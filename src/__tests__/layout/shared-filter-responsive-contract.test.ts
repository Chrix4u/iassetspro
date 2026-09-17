import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  join(process.cwd(), 'src', 'app', 'responsive-overrides.css'),
  'utf8',
)
const layout = readFileSync(
  join(process.cwd(), 'src', 'app', 'layout.tsx'),
  'utf8',
)

describe('shared responsive filter foundation', () => {
  it('loads responsive overrides after the existing global/page styles', () => {
    const globalsIndex = layout.indexOf('"./globals.css"')
    const pageLayoutIndex = layout.indexOf('"./page-layout.css"')
    const overrideIndex = layout.indexOf('"./responsive-overrides.css"')

    expect(globalsIndex).toBeGreaterThanOrEqual(0)
    expect(pageLayoutIndex).toBeGreaterThan(globalsIndex)
    expect(overrideIndex).toBeGreaterThan(pageLayoutIndex)
  })

  it('uses two compact phone columns while keeping the primary filter full width', () => {
    expect(css).toContain('@media (max-width: 639px)')
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(css).toContain('.filter-row > :first-child')
    expect(css).toContain('grid-column: 1 / -1')
  })

  it('keeps compact controls from forcing horizontal page overflow', () => {
    expect(css).toContain('width: 100% !important')
    expect(css).toContain('min-width: 0 !important')
    expect(css).toContain('max-width: none !important')
  })
})
