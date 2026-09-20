import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdmin, getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * One-time migration: ensure the 'repairs' system module + company module exist.
 * Called automatically from the navigation store on app init.
 * Idempotent — safe to call repeatedly.
 */
export async function POST(request: Request) {
  try {
    const session = getSession(request as any);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const isAdm = isAdmin(session);
    if (!isAdm) {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 });
    }

    // 1. Ensure system_module exists
    const sysMod = await db.systemModule.upsert({
      where: { code: 'repairs' },
      create: {
        code: 'repairs',
        name: 'Repairs Maintenance',
        description: 'Corrective/emergency repairs, material requests, tool requests, downtime tracking, and completion workflows',
        isCore: true,
        version: '2.0.0',
        isSystemLicensed: true,
        validFrom: new Date('2024-01-01'),
        validUntil: new Date('2026-12-31'),
      },
      update: {},
    });

    // 2. Ensure company_module exists (try __default__ first, then null)
    const existingDefault = await db.companyModule.findUnique({
      where: { systemModuleId_companyId: { systemModuleId: sysMod.id, companyId: '__default__' } },
    });

    if (!existingDefault) {
      const existingNull = await db.companyModule.findFirst({
        where: { systemModuleId: sysMod.id, companyId: null },
      });

      if (!existingNull) {
        await db.companyModule.create({
          data: {
            systemModuleId: sysMod.id,
            companyId: '__default__',
            isActive: true,
            isEnabled: true,
            licensedAt: new Date(),
            activatedAt: new Date(),
          },
        });
      } else {
        // Migrate null → __default__
        await db.companyModule.update({
          where: { id: existingNull.id },
          data: {
            companyId: '__default__',
            isActive: true,
            isEnabled: true,
          },
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Repairs module ensured' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}