import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { ObjectStorageService } from '@/services/objectStorage.service';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id, attachmentId } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true } },
        maintenanceRequest: { select: { requestedBy: true } },
      },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Access denied — you are not part of this work order workflow' }, { status: 403 });
    }

    const attachment = await db.attachment.findUnique({
      where: { id: attachmentId },
      select: { entityType: true, entityId: true, filePath: true, fileName: true, fileType: true },
    });
    if (!attachment || attachment.entityType !== 'work_order' || attachment.entityId !== id) {
      return NextResponse.json({ success: false, error: 'Attachment not found' }, { status: 404 });
    }

    const stored = await ObjectStorageService.download(attachment.filePath);
    if (!stored) return NextResponse.json({ success: false, error: 'Evidence file not found' }, { status: 404 });

    const safeName = attachment.fileName.replace(/["\r\n]/g, '_');
    const inline = attachment.fileType.startsWith('image/') || attachment.fileType === 'application/pdf';
    const responseBody = Uint8Array.from(stored.buffer).buffer;
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': attachment.fileType || stored.mimeType,
        'Content-Length': String(stored.buffer.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to download work-order evidence';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id, attachmentId } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        isLocked: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, accessLevel: true } },
        maintenanceRequest: { select: { requestedBy: true } },
      },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (wo.isLocked || wo.status === 'closed') {
      return NextResponse.json({ success: false, error: 'Work order is locked and evidence cannot be removed' }, { status: 409 });
    }

    const attachment = await db.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        filePath: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        description: true,
        uploadedById: true,
        uploadedAt: true,
      },
    });
    if (!attachment || attachment.entityType !== 'work_order' || attachment.entityId !== id) {
      return NextResponse.json({ success: false, error: 'Attachment not found' }, { status: 404 });
    }

    const canManage =
      canManageWorkOrder(session, wo) &&
      (isAdmin(session) || hasPermission(session, 'work_orders.update'));
    const isUploader = attachment.uploadedById === session.userId;
    if (!isUploader && !canManage) {
      return NextResponse.json(
        { success: false, error: 'Only the uploader or authorized maintenance management can remove this evidence' },
        { status: 403 },
      );
    }

    await db.attachment.delete({ where: { id: attachmentId } });
    const storageDeleted = await ObjectStorageService.delete(attachment.filePath);

    await createAuditLog(session.userId, 'Attachment', 'delete', attachmentId, {
      oldValues: {
        workOrderId: id,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        description: attachment.description,
        uploadedById: attachment.uploadedById,
        uploadedAt: attachment.uploadedAt.toISOString(),
        filePath: attachment.filePath,
      },
      newValues: {
        workOrderId: id,
        removed: true,
        storageDeleted,
      },
    });

    return NextResponse.json({ success: true, data: { id: attachmentId } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove work-order evidence';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
