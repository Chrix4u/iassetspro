import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
  'utf8',
);

const start = source.indexOf('export function PmTemplatesPage()');
const end = source.indexOf('// INVENTORY SUBPAGES', start);
const pmTemplatesSource = source.slice(start, end === -1 ? undefined : end);

describe('PM template task list presentation', () => {
  it('shows the full task description instead of truncating it', () => {
    expect(pmTemplatesSource).toContain('whitespace-normal break-words');
    expect(pmTemplatesSource).toContain('{task.description}');
    expect(pmTemplatesSource).not.toContain('font-medium truncate">{task.description}');
  });

  it('top-aligns task rows so wrapped descriptions remain readable', () => {
    expect(pmTemplatesSource).toContain(
      'className="flex items-start gap-2 p-2.5 rounded-lg border bg-card group/task hover:bg-muted/30 transition-colors"',
    );
  });
});