import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowPath = join(process.cwd(), '.github', 'workflows', 'ci.yml')
const workflow = readFileSync(workflowPath, 'utf8')

const expectedPins = [
  'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6',
  'actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
  'docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f',
  'docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8',
]

describe('CI workflow supply-chain security contract', () => {
  it('pins every external action to an immutable commit SHA', () => {
    for (const pin of expectedPins) {
      expect(workflow).toContain(pin)
    }

    expect(workflow).not.toMatch(/^\s*uses:\s+[^\s]+@v\d+(?:\.\d+)*\s*$/m)
  })

  it('does not persist checkout credentials', () => {
    const checkoutCount = (workflow.match(/actions\/checkout@/g) ?? []).length
    const disabledCredentialCount = (workflow.match(/persist-credentials:\s*false/g) ?? []).length

    expect(checkoutCount).toBeGreaterThan(0)
    expect(disabledCredentialCount).toBe(checkoutCount)
  })

  it('keeps the workflow token read-only', () => {
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s+read/)
    expect(workflow).not.toMatch(/contents:\s+write/)
  })
})
