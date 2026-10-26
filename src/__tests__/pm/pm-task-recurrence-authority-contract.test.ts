import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const createRoute = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');

describe('PM task recurrence authority contract', () => {
  it('defaults persisted PM schedules to legacy header recurrence authority', () => {
    expect(schema).toMatch(/recurrenceAuthority\s+String\s+@default\("legacy_header"\)/);
    expect(schema).toContain('@@index([recurrenceAuthority, isActive])');
  });

  it('makes explicit Scheduled Tasks the authority on task-level schedule creation', () => {
    expect(createRoute).toContain("recurrenceAuthority: scheduledTasksProvided ? 'task' : 'legacy_header'");
  });
});
