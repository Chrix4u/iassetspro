import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const occurrences = (source: string, value: string) => source.split(value).length - 1;

describe('user-friendly maintenance request defaults', () => {
  it('prefills technician material and tool request reasons and restores them after submit', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain("const DEFAULT_MATERIAL_REQUEST_REASON = 'Required to complete this work order.';");
    expect(panel).toContain("const DEFAULT_TOOL_REQUEST_REASON = 'Required to safely complete this work order.';");
    expect(occurrences(panel, 'reason: DEFAULT_MATERIAL_REQUEST_REASON')).toBeGreaterThanOrEqual(2);
    expect(occurrences(panel, 'reason: DEFAULT_TOOL_REQUEST_REASON')).toBeGreaterThanOrEqual(2);
  });

  it('does not auto-populate safety or PPE declarations as if they were assessed facts', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');

    expect(maintenance).not.toContain('DEFAULT_WO_SAFETY_NOTES');
    expect(maintenance).not.toContain('DEFAULT_WO_PPE');
  });
});
