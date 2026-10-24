import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const taskListSource = readFileSync(
  resolve(process.cwd(), 'src/components/modules/pm/PmTemplateTaskList.tsx'),
  'utf8',
);

describe('PM template task list presentation', () => {
  it('shows the full task description instead of truncating it', () => {
    expect(taskListSource).toContain('break-words');
    expect(taskListSource).toContain('{task.description}');
    expect(taskListSource).not.toContain('truncate');
  });

  it('top-aligns responsive task rows so wrapped descriptions remain readable', () => {
    expect(taskListSource).toContain('sm:items-start');
    expect(taskListSource).toContain('min-w-0 flex-1');
  });
});
