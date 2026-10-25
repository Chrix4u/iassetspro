import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const maintenancePage = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const scheduleCollection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const scheduleDetail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const meterRoute = fs.readFileSync('src/app/api/meter-readings/route.ts', 'utf8');
const meterSourceRoute = fs.readFileSync('src/app/api/pm-schedules/meter-sources/route.ts', 'utf8');
const triggerConfig = fs.readFileSync('src/services/pm/triggerConfig.service.ts', 'utf8');
const meterEngine = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');

describe('canonical PM frequency model contract', () => {
  it('persists canonical metadata and narrowly migrates legacy custom-hours to Time/Day hours', () => {
    expect(schema).toContain('frequencyUnit     String?');
    expect(schema).toContain('meterName         String?');

    const migrationDirs = fs.readdirSync('prisma/migrations')
      .filter((name) => name.includes('pm_frequency'));
    expect(migrationDirs.length).toBeGreaterThan(0);
    const migration = fs.readFileSync(`prisma/migrations/${migrationDirs.at(-1)}/migration.sql`, 'utf8');
    expect(migration).toContain('ADD COLUMN "frequencyUnit" TEXT');
    expect(migration).toContain('ADD COLUMN "meterName" TEXT');
    expect(migration).toContain('UPDATE "pm_triggers"');
    expect(migration).toContain("SET \"frequencyType\" = 'time_day'");
    expect(migration).toContain("\"frequencyUnit\" = 'hours'");
    expect(migration).toContain("WHERE \"frequencyType\" = 'custom_hours'");
    expect(migration).not.toContain("WHERE \"frequencyType\" = 'meter_based'");
  });

  it('offers only Time/Day and Meter and derives the dependent unit controls', () => {
    expect(maintenancePage).toContain('PM_SCHEDULE_FREQUENCY_TYPES');
    expect(maintenancePage).toContain('PM_TIME_UNITS');
    expect(maintenancePage).toContain("useState('time_day')");
    expect(maintenancePage).toContain("useState('months')");
    expect(maintenancePage).toContain('normalizePmFrequency(item)');
    expect(maintenancePage).toContain('formFreqType === \'time_day\'');
    expect(maintenancePage).toContain('formFreqType === \'meter\'');
    expect(maintenancePage).toContain('frequencyUnit: formFreqUnit');
    expect(maintenancePage).toContain('meterName: formFreqType === \'meter\' ? formMeterName : null');
  });

  it('discovers meter choices from readings tied to the selected asset', () => {
    expect(maintenancePage).toContain('/api/meter-readings?assetId=');
    expect(meterSourceRoute).toContain("const assetId = searchParams.get('assetId')");
    expect(meterSourceRoute).toContain('where: { assetId }');
    expect(meterSourceRoute).toContain("distinct: ['meterName', 'unit']");
    expect(meterRoute).toContain('assetId: assetId || null');
  });

  it('validates and stores canonical schedule frequency metadata on create and edit', () => {
    expect(scheduleCollection).toContain('validateCanonicalPmFrequency');
    expect(scheduleCollection).toContain('normalizePmFrequency');
    expect(scheduleCollection).toContain('frequencyType: storedFrequencyType');
    expect(scheduleCollection).toContain('frequencyUnit: storedFrequencyUnit');
    expect(scheduleCollection).toContain('meterName: storedMeterName');
    expect(scheduleDetail).toContain('validateCanonicalPmFrequency');
    expect(scheduleDetail).toContain("'frequencyUnit', 'meterName'");
  });

  it('requires explicit dependent metadata for new canonical writes', () => {
    expect(scheduleCollection).toContain('isCanonicalPmFrequencyType(effectiveFrequencyType)');
    expect(scheduleCollection).toContain("const effectiveFrequencyType = scheduledTasksProvided ? 'time_day' : frequencyType");
    expect(scheduleCollection).toContain("const effectiveFrequencyValue = scheduledTasksProvided ? 1 : frequencyValue");
    expect(scheduleCollection).toContain("const effectiveFrequencyUnit = scheduledTasksProvided ? 'days' : frequencyUnit");
    expect(scheduleCollection).toContain('validateCanonicalPmFrequency({');
    expect(scheduleCollection).toContain('frequencyUnit: effectiveFrequencyUnit');
    expect(scheduleCollection).toContain('meterName,');
    expect(scheduleDetail).toContain('isCanonicalPmFrequencyType(rawFrequencyType)');
    expect(scheduleDetail).toContain('rawFrequencyUnit');
    expect(scheduleDetail).toContain('rawMeterName');
  });

  it('prevents partial API edits from giving Meter schedules calendar due state', () => {
    expect(scheduleDetail).toContain('const existingNormalizedFrequency = normalizePmFrequency(existing)');
    expect(scheduleDetail).toContain("existingNormalizedFrequency.frequencyType === 'meter'");
    expect(scheduleDetail).toContain('updateData.nextDueDate = null');
    expect(scheduleDetail).toContain('updateData.leadDays = 0');
  });

  it('turns a canonical Meter schedule into an asset-meter runtime trigger', () => {
    expect(scheduleCollection).toContain("source: 'asset_meter_reading'");
    expect(scheduleCollection).toContain('baselineValue: Number(selectedMeter.value)');
    expect(triggerConfig).toContain("schedule.frequencyType === 'meter'");
    expect(triggerConfig).toContain("source: 'asset_meter_reading'");
    expect(triggerConfig).toContain('db.meterReading.findFirst');
  });

  it('evaluates asset-meter readings while retaining the legacy component-hours path', () => {
    expect(meterEngine).toContain("config.source === 'asset_meter_reading'");
    expect(meterEngine).toContain('tx.meterReading.findFirst');
    expect(meterEngine).toContain("config.source === 'component_operating_hours'");
    expect(meterEngine).toContain('baselineValue');
    expect(meterEngine).toContain('baselineHours');
  });
});
