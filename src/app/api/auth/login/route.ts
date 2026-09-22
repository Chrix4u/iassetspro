import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { compare } from 'bcryptjs';
import { createSession, sessionCache } from '@/lib/auth';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // ── Step 1: Find user (with fallback if includes fail due to schema drift) ──
    let user: any;
    try {
      user = await db.user.findUnique({
        where: { username },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
          directPerms: {
            include: { permission: true },
          },
          plantAccess: {
            include: { plant: true },
          },
        },
      });
    } catch (queryErr: any) {
      // Fallback: try without includes (schema may be out of sync on VPS)
      console.error('[login] Full user query failed, trying minimal query:', queryErr?.message);
      try {
        user = await db.user.findUnique({
          where: { username },
        });
      } catch (fallbackErr: any) {
        console.error('[login] Minimal user query also failed:', fallbackErr?.message);
        return NextResponse.json(
          { success: false, error: `Database error: ${fallbackErr?.message || 'User lookup failed'}. Run: npx prisma db push` },
          { status: 500 }
        );
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    if (user.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Account is inactive' },
        { status: 401 }
      );
    }

    const validPassword = await compare(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // ── Step 2: Create session (with fallback) ──
    let token: string;
    let permissions: string[] = [];
    let roles: any[] = [];

    try {
      const sessionResult = await createSession(user.id);
      token = sessionResult.token;
      permissions = sessionResult.session.permissions;
    } catch (sessionErr: any) {
      console.error('[login] createSession failed, using lightweight session:', sessionErr?.message);
      // Fallback: create a minimal session directly. Build the effective
      // authorization snapshot BEFORE persisting it so another proxy/route
      // worker never reads an authenticated session with empty RBAC data.
      try {
        token = randomUUID();
        const roleSlugs: string[] = [];
        const permSlugs = new Set<string>();
        for (const ur of (user.userRoles || [])) {
          const roleSlug = ur.role?.slug || ur.roleId;
          if (roleSlug) roleSlugs.push(roleSlug);
          for (const rp of (ur.role?.rolePermissions || [])) {
            const permissionSlug = rp.permission?.slug || rp.permissionId;
            if (permissionSlug) permSlugs.add(permissionSlug);
          }
        }
        for (const up of (user.directPerms || [])) {
          const permissionSlug = up.permission?.slug || up.permissionId;
          if (!permissionSlug) continue;
          if (up.expiresAt && new Date(up.expiresAt) < new Date()) {
            permSlugs.delete(permissionSlug);
            continue;
          }
          if (up.isGranted) permSlugs.add(permissionSlug);
          else permSlugs.delete(permissionSlug);
        }
        permissions = [...permSlugs];
        roles = (user.userRoles || []).map((ur: any) => ({
          id: ur.role?.id || ur.roleId,
          name: ur.role?.name || '',
          slug: ur.role?.slug || '',
          level: ur.role?.level || 0,
          isSystem: ur.role?.isSystem || false,
          description: ur.role?.description || '',
        }));

        const createdAt = new Date();
        // Try to persist session, but don't fail if sessions table is broken.
        try {
          await db.session.create({
            data: {
              token,
              userId: user.id,
              roles: JSON.stringify(roleSlugs),
              permissions: JSON.stringify(permissions),
              expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
            },
          });
        } catch (dbSessionErr: any) {
          console.warn('[login] Could not persist session to DB (using in-memory only):', dbSessionErr?.message);
        }

        // Cache the same snapshot locally. fullName is required by downstream
        // audit/notification code and must not disappear in fallback sessions.
        sessionCache.set(token, {
          data: {
            userId: user.id,
            username: user.username,
            fullName: user.fullName || user.username,
            roles: roleSlugs,
            permissions,
            createdAt,
          },
          cachedAt: Date.now(),
        });
      } catch (fallbackErr: any) {
        console.error('[login] Lightweight session also failed:', fallbackErr?.message);
        return NextResponse.json(
          { success: false, error: `Session creation failed: ${fallbackErr?.message}. Run: npx prisma db push` },
          { status: 500 }
        );
      }
    }

    // Get primary plant
    const primaryPlant = (user.plantAccess || []).find((up: any) => up.isPrimary);

    // Build response (strip password hash)
    const { passwordHash: _, ...safeUser } = user;
    if (!roles.length && (user.userRoles || []).length) {
      roles = (user.userRoles || []).map((ur: any) => ({
        id: ur.role?.id || ur.roleId,
        name: ur.role?.name || '',
        slug: ur.role?.slug || '',
        level: ur.role?.level || 0,
        isSystem: ur.role?.isSystem || false,
        description: ur.role?.description || '',
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          avatar: user.avatar,
          department: user.department,
          phone: user.phone,
          status: user.status,
          roles,
          permissions,
          plantId: primaryPlant?.plantId ?? null,
          plantAccess: (user.plantAccess || []).map((up: any) => ({
            id: up.plant?.id || up.plantId,
            code: up.plant?.code || '',
            name: up.plant?.name || '',
            location: up.plant?.location || '',
            accessLevel: up.accessLevel,
            isPrimary: up.isPrimary,
          })),
        },
        token,
        permissions,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Login failed';
    console.error('[login] Unhandled error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
