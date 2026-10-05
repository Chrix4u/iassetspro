import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const rbi = readFileSync('src/services/reliability/rbi.service.ts', 'utf8');
const sil = readFileSync('src/services/reliability/sil.service.ts', 'utf8');

describe('RBI and SIL persistence contracts', () => {
  it('models status as an updatable field', () => {
    expect(rbi).toMatch(/interface CreateRbiAssessmentData[\s\S]*status\?: string;/);
    expect(sil).toMatch(/interface CreateSilAssessmentData[\s\S]*status\?: string;/);
  });

  it('normalizes RBI JSON writes through Prisma InputJsonValue', () => {
    expect(rbi).toContain("import type { Prisma } from '@prisma/client'");
    expect(rbi).toContain('operatingConditions as unknown as Prisma.InputJsonValue');
    expect(rbi).toContain('degradationMechanisms as unknown as Prisma.InputJsonValue');
    expect(rbi).toContain('Prisma.RbiAssessmentUncheckedUpdateInput');
  });

  it('normalizes SIL JSON writes and reads through explicit JSON boundaries', () => {
    expect(sil).toContain("import type { Prisma } from '@prisma/client'");
    expect(sil).toContain('lopaLayers as unknown as Prisma.InputJsonValue');
    expect(sil).toContain('components as unknown as Prisma.InputJsonValue');
    expect(sil).toContain('Prisma.SilAssessmentUncheckedUpdateInput');
    expect(sil).toContain('assessment.components as unknown as SisComponent[] | null');
    expect(sil).toContain('(existing.components ?? []) as unknown as SisComponent[]');
  });
});
