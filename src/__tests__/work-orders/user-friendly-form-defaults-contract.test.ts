import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const occurrences = (source: string, value: string) => source.split(value).length - 1;

describe('user-friendly maintenance form defaults', () => {
  it('prefills technician material and tool request reasons and restores them after submit', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain("const DEFAULT_MATERIAL_REQUEST_REASON = 'Required to complete this work order.';");
    expect(panel).toContain("const DEFAULT_TOOL_REQUEST_REASON = 'Required to safely complete this work order.';");
    expect(occurrences(panel, 'reason: DEFAULT_MATERIAL_REQUEST_REASON')).toBeGreaterThanOrEqual(2);
    expect(occurrences(panel, 'reason: DEFAULT_TOOL_REQUEST_REASON')).toBeGreaterThanOrEqual(2);
  });

  it('prefills standardized safety narrative fields in direct and converted work orders', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');

    expect(maintenance).toContain("const DEFAULT_WO_SAFETY_NOTES = 'Follow site safety procedures. Isolate equipment and apply LOTO/PTW where required.';");
    expect(maintenance).toContain("const DEFAULT_WO_PPE = 'Safety helmet, safety boots, gloves and eye protection; add task-specific PPE where required.';");
    expect(maintenance).toContain("const DEFAULT_WO_NOTES = 'Record work performed, findings and follow-up actions before completion.';");
    expect(occurrences(maintenance, 'safetyNotes: DEFAULT_WO_SAFETY_NOTES')).toBeGreaterThanOrEqual(3);
    expect(occurrences(maintenance, 'ppeRequired: DEFAULT_WO_PPE')).toBeGreaterThanOrEqual(3);
    expect(occurrences(maintenance, 'notes: DEFAULT_WO_NOTES')).toBeGreaterThanOrEqual(3);
  });

  it('reuses the maintenance request description as the conversion technical description', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    expect(maintenance).toContain('technicalDescription: mr.description || mr.title');
  });
});
