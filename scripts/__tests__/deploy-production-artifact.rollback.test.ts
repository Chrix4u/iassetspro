import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('production artifact deployment rollback safety', () => {
  it('restores the previous runtime after failures that occur once PM2 has been stopped', async () => {
    const source = await readFile(
      join(process.cwd(), 'scripts/deploy-production-artifact.sh'),
      'utf8',
    );

    expect(source).toContain('RUNTIME_STOPPED=0');
    expect(source).toMatch(/CUTOVER_DONE.*RUNTIME_STOPPED/s);
    expect(source).toMatch(/pm2 delete \"\$PM2_NAME\"[\s\S]*RUNTIME_STOPPED=1/);
    expect(source).toMatch(/production port still occupied[\s\S]*rollback_runtime/);
    expect(source).toMatch(/if ![\s\S]*pm2 start \"\$NEW_ENTRY\"[\s\S]*rollback_runtime/);
    expect(source).toMatch(/ROLLBACK FAILED: previous runtime did not become healthy/);
  });
});
