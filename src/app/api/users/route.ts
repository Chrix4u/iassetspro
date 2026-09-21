import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin, hasPermission } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { hash } from 'bcryptjs';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');
    const departmentIds = searchParams.get('departmentIds');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const role = searchParams.get('role');
    const primaryTrade = searchParams.get('primaryTrade');
    const includeSkills = searchParams.get('includeSkills') === 'true';
    const admin = isAdmin(session);

    // Full user-directory access remains an administrative workspace. Existing
    // role-filtered calls are treated as assignment lookups and receive a
    // minimal, plant-scoped projection only.
    if (!role && !admin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};
    if (department) where.department = department;
    if (primaryTrade) where.primaryTrade = primaryTrade;

    // Non-admin directory lookups are active-worker lookups only. Admin user
    // management keeps the requested status filter, including inactive users.
    if (admin) {
      if (status) where.status = status;
    } else {
      where.status = 'active';
    }

    if (search) {
      where.OR = admin
        ? [
            { username: { contains: search } },
            { fullName: { contains: search } },
            { email: { contains: search } },
          ]
        : [
            { username: { contains: search } },
            { fullName: { contains: search } },
            { staffId: { contains: search } },
          ];
    }

    if (departmentIds) {
      const deptIds = departmentIds.split(',').filter(Boolean);
      if (deptIds.length > 0) {
        const depts = await db.department.findMany({
          where: { id: { in: deptIds } },
          select: { name: true },
        });
        const deptNames = depts.map((d) => d.name);
        if (deptNames.length > 0) {
          where.department = { in: deptNames };
        }
      }
    }

    if (role) {
      // Assignment controls use friendly aliases while RBAC stores canonical
      // maintenance role slugs. Resolve those aliases explicitly; arbitrary
      // role strings remain an exact slug filter and therefore fail closed.
      const roleSlugAliases: Record<string, string[]> = {
        technician: ['maintenance_technician'],
        supervisor: ['maintenance_supervisor', 'maintenance_manager', 'plant_manager'],
      };
      const targetRoleSlugs = roleSlugAliases[role] || [role];
      where.userRoles = {
        some: {
          role: {
            slug: { in: targetRoleSlugs },
          },
        },
      };
    }

    if (!admin) {
      const plantScope = await getPlantScope(request, session);
      if (plantScope.denyAccess) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }

      if (plantScope.isScoped && plantScope.plantId) {
        where.plantAccess = { some: { plantId: plantScope.plantId } };
      } else if (!plantScope.isSystemWide) {
        where.plantAccess = {
          some: {
            plantId: { in: plantScope.accessiblePlantIds },
          },
        };
      }

      const lookupUsers = await db.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          fullName: true,
          staffId: true,
          department: true,
          status: true,
          primaryTrade: true,
          userRoles: {
            select: {
              role: { select: { id: true, name: true, slug: true } },
            },
          },
          plantAccess: {
            select: {
              plant: { select: { id: true, name: true, code: true } },
            },
          },
          ...(includeSkills
            ? {
                userSkills: {
                  select: {
                    trade: {
                      select: { id: true, name: true, code: true, category: true, color: true },
                    },
                    proficiencyLevel: true,
                    yearsExperience: true,
                    certified: true,
                  },
                },
              }
            : {}),
        },
        orderBy: { fullName: 'asc' },
      });

      const safeLookupUsers = lookupUsers.map((user) => ({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        staffId: user.staffId,
        department: user.department,
        status: user.status,
        primaryTrade: user.primaryTrade,
        roles: user.userRoles.map((ur) => ur.role),
        plants: user.plantAccess.map((up) => up.plant),
        ...(includeSkills
          ? {
              skills:
                'userSkills' in user && Array.isArray(user.userSkills)
                  ? user.userSkills.map((us) => ({
                      ...us.trade,
                      proficiencyLevel: us.proficiencyLevel,
                      yearsExperience: us.yearsExperience,
                      certified: us.certified,
                    }))
                  : [],
            }
          : {}),
      }));

      return NextResponse.json({ success: true, data: safeLookupUsers });
    }

    const include: Record<string, unknown> = {
      userRoles: {
        include: { role: { select: { id: true, name: true, slug: true } } },
      },
      plantAccess: {
        include: { plant: { select: { id: true, name: true, code: true } } },
      },
    };

    if (includeSkills) {
      include.userSkills = {
        include: {
          trade: {
            select: { id: true, name: true, code: true, category: true, color: true },
          },
        },
      };
    }

    const users = await db.user.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include,
      orderBy: { createdAt: 'asc' },
    });

    // Authentication secrets never belong in a directory response, including
    // the administrative user-management view.
    const safeUsers = users.map(({
      passwordHash: _passwordHash,
      resetToken: _resetToken,
      resetTokenExpires: _resetTokenExpires,
      ...user
    }) => ({
      ...user,
      primaryTrade: user.primaryTrade,
      roles: (user.userRoles || []).map((ur) => ur.role),
      plants: (user.plantAccess || []).map((up) => up.plant),
      ...(includeSkills
        ? {
            skills:
              (user as Record<string, unknown>).userSkills != null
                ? ((user as Record<string, unknown>).userSkills as Array<{ trade: Record<string, unknown>; proficiencyLevel: string; yearsExperience: number | null; certified: boolean }>).map((us) => ({
                    ...us.trade,
                    proficiencyLevel: us.proficiencyLevel,
                    yearsExperience: us.yearsExperience,
                    certified: us.certified,
                  }))
                : [],
          }
        : {}),
    }));

    return NextResponse.json({ success: true, data: safeUsers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load users';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !hasPermission(session, 'users.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      username,
      email,
      password,
      fullName,
      staffId,
      phone,
      avatar,
      department,
      roleIds,
      plantIds,
    } = body;

    if (!username || !email || !password || !fullName) {
      return NextResponse.json(
        { success: false, error: 'Username, email, password, and fullName are required' },
        { status: 400 }
      );
    }

    // Check for duplicates
    const existing = await db.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Username or email already exists' },
        { status: 400 }
      );
    }

    const hashedPassword = await hash(password, 10);

    const user = await db.user.create({
      data: {
        username,
        email,
        passwordHash: hashedPassword,
        fullName,
        staffId: staffId || null,
        phone: phone || null,
        avatar: avatar || null,
        department: department || null,
        status: 'active',
        userRoles: roleIds?.length
          ? { create: roleIds.map((roleId: string) => ({ roleId })) }
          : undefined,
        plantAccess: plantIds?.length
          ? { create: plantIds.map((plantId: string) => ({ plantId })) }
          : undefined,
      },
      include: {
        userRoles: { include: { role: true } },
        plantAccess: { include: { plant: true } },
      },
    });

    const { passwordHash: _, ...safeUser } = user;

    return NextResponse.json({ success: true, data: safeUser }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
