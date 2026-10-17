import { PrismaClient } from '@prisma/client';

const FIXTURE_GUARD = 'IASSETSPRO_PLATFORM_E2E_FIXTURE';
const MODULE_CODE = 'digital_twin';
const DEFAULT_COMPANY_ID = '__default__';
const EXPECTED_DATABASE_NAME = 'platform_e2e';

if (process.env[FIXTURE_GUARD] !== '1') {
  throw new Error(`${FIXTURE_GUARD}=1 is required; refusing to change module licensing`);
}

if (process.env.CI !== 'true') {
  throw new Error('CI=true is required; refusing to change module licensing outside CI');
}

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to the isolated PostgreSQL platform E2E database');
}

const databaseName = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ''));
if (databaseName !== EXPECTED_DATABASE_NAME) {
  throw new Error(`Refusing to modify database ${databaseName || '(unknown)'}; expected ${EXPECTED_DATABASE_NAME}`);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

async function main(): Promise<void> {
  const now = new Date();

  await db.$transaction(async (tx) => {
    const systemModule = await tx.systemModule.findUnique({
      where: { code: MODULE_CODE },
      select: { id: true },
    });

    if (!systemModule) {
      throw new Error(`Seeded system module ${MODULE_CODE} is missing`);
    }

    await tx.systemModule.update({
      where: { id: systemModule.id },
      data: {
        isSystemLicensed: true,
        validFrom: now,
        validUntil: null,
      },
    });

    await tx.companyModule.upsert({
      where: {
        systemModuleId_companyId: {
          systemModuleId: systemModule.id,
          companyId: DEFAULT_COMPANY_ID,
        },
      },
      create: {
        systemModuleId: systemModule.id,
        companyId: DEFAULT_COMPANY_ID,
        isActive: true,
        isEnabled: true,
        licensedAt: now,
        licensedBy: 'platform-e2e-fixture',
        activatedAt: now,
        activatedBy: 'platform-e2e-fixture',
      },
      update: {
        isActive: true,
        isEnabled: true,
        licensedAt: now,
        licensedBy: 'platform-e2e-fixture',
        activatedAt: now,
        activatedBy: 'platform-e2e-fixture',
      },
    });
  });

  console.log(`Enabled ${MODULE_CODE} only for the guarded platform E2E fixture.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
