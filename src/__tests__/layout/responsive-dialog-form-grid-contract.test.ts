import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dialogSource = readFileSync(
  join(process.cwd(), 'src', 'components', 'shared', 'ResponsiveDialog.tsx'),
  'utf8',
)
const css = readFileSync(
  join(process.cwd(), 'src', 'app', 'responsive-overrides.css'),
  'utf8',
)

describe('shared dialog compact form grid contract', () => {
  it('marks both mobile and desktop ResponsiveDialog content with the shared body hook', () => {
    expect(dialogSource.match(/responsive-dialog-body/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('reduces dense three-to-five-column dialog grids to two columns below tablet width', () => {
    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('.responsive-dialog-body .grid.grid-cols-3')
    expect(css).toContain('.responsive-dialog-body .grid.grid-cols-4')
    expect(css).toContain('.responsive-dialog-body .grid.grid-cols-5')
    expect(css).toContain('[data-slot="dialog-content"] .grid.grid-cols-3')
    expect(css).toContain('[data-slot="dialog-content"] .grid.grid-cols-4')
    expect(css).toContain('[data-slot="dialog-content"] .grid.grid-cols-5')
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  })

  it('prevents dialog grid children from forcing horizontal overflow', () => {
    expect(css).toContain('.responsive-dialog-body .grid > *')
    expect(css).toContain('[data-slot="dialog-content"] .grid > *')
    expect(css).toContain('min-width: 0')
  })
})
