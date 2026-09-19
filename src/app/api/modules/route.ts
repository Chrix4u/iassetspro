import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';

// Prevent any response caching — module states change dynamically
export const dynamic = 'force-dynamic';

/**
 * Pick the correct CompanyModule record for a given system module.
 *
 * Background: MariaDB treats NULL as distinct in unique indexes, so
 * @@unique([systemModuleId, companyId]) allows multiple rows with the same
 * systemModuleId when companyId IS NULL.  The seed creates records with
 * companyId=NULL, while later code uses the sentinel '__default__'.  This
 * helper ensures we consistently pick the "right" record.
 *
 * Priority:
 *  1. companyId = '__default__'  (deterministic, created by the fix code)
 *  2. companyId IS NULL           (legacy seed data)
 *  3. companyId = any other value (multi-tenant future-proofing)
 *  4. any record at all (last resort)
 */
function pickCompanyModule(
  companyModules: Array<{
    id: string;
    companyId: string | null;
    isActive: boolean;
    isEnabled: boolean;
    activationLocked: boolean;
    activatedAt: Date | null;
    licensedAt: Date | null;
    licensedBy: string | null;
  }>,
) {
  if (!companyModules || companyModules.length === 0) return null;
  if (companyModules.length === 1) return companyModules[0];

  return (
    companyModules.find((cm) => cm.companyId === '__default__') ??
    companyModules.find((cm) => cm.companyId === null) ??
    companyModules[0]
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const isAdm = isAdmin(session);

    const modules = await db.systemModule.findMany({
      include: {
        companyModules: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Collect all licensedBy user IDs to batch-fetch
    const picked = modules.map((m) => pickCompanyModule(m.companyModules as any));
    const licensedByUserIds = picked
      .map((cm) => cm?.licensedBy)
      .filter((id): id is string => !!id);

    // Batch fetch all licensed-by users
    let licensedByUsers: Record<string, { id: string; fullName: string }> = {};
    if (licensedByUserIds.length > 0) {
      const users = await db.user.findMany({
        where: { id: { in: licensedByUserIds } },
        select: { id: true, fullName: true },
      });
      licensedByUsers = Object.fromEntries(users.map((u) => [u.id, { id: u.id, fullName: u.fullName }]));
    }

    const now = new Date();
    const data = modules.map((m, idx) => {
      const companyModule = picked[idx];
      const systemLicenseInWindow =
        (!m.validFrom || m.validFrom <= now) &&
        (!m.validUntil || m.validUntil >= now);
      const isLicenseValid = m.isCore || (m.isSystemLicensed && systemLicenseInWindow);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        description: m.description,
        version: m.version,
        isCore: m.isCore,
        isSystemLicensed: m.isSystemLicensed,
        isLicenseValid,
        licenseKey: isAdm ? m.licenseKey : null,
        validFrom: isAdm ? m.validFrom : null,
        validUntil: isAdm ? m.validUntil : null,
        // Company module activation status
        isEnabled: companyModule?.isEnabled ?? false,
        isActive: companyModule?.isActive ?? false,
        activationLocked: companyModule?.activationLocked ?? false,
        activatedAt: companyModule?.activatedAt ?? null,
        // Licensing fields
        licensedAt: companyModule?.licensedAt ?? null,
        licensedBy: companyModule?.licensedBy ?? null,
        licensedByUser: companyModule?.licensedBy
          ? licensedByUsers[companyModule.licensedBy] ?? null
          : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load modules';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
