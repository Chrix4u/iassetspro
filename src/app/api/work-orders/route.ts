import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope, applyPlantScope } from '@/lib/plant-scope';
import { getUnavailableOperationalModules } from '@/lib/module-access.server';
import { Prisma } from '@prisma/client';

// Helper: generate WO number WO-YYYYMM-NNNN (must be called inside a transaction)
async function generateWoNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const now = new Date();
  const prefix = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const latest = await tx.workOrder.findFirst({
    where: { woNumber: { startsWith: prefix } },
    orderBy: { woNumber: 'desc' },
    select: { woNumber: true },
  });

  let nextNum = 1;
  if (latest) {
    const parts = latest.woNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    nextNum = lastNum + 1;
  }

  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'work_orders.view') && !hasPermission(session, 'work_orders.view_own') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const type = searchParams.get('type');
    const assignedTo = searchParams.get('assignedTo');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search');
    const overdue = searchParams.get('overdue');

    // Resolve plant scope (validates X-Plant-ID against user's plant access)
    const plantScope = await getPlantScope(request, session);

    // Build where clause with role-based filtering
    const where: Record<string, unknown> = {};
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (search) {
      where.title = { contains: search };
    }
    if (overdue === 'true') {
      where.plannedEnd = { lt: new Date() };
      where.status = { notIn: ['completed', 'verified', 'closed', 'cancelled'] };
    }

    const hasViewAll = hasPermission(session, 'work_orders.view') || hasPermission(session, 'work_orders.view_all') || isAdmin(session);

    if (!hasViewAll) {
      // Users with only view_own see WOs assigned to them or where they are team members
      const teamWoIds = await db.workOrderTeamMember.findMany({
        where: { userId: session.userId },
        select: { workOrderId: true },
      });
      const teamIds = teamWoIds.map(t => t.workOrderId);
      if (teamIds.length > 0) {
        where.OR = [
          { assignedTo: session.userId },
          { id: { in: teamIds } },
        ];
      } else {
        where.assignedTo = session.userId;
      }
    } else if (!isAdmin(session)) {
      // Technicians get scoped view even with view_all
      if (session.roles.includes('maintenance_technician')) {
        const teamWoIds = await db.workOrderTeamMember.findMany({
          where: { userId: session.userId },
          select: { workOrderId: true },
        });
        const teamIds = teamWoIds.map(t => t.workOrderId);
        if (teamIds.length > 0) {
          where.OR = [
            { assignedTo: session.userId },
            { id: { in: teamIds } },
          ];
        } else {
          where.assignedTo = session.userId;
        }
      }
      // Planners, supervisors, and managers see all
    }

    // Only allow assignedTo filter for users with view_all (prevents view_own bypass)
    if (assignedTo && hasViewAll) {
      where.assignedTo = assignedTo;
    }

    // Apply plant scoping filter
    if (plantScope) {
      applyPlantScope(where, plantScope);
    }

    const [workOrders, total] = await Promise.all([
      db.workOrder.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          assignee: { select: { id: true, fullName: true, username: true } },
          teamLeader: { select: { id: true, fullName: true, username: true } },
          assignedSupervisor: { select: { id: true, fullName: true, username: true } },
          assigner: { select: { id: true, fullName: true, username: true } },
          planner: { select: { id: true, fullName: true, username: true } },
          maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
          pmSchedule: { select: { id: true, title: true, frequencyType: true, frequencyValue: true } },
          teamMembers: {
            include: { user: { select: { id: true, fullName: true } } },
            orderBy: { assignedAt: 'asc' },
          },
          timeLogs: {
            include: {
              user: { select: { id: true, fullName: true, username: true } },
            },
            orderBy: { timestamp: 'desc' },
          },
          _count: {
            select: { workOrderComponents: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.workOrder.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    const unavailableModules = new Set(await getUnavailableOperationalModules([
      'assets',
      'maintenance_requests',
      'pm_schedules',
    ]));

    const redactedWorkOrders = workOrders.map((workOrder) => {
      const redacted: Record<string, unknown> = { ...workOrder };

      if (unavailableModules.has('maintenance_requests')) {
        redacted.maintenanceRequest = null;
        redacted.maintenanceRequestId = null;
      }
      if (unavailableModules.has('pm_schedules')) {
        redacted.pmSchedule = null;
        redacted.pmScheduleId = null;
      }
      if (unavailableModules.has('assets')) {
        redacted.assetId = null;
        redacted._count = {
          ...(typeof workOrder._count === 'object' && workOrder._count ? workOrder._count : {}),
          workOrderComponents: 0,
        };
      }

      return redacted;
    });

    return NextResponse.json({
      success: true,
      data: redactedWorkOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load work orders';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'work_orders.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      type,
      priority,
      assetId,
      assetName,
      departmentId,
      plantId,
      estimatedHours,
      plannedStart,
      plannedEnd,
      maintenanceRequestId,
      notes,
      failureDescription,
      causeDescription,
      actionDescription,
      // Enhanced fields (matching convert-to-WO capabilities)
      tradeActivity,
      technicalDescription,
      deliveryDateRequired,
      safetyNotes,
      ppeRequired,
      assignmentType,
      assignedTo,
      teamLeaderId,
      teamMembers,
      assignedSupervisorId,
      requiredParts,
      requiredTools,
      componentIds,
    } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    // ── Validate maintenance request if provided ──
    // We validate the MR exists and is in 'approved' status, but we do NOT change
    // the MR status here. The MR → WO conversion (status change to 'converted') must
    // ONLY happen through the dedicated convert endpoint so that the state machine
    // can enforce validation, write history, and perform role checks.
    if (maintenanceRequestId) {
      const mr = await db.maintenanceRequest.findUnique({
        where: { id: maintenanceRequestId },
        select: { id: true, status: true, workflowStatus: true, workOrderId: true },
      });
      if (!mr) {
        return NextResponse.json(
          { success: false, error: 'Maintenance request not found' },
          { status: 400 }
        );
      }
      if (mr.status !== 'approved') {
        return NextResponse.json(
          { success: false, error: `Maintenance request must be in 'approved' status to create a work order (current: ${mr.status})` },
          { status: 400 }
        );
      }
      if (mr.workOrderId) {
        return NextResponse.json(
          { success: false, error: 'Maintenance request already has a work order' },
          { status: 400 }
        );
      }
    }

    // Resolve plantId (outside transaction — reads user config, no WO data yet)
    let resolvedPlantId = plantId;
    if (!resolvedPlantId) {
      const userPlant = await db.userPlant.findFirst({
        where: { userId: session.userId, isPrimary: true },
      });
      resolvedPlantId = userPlant?.plantId ?? null;
    }
    // Fallback: if still null, try any single plant the user has access to
    if (!resolvedPlantId && !isAdmin(session)) {
      const anyPlant = await db.userPlant.findFirst({
        where: { userId: session.userId },
        select: { plantId: true },
      });
      if (anyPlant) {
        resolvedPlantId = anyPlant.plantId;
      }
    }
    // Null-plant guard: operational WOs must have a plant for non-system users
    if (!resolvedPlantId && !isAdmin(session)) {
      const userPlants = await db.userPlant.findMany({
        where: { userId: session.userId },
        select: { plantId: true },
      });
      if (userPlants.length > 1) {
        return NextResponse.json(
          { success: false, error: 'Plant selection required. You have access to multiple plants — specify X-Plant-ID header or plantId in the request body.' },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { success: false, error: 'No plant assigned. Contact your administrator to assign a plant.' },
        { status: 400 },
      );
    }

    // Validate team members if provided
    if (teamMembers && Array.isArray(teamMembers)) {
      for (const member of teamMembers) {
        if (!member.userId || !member.role) {
          return NextResponse.json(
            { success: false, error: 'Each team member must have userId and role' },
            { status: 400 }
          );
        }
      }
    }

    // Determine initial WO status: "assigned" if assignee/team provided, otherwise "draft"
    const hasAssignment = assignedTo || (teamMembers && teamMembers.length > 0);
    const woStatus = hasAssignment ? 'assigned' : 'draft';

    // ═══════════════════════════════════════════════════════════════════════
    // Entire WO creation wrapped in a single transaction to prevent partial
    // failures from leaving orphaned records (team members, materials, tools,
    // components created without a valid WO, or WO created without materials).
    // ═══════════════════════════════════════════════════════════════════════
    const wo = await db.$transaction(async (tx) => {
      // ── WO number generation (inside tx to prevent race conditions) ──
      const woNumber = await generateWoNumber(tx);

      // ── Create the work order ──
      const createdWo = await tx.workOrder.create({
        data: {
          woNumber,
          title,
          description: description || technicalDescription || null,
          type: type || 'corrective',
          priority: priority || 'medium',
          assetId: assetId || null,
          assetName: assetName || null,
          departmentId: departmentId || null,
          plantId: resolvedPlantId,
          estimatedHours: estimatedHours || null,
          plannedStart: plannedStart ? new Date(plannedStart) : null,
          plannedEnd: plannedEnd || (deliveryDateRequired ? new Date(deliveryDateRequired) : null),
          maintenanceRequestId: maintenanceRequestId || null,
          notes: notes || null,
          failureDescription: failureDescription || null,
          causeDescription: causeDescription || null,
          actionDescription: actionDescription || null,
          // Enhanced fields
          tradeActivity: tradeActivity || null,
          safetyNotes: safetyNotes || null,
          ppeRequired: ppeRequired || null,
          status: woStatus,
          plannerId: session.userId,
          assignedTo: assignedTo || null,
          teamLeaderId: teamLeaderId || null,
          assignedSupervisorId: assignedSupervisorId || null,
          assignmentType: assignmentType || (assignedTo ? 'direct' : null),
          assignedBy: session.userId,
        },
        include: {
          assignee: { select: { id: true, fullName: true } },
          planner: { select: { id: true, fullName: true } },
          teamLeader: { select: { id: true, fullName: true } },
          assignedSupervisor: { select: { id: true, fullName: true } },
          maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
          workOrderComponents: {
            include: {
              componentRegistry: { select: { id: true, name: true, componentCode: true, componentType: true, criticality: true } },
            },
          },
        },
      });

      // ── Create team member records if provided ──
      if (teamMembers && teamMembers.length > 0) {
        const now = new Date();
        const teamMemberData = teamMembers.map((member: { userId: string; role: string }) => {
          const isTeamLeader = member.userId === teamLeaderId;
          return {
            workOrderId: createdWo.id,
            userId: member.userId,
            role: isTeamLeader ? 'team_leader' : member.role,
            accessLevel: isTeamLeader ? 'full' : 'read_only',
            assignedAt: now,
          };
        });

        await tx.workOrderTeamMember.createMany({ data: teamMemberData });
      }

      // Ensure assignedTo is a team member if not already in teamMembers
      if (assignedTo && !(teamMembers && teamMembers.some((m: { userId: string }) => m.userId === assignedTo))) {
        const isTeamLeader = assignedTo === teamLeaderId;
        const existingMember = await tx.workOrderTeamMember.findFirst({
          where: { workOrderId: createdWo.id, userId: assignedTo },
        });
        if (!existingMember) {
          await tx.workOrderTeamMember.create({
            data: {
              workOrderId: createdWo.id,
              userId: assignedTo,
              role: isTeamLeader ? 'team_leader' : 'assistant',
              accessLevel: isTeamLeader ? 'full' : 'read_only',
              assignedAt: new Date(),
            },
          });
        }
      }

      // ── Store planner-suggested parts & tools ──
      const suggestedPartsArr: Array<{ id: string; itemId: string; itemName: string; itemCode: string; quantity: number; unit: string; notes?: string }> = [];
      const suggestedToolsArr: Array<{ id: string; toolId: string; toolName: string; toolCode: string; quantity: number; notes?: string }> = [];

      // ── Parts: create RepairMaterialRequest records + JSON snapshot ──
      if (requiredParts && Array.isArray(requiredParts) && requiredParts.length > 0) {
        for (const part of requiredParts) {
          // New format: { itemId, quantity, unit, notes }
          if (typeof part === 'object' && part.itemId) {
            const invItem = await tx.inventoryItem.findUnique({ where: { id: part.itemId } });
            const entry = {
              id: crypto.randomUUID(),
              itemId: part.itemId,
              itemName: invItem?.name || part.itemName || 'Unknown Part',
              itemCode: invItem?.itemCode || part.itemCode || '',
              quantity: part.quantity || 1,
              unit: part.unit || invItem?.unit || 'each',
              notes: part.notes || '',
            };
            suggestedPartsArr.push(entry);

            // Create a RepairMaterialRequest so store keeper can see it in the pipeline
            await tx.repairMaterialRequest.create({
              data: {
                workOrderId: createdWo.id,
                itemId: part.itemId,
                itemName: entry.itemName,
                quantityRequested: entry.quantity,
                quantityApproved: 0,
                unit: entry.unit,
                unitCost: invItem?.unitCost || 0,
                estimatedCost: (invItem?.unitCost || 0) * entry.quantity,
                urgency: (part as Record<string, unknown>).urgency as string || 'normal',
                reason: 'Planner suggested material for work order',
                notes: part.notes || `Suggested by planner during WO creation`,
                plantId: resolvedPlantId,
                source: 'planner_suggested',
                status: 'pending',
                requestedById: session.userId,
              },
            });
          }
          // Legacy format: just an ID string
          else if (typeof part === 'string') {
            const invItem = await tx.inventoryItem.findUnique({ where: { id: part } });
            if (invItem) {
              const entry = {
                id: crypto.randomUUID(),
                itemId: invItem.id,
                itemName: invItem.name,
                itemCode: invItem.itemCode || '',
                quantity: 1,
                unit: invItem.unit || 'each',
                notes: '',
              };
              suggestedPartsArr.push(entry);

              await tx.repairMaterialRequest.create({
                data: {
                  workOrderId: createdWo.id,
                  itemId: invItem.id,
                  itemName: invItem.name,
                  quantityRequested: 1,
                  unit: invItem.unit || 'each',
                  unitCost: invItem.unitCost || 0,
                  estimatedCost: invItem.unitCost || 0,
                  reason: 'Planner suggested material for work order',
                  plantId: resolvedPlantId,
                  source: 'planner_suggested',
                  status: 'pending',
                  requestedById: session.userId,
                },
              });
            }
          }
        }
      }

      // ── Tools: create RepairToolRequest records + RepairToolRequestItem + JSON snapshot ──
      if (requiredTools && Array.isArray(requiredTools) && requiredTools.length > 0) {
        for (const tool of requiredTools) {
          // New format: { toolId, quantity, notes }
          if (typeof tool === 'object' && tool.toolId) {
            const toolRec = await tx.tool.findUnique({ where: { id: tool.toolId } });
            const entry = {
              id: crypto.randomUUID(),
              toolId: tool.toolId,
              toolName: toolRec?.name || tool.toolName || 'Unknown Tool',
              toolCode: toolRec?.toolCode || tool.toolCode || '',
              quantity: tool.quantity || 1,
              notes: tool.notes || '',
            };
            suggestedToolsArr.push(entry);

            const quantity = tool.quantity || 1;

            // Create RepairToolRequest (header record)
            const toolRequest = await tx.repairToolRequest.create({
              data: {
                workOrderId: createdWo.id,
                toolId: tool.toolId,
                toolName: entry.toolName,
                reason: 'Planned for WO creation',
                notes: tool.notes || `Suggested by planner during WO creation`,
                plantId: resolvedPlantId,
                source: 'planner_suggested',
                status: 'pending',
                urgency: 'normal',
                requestedById: session.userId,
              },
            });

            // Create RepairToolRequestItem (line item) so the tool pipeline can
            // track quantities, issue, return, and transfer at the item level
            await tx.repairToolRequestItem.create({
              data: {
                repairToolRequestId: toolRequest.id,
                toolId: tool.toolId,
                toolName: entry.toolName,
                toolCode: toolRec?.toolCode || tool.toolCode || '',
                category: toolRec?.category || null,
                quantityRequested: quantity,
                quantityIssued: 0,
                unitCost: toolRec?.purchaseCost || null,
              },
            });
          }
          // Legacy format: just an ID string
          else if (typeof tool === 'string') {
            const toolRec = await tx.tool.findUnique({ where: { id: tool } });
            if (toolRec) {
              const entry = {
                id: crypto.randomUUID(),
                toolId: toolRec.id,
                toolName: toolRec.name,
                toolCode: toolRec.toolCode || '',
                quantity: 1,
                notes: '',
              };
              suggestedToolsArr.push(entry);

              // Create RepairToolRequest (header record)
              const toolRequest = await tx.repairToolRequest.create({
                data: {
                  workOrderId: createdWo.id,
                  toolId: toolRec.id,
                  toolName: toolRec.name,
                  reason: 'Planned for WO creation',
                  plantId: resolvedPlantId,
                  source: 'planner_suggested',
                  status: 'pending',
                  urgency: 'normal',
                  requestedById: session.userId,
                },
              });

              // Create RepairToolRequestItem (line item)
              await tx.repairToolRequestItem.create({
                data: {
                  repairToolRequestId: toolRequest.id,
                  toolId: toolRec.id,
                  toolName: toolRec.name,
                  toolCode: toolRec.toolCode || '',
                  category: toolRec.category || null,
                  quantityRequested: 1,
                  quantityIssued: 0,
                  unitCost: toolRec.purchaseCost || null,
                },
              });
            }
          }
        }
      }

      // ── Store suggested parts/tools JSON on the WO record ──
      if (suggestedPartsArr.length > 0 || suggestedToolsArr.length > 0) {
        await tx.workOrder.update({
          where: { id: createdWo.id },
          data: {
            suggestedParts: JSON.stringify(suggestedPartsArr),
            suggestedTools: JSON.stringify(suggestedToolsArr),
          },
        });
      }

      // ── Link components if provided ──
      if (componentIds && Array.isArray(componentIds) && componentIds.length > 0) {
        // Validate all component IDs exist and belong to the asset
        const components = await tx.componentRegistry.findMany({
          where: { id: { in: componentIds } },
          select: { id: true },
        });
        const validIds = components.map(c => c.id);
        const validComponentIds = componentIds.filter((id: string) => validIds.includes(id));

        if (validComponentIds.length > 0) {
          await tx.workOrderComponent.createMany({
            data: validComponentIds.map((cid: string) => ({
              workOrderId: createdWo.id,
              componentRegistryId: cid,
            })),
          });
        }
      }

      // ── Create audit log ──
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'work_order',
          entityId: createdWo.id,
          newValues: JSON.stringify({ woNumber, title, type, priority }),
        },
      });

      return createdWo;
    });
    // ── End of transaction ──

    return NextResponse.json({ success: true, data: wo }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
