import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dockerignore = readFileSync(join(process.cwd(), '.dockerignore'), 'utf8')

describe('Docker build-context secret exclusion contract', () => {
  it('excludes every env-file naming variant at root and below', () => {
    expect(dockerignore).toMatch(/^\.env\*$/m)
    expect(dockerignore).toMatch(/^\*\*\/\.env\*$/m)
  })

  it('excludes registry and shell credential files', () => {
    for (const pattern of [
      '.npmrc',
      '**/.npmrc',
      '.yarnrc*',
      '**/.yarnrc*',
      '.netrc',
      '**/.netrc',
      '.ssh/',
      '**/.ssh/',
    ]) {
      expect(dockerignore).toContain(pattern)
    }
  })

  it('continues excluding private key material', () => {
    expect(dockerignore).toMatch(/^\*\.pem$/m)
    expect(dockerignore).toMatch(/^\*\.key$/m)
    expect(dockerignore).toMatch(/^\*\.crt$/m)
  })
})
