import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const service = readFileSync(join(process.cwd(), 'src/services/reliability/degradation.service.ts'), 'utf8');

describe('degradation service schema contract', () => {
  it('normalizes model candidates before choosing the best fit', () => {
    expect(service).toContain("const models: Array<{ modelType: string; params: DegradationModelParams; r2: number }>");
    expect(service).toContain('if (candidate.r2 > best.r2) best = candidate');
    expect(service).not.toContain('best.toParams');
  });

  it('carries the optional engineering unit through compute requests', () => {
    expect(service).toMatch(/interface ComputeDegradationRequest[\s\S]*unit\?: string;/);
    expect(service).toContain('unit: data.unit');
  });

  it('writes model parameters using Prisma JSON input semantics', () => {
    expect(service).toContain("import type { Prisma } from '@prisma/client'");
    expect(service).toContain('modelParams: modelParams as Prisma.InputJsonValue');
  });
});
