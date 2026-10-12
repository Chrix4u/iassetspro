import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';
import {
  MAINTENANCE_APPROVAL_PERMISSION,
  hasMaintenanceApprovalPermission,
} from '@/lib/maintenance-approvers';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const departmentIds = searchParams.get('departmentIds');
    const plantId = searchParams.get('plantId');
    const search = searchParams.get('search');
    const role = searchParams.get('role'); // technician | supervisor | all

    const where: Record<string, unknown> = {
      status: 'active',
    };
    const andPredicates: Record<string, unknown>[] = [];

    if (departmentIds) {
      const deptIds = departmentIds.split(',').filter(Boolean);
      if (deptIds.length > 0) {
        const departments = await db.department.findMany({
          where: { id: { in: deptIds } },
          select: { name: true },
        });
        const deptNames = departments.map(d => d.name);
        if (deptNames.length > 0) {
          where.department = { in: deptNames };
        }
      }
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { staffId: { contains: search } },
        { username: { contains: search } },
      ];
    }

    const allowedRoles = new Set(['all', 'technician', 'supervisor']);
    if (role && !allowedRoles.has(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid worker role filter' },
        { status: 400 },
      );
    }

    if (role === 'technician') {
      where.userRoles = {
        some: {
          role: { slug: 'maintenance_technician' },
        },
      };
    } else if (role === 'supervisor') {
      andPredicates.push({
        OR: [
          { userRoles: { some: { role: { slug: 'admin' } } } },
          {
            userRoles: {
              some: {
                role: {
                  rolePermissions: {
                    some: { permission: { slug: MAINTENANCE_APPROVAL_PERMISSION } },
                  },
                },
              },
            },
          },
          {
            directPerms: {
              some: {
                permission: { slug: MAINTENANCE_APPROVAL_PERMISSION },
                isGranted: true,
              },
            },
          },
        ],
      });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const addSupervisorPlantPredicate = (candidatePlantFilter: Record<string, unknown>) => {
      andPredicates.push({
        OR: [
          { plantAccess: { some: candidatePlantFilter } },
          { userRoles: { some: { role: { slug: 'admin' } } } },
        ],
      });
    };

    if (plantId) {
      if (!canAccessPlant(plantScope, plantId)) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
      if (role === 'supervisor') {
        addSupervisorPlantPredicate({ plantId });
      } else {
        where.plantAccess = { some: { plantId } };
      }
    } else if (plantScope.isScoped && plantScope.plantId) {
      if (role === 'supervisor') {
        addSupervisorPlantPredicate({ plantId: plantScope.plantId });
      } else {
        where.plantAccess = { some: { plantId: plantScope.plantId } };
      }
    } else if (!plantScope.isSystemWide) {
      if (plantScope.accessiblePlantIds.length === 0) {
        where.id = { in: [] };
      } else if (role === 'supervisor') {
        addSupervisorPlantPredicate({ plantId: { in: plantScope.accessiblePlantIds } });
      } else {
        where.plantAccess = {
          some: {
            plantId: { in: plantScope.accessiblePlantIds },
          },
        };
      }
    }

    if (andPredicates.length > 0) where.AND = andPredicates;

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        staffId: true,
        username: true,
        department: true,
        primaryTrade: true,
        status: true,
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
                slug: true,
                rolePermissions: {
                  select: { permission: { select: { slug: true } } },
                },
              },
            },
          },
        },
        directPerms: {
          select: {
            isGranted: true,
            expiresAt: true,
            permission: { select: { slug: true } },
          },
        },
        userSkills: {
          select: {
            trade: {
              select: {
                name: true,
                code: true,
                category: true,
              },
            },
            proficiencyLevel: true,
          },
        },
      },
      orderBy: { fullName: 'asc' },
      take: 100,
    });

    const eligibleUsers = role === 'supervisor'
      ? users.filter((user) => hasMaintenanceApprovalPermission(user))
      : users;

    const data = eligibleUsers.map(user => {
      const roles = (user.userRoles || []).map(ur => ({
        name: ur.role.name,
        slug: ur.role.slug,
      }));
      const primaryRole = roles.length > 0 ? roles[0].name : null;
      const primaryRoleSlug = roles.length > 0 ? roles[0].slug : null;
      const isTechnician = roles.some(r => r.slug === 'maintenance_technician');

      const skills = (user.userSkills || []).map(us => ({
        name: us.trade.name,
        code: us.trade.code,
        category: us.trade.category,
        proficiency: us.proficiencyLevel,
      }));

      return {
        id: user.id,
        fullName: user.fullName,
        staffId: user.staffId,
        username: user.username,
        department: user.department,
        trade: user.primaryTrade,
        status: user.status,
        primaryRole,
        primaryRoleSlug,
        isTechnician,
        roles,
        skills,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[GET /api/workers] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch workers' },
      { status: 500 }
    );
  }
}
