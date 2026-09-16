import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('production deployment workflow gate', () => {
  it('deploys successful main CI by default while preserving an explicit emergency kill switch', async () => {
    const workflow = await readFile(
      join(process.cwd(), '.github/workflows/deploy.yml'),
      'utf8',
    );

    expect(workflow).toContain("vars.ENABLE_PRODUCTION_DEPLOY != 'false'");
    expect(workflow).not.toContain("vars.ENABLE_PRODUCTION_DEPLOY == 'true'");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
  });

  it('uses non-secret deployment routing defaults while keeping SSH trust material secret', async () => {
    const workflow = await readFile(
      join(process.cwd(), '.github/workflows/deploy.yml'),
      'utf8',
    );

    expect(workflow).toContain("DEPLOY_HOST: ${{ vars.DEPLOY_HOST || secrets.DEPLOY_HOST || 'iassetspro.lightworldtech.com' }}");
    expect(workflow).toContain("DEPLOY_USER: ${{ vars.DEPLOY_USER || secrets.DEPLOY_USER || 'iassetsdeploy' }}");
    expect(workflow).toContain("DEPLOY_PORT: ${{ vars.DEPLOY_PORT || secrets.DEPLOY_PORT || '22' }}");
    expect(workflow).toContain("DEPLOY_INBOX: ${{ vars.DEPLOY_INBOX || secrets.DEPLOY_INBOX || '/home/iassetsdeploy/incoming' }}");
    expect(workflow).toContain('Missing deployment secret');
    expect(workflow).toContain('DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}');
    expect(workflow).toContain('DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}');
  });

  it('uses Node 24 GitHub Actions releases in the production deploy path', async () => {
    const workflow = await readFile(
      join(process.cwd(), '.github/workflows/deploy.yml'),
      'utf8',
    );

    expect(workflow).toContain('uses: actions/checkout@v7.0.1');
    expect(workflow).toContain('uses: actions/download-artifact@v8.0.1');
    expect(workflow).not.toContain('uses: actions/checkout@v4');
    expect(workflow).not.toContain('uses: actions/download-artifact@v4');
  });

  it('keeps artifact provenance, integrity and pinned SSH trust as hard deployment safeguards', async () => {
    const workflow = await readFile(
      join(process.cwd(), '.github/workflows/deploy.yml'),
      'utf8',
    );

    expect(workflow).toContain('Validate exact successful CI run provenance');
    expect(workflow).toContain('Download tested production artifact from CI');
    expect(workflow).toContain('Verify release artifact integrity');
    expect(workflow).toContain('DEPLOY_KNOWN_HOSTS');
    expect(workflow).toContain('ssh-keygen -F "$DEPLOY_HOST" -f ~/.ssh/known_hosts');
    expect(workflow).toContain('StrictHostKeyChecking=yes');
    expect(workflow).toContain('UserKnownHostsFile=~/.ssh/known_hosts');
    expect(workflow).toContain("sudo /usr/local/sbin/iassetspro-deploy-artifact '$RELEASE_SHA'");
  });
});
