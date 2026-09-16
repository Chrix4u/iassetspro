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
    expect(workflow).toContain("sudo /usr/local/sbin/iassetspro-deploy-artifact '$RELEASE_SHA'");
  });
});
