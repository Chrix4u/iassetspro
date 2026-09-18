import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { ObjectStorageService } from '@/services/objectStorage.service';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id: workOrderId } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id: workOrderId },
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
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const isWritableExecutionActor =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some((member) => member.userId === session.userId && member.accessLevel !== 'read_only');
    const canManage =
      canManageWorkOrder(session, wo) &&
      (isAdmin(session) || hasPermission(session, 'work_orders.update'));
    if (!isWritableExecutionActor && !canManage) {
      return NextResponse.json({ success: false, error: 'Only assigned execution staff or authorized maintenance management can upload work-order evidence' }, { status: 403 });
    }

    if (wo.isLocked || wo.status === 'closed') {
      return NextResponse.json({ success: false, error: 'Work order is locked and cannot be modified' }, { status: 409 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const description = (formData.get('description') as string) || null;
    const category = (formData.get('category') as string) || null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'File is required' }, { status: 400 });
    }

    const validation = ObjectStorageService.validateUpload(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = ObjectStorageService.generateKey(`work-orders/${workOrderId}`, file.name);
    const uploadResult = await ObjectStorageService.upload(key, buffer, file.type);
    const finalDescription = category
      ? `[${category}]${description ? ' ' + description : ''}`
      : description;

    const attachment = await db.attachment.create({
      data: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        filePath: uploadResult.key,
        entityType: 'work_order',
        entityId: workOrderId,
        uploadedById: session.userId,
        description: finalDescription,
      },
      include: { uploadedBy: { select: { id: true, fullName: true, username: true } } },
    });

    return NextResponse.json({ success: true, data: attachment }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload attachment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id: workOrderId } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
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
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json({ success: false, error: 'Access denied — you are not part of this work order workflow' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const where: Record<string, unknown> = {
      entityType: 'work_order',
      entityId: workOrderId,
    };
    if (category) where.description = { startsWith: `[${category}]` };

    const attachments = await db.attachment.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      include: { uploadedBy: { select: { id: true, fullName: true, username: true } } },
      take: 200,
    });

    const isWritableExecutionActor =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some((member) => member.userId === session.userId && member.accessLevel !== 'read_only');
    const canManage =
      canManageWorkOrder(session, wo) &&
      (isAdmin(session) || hasPermission(session, 'work_orders.update'));
    const deletionAllowed = !wo.isLocked && wo.status !== 'closed';

    return NextResponse.json({
      success: true,
      data: attachments.map((attachment) => ({
        ...attachment,
        canDelete:
          deletionAllowed &&
          (
            (attachment.uploadedById === session.userId && isWritableExecutionActor) ||
            canManage
          ),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch attachments';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
