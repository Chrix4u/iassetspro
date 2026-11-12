import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src', 'components', 'modules', 'AssetPages.tsx'),
  'utf8',
)

describe('Asset Register responsive contract', () => {
  it('lets the page header actions wrap without forcing horizontal overflow', () => {
    expect(source).toContain("className='flex w-full flex-wrap gap-2 sm:w-auto'")
    expect(source).toContain("className='flex-1 bg-emerald-600 hover:bg-emerald-700 text-white sm:flex-none'")
    expect(source).toContain("className='flex-1 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30 gap-1.5 sm:flex-none'")
  })

  it('keeps all five filters in one desktop row without the legacy wrapping flex rule', () => {
    expect(source).toContain('data-testid="assets-machines-filter-scroll"')
    expect(source).toContain('data-testid="assets-machines-filters"')
    expect(source).toContain('grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2')
    expect(source).toContain('lg:min-w-[780px]')
    expect(source).toContain('lg:grid-cols-[minmax(11rem,1.8fr)_repeat(3,minmax(7.5rem,1fr))_minmax(11.5rem,1.4fr)]')
    expect(source).not.toContain('className="filter-row grid')
    for (const key of ['search', 'status', 'health', 'criticality', 'subcomponents']) {
      expect(source).toContain('data-testid="assets-machines-filter-' + key + '"')
    }
  })

  it('lets each dropdown fit within its dedicated grid cell', () => {
    expect(source).toContain('<SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Status" /></SelectTrigger>')
    expect(source).toContain('<SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Health" /></SelectTrigger>')
    expect(source).toContain('<SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Criticality" /></SelectTrigger>')
    expect(source).toContain('className="whitespace-nowrap text-xs text-muted-foreground">Show sub-components')
  })

  it('contains the wide asset table instead of widening the page', () => {
    expect(source).toContain('<div className="overflow-x-auto">')
    expect(source).toContain('<TableHead className="hidden md:table-cell">Category</TableHead>')
    expect(source).toContain('<TableHead className="hidden lg:table-cell">Installed At</TableHead>')
    expect(source).toContain('<TableHead className="hidden xl:table-cell">Condition</TableHead>')
  })
})
