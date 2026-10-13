import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const assetPages = read('src/components/modules/AssetPages.tsx')
const schema = read('prisma/schema.prisma')
const assetsRoute = read('src/app/api/assets/route.ts')
const assetRoute = read('src/app/api/assets/[id]/route.ts')

describe('Asset Register final responsive and acquisition-condition contract', () => {
  it('lets Asset Register header actions and filters reflow without fixed-width phone overflow', () => {
    expect(assetPages).toContain("className='flex w-full flex-wrap gap-2 sm:w-auto'")
    expect(assetPages).toContain('grid grid-cols-2 gap-3 lg:grid-cols-[minmax(14rem,1.7fr)_minmax(9rem,.8fr)_minmax(9rem,.8fr)_minmax(9rem,.8fr)_auto] lg:items-center')
    expect(assetPages).toContain('col-span-2 min-w-0 lg:col-span-1')
    expect(assetPages).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>')
    expect(assetPages).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Health" /></SelectTrigger>')
    expect(assetPages).toContain('<SelectTrigger className="w-full"><SelectValue placeholder="Criticality" /></SelectTrigger>')
  })

  it('stores New/Used separately from maintenance health condition', () => {
    expect(schema).toContain('acquisitionCondition String    @default("new")')
    expect(assetPages).toContain("acquisitionCondition: 'new'")
    expect(assetPages).toContain("acquisitionCondition: a.acquisitionCondition || 'new'")
    expect(assetPages).toContain('<SelectItem value="new">New</SelectItem><SelectItem value="used">Used</SelectItem>')

    const formCondition = assetPages.match(/<Label>Condition<\/Label>[\s\S]*?<\/Select>/)?.[0] || ''
    expect(formCondition).toContain('form.acquisitionCondition')
    expect(formCondition).not.toContain('value="good"')
    expect(formCondition).not.toContain('value="fair"')
    expect(formCondition).not.toContain('value="poor"')
  })

  it('accepts acquisitionCondition through create/update APIs without repurposing health condition', () => {
    expect(assetsRoute).toContain('acquisitionCondition,')
    expect(assetsRoute).toContain("acquisitionCondition: acquisitionCondition || 'new'")
    expect(assetRoute).toContain("'acquisitionCondition', 'condition', 'status', 'criticality'")
  })
})
