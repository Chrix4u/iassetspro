import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync(join(process.cwd(), 'Dockerfile'), 'utf8')

const bunImage =
  'oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895'

describe('production Dockerfile base-image contract', () => {
  it('pins Bun by version and immutable multi-platform digest', () => {
    expect(dockerfile).toContain(`ARG BUN_IMAGE=${bunImage}`)
    expect(dockerfile).not.toMatch(/ARG BUN_IMAGE=oven\/bun:[^@\s]+\s*$/m)
  })

  it('uses the same pinned image for all build stages', () => {
    const fromCount = (dockerfile.match(/^FROM \$\{BUN_IMAGE\}/gm) ?? []).length
    expect(fromCount).toBe(3)
  })

  it('keeps the production runtime unprivileged', () => {
    expect(dockerfile).toMatch(/^USER bun$/m)
  })
})
