/**
 * @file Repair Planning Service — Canonical MR→WO conversion domain service
 *
 * Extracts ALL business logic from the convert API route into a single,
 * pure-domain async function. The entire DB operation runs inside one
 * `db.$transaction()` for atomicity. HTTP concerns (auth, permissions,
 * response shaping) remain in the API route.
 *
 * @see src/app/api/maintenance-requests/[id]/convert/route.ts
 */

import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import type { Prisma } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

/** Minimal session shape — permissions are assumed already checked by the caller. */
export interface SessionLike {
  userId: string;
  fullName?: string;
  roles: string[];
}

/** Payload accepted by the conversion service. */
export interface ConvertMRToWOPayload {
  title?: string;
  priority?: string;
  workOrderType?: string;
  tradeActivity?: string;
  technicalDescription?: string;
  assignmentType?: 'direct' | 'via_supervisor';
  assignedTo?: string;
  teamLeaderId?: string;
  teamMembers?: Array<{ userId: string; role: string }>;
  assignedSupervisorId?: string;
  failureDescription?: string;
  causeDescription?: string;
  actionDescription?: string;
  estimatedHours?: number;
  plannedStart?: string;
  plannedEnd?: string;
  deliveryDateRequired?: string;
  safetyNotes?: string;
  ppeRequired?: string;
  notes?: string;
  requiredParts?: Array<{ itemId: string; quantity?: number }>;
  requiredTools?: Array<{ toolId: string; quantity?: number }>;
}

/** Notification payload returned to the caller for post-tx dispatch. */
export interface ConversionNotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  actionUrl: string;
  options?: Record<string, unknown>;
}

/** Result of the conversion operation. */
export interface ConvertMRToWOResult {
  success: boolean;
  workOrder?: any; // WorkOrder with includes
  error?: string;
  conflictWoNumber?: string;
  notifications?: ConversionNotification[];
}

const WO_NUMBER_MAX_RETRIES = 3;

function buildWoNumber(monthStr: string, seq: number): string {
  return `WO-${monthStr}-${String(seq).padStart(4, '0')}`;
}

async function determineBaseSequence(
  tx: Prisma.TransactionClient,
): Promise<{ monthStr: string; baseSeq: number }> {
  const now = new Date();
  const monthStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastWO = await tx.workOrder.findFirst({
    where: { woNumber: { startsWith: `WO-${monthStr}` } },
    orderBy: { woNumber: 'desc' },
  });
  if (!lastWO) return { monthStr, baseSeq: 1 };
  const parts = lastWO.woNumber.split('-');
  return { monthStr, baseSeq: (parseInt(parts[2] || '0', 10) + 1) };
}

function buildRequesterNotification(
  mr: { requestedBy: string },
  wo: { woNumber: string; id: string },
  session: SessionLike,
): ConversionNotification | null {
  if (!mr.requestedBy || mr.requestedBy === session.userId) return null;
  return {
    userId: mr.requestedBy,
    type: 'mr_converted',
    title: 'MR Converted to Work Order',
    message: `Your request has been converted to WO ${wo.woNumber} by ${session.fullName ?? 'a planner'}`,
    entityType: 'work_order',
    entityId: wo.id,
    actionUrl: `wo-detail?id=${wo.id}`,
  };
}

function buildAssignmentNotifications(
  payload: ConvertMRToWOPayload,
  wo: { woNumber: string; id: string; title: string },
  session: SessionLike,
): ConversionNotification[] {
  const notifications: ConversionNotification[] = [];
  const sentTo = new Set<string>();

  const add = (userId: string | undefined, type: string, title: string, msg: string, opts?: Record<string, unknown>) => {
    if (!userId || userId === session.userId || sentTo.has(userId)) return;
    sentTo.add(userId);
    notifications.push({
      userId,
      type,
      title,
      message: msg,
      entityType: 'work_order',
      entityId: wo.id,
      actionUrl: `wo-detail?id=${wo.id}`,
      options: opts,
    });
  };

  add(
    payload.teamLeaderId,
    'wo_assigned',
    'Work Order Team Lead Assignment',
    `${session.fullName ?? 'A planner'} assigned you as team leader for ${wo.woNumber}: "${wo.title}"`,
    { forceSms: true },
  );

  if (payload.assignedTo && payload.assignedTo !== payload.teamLeaderId) {
    add(
      payload.assignedTo,
      'wo_assigned',
      'Work Order Assigned',
      `${session.fullName ?? 'A planner'} assigned ${wo.woNumber} to you: "${wo.title}"`,
      { forceSms: true },
    );
  }

  if (payload.teamMembers) {
    for (const member of payload.teamMembers) {
      add(
        member.userId,
        'wo_assigned',
        'Work Order Team Assignment',
        `${session.fullName ?? 'A planner'} assigned you to the team for ${wo.woNumber}: "${wo.title}"`,
        { forceSms: true },
      );
    }
  }

  add(
    payload.assignedSupervisorId,
    'wo_assigned',
    'Work Order Pending Your Review',
    `${session.fullName ?? 'A planner'} created ${wo.woNumber} and assigned it to your team for review`,
    { forceSms: true },
  );

  return notifications;
}

export async function convertMRToWorkOrder(
  mrId: string,
  payload: ConvertMRToWOPayload,
  session: SessionLike,
): Promise<ConvertMRToWOResult> {
  const isAdmin = session.roles.includes('admin');

  const mr = await db.maintenanceRequest.findUnique({ where: { id: mrId } });
  if (!mr) {
    return { success: false, error: 'Maintenance request not found' };
  }

  if (payload.teamMembers && Array.isArray(payload.teamMembers)) {
    for (const member of payload.teamMembers) {
      if (!member.userId || !member.role) {
        return { success: false, error: 'Each team member must have userId and role' };
      }
    }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      if (mr.workOrderId) {
        const linkedWO = await tx.workOrder.findUnique({ where: { id: mr.workOrderId } });
        if (linkedWO) {
          return {
            success: false as const,
            error: `This request has already been converted to work order ${linkedWO.woNumber}`,
            conflictWoNumber: linkedWO.woNumber,
          };
        }
      }

      const existingWO = await tx.workOrder.findFirst({ where: { maintenanceRequestId: mrId } });
      if (existingWO) {
        await tx.maintenanceRequest.update({
          where: { id: mrId },
          data: { workOrderId: existingWO.id },
        });
        return {
          success: false as const,
          error: `This request was already converted to work order ${existingWO.woNumber}`,
          conflictWoNumber: existingWO.woNumber,
        };
      }

      if (mr.plantId && !isAdmin) {
        const plantAccess = await tx.userPlant.findUnique({
          where: { userId_plantId: { userId: session.userId, plantId: mr.plantId } },
        });
        if (!plantAccess) {
          return {
            success: false as const,
            error: 'No plant access for this maintenance request',
          };
        }
      }

      if (mr.workOrderId) {
        await tx.maintenanceRequest.update({ where: { id: mrId }, data: { workOrderId: null } });
      }

      const hasAssignment = payload.assignedTo || (payload.teamMembers && payload.teamMembers.length > 0);
      const woStatus = hasAssignment ? 'assigned' : 'approved';
      const now = new Date();

      const { monthStr, baseSeq } = await determineBaseSequence(tx);
      let workOrder!: Awaited<ReturnType<typeof tx.workOrder.create>>;

      const woInclude = {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
        planner: { select: { id: true, fullName: true, username: true } },
        maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
      } as const;

      let created = false;
      for (let attempt = 0; attempt < WO_NUMBER_MAX_RETRIES; attempt++) {
        const woNumber = buildWoNumber(monthStr, baseSeq + attempt);
        try {
          workOrder = await tx.workOrder.create({
            data: {
              woNumber,
              title: payload.title || mr.title,
              description: mr.description,
              type: payload.workOrderType || 'corrective',
              priority: payload.priority || mr.priority || 'medium',
              status: woStatus,
              maintenanceRequestId: mr.id,
              assetId: mr.assetId,
              departmentId: mr.departmentId,
              plantId: mr.plantId,
              estimatedHours: payload.estimatedHours ?? mr.estimatedHours ?? undefined,
              plannedStart: payload.plannedStart ? new Date(payload.plannedStart) : (mr.plannedStart ?? undefined),
              plannedEnd: payload.deliveryDateRequired
                ? new Date(payload.deliveryDateRequired)
                : (payload.plannedEnd ? new Date(payload.plannedEnd) : (mr.plannedEnd ?? undefined)),
              plannerId: session.userId,
              assignedTo: payload.assignedTo || null,
              teamLeaderId: payload.teamLeaderId || null,
              assignedSupervisorId: payload.assignedSupervisorId || null,
              assignmentType: payload.assignmentType || (payload.assignedTo ? 'direct' : null),
              assignedBy: session.userId,
              failureDescription: payload.failureDescription || null,
              causeDescription: payload.causeDescription || null,
              actionDescription: payload.actionDescription || null,
              tradeActivity: payload.tradeActivity || null,
              safetyNotes: payload.safetyNotes || null,
              ppeRequired: payload.ppeRequired || null,
              notes: payload.notes || null,
            },
            include: woInclude,
          });
          created = true;
          break;
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            continue;
          }
          throw err;
        }
      }

      if (!created) {
        const conflictWO = await tx.workOrder.findFirst({ where: { maintenanceRequestId: mrId } });
        const woRef = conflictWO ? conflictWO.woNumber : 'an existing work order';
        return {
          success: false as const,
          error: `This request has already been converted to ${woRef}`,
          conflictWoNumber: conflictWO?.woNumber,
        };
      }

      if (payload.teamMembers && payload.teamMembers.length > 0) {
        const teamMemberData = payload.teamMembers.map((member) => {
          const isTeamLeader = member.userId === payload.teamLeaderId;
          return {
            workOrderId: workOrder.id,
            userId: member.userId,
            role: isTeamLeader ? 'team_leader' : member.role,
            accessLevel: isTeamLeader ? 'full' : 'execution' as const,
            assignedAt: now,
          };
        });
        await tx.workOrderTeamMember.createMany({ data: teamMemberData });
      }

      if (
        payload.assignedTo &&
        !(payload.teamMembers && payload.teamMembers.some((m) => m.userId === payload.assignedTo))
      ) {
        const isTeamLeader = payload.assignedTo === payload.teamLeaderId;
        await tx.workOrderTeamMember.create({
          data: {
            workOrderId: workOrder.id,
            userId: payload.assignedTo,
            role: isTeamLeader ? 'team_leader' : 'assistant',
            accessLevel: isTeamLeader ? 'full' : 'execution' as const,
            assignedAt: now,
          },
        });
      }

      // Planner-selected resources must be represented in both the canonical
      // Repairs approval pipeline and the WO suggestion snapshot consumed by the
      // details page. WorkOrderMaterial remains a compatibility/cost projection.
      const suggestedParts: Array<{
        id: string;
        itemId: string;
        itemName: string;
        itemCode: string;
        quantity: number;
        unit: string;
        notes: string;
      }> = [];
      const suggestedTools: Array<{
        id: string;
        toolId: string;
        toolName: string;
        toolCode: string;
        quantity: number;
        notes: string;
      }> = [];

      if (payload.requiredParts && Array.isArray(payload.requiredParts) && payload.requiredParts.length > 0) {
        for (const partEntry of payload.requiredParts) {
          const partId = typeof partEntry === 'object' && partEntry !== null ? partEntry.itemId : partEntry;
          const rawQty = typeof partEntry === 'object' && partEntry !== null ? partEntry.quantity : 1;
          const quantity = Number(rawQty ?? 1);

          if (!partId || !Number.isFinite(quantity) || quantity <= 0) {
            throw new Error('Each required part must have a valid itemId and positive quantity');
          }

          const part = await tx.inventoryItem.findUnique({
            where: { id: partId },
            select: {
              id: true,
              name: true,
              itemCode: true,
              unitOfMeasure: true,
              unitCost: true,
              plantId: true,
            },
          });
          if (!part) {
            throw new Error(`Selected inventory item ${partId} was not found`);
          }
          if (workOrder.plantId && part.plantId !== workOrder.plantId) {
            throw new Error(`Selected inventory item ${part.itemCode} belongs to a different plant`);
          }

          const unit = part.unitOfMeasure || 'each';
          const unitCost = part.unitCost ?? 0;
          const estimatedCost = unitCost * quantity;

          suggestedParts.push({
            id: crypto.randomUUID(),
            itemId: part.id,
            itemName: part.name,
            itemCode: part.itemCode || '',
            quantity,
            unit,
            notes: '',
          });

          await tx.workOrderMaterial.create({
            data: {
              workOrderId: workOrder.id,
              itemId: part.id,
              itemName: part.name,
              quantity,
              unitCost,
              totalCost: estimatedCost,
              status: 'planned',
              requestedBy: session.userId,
            },
          });

          await tx.repairMaterialRequest.create({
            data: {
              workOrderId: workOrder.id,
              itemId: part.id,
              itemName: part.name,
              quantityRequested: quantity,
              quantityApproved: 0,
              quantityIssued: 0,
              quantityReturned: 0,
              unit,
              unitCost,
              estimatedCost,
              urgency: 'normal',
              reason: `Planned for ${workOrder.woNumber}`,
              notes: 'Suggested by planner during maintenance-request conversion',
              plantId: workOrder.plantId || part.plantId,
              source: 'planner_suggested',
              status: 'pending',
              requestedById: session.userId,
            },
          });
        }
      }

      if (payload.requiredTools && Array.isArray(payload.requiredTools) && payload.requiredTools.length > 0) {
        for (const toolEntry of payload.requiredTools) {
          const toolId = typeof toolEntry === 'object' && toolEntry !== null ? toolEntry.toolId : toolEntry;
          const rawQty = typeof toolEntry === 'object' && toolEntry !== null ? toolEntry.quantity : 1;
          const quantity = Number(rawQty ?? 1);

          if (!toolId || !Number.isFinite(quantity) || quantity <= 0) {
            throw new Error('Each required tool must have a valid toolId and positive quantity');
          }

          const tool = await tx.tool.findUnique({ where: { id: toolId } });
          if (!tool) {
            throw new Error(`Selected tool ${toolId} was not found`);
          }
          if (workOrder.plantId && tool.plantId && tool.plantId !== workOrder.plantId) {
            throw new Error(`Selected tool ${tool.toolCode} belongs to a different plant`);
          }

          suggestedTools.push({
            id: crypto.randomUUID(),
            toolId: tool.id,
            toolName: tool.name,
            toolCode: tool.toolCode || '',
            quantity,
            notes: '',
          });

          const toolRequest = await tx.repairToolRequest.create({
            data: {
              workOrderId: workOrder.id,
              toolId: tool.id,
              toolName: tool.name,
              reason: `Planned for ${workOrder.woNumber}`,
              notes: 'Suggested by planner during maintenance-request conversion',
              plantId: workOrder.plantId || undefined,
              source: 'planner_suggested',
              status: 'pending',
              urgency: 'normal',
              requestedById: session.userId,
            },
          });

          await tx.repairToolRequestItem.create({
            data: {
              repairToolRequestId: toolRequest.id,
              toolId: tool.id,
              toolName: tool.name,
              toolCode: tool.toolCode,
              category: tool.category,
              quantityRequested: quantity,
              quantityIssued: 0,
              unitCost: tool.purchaseCost ?? undefined,
            },
          });
        }
      }

      if (suggestedParts.length > 0 || suggestedTools.length > 0) {
        await tx.workOrder.update({
          where: { id: workOrder.id },
          data: {
            suggestedParts: JSON.stringify(suggestedParts),
            suggestedTools: JSON.stringify(suggestedTools),
          },
        });
      }

      const transitionResult = await executeTransition(
        'maintenance_request',
        mrId,
        'converted',
        { ...session, permissions: [] },
        {
          extraData: {
            workOrderId: workOrder.id,
            workflowStatus: 'work_order_created',
            assignedPlannerId: session.userId,
          },
          tx,
        },
      );

      const warnings: ConversionNotification[] = [];
      if (!transitionResult.success) {
        warnings.push({
          userId: session.userId,
          type: 'system_warning',
          title: 'MR Status Transition Warning',
          message: `Work order ${workOrder.woNumber} created but MR status transition failed: ${transitionResult.error}. The MR status may need manual update.`,
          entityType: 'work_order',
          entityId: workOrder.id,
          actionUrl: `wo-detail?id=${workOrder.id}`,
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'maintenance_request',
          entityId: mrId,
          oldValues: JSON.stringify({}),
          newValues: JSON.stringify({
            workOrderId: workOrder.id,
            woNumber: workOrder.woNumber,
            assignedTo: payload.assignedTo || null,
            teamLeaderId: payload.teamLeaderId || null,
            teamMembersCount: payload.teamMembers?.length || 0,
            assignmentType: payload.assignmentType || null,
          }),
        },
      });

      const notifications: ConversionNotification[] = [];
      const requesterNotif = buildRequesterNotification(mr, workOrder, session);
      if (requesterNotif) notifications.push(requesterNotif);

      notifications.push(...buildAssignmentNotifications(payload, workOrder, session));
      notifications.push(...warnings);

      return {
        success: true as const,
        workOrder,
        notifications,
      };
    }, { timeout: 30000 });

    return result;

  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      const existingWO = await db.workOrder.findFirst({ where: { maintenanceRequestId: mrId } });
      const woRef = existingWO ? existingWO.woNumber : 'an existing work order';
      return {
        success: false,
        error: `This request has already been converted to ${woRef}`,
        conflictWoNumber: existingWO?.woNumber,
      };
    }

    const message = error instanceof Error ? error.message : 'Failed to convert maintenance request';
    return { success: false, error: message };
  }
}
