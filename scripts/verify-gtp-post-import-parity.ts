import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { db } from '../src/lib/db';

type RawRow = Record<string, unknown>;

const arg = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const workbookPath = arg('--workbook') || process.env.GTP_WORKBOOK_PATH;
const plantId = arg('--plant') || process.env.GTP_MIGRATION_PLANT_ID;

if (!workbookPath || !plantId) {
  console.error('Usage: tsx scripts/verify-gtp-post-import-parity.ts --workbook <path.xlsm> --plant <plantId>');
  process.exit(2);
}

const text = (value: unknown) => String(value ?? '').trim();
const close = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance;

(async () => {
  const workbookBuffer = fs.readFileSync(workbookPath);
  const workbook = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: true, cellFormula: true });
  const sheet = workbook.Sheets.JobRecords;
  if (!sheet) throw new Error('Workbook has no JobRecords sheet');

  const sourceRows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true });
  const sourceJobs = sourceRows.filter((row) => text(row['Work Order No']));
  const sourceBreakdowns = sourceJobs.filter((row) => text(row['Work Order Type']).toLowerCase() === 'breakdown');
  const sourcePriorityOne2025 = sourceBreakdowns.filter((row) =>
    text(row['Prod year reported']) === '2025' && Number(row['Priority']) === 1,
  );
  const sourceResponseMinutes = sourcePriorityOne2025.reduce((sum, row) => {
    const value = Number(row['Response Time']);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const [workOrders, maintenanceRequests] = await Promise.all([
    db.workOrder.findMany({
      where: { plantId, woNumber: { startsWith: 'GTP-WO-' } },
      select: {
        id: true,
        woNumber: true,
        type: true,
        priority: true,
        createdAt: true,
        actualStart: true,
        maintenanceRequestId: true,
        description: true,
      },
    }),
    db.maintenanceRequest.findMany({
      where: { plantId, requestNumber: { startsWith: 'GTP-MR-' } },
      select: { id: true, requestNumber: true, workOrderId: true, description: true },
    }),
  ]);

  const dbBreakdowns = workOrders.filter((row) => row.type === 'breakdown');
  const dbPriorityOne2025 = dbBreakdowns.filter((row) =>
    row.priority === 'critical' && row.createdAt.getUTCFullYear() === 2025,
  );
  const dbResponseMinutes = dbPriorityOne2025.reduce((sum, row) => {
    if (!row.actualStart) return sum;
    return sum + ((row.actualStart.getTime() - row.createdAt.getTime()) / 60000);
  }, 0);

  const woById = new Map(workOrders.map((row) => [row.id, row]));
  const mrById = new Map(maintenanceRequests.map((row) => [row.id, row]));
  const linkedWoToMr = workOrders.filter((row) => row.maintenanceRequestId && mrById.has(row.maintenanceRequestId)).length;
  const linkedMrToWo = maintenanceRequests.filter((row) => row.workOrderId && woById.has(row.workOrderId)).length;
  const provenanceWo = workOrders.filter((row) => row.description?.includes('"source":"GTP historical workbook"')).length;
  const provenanceMr = maintenanceRequests.filter((row) => row.description?.includes('"source":"GTP historical workbook"')).length;

  const checks = {
    workOrderCount: { expected: sourceJobs.length, actual: workOrders.length, pass: workOrders.length === sourceJobs.length },
    maintenanceRequestCount: { expected: sourceJobs.length, actual: maintenanceRequests.length, pass: maintenanceRequests.length === sourceJobs.length },
    breakdownCount: { expected: sourceBreakdowns.length, actual: dbBreakdowns.length, pass: dbBreakdowns.length === sourceBreakdowns.length },
    priorityOne2025Count: { expected: sourcePriorityOne2025.length, actual: dbPriorityOne2025.length, pass: dbPriorityOne2025.length === sourcePriorityOne2025.length },
    priorityOneResponseMinutes: {
      expected: Number(sourceResponseMinutes.toFixed(6)),
      actual: Number(dbResponseMinutes.toFixed(6)),
      pass: close(sourceResponseMinutes, dbResponseMinutes),
    },
    workOrderToRequestLinks: { expected: sourceJobs.length, actual: linkedWoToMr, pass: linkedWoToMr === sourceJobs.length },
    requestToWorkOrderLinks: { expected: sourceJobs.length, actual: linkedMrToWo, pass: linkedMrToWo === sourceJobs.length },
    workOrderProvenance: { expected: sourceJobs.length, actual: provenanceWo, pass: provenanceWo === sourceJobs.length },
    requestProvenance: { expected: sourceJobs.length, actual: provenanceMr, pass: provenanceMr === sourceJobs.length },
  };

  const pass = Object.values(checks).every((check) => check.pass);
  const result = {
    schema: 'gtp-post-import-parity/v1',
    workbook: workbookPath,
    plantId,
    generatedAt: new Date().toISOString(),
    authoritative: {
      jobRecords: sourceJobs.length,
      breakdowns: sourceBreakdowns.length,
      priorityOneBreakdowns2025: sourcePriorityOne2025.length,
      priorityOneResponseMinutes: Number(sourceResponseMinutes.toFixed(6)),
    },
    database: {
      importedWorkOrders: workOrders.length,
      importedMaintenanceRequests: maintenanceRequests.length,
      breakdowns: dbBreakdowns.length,
      priorityOneBreakdowns2025: dbPriorityOne2025.length,
      priorityOneResponseMinutes: Number(dbResponseMinutes.toFixed(6)),
    },
    checks,
    pass,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!pass) process.exitCode = 1;
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
