import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src', 'components', 'modules', 'RepairDetailReportPage.tsx'),
  'utf8',
)

describe('repair detail report responsive contract', () => {
  it('uses compact filters below desktop and one horizontal row on wide screens', () => {
    expect(source).toContain('grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[')
    expect(source).toContain('min-w-0 space-y-1')
    expect(source).toContain('SelectTrigger className="w-full"')
    expect(source).not.toContain('className="w-[160px]"')
    expect(source).not.toContain('className="w-[150px]"')
    expect(source).not.toContain('className="w-[180px]"')
  })

  it('keeps actions and footer usable on phones', () => {
    expect(source).toContain('w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto')
    expect(source).toContain('col-span-2 w-full md:col-span-1 md:w-auto')
    expect(source).toContain('flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row')
  })

  it('contains the wide data table inside intentional horizontal scrolling', () => {
    expect(source).toContain('overflow-x-auto overscroll-x-contain')
    expect(source).toContain('<Table className="min-w-[900px]">')
  })
})
