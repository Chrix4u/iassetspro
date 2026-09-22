import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('planner recommended tool immediate selection', () => {
  const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

  it('keeps planner fallbacks selectable while the live candidate lookup is still loading', () => {
    expect(panel).toContain("resourcesLoading && toolOptions.length === 0");
    expect(panel).toContain("disabled={toolOptions.length === 0}");
    expect(panel).not.toContain("disabled={resourcesLoading || toolOptions.length === 0}");
  });

  it('does not block a selected planner tool on the live lookup loading flag', () => {
    expect(panel).toContain("disabled={busy !== null || !toolRequest.toolId}");
    expect(panel).not.toContain("!toolRequest.toolId || (!editingToolRequestId && resourcesLoading)");
    expect(panel).toContain("if (selectedTool?.availabilityVerified)");
  });
});
