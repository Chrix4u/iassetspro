import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('canonical lifecycle transition seeding', () => {
  it('keeps prisma bootstrap seed on the runtime canonical transition source', () => {
    const seed = read('prisma/seed.ts');

    expect(seed).toContain("import { seedCanonicalTransitions } from '../src/lib/state-machine'");
    expect(seed).toContain('await seedCanonicalTransitions(db)');
    expect(seed).not.toContain('const mrTransitions = [');
    expect(seed).not.toContain('const woTransitions = [');
  });

  it('keeps critical RWOP states in the canonical source', () => {
    const machine = read('src/lib/state-machine.ts');

    expect(machine).toContain("fromStatus: 'in_progress', toStatus: 'pending_handover'");
    expect(machine).toContain("fromStatus: 'waiting_tools', toStatus: 'in_progress'");
    expect(machine).toContain("fromStatus: 'waiting_shutdown', toStatus: 'in_progress'");
    expect(machine).toContain("fromStatus: 'waiting_permit', toStatus: 'in_progress'");
    expect(machine).toContain("fromStatus: 'completed', toStatus: 'verified'");
    expect(machine).toContain("fromStatus: 'verified', toStatus: 'closed'");
    expect(machine).toContain("fromStatus: 'completed', toStatus: 'in_progress'");
    expect(machine).toContain("fromStatus: 'verified', toStatus: 'in_progress'");
  });
});
