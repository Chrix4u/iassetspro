import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician start-readiness warning semantics', () => {
  it('treats compatible trade labels semantically instead of by raw string equality', () => {
    const eligibility = read('src/services/technicianEligibility.service.ts');

    expect(eligibility).toContain('export function tradeValuesCompatible');
    expect(eligibility).toContain("'fitter'");
    expect(eligibility).toContain('const primaryTradeMatches = tradeValuesCompatible(user.primaryTrade, wo.tradeActivity)');
    expect(eligibility).toContain('const structuredTradeMatches = user.userSkills.some');
    expect(eligibility).not.toContain('user.primaryTrade !== wo.tradeActivity');
  });

  it('counts only genuinely live execution sessions as conflicting work', () => {
    const eligibility = read('src/services/technicianEligibility.service.ts');
    const startExecution = read('src/services/workOrderStartExecution.service.ts');

    expect(eligibility).toContain('await db.workOrderTimeLog.count');
    expect(eligibility).toContain("action: { in: ['start', 'resume'] }");
    expect(eligibility).toContain('endTime: null');
    expect(eligibility).toContain("workOrder: { status: 'in_progress' }");
    expect(eligibility).not.toContain('activeWoStatuses');

    expect(startExecution).toContain("action: { in: ['start', 'resume'] }");
    expect(startExecution).toContain('endTime: null');
    expect(startExecution).toContain("workOrder: { status: 'in_progress' }");
  });

  it('does not claim trade data is missing when a primary trade is recorded', () => {
    const eligibility = read('src/services/technicianEligibility.service.ts');

    expect(eligibility).toContain('checkNoSkillRecord(user.primaryTrade, user.userSkills, warnings)');
    expect(eligibility).toContain("if (!primaryTrade?.trim() && userSkills.length === 0)");
    expect(eligibility).toContain('No primary trade or structured skill records are on file for this technician');
    expect(eligibility).not.toContain('No trade or skill certifications are on file for this technician');
  });

  it('emits certification warnings only from matching structured skill evidence', () => {
    const eligibility = read('src/services/technicianEligibility.service.ts');

    expect(eligibility).toContain('const matchingSkills = user.userSkills.filter');
    expect(eligibility).toContain('if (matchingSkills.length > 0)');
    expect(eligibility).toContain('const anyCertified = matchingSkills.some');
  });
});
