import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'), 'utf8');

describe('PM work-order checklist loading', () => {
  it('loads the task checklist when the work-order detail lifecycle page mounts', () => {
    expect(source).toContain("const fetchTaskChecklist = useCallback(async () => {");
    expect(source).toMatch(/useEffect\(\(\) => \{\s*fetchTaskChecklist\(\);\s*\}, \[fetchTaskChecklist\]\);/);
  });
});
