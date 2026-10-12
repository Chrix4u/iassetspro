import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const source = read('src/components/modules/AssetPages.tsx');

describe('asset acquisition condition contract', () => {
  it('limits the Add/Edit Asset condition field to New and Used', () => {
    const match = source.match(/<Label>Condition<\/Label>[\s\S]*?<\/Select>/);
    expect(match).not.toBeNull();

    const field = match![0];
    expect(field).toContain('<SelectItem value="new">New</SelectItem>');
    expect(field).toContain('<SelectItem value="used">Used</SelectItem>');
    expect(field).not.toContain('<SelectItem value="good">Good</SelectItem>');
    expect(field).not.toContain('<SelectItem value="fair">Fair</SelectItem>');
    expect(field).not.toContain('<SelectItem value="poor">Poor</SelectItem>');
    expect(field).toContain('<SelectValue placeholder="Select condition" />');
  });

  it('requires legacy health-style values to be explicitly reclassified before save', () => {
    expect(source).toContain("condition: a.condition === 'new' || a.condition === 'used' ? a.condition : ''");
    expect(source).toContain("if (form.condition !== 'new' && form.condition !== 'used')");
    expect(source).toContain("toast.error('Condition must be New or Used')");
  });

  it('keeps the separate asset-health classifications available elsewhere', () => {
    expect(source).toContain("['new', 'good', 'fair', 'poor', 'out_of_service']");
  });
});
