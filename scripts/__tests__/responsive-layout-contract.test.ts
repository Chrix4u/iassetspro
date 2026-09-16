import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const workOrderPanels = readFileSync(
  join(root, 'src/components/modules/TechnicianWorkOrderV11Panels.tsx'),
  'utf8',
)
const tabs = readFileSync(join(root, 'src/components/ui/tabs.tsx'), 'utf8')

describe('responsive layout contract', () => {
  it('keeps material and tool request forms compact on smaller screens and single-row on desktop', () => {
    const responsiveResourceForms = workOrderPanels.match(
      /grid grid-cols-2 gap-2 lg:grid-cols-\[/g,
    ) ?? []

    expect(responsiveResourceForms).toHaveLength(2)
    expect(workOrderPanels).toContain('Request Material')
    expect(workOrderPanels).toContain('Request Tool')
    expect(workOrderPanels).toContain(
      'col-span-2 w-full whitespace-nowrap lg:col-span-1 lg:w-auto',
    )
    expect(workOrderPanels).toContain('col-span-2 min-w-0 lg:col-span-1')
  })

  it('prevents shared tab controls from widening responsive pages', () => {
    expect(tabs).toContain('max-w-full')
    expect(tabs).toContain('overflow-x-auto')
    expect(tabs).toContain('shrink-0')
    expect(tabs).toContain('min-w-0 flex-1 outline-none')
  })
})
