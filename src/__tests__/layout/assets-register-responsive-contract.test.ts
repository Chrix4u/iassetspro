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
    expect(source).toContain("sm:flex-none")
  })

  it('uses a compact two-column filter layout before switching to a desktop row', () => {
    expect(source).toContain('grid grid-cols-2 gap-3 lg:grid-cols-[minmax(14rem,1.7fr)_minmax(9rem,.8fr)_minmax(9rem,.8fr)_minmax(9rem,.8fr)_auto] lg:items-center')
    expect(source).toContain('col-span-2 min-w-0 lg:col-span-1')
    expect(source).toContain('col-span-2 flex items-center gap-2 lg:col-span-1 lg:ml-auto')
  })

  it('lets each compact filter control use its available grid cell', () => {
    expect(source).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>')
    expect(source).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Condition" /></SelectTrigger>')
    expect(source).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Criticality" /></SelectTrigger>')
  })
})
