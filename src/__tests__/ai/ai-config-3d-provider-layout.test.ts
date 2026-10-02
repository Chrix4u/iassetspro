import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AI 3D provider card layout', () => {
  it('keeps selector and icon on the first row with text below', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AIConfigPage.tsx'),
      'utf8',
    );
    expect(source).toContain('className="flex items-center justify-between gap-3"');
    expect(source).toContain('<RadioGroupItem value={p.id} aria-label={p.label} />');
    expect(source).toContain('className={`h-7 w-7 rounded-md ${p.bgColor} flex items-center justify-center shrink-0`}');
  });
});
