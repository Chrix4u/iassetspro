import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { seedCanonicalTransitions } from '../src/lib/state-machine';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');

const databaseUrl = process.env.DATABASE_URL || '';
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('seed:constants requires a PostgreSQL DATABASE_URL');
}

const db = new PrismaClient({
  adapter: createAdapter(databaseUrl),
  log: ['warn', 'error'],
});

function runSeed(script: string) {
  const result = spawnSync('bun', ['run', script], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Seed step failed: ${script}`);
  }
}

const systemModules = [
  { code: 'core', name: 'Core Platform', description: 'Core EAM platform with authentication, navigation, and base functionality', isCore: true, version: '2.0.0', licensed: true },
  { code: 'assets', name: 'Asset Management', description: 'Complete asset registry, hierarchy, tracking, and lifecycle management', isCore: false, version: '2.0.0', licensed: true },
  { code: 'maintenance_requests', name: 'Maintenance Requests', description: 'Submit, review, approve, and convert maintenance requests with full workflow', isCore: false, version: '2.0.0', licensed: true },
  { code: 'work_orders', name: 'Work Orders', description: 'Plan, assign, execute, and track maintenance work orders with SLA management', isCore: false, version: '2.0.0', licensed: true },
  { code: 'repairs', name: 'Repairs Maintenance', description: 'Corrective repairs/RWOP execution, resource custody, completion, closure, analytics, and reporting workflows', isCore: false, version: '2.0.0', licensed: true },
  { code: 'inventory', name: 'Inventory & Spare Parts', description: 'Manage spare parts inventory, stock levels, locations, and replenishment', isCore: false, version: '2.0.0', licensed: true },
  { code: 'pm_schedules', name: 'PM Schedules', description: 'Preventive maintenance scheduling with auto work order generation', isCore: false, version: '2.0.0', licensed: true },
  { code: 'analytics', name: 'Analytics & KPI', description: 'Advanced analytics, dashboards, and KPI monitoring', isCore: false, version: '1.5.0', licensed: true },
  { code: 'production', name: 'Production Management', description: 'Work centers, resource planning, scheduling, and capacity management', isCore: false, version: '1.5.0', licensed: true },
  { code: 'quality', name: 'Quality Management', description: 'Inspections, NCR, audits, SPC, CAPA, and quality control plans', isCore: false, version: '1.5.0', licensed: true },
  { code: 'safety', name: 'Safety Management', description: 'Incidents, safety inspections, training, equipment, and permits', isCore: false, version: '1.5.0', licensed: true },
  { code: 'iot_sensors', name: 'IoT Sensors', description: 'IoT device management, real-time monitoring, and threshold-based alerts', isCore: false, version: '1.3.0', licensed: true },
  { code: 'calibration', name: 'Calibration', description: 'Instrument calibration schedules, tracking, and compliance records', isCore: false, version: '1.2.0', licensed: true },
  { code: 'downtime', name: 'Downtime Tracking', description: 'Machine downtime logging, root cause analysis, and MTBF/MTTR analytics', isCore: false, version: '1.2.0', licensed: true },
  { code: 'meter_readings', name: 'Meter Readings', description: 'Equipment meter readings, meter-based PM triggers, and trending', isCore: false, version: '1.1.0', licensed: true },
  { code: 'training', name: 'Training Management', description: 'Training programs, certifications, skills tracking, and competency management', isCore: false, version: '1.1.0', licensed: false },
  { code: 'risk_assessment', name: 'Risk Assessment', description: 'Risk identification, assessment matrices, mitigation planning, and monitoring', isCore: false, version: '1.2.0', licensed: false },
  { code: 'condition_monitoring', name: 'Condition Monitoring', description: 'Vibration, temperature, and other condition monitoring with trending', isCore: false, version: '1.3.0', licensed: false },
  { code: 'digital_twin', name: 'Digital Twin', description: '3D asset visualization, digital twin modeling, and real-time state mirroring', isCore: false, version: '1.0.0', licensed: false },
  { code: 'bom', name: 'Bill of Materials', description: 'Equipment BOM management, spare part lists, and component relationships', isCore: false, version: '1.1.0', licensed: true },
  { code: 'failure_analysis', name: 'Failure Analysis', description: 'Failure modes, effects analysis, and failure pattern recognition', isCore: false, version: '1.0.0', licensed: false },
  { code: 'rca_analysis', name: 'Root Cause Analysis', description: '5-Why analysis, fishbone diagrams, and RCA documentation workflows', isCore: false, version: '1.0.0', licensed: false },
  { code: 'capa', name: 'CAPA Management', description: 'Corrective and preventive actions tracking and verification', isCore: false, version: '1.0.0', licensed: false },
  { code: 'reports', name: 'Reports & Dashboards', description: 'Custom report builder, scheduled reports, and multi-format export', isCore: false, version: '2.0.0', licensed: true },
  { code: 'vendors', name: 'Vendor Management', description: 'Supplier management, vendor evaluation, and procurement workflows', isCore: false, version: '1.1.0', licensed: true },
  { code: 'tools', name: 'Tool Management', description: 'Tool inventory, calibration tracking, assignment, and availability', isCore: false, version: '1.0.0', licensed: true },
  { code: 'notifications', name: 'Notifications', description: 'In-app notifications, email alerts, and notification preferences', isCore: false, version: '1.5.0', licensed: true },
  { code: 'documents', name: 'Document Management', description: 'Document storage, versioning, approvals, and file organization', isCore: false, version: '1.2.0', licensed: true },
  { code: 'modules', name: 'Module Management', description: 'System module licensing, activation, and feature management', isCore: true, version: '2.0.0', licensed: true },
  { code: 'kpi_dashboard', name: 'KPI Dashboard', description: 'Customizable KPI dashboards with real-time data widgets', isCore: false, version: '1.3.0', licensed: true },
  { code: 'predictive', name: 'Predictive Maintenance', description: 'ML-based predictive analytics for maintenance planning', isCore: false, version: '1.0.0', licensed: false },
  { code: 'oee', name: 'OEE Tracking', description: 'Overall Equipment Effectiveness tracking, analysis, and improvement', isCore: false, version: '1.2.0', licensed: false },
  { code: 'energy', name: 'Energy Management', description: 'Energy consumption monitoring, optimization, and cost tracking', isCore: false, version: '1.1.0', licensed: false },
  { code: 'shift_management', name: 'Shift Management', description: 'Shift scheduling, handover logs, and workforce planning', isCore: false, version: '1.1.0', licensed: false },
  { code: 'erp_integration', name: 'ERP Integration', description: 'Integration with external ERP systems via API connectors', isCore: false, version: '1.0.0', licensed: false },
  { code: 'forecasting', name: 'Demand Forecasting', description: 'AI-powered demand forecasting for spare parts and resources', isCore: false, version: '1.0.0', licensed: false },
] as const;

async function main() {
  console.log('🌱 iAssetsPro constants-only PostgreSQL seed');

  // RBAC and trade catalogues are maintained in their existing authoritative seeds.
  runSeed('prisma/seed-permissions-only.ts');
  runSeed('prisma/seed-trades.ts');

  const adminRole = await db.role.findUnique({ where: { slug: 'admin' } });
  if (!adminRole) throw new Error('Admin role was not created by the RBAC seed');

  const username = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@iassetspro.local';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be set and contain at least 12 characters');
  }

  const passwordHash = await hash(password, 12);
  const admin = await db.user.upsert({
    where: { username },
    update: {
      email,
      fullName: process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator',
      passwordHash,
      status: 'active',
    },
    create: {
      username,
      email,
      fullName: process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator',
      passwordHash,
      status: 'active',
    },
  });

  await db.userRole.deleteMany({ where: { userId: admin.id } });
  await db.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });

  for (const mod of systemModules) {
    const systemModule = await db.systemModule.upsert({
      where: { code: mod.code },
      update: {
        name: mod.name,
        description: mod.description,
        version: mod.version,
        isCore: mod.isCore,
        isSystemLicensed: mod.licensed,
      },
      create: {
        code: mod.code,
        name: mod.name,
        description: mod.description,
        version: mod.version,
        isCore: mod.isCore,
        isSystemLicensed: mod.licensed,
        validFrom: mod.licensed ? new Date('2026-01-01T00:00:00.000Z') : null,
        validUntil: null,
      },
    });

    if (mod.isCore || mod.licensed) {
      const existing = await db.companyModule.findFirst({
        where: { systemModuleId: systemModule.id, companyId: '__default__' },
      });
      const values = {
        isActive: true,
        isEnabled: true,
        licensedAt: new Date(),
        licensedBy: admin.id,
        activatedAt: new Date(),
        activatedBy: admin.id,
      };
      if (existing) {
        await db.companyModule.update({ where: { id: existing.id }, data: values });
      } else {
        await db.companyModule.create({
          data: {
            systemModuleId: systemModule.id,
            companyId: '__default__',
            ...values,
          },
        });
      }
    }
  }

  const transitionCount = await seedCanonicalTransitions(db);

  const operationalCounts = {
    plants: await db.plant.count(),
    departments: await db.department.count(),
    assets: await db.asset.count(),
    components: await db.componentRegistry.count(),
    workOrders: await db.workOrder.count(),
    maintenanceRequests: await db.maintenanceRequest.count(),
    inventoryItems: await db.inventoryItem.count(),
    tools: await db.tool.count(),
  };

  for (const [name, count] of Object.entries(operationalCounts)) {
    if (count !== 0) {
      throw new Error(`Constants-only seed invariant failed: ${name} expected 0, found ${count}`);
    }
  }

  console.log(`✅ Bootstrap admin: ${username}`);
  console.log(`✅ System modules: ${systemModules.length}`);
  console.log(`✅ Canonical transitions: ${transitionCount}`);
  console.log('✅ Operational staging tables are empty and ready for manual commissioning');
}

main()
  .catch((error) => {
    console.error('❌ Constants-only seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
