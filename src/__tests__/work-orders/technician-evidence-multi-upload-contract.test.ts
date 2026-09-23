import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/TechnicianWorkOrderPage.tsx'),
  'utf8',
);

describe('technician evidence multi-upload contract', () => {
  it('allows selecting multiple evidence files in one native picker action', () => {
    expect(page).toContain('type="file"');
    expect(page).toContain('multiple');
    expect(page).toContain('Array.from(e.currentTarget.files || [])');
    expect(page).toContain('setEvidenceFiles(selected)');
    expect(page).toContain('Upload ${evidenceFiles.length} Files');
  });

  it('uses a synchronous file ref so the first upload click sees the current browser selection', () => {
    expect(page).toContain('const evidenceFilesRef = useRef<File[]>([])');
    expect(page).toContain('evidenceFilesRef.current = selected');
    expect(page).toContain('const selectedFiles = evidenceFilesRef.current.length > 0');
    expect(page).toContain('? [...evidenceFilesRef.current]');
  });

  it('uploads every selected file, reloads once, and retains failures for retry', () => {
    expect(page).toContain('for (const file of selectedFiles)');
    expect(page).toContain("form.append('file', file)");
    expect(page).toContain('uploadedCount += 1');
    expect(page).toContain('failed.push(file)');
    expect(page).toContain('await load()');
    expect(page).toContain('evidenceFilesRef.current = failed');
    expect(page).toContain('setEvidenceFiles(failed)');
  });

  it('keeps the 50 MB per-file validation and supports removing queued files', () => {
    expect(page).toContain('const maxBytes = 50 * 1024 * 1024');
    expect(page).toContain('must be 50 MB or smaller per file');
    expect(page).toContain('removeQueuedEvidenceFile');
    expect(page).toContain('from upload queue');
  });
});
