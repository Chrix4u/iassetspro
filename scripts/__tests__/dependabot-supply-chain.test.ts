import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const configPath = join(process.cwd(), '.github', 'dependabot.yml')
const config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''

describe('Dependabot supply-chain update contract', () => {
  it('tracks Bun, Docker, and GitHub Actions through weekly reviewed update PRs', () => {
    expect(existsSync(configPath)).toBe(true)
    expect(config).toContain('version: 2')
    expect(config).toContain('package-ecosystem: bun')
    expect(config).toContain('package-ecosystem: docker')
    expect(config).toContain('package-ecosystem: github-actions')
    expect(config.match(/interval: weekly/g)).toHaveLength(3)
  })
})
