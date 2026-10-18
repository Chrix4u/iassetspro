import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowsDir = join(process.cwd(), '.github', 'workflows')
const workflowFiles = readdirSync(workflowsDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort()

const workflows = new Map(
  workflowFiles.map((name) => [name, readFileSync(join(workflowsDir, name), 'utf8')]),
)

function externalActionRefs(source: string) {
  return source
    .split('\n')
    .map((line) => line.match(/^\s*uses:\s+([^\s#]+)/)?.[1])
    .filter((ref): ref is string => typeof ref === 'string' && !ref.startsWith('./'))
}

function checkoutBlocks(source: string) {
  return source
    .split(/\n(?=\s*- name: )/)
    .filter((block) => block.includes('uses: actions/checkout@'))
}

describe('GitHub Actions supply-chain hardening', () => {
  it('pins every external workflow Action to an immutable 40-character commit SHA', () => {
    const floating: string[] = []

    for (const [name, source] of workflows) {
      for (const ref of externalActionRefs(source)) {
        if (!/^[^@\s]+@[0-9a-f]{40}$/.test(ref)) floating.push(`${name}: ${ref}`)
      }
    }

    expect(floating).toEqual([])
  })

  it('disables persisted Git credentials for every checkout step', () => {
    const unsafe: string[] = []

    for (const [name, source] of workflows) {
      checkoutBlocks(source).forEach((block, index) => {
        if (!/persist-credentials:\s*false/.test(block)) unsafe.push(`${name}: checkout ${index + 1}`)
      })
    }

    expect(unsafe).toEqual([])
  })

  it('keeps scheduled Code Quality workflow token permissions read-only', () => {
    const codeQuality = workflows.get('code-quality.yml') ?? ''
    expect(codeQuality).toMatch(/^permissions:\s*\n\s+contents:\s+read\s*$/m)
  })
})
