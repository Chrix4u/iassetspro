/**
 * Central plant-authorization helpers for Repairs API routes.
 *
 * These functions encapsulate the repeated pattern of:
 *   1. Load entity (ID + plantId only)
 *   2. Return 404 if entity missing
 *   3. Call getPlantScope(request, session)
 *   4. Fail if denyAccess → 403
 *   5. Fail if !canAccessPlantStrict(scope, entityPlantId) → 403
 *   6. Return the entity + scope on success
 *
 * All helpers use the existing plant-scope.ts semantics.
 * System-wide admin/plant-manager bypass continues via getPlantScope().
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, type SessionData } from '@/lib/auth';
import { isWorkOrderExecutionMember } from '@/services/workOrderAccess.service';
import { getPlantScope, canAccessPlantStrict, type PlantScopeResult } from '@/lib/plant-scope';

// ── Return types ──

interface PlantAuthSuccess<T> {
  ok: true;
  entity: T;
  plantScope: PlantScopeResult;
}

interface PlantAuthFail {
  ok: false;
  response: NextResponse;
}

export type PlantAuthResult<T> = PlantAuthSuccess<T> | PlantAuthFail;

// ── Internal helper ──

function fail(status: number, error: string): PlantAuthFail {
  return { ok: false, response: NextResponse.json({ success: false, error }, { status }) };
}

async function resolveScope(request: NextRequest, session: SessionData): Promise<{ ok: true; plantScope: PlantScopeResult } | PlantAuthFail> {
  const plantScope = await getPlantScope(request, session);
  if (plantScope.denyAccess) {
    return fail(403, 'Access denied');
  }
  return { ok: true, plantScope };
}

// ── Entity types (minimal selects for authorization) ──

export interface WorkOrderWithPlant {
  id: string;
  plantId: string | null;
}

export interface WorkOrderExecutionWithPlant extends WorkOrderWithPlant {
  assignedTo: string | null;
  teamLeaderId: string | null;
  assignedSupervisorId: string | null;
  plannerId: string | null;
  teamMembers: Array<{ userId: string; role: string | null }>;
}


export interface MRWithPlant {
  id: string;
  plantId: string | null;
}

export interface MaterialRequestWithPlant {
  id: string;
  workOrderId: string | null;
  workOrder: { plantId: string | null } | null;
}

export interface ToolRequestWithPlant {
  id: string;
  workOrderId: string | null;
  workOrder: { plantId: string | null } | null;
}

// ── Public helpers ──

/**
 * Authorize access to a Work Order by plant.
 * Returns the WO (id + plantId) and plant scope on success.
 */
export async function authorizeWorkOrderPlant(
  request: NextRequest,
  session: SessionData,
  workOrderId: string,
): Promise<PlantAuthResult<WorkOrderWithPlant>> {
  const wo = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, plantId: true },
  });
  if (!wo) return fail(404, 'Work order not found');

  const scopeOrDeny = await resolveScope(request, session);
  if (!scopeOrDeny.ok) return scopeOrDeny;
  const plantScope = scopeOrDeny.plantScope;

  if (!canAccessPlantStrict(plantScope, wo.plantId)) {
    return fail(403, 'Access denied');
  }

  return { ok: true, entity: wo, plantScope };
}

/**
 * Authorize an exact Work Order for its assigned execution actor.
 *
 * Normal plant scoping remains authoritative. The only fallback is a direct,
 * server-stored execution relationship to this exact WO. This is intentionally
 * narrower than granting UserPlant membership and exists to keep legacy/current
 * assignments usable when a technician has no explicit UserPlant row.
 */
export async function authorizeWorkOrderExecutionAccess(
  request: NextRequest,
  session: SessionData,
  workOrderId: string,
): Promise<PlantAuthResult<WorkOrderExecutionWithPlant>> {
  const wo = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      plantId: true,
      assignedTo: true,
      teamLeaderId: true,
      assignedSupervisorId: true,
      plannerId: true,
      teamMembers: { select: { userId: true, role: true } },
    },
  });
  if (!wo) return fail(404, 'Work order not found');
  if (!wo.plantId) return fail(403, 'Operational work order has no plant');

  const scopeOrDeny = await resolveScope(request, session);
  if (!scopeOrDeny.ok) {
    if (isWorkOrderExecutionMember(session, wo)) {
      return {
        ok: true,
        entity: wo,
        plantScope: {
          plantId: wo.plantId,
          accessiblePlantIds: [wo.plantId],
          isScoped: true,
          isSystemWide: false,
          accessLevel: 'read',
        },
      };
    }
    return scopeOrDeny;
  }

  const plantScope = scopeOrDeny.plantScope;
  if (canAccessPlantStrict(plantScope, wo.plantId)) {
    return { ok: true, entity: wo, plantScope };
  }

  if (isWorkOrderExecutionMember(session, wo)) {
    return {
      ok: true,
      entity: wo,
      plantScope: {
        plantId: wo.plantId,
        accessiblePlantIds: [wo.plantId],
        isScoped: true,
        isSystemWide: false,
        accessLevel: 'read',
      },
    };
  }

  return fail(403, 'Access denied');
}

/**
 * Authorize access to a Maintenance Request by plant.
 */
export async function authorizeMaintenanceRequestPlant(
  request: NextRequest,
  session: SessionData,
  mrId: string,
): Promise<PlantAuthResult<MRWithPlant>> {
  const mr = await db.maintenanceRequest.findUnique({
    where: { id: mrId },
    select: { id: true, plantId: true },
  });
  if (!mr) return fail(404, 'Maintenance request not found');

  const scopeOrDeny = await resolveScope(request, session);
  if (!scopeOrDeny.ok) return scopeOrDeny;
  const plantScope = scopeOrDeny.plantScope;

  if (!canAccessPlantStrict(plantScope, mr.plantId)) {
    return fail(403, 'Access denied');
  }

  return { ok: true, entity: mr, plantScope };
}

/**
 * Authorize access to a Repair Material Request by its linked WO plant.
 */
export async function authorizeMaterialRequestPlant(
  request: NextRequest,
  session: SessionData,
  requestId: string,
): Promise<PlantAuthResult<MaterialRequestWithPlant>> {
  const matReq = await db.repairMaterialRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      workOrderId: true,
      workOrder: { select: { plantId: true } },
    },
  });
  if (!matReq) return fail(404, 'Material request not found');

  const scopeOrDeny = await resolveScope(request, session);
  if (!scopeOrDeny.ok) return scopeOrDeny;
  const plantScope = scopeOrDeny.plantScope;

  const entityPlantId = matReq.workOrder?.plantId;
  if (!canAccessPlantStrict(plantScope, entityPlantId)) {
    return fail(403, 'Access denied');
  }

  return { ok: true, entity: matReq, plantScope };
}

/**
 * Authorize access to a Repair Tool Request by its linked WO plant.
 */
export async function authorizeToolRequestPlant(
  request: NextRequest,
  session: SessionData,
  requestId: string,
): Promise<PlantAuthResult<ToolRequestWithPlant>> {
  const toolReq = await db.repairToolRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      workOrderId: true,
      workOrder: { select: { plantId: true } },
    },
  });
  if (!toolReq) return fail(404, 'Tool request not found');

  const scopeOrDeny = await resolveScope(request, session);
  if (!scopeOrDeny.ok) return scopeOrDeny;
  const plantScope = scopeOrDeny.plantScope;

  const entityPlantId = toolReq.workOrder?.plantId;
  if (!canAccessPlantStrict(plantScope, entityPlantId)) {
    return fail(403, 'Access denied');
  }

  return { ok: true, entity: toolReq, plantScope };
}
