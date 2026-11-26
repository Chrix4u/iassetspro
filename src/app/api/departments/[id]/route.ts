import { validateDepartmentParent } from '@/lib/department-hierarchy';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import {
  getMaintenanceApproverEligibility,
  maintenanceApproverErrorMessage,
} from '@/lib/maintenance-approvers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Plant access denied'},{status:403});

    const department = await db.department.findUnique({
      where: { id },
      include: {
        supervisor: { select: { id: true, fullName: true, username: true } },
        parent: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
        children: {
          include: {
            supervisor: { select: { id: true, fullName: true, username: true } },
            _count: { select: { children: true } },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    if(!canAccessPlantStrict(scope,department.plantId))
      return NextResponse.json({success:false,error:'Plant access denied'},{status:403});
    // Do not expose children from an inconsistent legacy cross-plant tree.
    return NextResponse.json({ success: true, data: {...department,
      children:department.children.filter(child=>child.plantId===department.plantId)} });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load department';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await db.department.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = ['name', 'code', 'plantId', 'parentId', 'supervisorId'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === '' ? null : body[field];
      }
    }

    if (updateData.parentId === id) {
      return NextResponse.json(
        { success: false, error: 'Department cannot be its own parent' },
        { status: 400 }
      );
    }

    if(updateData.plantId!==undefined&&(typeof updateData.plantId!=='string'||!updateData.plantId.trim()))
      return NextResponse.json({success:false,error:'A valid plant is required'},{status:400});
    if(updateData.parentId!==undefined&&updateData.parentId!==null&&typeof updateData.parentId!=='string')
      return NextResponse.json({success:false,error:'Invalid parent department'},{status:400});
    const effectivePlantId = typeof updateData.plantId === 'string'
      ? updateData.plantId
      : existing.plantId;
    const effectiveParentId=updateData.parentId===undefined?existing.parentId:updateData.parentId as string|null;
    if(effectivePlantId!==existing.plantId){
      const [plant,linked]=await Promise.all([
        db.plant.findUnique({where:{id:effectivePlantId},select:{id:true}}),
        db.department.findUnique({where:{id},select:{_count:{select:{children:true,assets:true,pmSchedules:true}}}}),
      ]);
      if(!plant)return NextResponse.json({success:false,error:'Plant not found'},{status:400});
      if(!linked||linked._count.children||linked._count.assets||linked._count.pmSchedules)
        return NextResponse.json({success:false,error:'Department has linked children, machines or PM schedules; a controlled transfer is required'},{status:409});
    }
    if(effectiveParentId&&(effectivePlantId!==existing.plantId||effectiveParentId!==existing.parentId)){
      const error=await validateDepartmentParent(db,{plantId:effectivePlantId,parentId:effectiveParentId,departmentId:id});
      if(error)return NextResponse.json({success:false,error},{status:400});
    }
    const effectiveSupervisorId = updateData.supervisorId !== undefined
      ? (typeof updateData.supervisorId === 'string' ? updateData.supervisorId : null)
      : existing.supervisorId;

    if (effectiveSupervisorId) {
      const eligibility = await getMaintenanceApproverEligibility(effectiveSupervisorId, effectivePlantId);
      if (!eligibility.eligible) {
        return NextResponse.json(
          { success: false, error: maintenanceApproverErrorMessage(eligibility.reason) },
          { status: 400 },
        );
      }
    }

    const updated = await db.department.update({
      where: { id },
      data: updateData,
      include: {
        supervisor: { select: { id: true, fullName: true, username: true } },
        parent: { select: { id: true, name: true, code: true } },
        plant: { select: { id: true, name: true, code: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'department',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, code: existing.code }),
        newValues: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update department';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.department.findUnique({
      where: { id },
      include: { _count: { select: { children: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    if (existing._count.children > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete department with child departments' },
        { status: 400 }
      );
    }

    await db.department.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'delete',
        entityType: 'department',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, code: existing.code }),
      },
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete department';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
