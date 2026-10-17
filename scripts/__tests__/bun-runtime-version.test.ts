import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as { packageManager?: string }
const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8')

describe('Bun runtime version contract', () => {
  it('pins the package manager used by setup-bun', () => {
    expect(packageJson.packageManager).toBe('bun@1.4.2')
  })

  it('matches the production Docker Bun version', () => {
    expect(dockerfile).toMatch(/^ARG BUN_IMAGE=oven\/bun:1\.4\.2(?:@sha256:[0-9a-f]{64})?$/m)
  })
})
