import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';

const SETUP_LOCK_KEY = 476293812;

function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 12) errors.push('At least 12 characters');
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('At least one number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('At least one special character');
  return errors;
}

export async function GET() {
  try {
    const [userCount, adminRole] = await Promise.all([
      db.user.count(),
      db.role.findUnique({ where: { slug: 'admin' }, select: { id: true } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        setupRequired: userCount === 0,
        constantsReady: Boolean(adminRole),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to determine setup status';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.fullName || '').trim();
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!username || !email || !fullName || !password || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Name, username, email, password and confirmation are required' },
        { status: 400 },
      );
    }

    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
      return NextResponse.json(
        { success: false, error: 'Username must be 3–64 characters and use letters, numbers, dot, underscore or hyphen' },
        { status: 400 },
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'Enter a valid email address' }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ success: false, error: 'Password confirmation does not match' }, { status: 400 });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Password does not meet complexity requirements', details: passwordErrors },
        { status: 400 },
      );
    }

    const passwordHash = await hash(password, 12);

    const created = await db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`);

      const existingUsers = await tx.user.count();
      if (existingUsers !== 0) {
        throw new Error('FIRST_ADMIN_ALREADY_CREATED');
      }

      const adminRole = await tx.role.findUnique({ where: { slug: 'admin' }, select: { id: true } });
      if (!adminRole) {
        throw new Error('CONSTANTS_NOT_READY');
      }

      return tx.user.create({
        data: {
          username,
          email,
          fullName,
          passwordHash,
          status: 'active',
          userRoles: {
            create: { roleId: adminRole.id },
          },
        },
        select: { id: true, username: true, email: true, fullName: true },
      });
    });

    return NextResponse.json({
      success: true,
      data: created,
      message: 'First administrator created. First-run setup is now disabled.',
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create first administrator';
    if (message === 'FIRST_ADMIN_ALREADY_CREATED') {
      return NextResponse.json(
        { success: false, error: 'First-run setup is already complete' },
        { status: 409 },
      );
    }
    if (message === 'CONSTANTS_NOT_READY') {
      return NextResponse.json(
        { success: false, error: 'System constants are not seeded yet' },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
