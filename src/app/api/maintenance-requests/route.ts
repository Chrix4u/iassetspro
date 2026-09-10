import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope, applyPlantScope } from '@/lib/plant-scope';
import { notifyUser, notifyAdmins } from '@/lib/notifications';

async function generateRequestNumber(): Promise<string> {
  const now = new Date();
  const prefix = `MR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const latest = await db.maintenanceRequest.findFirst({
    where: { requestNumber: { startsWith: prefix } },
    orderBy: { requestNumber: 'desc' },
    select: { requestNumber: true },
  });

  let nextNum = 1;
  if (latest) {
    const parts = latest.requestNumber.split('-');
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
    if (
      !hasPermission(session, 'maintenance_requests.view') &&
      !hasPermission(session, 'maintenance_requests.view_own') &&
      !isAdmin(session)
    ) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const hasViewAll =
      hasPermission(session, 'maintenance_requests.view') ||
      hasPermission(session, 'maintenance_requests.view_all') ||
      isAdmin(session);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search');

    const plantScope = await getPlantScope(request, session);
    const where: Record<string, unknown> = {};

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (search) where.title = { contains: search };

    if (!hasViewAll) {
      where.requestedBy = session.userId;
    } else if (!isAdmin(session)) {
      if (session.roles.includes('maintenance_supervisor')) {
        const supervisedDepts = await db.department.findMany({
          where: { supervisorId: session.userId },
          select: { id: true },
        });
        const supervisedDeptIds = supervisedDepts.map((d) => d.id);
        if (supervisedDeptIds.length > 0) {
          where.OR = [
            { supervisorId: session.userId },
            { departmentId: { in: supervisedDeptIds } },
          ];
        } else {
          where.supervisorId = session.userId;
        }
      } else if (session.roles.includes('maintenance_technician')) {
        where.OR = [
          { requestedBy: session.userId },
          { workOrder: { assignedTo: session.userId } },
        ];
      }
    }

    if (plantScope) applyPlantScope(where, plantScope);

    const [requests, total] = await Promise.all([
      db.maintenanceRequest.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          asset: { select: { id: true, name: true, assetTag: true, serialNumber: true } },
          requester: { select: { id: true, fullName: true, username: true } },
          supervisor: { select: { id: true, fullName: true, username: true } },
          approver: { select: { id: true, fullName: true, username: true } },
          assignedPlanner: { select: { id: true, fullName: true, username: true } },
          workOrder: { select: { id: true, woNumber: true, title: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.maintenanceRequest.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load maintenance requests';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'maintenance_requests.create') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      priority,
      category,
      assetId,
      assetName,
      location,
      departmentId,
      plantId,
      machineDownStatus,
      supervisorId: explicitSupervisorId,
      estimatedHours,
      slaHours,
      plannedStart,
      plannedEnd,
      notes,
    } = body;

    if (!title || !String(title).trim()) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const normalizedAssetName = typeof assetName === 'string' ? assetName.trim() : '';
    if (!assetId && !normalizedAssetName) {
      return NextResponse.json(
        { success: false, error: 'Select a registered asset or enter an asset/item name' },
        { status: 400 },
      );
    }

    let resolvedPlantId: string | null = plantId || null;
    if (!resolvedPlantId) {
      const primaryPlant = await db.userPlant.findFirst({
        where: { userId: session.userId, isPrimary: true },
        select: { plantId: true },
      });
      resolvedPlantId = primaryPlant?.plantId ?? null;
    }
    if (!resolvedPlantId && !isAdmin(session)) {
      const anyPlant = await db.userPlant.findFirst({
        where: { userId: session.userId },
        select: { plantId: true },
      });
      resolvedPlantId = anyPlant?.plantId ?? null;
    }
    if (!resolvedPlantId) {
      return NextResponse.json(
        { success: false, error: 'Plant selection required. You must specify a plant for maintenance requests.' },
        { status: 400 },
      );
    }

    if (!isAdmin(session)) {
      const plantAccess = await db.userPlant.findUnique({
        where: { userId_plantId: { userId: session.userId, plantId: resolvedPlantId } },
        select: { id: true },
      });
      if (!plantAccess) {
        return NextResponse.json(
          { success: false, error: 'You do not have access to the selected plant' },
          { status: 403 },
        );
      }
    }

    let resolvedAssetName: string | null = normalizedAssetName || null;

    if (assetId) {
      const asset = await db.asset.findUnique({
        where: { id: assetId },
        select: { id: true, plantId: true, name: true },
      });
      if (!asset) {
        return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
      }
      if (asset.plantId !== resolvedPlantId) {
        return NextResponse.json(
          { success: false, error: 'Asset does not belong to the selected plant' },
          { status: 400 },
        );
      }
      resolvedAssetName = asset.name;
    }

    let resolvedDepartmentId: string | null = departmentId || null;
    let resolvedSupervisorId: string | null = explicitSupervisorId || null;

    if (resolvedDepartmentId) {
      const department = await db.department.findUnique({
        where: { id: resolvedDepartmentId },
        select: { id: true, plantId: true, supervisorId: true },
      });
      if (!department) {
        return NextResponse.json({ success: false, error: 'Department not found' }, { status: 404 });
      }
      if (department.plantId !== resolvedPlantId) {
        return NextResponse.json(
          { success: false, error: 'Department does not belong to the selected plant' },
          { status: 400 },
        );
      }
      if (!resolvedSupervisorId) resolvedSupervisorId = department.supervisorId ?? null;
    } else {
      // Backward-compatible bridge: User.department is currently a legacy string,
      // while MaintenanceRequest uses Department.id. Resolve it by id/code/name
      // inside the selected plant when possible.
      const requester = await db.user.findUnique({
        where: { id: session.userId },
        select: { department: true },
      });
      const legacyDepartment = requester?.department?.trim();
      if (legacyDepartment) {
        const department = await db.department.findFirst({
          where: {
            plantId: resolvedPlantId,
            OR: [
              { id: legacyDepartment },
              { code: legacyDepartment },
              { name: legacyDepartment },
            ],
          },
          select: { id: true, supervisorId: true },
        });
        if (department) {
          resolvedDepartmentId = department.id;
          if (!resolvedSupervisorId) resolvedSupervisorId = department.supervisorId ?? null;
        }
      }
    }

    if (resolvedSupervisorId) {
      const supervisor = await db.user.findUnique({
        where: { id: resolvedSupervisorId },
        select: {
          status: true,
          userRoles: { select: { role: { select: { slug: true } } } },
          plantAccess: { where: { plantId: resolvedPlantId }, select: { id: true } },
        },
      });
      const supervisorRoles = supervisor?.userRoles.map((ur) => ur.role.slug) ?? [];
      const isMaintenanceSupervisor = supervisorRoles.some((slug) =>
        ['maintenance_supervisor', 'maintenance_manager', 'plant_manager', 'admin'].includes(slug),
      );
      if (!supervisor || supervisor.status !== 'active' || !isMaintenanceSupervisor) {
        return NextResponse.json(
          { success: false, error: 'Selected supervisor is not an active maintenance approver' },
          { status: 400 },
        );
      }
      if (supervisor.plantAccess.length === 0 && !supervisorRoles.includes('admin')) {
        return NextResponse.json(
          { success: false, error: 'Selected supervisor does not have access to the selected plant' },
          { status: 400 },
        );
      }
    } else if (!isAdmin(session)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Supervisor assignment required. Configure the requester department supervisor or select an authorized supervisor.',
        },
        { status: 400 },
      );
    }

    const requestNumber = await generateRequestNumber();
    const mr = await db.maintenanceRequest.create({
      data: {
        requestNumber,
        title,
        description: description || null,
        priority: priority || 'medium',
        category: category || null,
        assetId: assetId || null,
        assetName: resolvedAssetName,
        location: location || null,
        departmentId: resolvedDepartmentId,
        plantId: resolvedPlantId,
        requestedBy: session.userId,
        supervisorId: resolvedSupervisorId,
        machineDownStatus: machineDownStatus || false,
        estimatedHours: estimatedHours || null,
        slaHours: slaHours || null,
        plannedStart: plannedStart ? new Date(plannedStart) : null,
        plannedEnd: plannedEnd ? new Date(plannedEnd) : null,
        notes: notes || null,
      },
      include: {
        requester: { select: { id: true, fullName: true, username: true } },
        supervisor: { select: { id: true, fullName: true, username: true } },
      },
    });

    if (resolvedSupervisorId && resolvedSupervisorId !== session.userId) {
      const desc = description ? description.substring(0, 120) : '';
      const assetInfo = resolvedAssetName || '';
      const priorityLabel = (priority || 'medium').toUpperCase();
      await notifyUser(
        resolvedSupervisorId,
        'mr_assigned',
        `New MR: ${mr.requestNumber} [${priorityLabel}]`,
        `"${mr.title}"${assetInfo ? ` — ${assetInfo}` : ''}\nSubmitted by ${mr.requester?.fullName || 'Unknown'}${desc ? `\n${desc}` : ''}`,
        'maintenance_request',
        mr.id,
        `mr-detail?id=${mr.id}`,
        { forceSms: true },
      );
    }

    await notifyAdmins(
      'mr_assigned',
      `New MR: ${mr.requestNumber}`,
      `"${mr.title}" submitted by ${mr.requester?.fullName || 'Unknown'}${description ? `\n${description.substring(0, 100)}` : ''}`,
      'maintenance_request',
      mr.id,
      `mr-detail?id=${mr.id}`,
      { forceSms: true },
    );

    return NextResponse.json({ success: true, data: mr }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create maintenance request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
