import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  join(process.cwd(), '.github', 'workflows', 'deploy.yml'),
  'utf8',
);

describe('production deploy boundary security', () => {
  it('requires the release SHA to be the merge result of a merged PR targeting main', () => {
    expect(workflow).toContain('pull-requests: read');
    expect(workflow).toContain('/commits/${RELEASE_SHA}/pulls');
    expect(workflow).toContain('.merged_at != null');
    expect(workflow).toContain('.base.ref == "main"');
    expect(workflow).toContain('.merge_commit_sha == $sha');
  });

  it('attests the installed privileged deployer to reviewed release source before upload', () => {
    expect(workflow).toContain('- name: Attest installed privileged deployer');
    expect(workflow).toContain('WRAPPER_SOURCE="scripts/deploy-production-artifact.sh"');
    expect(workflow).toContain('CORE_SOURCE="scripts/deploy-production-artifact-core.sh"');
    expect(workflow).toContain('WRAPPER_REMOTE_PATH="/usr/local/sbin/iassetspro-deploy-artifact"');
    expect(workflow).toContain('CORE_REMOTE_PATH="/usr/local/sbin/deploy-production-artifact-core.sh"');
    expect(workflow).toContain('sudo sha256sum');
    expect(workflow.indexOf('- name: Attest installed privileged deployer')).toBeLessThan(
      workflow.indexOf('- name: Upload artifact to production inbox'),
    );
  });

  it('validates custom SSH ports against the pinned known-host entry and uses noninteractive SSH', () => {
    expect(workflow).toContain('[[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]]');
    expect(workflow).toContain('DEPLOY_PORT >= 1 && DEPLOY_PORT <= 65535');
    expect(workflow).toContain('KNOWN_HOST_QUERY="$DEPLOY_HOST"');
    expect(workflow).toContain('KNOWN_HOST_QUERY="[$DEPLOY_HOST]:$DEPLOY_PORT"');
    expect(workflow).toContain('ssh-keygen -F "$KNOWN_HOST_QUERY" -f ~/.ssh/known_hosts >/dev/null');
    expect(workflow).toContain('-o BatchMode=yes');
    expect(workflow).toContain('-o StrictHostKeyChecking=yes');
    expect(workflow).toContain('-o UserKnownHostsFile="$HOME/.ssh/known_hosts"');
  });

  it('pins deploy workflow actions to immutable commit SHAs and disables persisted checkout credentials', () => {
    const deployUses = workflow.match(/^\s*uses:\s+[^\s]+$/gm) ?? [];
    expect(deployUses.length).toBeGreaterThan(0);
    for (const action of deployUses) {
      expect(action).toMatch(/@[0-9a-f]{40}(?:\s+#.*)?$/);
    }
    expect(workflow).toContain('persist-credentials: false');
  });
});
