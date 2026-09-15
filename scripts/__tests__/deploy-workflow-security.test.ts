import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowPath = join(process.cwd(), '.github', 'workflows', 'deploy.yml')
const workflow = readFileSync(workflowPath, 'utf8')

describe('production deploy workflow security contract', () => {
  it('pins deploy actions and disables persisted checkout credentials', () => {
    expect(workflow).toContain(
      'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4',
    )
    expect(workflow).toContain(
      'uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4',
    )
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).not.toMatch(/uses:\s+actions\/checkout@v\d+/)
    expect(workflow).not.toMatch(/uses:\s+actions\/download-artifact@v\d+/)
  })

  it('requires release provenance from a merged PR targeting main', () => {
    expect(workflow).toContain('pull-requests: read')
    expect(workflow).toContain('/commits/${RELEASE_SHA}/pulls')
    expect(workflow).toContain('.merged_at != null')
    expect(workflow).toContain('.base.ref == "main"')
    expect(workflow).toContain('.merge_commit_sha == $sha')
    expect(workflow).toContain(
      'release SHA is not the merge result of a merged PR targeting main',
    )
  })

  it('validates custom SSH ports against the pinned known-host entry', () => {
    expect(workflow).toContain('[[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]]')
    expect(workflow).toContain('DEPLOY_PORT >= 1 && DEPLOY_PORT <= 65535')
    expect(workflow).toContain('KNOWN_HOST_QUERY="$DEPLOY_HOST"')
    expect(workflow).toContain('KNOWN_HOST_QUERY="[$DEPLOY_HOST]:$DEPLOY_PORT"')
    expect(workflow).toContain(
      'ssh-keygen -F "$KNOWN_HOST_QUERY" -f ~/.ssh/known_hosts >/dev/null',
    )
  })

  it('requires strict pinned host-key verification for SSH and SCP', () => {
    expect(workflow).toContain('-o BatchMode=yes')
    expect(workflow).toContain('-o StrictHostKeyChecking=yes')
    expect(workflow).toContain('-o UserKnownHostsFile="$HOME/.ssh/known_hosts"')
    expect(workflow).not.toContain('ssh-keyscan')
    expect(workflow).not.toContain('StrictHostKeyChecking=no')
  })

  it('attests both privileged deployer files before any artifact upload', () => {
    expect(workflow).toContain('- name: Attest installed privileged deployer')
    expect(workflow).toContain('WRAPPER_SOURCE="scripts/deploy-production-artifact.sh"')
    expect(workflow).toContain('CORE_SOURCE="scripts/deploy-production-artifact-core.sh"')
    expect(workflow).toContain('WRAPPER_REMOTE_PATH="/usr/local/sbin/iassetspro-deploy-artifact"')
    expect(workflow).toContain(
      'CORE_REMOTE_PATH="/usr/local/sbin/deploy-production-artifact-core.sh"',
    )
    expect(workflow).toContain('sudo sha256sum')
    expect(workflow).toContain('installed wrapper does not match reviewed release source')
    expect(workflow).toContain('installed core deployer does not match reviewed release source')

    expect(workflow.indexOf('- name: Attest installed privileged deployer')).toBeLessThan(
      workflow.indexOf('- name: Upload artifact to production inbox'),
    )
  })
})
