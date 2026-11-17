import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getComponentPlantAccess } from '@/lib/component-plant-access';
import { canUpdateComponentHierarchy, canViewComponentHierarchy } from '@/lib/component-registry-permissions';
import { normalizeCommissioningParameters } from '@/lib/asset-onboarding';
import { assertPointRevisionAllowed, parameterRange, pointChanges, parameterRevisionSnapshot } from '@/lib/component-parameter-revision';

class PointRevisionConflict extends Error {}
import { POST as recordPmInspection } from '@/app/api/pm-inspections/[pointId]/records/route';

async function authorize(request: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, id: string) {
  const access = await getComponentPlantAccess(request, session, id);
  if (!access.exists) return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
  if (!access.allowed) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canViewComponentHierarchy(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const denied = await authorize(request, session, id);
    if (denied) return denied;

    const inspectionPoints = await db.componentInspectionPoint.findMany({
      where: { componentId: id, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        records: {
          orderBy: { inspectedAt: 'desc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: inspectionPoints.map((point) => ({
        ...point,
        latestRecord: point.records[0] || null,
        records: undefined,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inspections';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Legacy Digital Twin recording endpoint delegates to the same canonical PM inspection lifecycle. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const { id } = await params;
    const denied = await authorize(request, session, id);
    if (denied) return denied;
    const body = await request.json();
    const inspectionPointId = typeof body.inspectionPointId === 'string' ? body.inspectionPointId.trim() : '';
    if (!inspectionPointId) return NextResponse.json({ success: false, error: 'inspectionPointId is required' }, { status: 400 });
    const point = await db.componentInspectionPoint.findFirst({
      where: { id: inspectionPointId, componentId: id, isActive: true },
      select: { id: true },
    });
    if (!point) return NextResponse.json({ success: false, error: 'Inspection point does not belong to this part' }, { status: 404 });
    const legacyResult = body.result === 'conditional' ? 'needs_attention' : body.result || 'pass';
    const delegatedRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        value: body.value,
        outcome: legacyResult,
        findings: body.findings,
        recommendation: body.recommendation,
      }),
    });
    return recordPmInspection(delegatedRequest, { params: Promise.resolve({ pointId: inspectionPointId }) });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to record inspection' }, { status: 500 });
  }
}

/**
 * Controlled part parameter revision. Historical measurements and PM bindings
 * stay attached to their original calibrated point and are NEVER rewritten.
 * Missing unused points may be deactivated; a used point blocks the request.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!canUpdateComponentHierarchy(session)) {
    return NextResponse.json({ success: false, error: 'Part configuration update permission required' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const denied = await authorize(request, session, id);
    if (denied) return denied;
    const payload = await request.json() as Record<string, unknown>;
    if (!Array.isArray(payload.parameters) || payload.parameters.length > 40) {
      return NextResponse.json({ success: false, error: 'Provide an array of up to 40 part parameters' }, { status: 400 });
    }
    if (typeof payload.expectedSnapshot !== 'string' || payload.expectedSnapshot.length > 20000) {
      return NextResponse.json({ success: false, error: 'Reload the part before updating its inspection settings' }, { status: 400 });
    }
    const rows = payload.parameters as Array<Record<string, unknown>>;
    if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      return NextResponse.json({ success: false, error: 'Invalid parameter row' }, { status: 400 });
    }
    let desired: ReturnType<typeof normalizeCommissioningParameters>;
    try { desired = normalizeCommissioningParameters(rows); }
    catch (error) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid parameter' }, { status: 400 });
    }
    const ids = rows.map(row => typeof row.id === 'string' ? row.id.trim() : '');
    if (new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) {
      return NextResponse.json({ success: false, error: 'Duplicate inspection point identity' }, { status: 400 });
    }

    const plant = await db.componentRegistry.findUnique({
      where: { id }, select: { asset: { select: { plantId: true } } },
    });
    // A maintainable checkpoint must belong to a real machine/plant.
    // Generic canAccessPlant tolerates null for shared catalog records; this
    // operational editor must fail closed for orphaned parts.
    if (!plant?.asset?.plantId) {
      return NextResponse.json({ success: false,
        error: 'Part must be assigned to a machine and plant before configuring inspection parameters' },
        { status: 422 });
    }
    const result = await db.$transaction(async tx => {
      const existing = await tx.componentInspectionPoint.findMany({
        where: { componentId: id, isActive: true },
        select: { id: true, name: true, description: true, inspectionType: true,
          parameterKey: true, normalRange: true,
          _count: { select: { records: true, pmTaskLinks: true } } },
      });
      if (parameterRevisionSnapshot(existing) !== payload.expectedSnapshot) {
        throw new PointRevisionConflict('This part’s inspection parameters changed after you opened the editor. Reload before saving');
      }
      const byId = new Map(existing.map(p => [p.id, p]));
      for (const pointId of ids.filter(Boolean)) {
        if (!byId.has(pointId)) {
          throw new PointRevisionConflict('An inspection point was changed elsewhere. Reload this part before editing');
        }
      }
      const allIds = new Set(ids.filter(Boolean));
      const retired = existing.filter(point => !allIds.has(point.id));
      for (const point of retired) {
        try { assertPointRevisionAllowed(point); }
        catch (error) { throw new PointRevisionConflict(error instanceof Error ? error.message : 'Linked parameter cannot be retired'); }
      }
      let added = 0, revised = 0, retained = 0;
      for (let i = 0; i < desired.length; i++) {
        const point = ids[i] ? byId.get(ids[i]) : undefined;
        const next = desired[i];
        if (point) {
          try { assertPointRevisionAllowed(point, next); }
          catch (error) { throw new PointRevisionConflict(error instanceof Error ? error.message : 'Calibrated parameter cannot change'); }
          if (!pointChanges(point, next)) { retained++; continue; }
          await tx.componentInspectionPoint.update({
            where: { id: point.id }, data: {
              name: next.name, parameterKey: next.key, inspectionType: next.inspectionType,
              description: next.reference || null, normalRange: parameterRange(next),
            },
          });
          revised++;
        } else {
          await tx.componentInspectionPoint.create({ data: {
            componentId: id, name: next.name, parameterKey: next.key,
            inspectionType: next.inspectionType, description: next.reference || null,
            normalRange: parameterRange(next), sortOrder: i, isActive: true,
          } });
          added++;
        }
      }
      if (retired.length) await tx.componentInspectionPoint.updateMany({
        where: { id: { in: retired.map(p => p.id) }, componentId: id },
        data: { isActive: false },
      });
      await tx.auditLog.create({ data: {
        userId: session.userId, plantId: plant?.asset?.plantId || undefined,
        action: 'update', entityType: 'component_inspection_parameters',
        entityId: id,
        oldValues: JSON.stringify(existing.map(p => ({ id:p.id, name:p.name,
          parameterKey:p.parameterKey, inspectionType:p.inspectionType,
          normalRange:p.normalRange, description:p.description }))),
        newValues: JSON.stringify({ parameters: desired, added, revised,
          retained, deactivated: retired.map(p => p.id),
          policy: 'block_revision_of_used_or_PM_linked_points' }),
      } });
      return { added, revised, retained, deactivated: retired.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof PointRevisionConflict || (error as { code?: string })?.code === 'P2034') {
      return NextResponse.json({ success: false,
        error: error instanceof PointRevisionConflict ? error.message : 'Concurrent update; reload and retry' },
        { status: 409 });
    }
    return NextResponse.json({ success: false,
      error: error instanceof Error ? error.message : 'Unable to update part parameters' },
      { status: 500 });
  }
}
