import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacyDeploy = fs.readFileSync('DEPLOY.sh', 'utf8');

describe('legacy DEPLOY.sh production path', () => {
  it('fails closed instead of offering a manual production deployment bypass', () => {
    expect(legacyDeploy).toContain('UNSUPPORTED');
    expect(legacyDeploy).toContain('iassetspro-deploy-artifact');
    expect(legacyDeploy).toMatch(/exit\s+1/);

    expect(legacyDeploy).not.toContain('git pull origin main');
    expect(legacyDeploy).not.toContain('npm run build');
    expect(legacyDeploy).not.toContain('node .next/standalone/server.js');
    expect(legacyDeploy).not.toContain('Configure cPanel Node.js app');
  });
});
