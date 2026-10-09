import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/modules/PmTriggersPage.tsx', 'utf8');

describe('PM trigger planner UI contract', () => {
  it('loads authoritative condition and production sources for the selected PM schedule', () => {
    expect(page).toContain('/api/pm-triggers/sources?${params}');
    expect(page).toContain("triggerType !== 'condition' && triggerType !== 'production_count'");
    expect(page).toContain('Authoritative condition source');
    expect(page).toContain('Authoritative production source');
  });

  it('serializes source selections into the runtime configuration contract', () => {
    expect(page).toContain("return { ...base, metric: decodeURIComponent(sourceId) }");
    expect(page).toContain('return { ...base, deviceId: sourceId }');
    expect(page).toContain("return { sourceType, counterId: sourceId }");
    expect(page).toContain('return { sourceType, workCenterId: sourceId }');
  });

  it('does not expose the retired competing time-trigger clock in the runtime trigger picker', () => {
    expect(page).toContain("(['meter', 'condition', 'production_count'] as TriggerType[])");
    expect(page).toContain('Time cadence remains configured on the PM schedule');
    expect(page).toContain("initialType === 'time' && !legacyTypeConverted");
  });

  it('uses one authoritative interval for meter and production triggers', () => {
    expect(page).toContain('Operating-hours interval *');
    expect(page).toContain('Production interval *');
    expect(page).not.toContain('Production Threshold *');
    expect(page).not.toContain('Meter Name *');
  });

  it('removes schedules that already have a runtime trigger from the create picker', () => {
    expect(page).toContain('!triggers.some((trigger) => trigger.scheduleId === schedule.id)');
    expect(page).toContain('fetchOptions={async () => availableSchedules.map');
  });

  it('refreshes PM schedules before opening create/edit so the picker is never a stale empty snapshot', () => {
    expect(page).toContain("api.get<PmScheduleRef[]>('/api/pm-schedules')");
    expect(page).toContain('setSchedules(Array.isArray(res.data) ? res.data : [])');
    expect(page).toContain('const ready = await fetchSchedules()');
    expect(page).toContain('if (!ready) return');
    expect(page).toContain('setFormDialogOpen(true)');
  });

  it('prevents duplicate save submissions while the trigger mutation is in flight', () => {
    expect(page).toContain('if (formLoading) return');
    expect(page).toContain('setFormLoading(true)');
    expect(page).toContain('loading={formLoading}');
  });

  it('shows authoritative source labels in trigger cards', () => {
    expect(page).toContain('{config.sourceLabel || config.metric}');
    expect(page).toContain("{config.sourceLabel || 'Production source'}");
  });

  it('explains condition edge-triggering so planners understand duplicate suppression', () => {
    expect(page).toContain('A persistent alarm will not keep creating duplicate work orders');
    expect(page).toContain('it must recover before it can trigger again');
  });
});
