import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { generateClosedWOPackPDF, type ClosedWOPackData } from '@/lib/generate-closed-wo-pack';

// GET /api/work-orders/[id]/closed-pack
// Returns a comprehensive Closed Work Order Pack PDF
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ── Auth ──
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    // ── RBAC: require work_orders.view or reports.view ──
    if (!hasAnyPermission(session, ['work_orders.view', 'reports.view']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    // ── Plant scope enforcement ──
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const { id } = await params;

    // ── Fetch WorkOrder with all relations ──
    const wo = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, department: true } },
        teamLeader: { select: { id: true, fullName: true } },
        assignedSupervisor: { select: { id: true, fullName: true } },
        assigner: { select: { id: true, fullName: true } },
        planner: { select: { id: true, fullName: true } },
        maintenanceRequest: {
          select: {
            id: true, requestNumber: true, title: true, description: true,
            category: true, priority: true, status: true,
            createdAt: true,
            requester: { select: { id: true, fullName: true, department: true } },
          },
        },
        pmSchedule: { select: { id: true, title: true, frequencyType: true, frequencyValue: true } },
        teamMembers: {
          include: { user: { select: { id: true, fullName: true, department: true } } },
          orderBy: { assignedAt: 'asc' as const },
        },
        timeLogs: {
          include: {
            user: { select: { id: true, fullName: true } },
            loggedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { timestamp: 'asc' as const },
        },
        materials: {
          include: {
            requester: { select: { id: true, fullName: true } },
            approver: { select: { id: true, fullName: true } },
            issuer: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
        taskExecutions: {
          include: { completedBy: { select: { id: true, fullName: true } } },
          orderBy: { taskNumber: 'asc' as const },
        },
        statusHistory: {
          include: { performedBy: { select: { id: true, fullName: true, username: true } } },
          orderBy: { createdAt: 'asc' as const },
        },
        workOrderDowntimes: { orderBy: { downtimeStart: 'asc' as const } },
        repairCompletion: {
          include: {
            supervisorApprovedBy: { select: { id: true, fullName: true } },
            plannerClosedBy: { select: { id: true, fullName: true } },
          },
        },
        failureRecords: { orderBy: { detectedAt: 'desc' as const } },
        shiftHandovers: {
          include: {
            handedOverBy: { select: { id: true, fullName: true } },
            receivedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
        teamMemberRequests: {
          include: {
            requestedByUser: { select: { id: true, fullName: true } },
            requestedUser: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
        workOrderComponents: {
          include: {
            componentRegistry: { select: {
              id: true, componentCode: true, name: true, componentType: true,
              criticality: true, lifecycleStatus: true,
            } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
        repairMaterialRequests: {
          include: {
            item: { select: { id: true, itemCode: true, unitOfMeasure: true, binLocation: true, specification: true } },
            requestedBy: { select: { id: true, fullName: true } },
            supervisorApprovedBy: { select: { id: true, fullName: true } },
            issuedByUser: { select: { id: true, fullName: true } },
            returnedByUser: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
        repairToolRequests: {
          include: {
            tool: { select: { id: true, toolCode: true, name: true } },
            items: {
              include: {
                tool: { select: { id: true, toolCode: true, name: true, category: true } },
              },
              orderBy: { createdAt: 'asc' as const },
            },
            requestedBy: { select: { id: true, fullName: true } },
            issuedByUser: { select: { id: true, fullName: true } },
            returnedByUser: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
        toolTransactions: {
          include: {
            tool: { select: { id: true, name: true, toolCode: true } },
            performedBy: { select: { id: true, fullName: true } },
            toUser: { select: { id: true, fullName: true } },
            fromUser: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    // ── WO must be in closed status ──
    if (wo.status !== 'closed') {
      return NextResponse.json(
        { success: false, error: `Work order is not closed (current status: ${wo.status})`, currentStatus: wo.status },
        { status: 400 },
      );
    }

    // ── Plant scope filter ──
    if (scope.isScoped && scope.plantId && wo.plantId !== scope.plantId) {
      return NextResponse.json({ success: false, error: 'Work order not in your plant scope' }, { status: 403 });
    }

    // WorkOrder stores plantId as a scalar and has no Prisma plant relation.
    // Resolve the plant explicitly so the Closed WO Pack receives the expected
    // descriptive plant shape without inventing a schema relation.
    const plant: ClosedWOPackData['plant'] = wo.plantId
      ? await db.plant.findUnique({
          where: { id: wo.plantId },
          select: { name: true, code: true, location: true, city: true, country: true },
        })
      : null;

    // ── Fetch Asset separately ──
    let asset: Record<string, unknown> | null = null;
    if (wo.assetId) {
      const assetRecord = await db.asset.findUnique({
        where: { id: wo.assetId },
        include: { category: { select: { id: true, name: true } } },
      });
      if (assetRecord) {
        const { category, ...rest } = assetRecord;
        asset = { ...rest, category };
      }
    }

    // ── Fetch InventoryItems for materials ──
    const materialItemIds = wo.materials.map((m) => m.itemId).filter((id): id is string => !!id);
    let inventoryItemMap: Record<string, Record<string, unknown>> = {};
    if (materialItemIds.length > 0) {
      const inventoryItems = await db.inventoryItem.findMany({
        where: { id: { in: materialItemIds } },
        select: { id: true, itemCode: true, unitOfMeasure: true, binLocation: true, specification: true, currentStock: true },
      });
      for (const item of inventoryItems) {
        inventoryItemMap[item.id] = item as unknown as Record<string, unknown>;
      }
    }
    const materialsWithInventory = wo.materials.map((m) => ({
      ...m,
      inventoryItem: m.itemId ? (inventoryItemMap[m.itemId] as ClosedWOPackData['materials'][0] extends Record<string, unknown> ? Record<string, unknown> : never) ?? null : null,
    }));

    // ── Fetch Attachments ──
    const attachments = await db.attachment.findMany({
      where: { entityType: 'work_order', entityId: wo.id },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { uploadedAt: 'asc' as const },
    });

    // WorkInstructionExecution stores technicianId as a scalar and has no
    // Prisma technician relation. Resolve technician names explicitly and map
    // them back into the shape expected by the PDF generator.
    const wiExecutionsRaw = await db.workInstructionExecution.findMany({
      where: { workOrderId: wo.id },
      include: {
        workInstruction: { select: { id: true, title: true } },
      },
      orderBy: { startedAt: 'asc' as const },
    });
    const wiTechnicianIds = [
      ...new Set(
        wiExecutionsRaw
          .map((execution) => execution.technicianId)
          .filter((technicianId): technicianId is string => Boolean(technicianId)),
      ),
    ];
    const wiTechnicians = wiTechnicianIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: wiTechnicianIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const wiTechnicianMap = new Map(wiTechnicians.map((technician) => [technician.id, technician]));
    const wiExecutions = wiExecutionsRaw.map((execution) => ({
      ...execution,
      technician: wiTechnicianMap.get(execution.technicianId) ?? null,
    }));

    // ── Fetch Company Profile ──
    const companyProfile = await db.companyProfile.findFirst({
      select: {
        companyName: true, tradingName: true, address: true, city: true,
        region: true, country: true, postalCode: true, phone: true,
        email: true, website: true, currency: true,
      },
    });

    // ── Build ClosedWOPackData ──
    const packData: ClosedWOPackData = {
      workOrder: wo,
      assignee: wo.assignee ? { fullName: wo.assignee.fullName, department: wo.assignee.department } : null,
      teamLeader: wo.teamLeader ? { fullName: wo.teamLeader.fullName } : null,
      supervisor: wo.assignedSupervisor ? { fullName: wo.assignedSupervisor.fullName } : null,
      planner: wo.planner ? { fullName: wo.planner.fullName } : null,
      assigner: wo.assigner ? { fullName: wo.assigner.fullName } : null,
      plant,
      asset,
      components: wo.workOrderComponents.map((wc) => ({
        ...wc,
        componentRegistry: wc.componentRegistry,
      })),
      sourceRequest: wo.maintenanceRequest
        ? {
            id: wo.maintenanceRequest.id,
            requestNumber: wo.maintenanceRequest.requestNumber,
            title: wo.maintenanceRequest.title,
            description: wo.maintenanceRequest.description,
            category: wo.maintenanceRequest.category,
            priority: wo.maintenanceRequest.priority,
            status: wo.maintenanceRequest.status,
            createdAt: wo.maintenanceRequest.createdAt,
            requester: wo.maintenanceRequest.requester
              ? { fullName: wo.maintenanceRequest.requester.fullName, department: wo.maintenanceRequest.requester.department }
              : null,
          }
        : null,
      pmSchedule: wo.pmSchedule,
      teamMembers: wo.teamMembers.map((tm) => ({
        id: tm.id, role: tm.role, accessLevel: tm.accessLevel, assignedAt: tm.assignedAt,
        user: { fullName: tm.user.fullName, department: tm.user.department },
      })),
      timeLogs: wo.timeLogs,
      downtimes: wo.workOrderDowntimes,
      taskExecutions: wo.taskExecutions,
      materials: materialsWithInventory,
      repairMaterialRequests: wo.repairMaterialRequests,
      toolRequests: wo.repairToolRequests,
      toolTransactions: wo.toolTransactions,
      failureRecords: wo.failureRecords,
      repairCompletion: wo.repairCompletion,
      shiftHandovers: wo.shiftHandovers,
      assistanceRequests: wo.teamMemberRequests.map(({ requestedByUser, ...request }) => ({
        ...request,
        requestedBy: requestedByUser,
      })),
      attachments,
      statusHistory: wo.statusHistory,
      workInstructionExecutions: wiExecutions,
      companyInfo: companyProfile
        ? {
            name: companyProfile.tradingName || companyProfile.companyName,
            legalName: companyProfile.companyName,
            address: [companyProfile.address, companyProfile.city, companyProfile.region, companyProfile.postalCode, companyProfile.country]
              .filter(Boolean).join(', '),
            phone: companyProfile.phone ?? '',
            email: companyProfile.email ?? '',
            website: companyProfile.website ?? '',
            currency: companyProfile.currency,
          }
        : { name: 'iAssetsPro', legalName: 'iAssetsPro EAM', address: '', phone: '', email: '', website: '', currency: 'USD' },
      generatedAt: new Date(),
    };

    // ── Generate PDF ──
    const pdfBuffer = await generateClosedWOPackPDF(packData);
    const filename = `${wo.woNumber}-closed-pack.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[Closed WO Pack] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate closed WO pack', details: (error as Error).message },
      { status: 500 },
    );
  }
}
