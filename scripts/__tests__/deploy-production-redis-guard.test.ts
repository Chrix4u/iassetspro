import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('production deployment Redis durability guard', () => {
  it('runs the production Redis/BullMQ preflight before canary and PM2 cutover', async () => {
    const corePath = join(process.cwd(), 'scripts/deploy-production-artifact-core.sh');
    const source = await readFile(corePath, 'utf8');

    expect(source).toContain('test -f "$NEW_RELEASE/scripts/production-redis-preflight.mjs"');
    expect(source).toContain('NODE_ENV=production node --env-file=.env scripts/production-redis-preflight.mjs');

    const preflight = source.indexOf('NODE_ENV=production node --env-file=.env scripts/production-redis-preflight.mjs');
    const canary = source.indexOf('echo "[4/10] Canary"');
    const cutover = source.indexOf('echo "[5/10] PM2 cutover"');

    expect(preflight).toBeGreaterThan(-1);
    expect(canary).toBeGreaterThan(preflight);
    expect(cutover).toBeGreaterThan(canary);
  });

  it('packages the production queue/email runtime and validates it inside the release bundle', async () => {
    const workflow = await readFile(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

    expect(workflow).toContain('scripts/production-redis-preflight.mjs');
    for (const dependency of ['bullmq', 'ioredis', 'nodemailer']) {
      expect(workflow).toContain(`require('./node_modules/${dependency}/package.json').version`);
      expect(workflow).toContain(`.release-bundle/node_modules/${dependency}/package.json`);
    }
    expect(workflow).toContain("(cd .release-bundle && node --input-type=module -e \"await import('bullmq'); await import('ioredis'); await import('nodemailer')\")");
  });

});
