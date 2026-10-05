import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const validationRoutes = [
  'src/app/api/reliability/degradation/route.ts',
  'src/app/api/reliability/downtime/route.ts',
  'src/app/api/reliability/failure-modes/route.ts',
  'src/app/api/reliability/rcm/route.ts',
  'src/app/api/reliability/sil/route.ts',
];

describe('reliability API validation contracts', () => {
  it.each(validationRoutes)('%s supplies only string values to ValidationError', (path) => {
    const source = read(path);
    expect(source).not.toMatch(/:\s*!?[^\n?]+\?\s*['"][^'"]+['"]\s*:\s*undefined/);
    expect(source).toContain('new ValidationError');
  });

  it('imports ValidationError in the RBI route before using it', () => {
    const source = read('src/app/api/reliability/rbi/route.ts');
    expect(source).toMatch(/import \{[^}]*ValidationError[^}]*\} from '@\/lib\/errors'/);
    expect(source).toContain("new ValidationError({ assetId: 'assetId is required' })");
  });

  it('uses the computed Weibull derivative variable consistently', () => {
    const source = read('src/app/api/reliability/weibull/route.ts');
    expect(source).toContain('const dfBeta =');
    expect(source).toContain('Math.abs(dfBeta)');
    expect(source).not.toContain('dFBeta');
  });
});
