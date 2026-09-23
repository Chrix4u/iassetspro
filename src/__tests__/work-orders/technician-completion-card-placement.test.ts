import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/TechnicianWorkOrderPage.tsx'),
  'utf8',
);

describe('technician completion card placement', () => {
  it('renders Complete & Submit immediately after Photos & Evidence and before the right-side operational cards', () => {
    const evidence = page.indexOf('<Card id="evidence"');
    const completion = page.indexOf('<div id="completion"');
    const assignment = page.indexOf('>Assignment</CardTitle>');
    const handover = page.indexOf('>Shift Handover</CardTitle>');

    expect(evidence).toBeGreaterThan(-1);
    expect(completion).toBeGreaterThan(evidence);
    expect(assignment).toBeGreaterThan(completion);
    expect(handover).toBeGreaterThan(completion);
  });

  it('keeps the completion permission gate and submit behavior unchanged', () => {
    expect(page).toContain('{caps?.canSubmitCompletion && (');
    expect(page).toContain('Stop Timer Before Submit');
    expect(page).toContain('Submit for Supervisor Review');
    expect(page).toContain('disabled={busy !== null || !completionNotes.trim() || completionBlocked}');
  });
});
