import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/component-registry/route.ts'), 'utf8');

describe('component registry POST error context', () => {
  it('declares error context outside the try/catch boundary', () => {
    expect(route).toContain('let errorContext: { componentCode?: unknown; name?: unknown; assetId?: unknown } = {};');
  });

  it('captures request identifiers after JSON parsing', () => {
    expect(route).toContain('componentCode: body?.componentCode');
    expect(route).toContain('name: body?.name');
    expect(route).toContain('assetId: body?.assetId');
  });

  it('uses only the safe outer context in the catch logger', () => {
    const catchSection = route.slice(route.lastIndexOf('} catch (error: unknown)'));
    expect(catchSection).toContain('...errorContext');
    expect(catchSection).not.toMatch(/\n\s+componentCode,\n/);
    expect(catchSection).not.toMatch(/\n\s+assetId,\n/);
  });
});
