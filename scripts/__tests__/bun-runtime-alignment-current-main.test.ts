import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as { packageManager?: string }
const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8')

function productionBunVersion() {
  const match = dockerfile.match(/^ARG BUN_IMAGE=oven\/bun:([^@\s]+)(?:@sha256:[a-f0-9]{64})?$/m)
  if (!match) throw new Error('Dockerfile must declare ARG BUN_IMAGE=oven/bun:<version>')
  return match[1]
}

describe('Bun runtime alignment', () => {
  it('declares the same Bun version for repository tooling and production Docker', () => {
    const dockerVersion = productionBunVersion()
    expect(packageJson.packageManager).toBe(`bun@${dockerVersion}`)
  })
})
