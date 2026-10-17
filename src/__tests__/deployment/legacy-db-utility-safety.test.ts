import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

const retired = [
  'scripts/vps-query.mjs',
  'scripts/seed-rotary-printer.mjs',
  'scripts/seed-rotary-printer-part2.mjs',
  'scripts/fix-schema-drift.sh',
  'scripts/fix-prisma-generate.sh',
];

describe('legacy database utility safety', () => {
  it('keeps retired MariaDB-era utilities fail closed and free of embedded connection material', () => {
    for (const path of retired) {
      const source = read(path);
      expect(source, path).toContain('retired');
      expect(source, path).not.toContain('@prisma/adapter-mariadb');
      expect(source, path).not.toContain('PrismaMariaDb');
      expect(source, path).not.toMatch(/(?:mysql|mariadb|postgres(?:ql)?):\/\/[^\s"']+/i);
      expect(source, path).not.toMatch(/\bpassword\s*[:=]\s*["'][^"']+["']/i);
      expect(source, path).not.toContain('prisma db push');
    }
  });
});
