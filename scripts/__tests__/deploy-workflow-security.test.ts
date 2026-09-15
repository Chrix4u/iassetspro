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
})
