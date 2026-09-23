import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { notifyUser } from '@/lib/notifications';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

// GET /api/repairs/damaged-tools/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;

    const report = await db.damagedToolReport.findUnique({
      where: { id },
      include: {
        tool: {
          select: {
            id: true, toolCode: true, name: true, category: true, status: true,
            condition: true, serialNumber: true, purchaseCost: true, currentValue: true,
            manufacturer: true, model: true,
            assignedTo: { select: { id: true, fullName: true, avatar: true } },
          },
        },
        workOrder: {
          select: {
            id: true, plantId: true, woNumber: true, title: true, status: true,
            assetId: true, assetName: true,
            assignee: { select: { id: true, fullName: true } },
          },
        },
        toolRequest: { select: { id: true } },
        reportedBy: { select: { id: true, fullName: true, username: true, avatar: true } },
        technician: { select: { id: true, fullName: true, username: true } },
        repairCompletedBy: { select: { id: true, fullName: true, username: true } },
        writtenOffBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    if (!report) {
      return NextResponse.json({ success: false, error: 'Damaged tool report not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    const reportPlantId = report.workOrder?.plantId;
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, reportPlantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const canViewAllDamageReports =
      isAdmin(session)
      || hasRole(session, 'maintenance_supervisor')
      || hasRole(session, 'maintenance_manager')
      || hasRole(session, 'plant_manager')
      || hasRole(session, 'store_keeper')
      || hasRole(session, 'tools_shop_attendant')
      || hasRole(session, 'inventory_manager');
    if (!canViewAllDamageReports && report.reportedById !== session.userId) {
      return NextResponse.json({ success: false, error: 'Access denied — this damaged tool report is outside your scope' }, { status: 403 });
    }

    const asset = report.workOrder?.assetId
      ? await db.asset.findUnique({
          where: { id: report.workOrder.assetId },
          select: { id: true, name: true, assetTag: true },
        })
      : null;

    const data = {
      ...report,
      workOrder: report.workOrder
        ? {
            ...report.workOrder,
            asset: asset ?? (report.workOrder.assetName
              ? { id: report.workOrder.assetId, name: report.workOrder.assetName, assetTag: null }
              : null),
          }
        : null,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch damaged tool report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/repairs/damaged-tools/[id] — update basic fields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const existing = await db.damagedToolReport.findUnique({
      where: { id },
      include: { workOrder: { select: { plantId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Damaged tool report not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, existing.workOrder?.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const canEditDamageReport =
      isAdmin(session)
      || hasRole(session, 'maintenance_supervisor')
      || hasRole(session, 'maintenance_manager')
      || hasRole(session, 'plant_manager')
      || hasRole(session, 'store_keeper')
      || hasRole(session, 'tools_shop_attendant')
      || hasRole(session, 'inventory_manager');
    if (!canEditDamageReport && existing.reportedById !== session.userId) {
      return NextResponse.json({ success: false, error: 'You can only update your own damaged tool reports' }, { status: 403 });
    }

    const terminalStatuses = ['repaired', 'written_off', 'replaced'];
    if (terminalStatuses.includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot update: report is in terminal status '${existing.status}'` },
        { status: 400 },
      );
    }

    const allowedFields = ['damageDescription', 'damagePhotoUrls', 'damageSeverity', 'occurredAt', 'technicianId', 'assessmentNotes', 'estimatedRepairCost', 'repairVendorId', 'repairVendorName'];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await db.damagedToolReport.update({
      where: { id },
      data: updateData,
      include: {
        tool: { select: { id: true, toolCode: true, name: true } },
        reportedBy: { select: { id: true, fullName: true } },
        technician: { select: { id: true, fullName: true } },
      },
    });

    await createAuditLog(session.userId, 'DamagedToolReport', 'update', id, {
      newValues: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update damaged tool report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/repairs/damaged-tools/[id] — workflow actions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const isStoreRole = isAdmin(session) || hasRole(session, 'inventory_manager') || hasRole(session, 'store_keeper') || hasRole(session, 'tools_shop_attendant');
    const isMaintRole = isAdmin(session) || hasRole(session, 'maintenance_manager') || hasRole(session, 'maintenance_supervisor') || hasRole(session, 'maintenance_planner');

    if (action === 'assess') {
      if (!isStoreRole && !isMaintRole) {
        return NextResponse.json({ success: false, error: 'Only maintenance or store roles can assess damage' }, { status: 403 });
      }
    }
    if (action === 'quote_repair' || action === 'write_off' || action === 'replace') {
      if (!isStoreRole) {
        return NextResponse.json({ success: false, error: 'Only store/inventory roles can manage repair costs and tool replacement' }, { status: 403 });
      }
    }
    if (action === 'start_repair' || action === 'complete_repair') {
      if (!isStoreRole && !isMaintRole) {
        return NextResponse.json({ success: false, error: 'Only maintenance or store roles can manage repairs' }, { status: 403 });
      }
    }

    const existing = await db.damagedToolReport.findUnique({
      where: { id },
      include: {
        tool: true,
        workOrder: { select: { id: true, woNumber: true, title: true, plantId: true } },
        reportedBy: { select: { id: true, fullName: true } },
        technician: { select: { id: true, fullName: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Damaged tool report not found' }, { status: 404 });
    }

    const actionPlantScope = await getPlantScope(request, session);
    if (actionPlantScope.denyAccess || !canAccessPlantStrict(actionPlantScope, existing.workOrder?.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const now = new Date();

    if (action === 'assess') {
      if (existing.status !== 'reported') {
        return NextResponse.json({ success: false, error: `Cannot assess: current status is '${existing.status}', expected 'reported'` }, { status: 400 });
      }

      const { assessmentNotes, estimatedRepairCost } = body;

      const updated = await db.damagedToolReport.update({
        where: { id },
        data: {
          status: 'assessed',
          assessmentNotes: assessmentNotes || null,
          estimatedRepairCost: estimatedRepairCost ?? null,
        },
        include: {
          tool: { select: { id: true, toolCode: true, name: true } },
          reportedBy: { select: { id: true, fullName: true } },
        },
      });

      await createAuditLog(session.userId, 'DamagedToolReport', 'assess', id, {
        newValues: { status: 'assessed', estimatedRepairCost },
      });

      await notifyUser(
        existing.reportedById,
        'tool_damage_assessed',
        'Tool Damage Assessment Complete',
        `${existing.reportNumber}: Assessment completed${estimatedRepairCost ? `, est. cost: $${estimatedRepairCost}` : ''}`,
        'damaged_tool', id, 'damaged-tools',
      ).catch(() => {});

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'quote_repair') {
      if (existing.status !== 'assessed') {
        return NextResponse.json({ success: false, error: `Cannot quote repair: current status is '${existing.status}', expected 'assessed'` }, { status: 400 });
      }

      const { repairVendorId, repairVendorName, estimatedRepairCost } = body;

      const updated = await db.damagedToolReport.update({
        where: { id },
        data: {
          status: 'repair_quoted',
          repairVendorId: repairVendorId || null,
          repairVendorName: repairVendorName || null,
          estimatedRepairCost: estimatedRepairCost ?? existing.estimatedRepairCost ?? null,
        },
        include: {
          tool: { select: { id: true, toolCode: true, name: true } },
        },
      });

      await createAuditLog(session.userId, 'DamagedToolReport', 'quote_repair', id, {
        newValues: { status: 'repair_quoted', repairVendorName, estimatedRepairCost },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'start_repair') {
      if (existing.status !== 'repair_quoted') {
        return NextResponse.json({ success: false, error: `Cannot start repair: current status is '${existing.status}', expected 'repair_quoted'` }, { status: 400 });
      }

      const updated = await db.damagedToolReport.update({
        where: { id },
        data: {
          status: 'repair_in_progress',
          repairStartedAt: now,
        },
        include: {
          tool: { select: { id: true, toolCode: true, name: true } },
        },
      });

      await createAuditLog(session.userId, 'DamagedToolReport', 'start_repair', id, {
        newValues: { status: 'repair_in_progress' },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'complete_repair') {
      if (existing.status !== 'repair_in_progress') {
        return NextResponse.json({ success: false, error: `Cannot complete repair: current status is '${existing.status}', expected 'repair_in_progress'` }, { status: 400 });
      }

      const { actualRepairCost } = body;

      const [updated] = await db.$transaction([
        db.damagedToolReport.update({
          where: { id },
          data: {
            status: 'repaired',
            actualRepairCost: actualRepairCost ?? null,
            repairCompletedAt: now,
            repairCompletedById: session.userId,
          },
          include: {
            tool: { select: { id: true, toolCode: true, name: true } },
            repairCompletedBy: { select: { id: true, fullName: true } },
            reportedBy: { select: { id: true, fullName: true } },
          },
        }),
        db.tool.update({
          where: { id: existing.toolId },
          data: { status: 'available', condition: 'good' },
        }),
        db.toolTransaction.create({
          data: {
            toolId: existing.toolId,
            type: 'repair_complete',
            notes: `Repair completed: ${existing.reportNumber}`,
            performedById: session.userId,
          },
        }),
      ]);

      await createAuditLog(session.userId, 'DamagedToolReport', 'complete_repair', id, {
        newValues: { status: 'repaired', actualRepairCost },
      });

      const notifyIds = [existing.reportedById, existing.technicianId].filter(Boolean) as string[];
      for (const uid of notifyIds) {
        await notifyUser(
          uid,
          'tool_repair_completed',
          'Tool Repair Completed',
          `${existing.reportNumber}: ${existing.tool?.name || 'Tool'} has been repaired`,
          'damaged_tool', id, 'damaged-tools',
        ).catch(() => {});
      }

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'write_off') {
      if (!['reported', 'assessed', 'repair_quoted', 'repair_in_progress'].includes(existing.status)) {
        return NextResponse.json({ success: false, error: `Cannot write off: current status is '${existing.status}'` }, { status: 400 });
      }

      const { writeOffReason } = body;
      if (!writeOffReason) {
        return NextResponse.json({ success: false, error: 'writeOffReason is required' }, { status: 400 });
      }

      const [updated] = await db.$transaction([
        db.damagedToolReport.update({
          where: { id },
          data: {
            status: 'written_off',
            writtenOffById: session.userId,
            writtenOffAt: now,
            writeOffReason,
          },
          include: {
            tool: { select: { id: true, toolCode: true, name: true } },
            writtenOffBy: { select: { id: true, fullName: true } },
            reportedBy: { select: { id: true, fullName: true } },
          },
        }),
        db.tool.update({
          where: { id: existing.toolId },
          data: { status: 'retired' },
        }),
        db.toolTransaction.create({
          data: {
            toolId: existing.toolId,
            type: 'retire',
            notes: `Written off: ${existing.reportNumber} - ${writeOffReason}`,
            performedById: session.userId,
          },
        }),
      ]);

      await createAuditLog(session.userId, 'DamagedToolReport', 'write_off', id, {
        newValues: { status: 'written_off', writeOffReason },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === 'replace') {
      if (!['reported', 'assessed', 'repair_quoted', 'repair_in_progress'].includes(existing.status)) {
        return NextResponse.json({ success: false, error: `Cannot replace: current status is '${existing.status}'` }, { status: 400 });
      }

      const { replacedWithToolId } = body;

      const [updated] = await db.$transaction([
        db.damagedToolReport.update({
          where: { id },
          data: {
            status: 'replaced',
            replacedWithToolId: replacedWithToolId || null,
          },
          include: {
            tool: { select: { id: true, toolCode: true, name: true } },
            reportedBy: { select: { id: true, fullName: true } },
          },
        }),
        db.tool.update({
          where: { id: existing.toolId },
          data: { status: 'retired' },
        }),
        db.toolTransaction.create({
          data: {
            toolId: existing.toolId,
            type: 'retire',
            notes: `Replaced: ${existing.reportNumber}`,
            performedById: session.userId,
          },
        }),
      ]);

      if (replacedWithToolId) {
        try {
          await db.tool.update({
            where: { id: replacedWithToolId },
            data: { status: 'available' },
          });
        } catch (err) {
          console.error('[damaged-tools] Failed to update replacement tool status:', err);
        }
      }

      await createAuditLog(session.userId, 'DamagedToolReport', 'replace', id, {
        newValues: { status: 'replaced', replacedWithToolId },
      });

      await notifyUser(
        existing.reportedById,
        'tool_replaced',
        'Damaged Tool Replaced',
        `${existing.reportNumber}: ${existing.tool?.name || 'Tool'} has been replaced${replacedWithToolId ? ' with a new tool' : ''}`,
        'damaged_tool', id, 'damaged-tools',
      ).catch(() => {});

      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process damaged tool action';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
