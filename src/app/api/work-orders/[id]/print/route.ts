import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { generateWODetailPDF } from '@/lib/generate-wo-detail-pdf';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

// GET /api/work-orders/[id]/print
// Returns enriched WO data as JSON (default) or PDF binary (?format=pdf)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const hasBroadAccess =
      isAdmin(session) ||
      hasAnyPermission(session, ['work_orders.view', 'work_orders.view_all', 'work_orders.export', 'reports.export', 'reports.view']);
    const hasOwnAccess = hasAnyPermission(session, ['work_orders.view_own']);

    if (!hasBroadAccess && !hasOwnAccess) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    // Plant authorization
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    // ── Fetch WorkOrder with ALL relations ──
    const wo = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true, department: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
        assigner: { select: { id: true, fullName: true, username: true } },
        planner: { select: { id: true, fullName: true, username: true } },
        maintenanceRequest: {
          select: {
            id: true,
            requestNumber: true,
            title: true,
            description: true,
            category: true,
            createdAt: true,
            requester: { select: { id: true, fullName: true, username: true, department: true } },
          },
        },
        pmSchedule: { select: { id: true, title: true, frequencyType: true, frequencyValue: true } },
        teamMembers: {
          include: { user: { select: { id: true, fullName: true, username: true, department: true } } },
          orderBy: { assignedAt: 'asc' as const },
        },
        timeLogs: {
          include: {
            user: { select: { id: true, fullName: true, username: true } },
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
        comments: {
          include: { user: { select: { id: true, fullName: true, username: true } } },
          orderBy: { createdAt: 'desc' as const },
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
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    // `work_orders.view_own` is deliberately scoped to execution ownership.
    // It must never become a broad WO export permission.
    if (!hasBroadAccess) {
      const isAssigned = wo.assignedTo === session.userId;
      const isTeamLeader = wo.teamLeaderId === session.userId;
      const isTeamMember = wo.teamMembers.some((member) => member.userId === session.userId);
      if (!isAssigned && !isTeamLeader && !isTeamMember) {
        return NextResponse.json({ success: false, error: 'You do not have access to print this work order' }, { status: 403 });
      }
    }

    // ── Fetch Asset separately (no WorkOrder Prisma relation) ──
    const assetRecord = wo.assetId
      ? await db.asset.findUnique({
          where: { id: wo.assetId },
          include: { category: { select: { id: true, name: true } } },
        })
      : null;
    const assetCategory = assetRecord?.category ?? null;
    const asset = assetRecord
      ? (() => {
          const { category: _category, ...assetWithoutCategory } = assetRecord;
          return assetWithoutCategory;
        })()
      : null;

    // ── Fetch InventoryItems for materials ──
    const materialItemIds = wo.materials
      .map((m) => m.itemId)
      .filter((itemId): itemId is string => !!itemId);

    const inventoryItemMap: Record<string, {
      itemCode: string | null;
      unitOfMeasure: string;
      supplier: string | null;
      supplierPartNumber: string | null;
      binLocation: string | null;
      specification: string;
      currentStock: number;
    }> = {};

    if (materialItemIds.length > 0) {
      const inventoryItems = await db.inventoryItem.findMany({
        where: { id: { in: materialItemIds } },
        select: {
          id: true,
          itemCode: true,
          unitOfMeasure: true,
          supplier: true,
          supplierPartNumber: true,
          binLocation: true,
          specification: true,
          currentStock: true,
        },
      });
      for (const item of inventoryItems) {
        inventoryItemMap[item.id] = item;
      }
    }

    const materialsWithInventory = wo.materials.map((m) => ({
      ...m,
      inventoryItem: m.itemId ? inventoryItemMap[m.itemId] ?? null : null,
    }));

    // ── Fetch Company Profile ──
    const companyProfile = await db.companyProfile.findFirst({
      select: {
        companyName: true,
        tradingName: true,
        address: true,
        city: true,
        region: true,
        country: true,
        postalCode: true,
        phone: true,
        email: true,
        website: true,
        currency: true,
      },
    });

    // ── Build response data ──
    const data = {
      workOrder: wo,
      assignee: wo.assignee ? { fullName: wo.assignee.fullName, department: wo.assignee.department } : null,
      teamLeader: wo.teamLeader ? { fullName: wo.teamLeader.fullName } : null,
      supervisor: wo.assignedSupervisor ? { fullName: wo.assignedSupervisor.fullName } : null,
      planner: wo.planner ? { fullName: wo.planner.fullName } : null,
      assigner: wo.assigner ? { fullName: wo.assigner.fullName } : null,
      asset: asset
        ? {
            ...asset,
            category: assetCategory,
          }
        : null,
      materials: materialsWithInventory,
      timeLogs: wo.timeLogs,
      downtimes: wo.workOrderDowntimes,
      repairCompletion: wo.repairCompletion,
      statusHistory: wo.statusHistory,
      teamMembers: wo.teamMembers.map((tm) => ({
        id: tm.id,
        role: tm.role,
        accessLevel: tm.accessLevel,
        assignedAt: tm.assignedAt,
        user: { fullName: tm.user.fullName, department: tm.user.department },
      })),
      failureRecords: wo.failureRecords,
      taskExecutions: wo.taskExecutions,
      sourceRequest: wo.maintenanceRequest
        ? {
            id: wo.maintenanceRequest.id,
            requestNumber: wo.maintenanceRequest.requestNumber,
            title: wo.maintenanceRequest.title,
            category: wo.maintenanceRequest.category,
            createdAt: wo.maintenanceRequest.createdAt,
            requester: wo.maintenanceRequest.requester
              ? { fullName: wo.maintenanceRequest.requester.fullName, department: wo.maintenanceRequest.requester.department }
              : null,
          }
        : null,
      pmSchedule: wo.pmSchedule,
      companyInfo: companyProfile
        ? {
            name: companyProfile.tradingName || companyProfile.companyName,
            legalName: companyProfile.companyName,
            address: [companyProfile.address, companyProfile.city, companyProfile.region, companyProfile.postalCode, companyProfile.country]
              .filter(Boolean)
              .join(', '),
            phone: companyProfile.phone ?? '',
            email: companyProfile.email ?? '',
            website: companyProfile.website ?? '',
            currency: companyProfile.currency || 'GHS',
          }
        : {
            name: 'iAssetsPro',
            legalName: 'iAssetsPro CMMS',
            address: '',
            phone: '',
            email: '',
            website: '',
            currency: 'GHS',
          },
    };

    // ── Return PDF binary if requested ──
    if (format === 'pdf') {
      const pdfBuffer = await generateWODetailPDF(data);
      const filename = `${wo.woNumber || 'work-order'}-print.pdf`;
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}"`,
        },
      });
    }

    // ── Default: return JSON ──
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[WO Print] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate print data', details: (error as Error).message },
      { status: 500 }
    );
  }
}
