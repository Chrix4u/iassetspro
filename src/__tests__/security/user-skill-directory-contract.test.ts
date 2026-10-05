import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/api/users/route.ts', 'utf8');

describe('user skill directory contract', () => {
  it('uses a dedicated skilled lookup query so the Trade relation is typed', () => {
    expect(source).toContain('if (includeSkills) {');
    expect(source).toContain('const lookupUsers = await db.user.findMany({');
    expect(source).toContain('skills: user.userSkills.map((us) => ({');
    expect(source).toContain('...us.trade');
    expect(source).not.toContain("'userSkills' in user");
  });

  it('keeps the default assignment lookup free of skill joins', () => {
    expect(source).toContain('select: lookupBaseSelect');
    expect(source).toContain('take: 100');
  });

  it('keeps authentication/contact secrets out of the non-admin lookup projection', () => {
    const lookupStart = source.indexOf('const lookupBaseSelect =');
    const adminStart = source.indexOf('const include: Record<string, unknown>');
    const lookupSection = source.slice(lookupStart, adminStart);
    expect(lookupSection).not.toContain('email: true');
    expect(lookupSection).not.toContain('phone: true');
    expect(lookupSection).not.toContain('passwordHash');
  });
});
