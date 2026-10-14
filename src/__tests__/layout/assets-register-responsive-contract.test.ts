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

  it('keeps Status, Health, and Criticality together on one filter row', () => {
    expect(source).toContain('filter-row grid gap-3 lg:grid-cols-[minmax(14rem,1.4fr)_minmax(27rem,2.4fr)_auto] lg:items-center')
    expect(source).toContain('className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3"')
    expect(source).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>')
    expect(source).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Health" /></SelectTrigger>')
    expect(source).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Criticality" /></SelectTrigger>')
  })

  it('contains the wide asset table instead of widening the page', () => {
    expect(source).toContain('<div className="overflow-x-auto">')
    expect(source).toContain('<TableHead className="hidden md:table-cell">Category</TableHead>')
    expect(source).toContain('<TableHead className="hidden lg:table-cell">Location</TableHead>')
    expect(source).toContain('<TableHead className="hidden xl:table-cell">Condition</TableHead>')
  })
})
