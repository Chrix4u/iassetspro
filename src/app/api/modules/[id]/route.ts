import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { isControlPlaneCoreModule } from '@/lib/module-access';

/**
 * Consolidate all CompanyModule records for a given systemModuleId into one.
 *
 * Because MariaDB treats NULL as distinct in unique indexes, multiple rows
 * with the same systemModuleId and NULL companyId can coexist under
 * @@unique([systemModuleId, companyId]).  The seed created NULL records,
 * while later code used '__default__'.  This function:
 *   1. Finds ALL records for the systemModuleId
 *   2. Picks the "best" one (prefer '__default__' over NULL, newest first)
 *   3. Deletes all others
 *   4. If the kept record has NULL companyId, migrates it to '__default__'
 *
 * Returns the single remaining canonical record (with companyId='__default__').
 */
async function consolidateCompanyModule(systemModuleId: string) {
  const allRecords = await db.companyModule.findMany({
    where: { systemModuleId },
    orderBy: { createdAt: 'desc' },
  });

  if (allRecords.length === 0) return null;
  if (allRecords.length === 1) {
    const record = allRecords[0];
    // If the sole record has NULL companyId, migrate it
    if (!record.companyId) {
      return db.companyModule.update({
        where: { id: record.id },
        data: { companyId: '__default__' },
      });
    }
    return record;
  }

  // Multiple records exist — pick the best one to keep
  const defaultRecord = allRecords.find(r => r.companyId === '__default__');
  const keep = defaultRecord || allRecords.find(r => r.companyId === null) || allRecords[0];

  // Delete all others first (before any migration that could hit unique constraint)
  const idsToDelete = allRecords.map(r => r.id).filter(id => id !== keep.id);
  if (idsToDelete.length > 0) {
    await db.companyModule.deleteMany({
      where: { id: { in: idsToDelete } },
    });
    console.log(`[modules] Cleaned up ${idsToDelete.length} duplicate company_module(s) for systemModule ${systemModuleId.slice(0, 8)}`);
  }

  // Migrate NULL companyId to '__default__' if needed (safe now — duplicates are gone)
  if (!keep.companyId) {
    return db.companyModule.update({
      where: { id: keep.id },
      data: { companyId: '__default__' },
    });
  }

  return keep;
}

// Shared handler for both PUT and PATCH
async function handleUpdate(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Accept either modules.manage or modules.activate permission (admin always has all)
    if (!hasPermission(session, 'modules.manage') && !hasPermission(session, 'modules.activate') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions — requires modules.manage or modules.activate' }, { status: 403 });
    }

    const { id } = await params;
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }
    const { isActive, isEnabled } = body;

    if (typeof isActive !== 'boolean' && typeof isEnabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'isActive or isEnabled (boolean) is required' }, { status: 400 });
    }

    const systemModule = await db.systemModule.findUnique({ where: { id } });
    if (!systemModule) {
      return NextResponse.json({ success: false, error: 'Module not found' }, { status: 404 });
    }

    const protectedCore = isControlPlaneCoreModule(systemModule.code);

    // Only the true platform/control-plane modules are non-disableable.
    if (protectedCore && isActive === false) {
      return NextResponse.json({ success: false, error: 'Core platform modules cannot be deactivated' }, { status: 400 });
    }
    if (protectedCore && isEnabled === false) {
      return NextResponse.json({ success: false, error: 'Core platform modules cannot be disabled' }, { status: 400 });
    }

    // Consolidate any duplicate records BEFORE the update.
    // This handles NULL vs '__default__' ambiguity and ensures a single canonical record.
    const companyModule = await consolidateCompanyModule(id);

    if (companyModule?.activationLocked && (isActive === false || isEnabled === false)) {
      return NextResponse.json({ success: false, error: 'Module activation is locked and cannot be changed' }, { status: 400 });
    }

    // Cannot enable a module that is not active (vendor hasn't licensed it)
    if (isEnabled === true && companyModule && !companyModule.isActive) {
      return NextResponse.json({ success: false, error: 'Module must be licensed/activated by vendor before enabling' }, { status: 400 });
    }

    // Build update data with proper typing
    const updateData: {
      isActive?: boolean;
      isEnabled?: boolean;
      licensedAt?: Date | null;
      licensedBy?: string | null;
      activatedAt?: Date | null;
      activatedBy?: string | null;
    } = {};
    if (typeof isActive === 'boolean') {
      updateData.isActive = isActive;
      if (isActive) {
        updateData.licensedAt = new Date();
        updateData.licensedBy = session.userId;
      }
    }
    if (typeof isEnabled === 'boolean') {
      updateData.isEnabled = isEnabled;
      if (isEnabled) {
        updateData.activatedAt = new Date();
        updateData.activatedBy = session.userId;
      } else {
        updateData.activatedAt = null;
        updateData.activatedBy = null;
      }
    }

    let updated;
    if (companyModule) {
      updated = await db.companyModule.update({
        where: { id: companyModule.id },
        data: updateData,
      });
    } else {
      // No record exists — create fresh
      updated = await db.companyModule.create({
        data: {
          systemModuleId: id,
          companyId: '__default__',
          isActive: (isActive as boolean) ?? false,
          isEnabled: (isEnabled as boolean) ?? false,
          licensedAt: isActive ? new Date() : null,
          licensedBy: isActive ? session.userId : null,
          activatedAt: isEnabled ? new Date() : null,
          activatedBy: isEnabled ? session.userId : null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        isActive: updated.isActive,
        isEnabled: updated.isEnabled,
        activatedAt: updated.activatedAt,
        licensedAt: updated.licensedAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update module';
    console.error('[modules/update] Error updating module:', message, error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleUpdate(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleUpdate(request, context);
}
