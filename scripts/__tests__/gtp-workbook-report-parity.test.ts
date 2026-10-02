import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(
  join(process.cwd(), 'src/app/api/reports/maintenance/route.ts'),
  'utf8',
)

describe('GTP workbook report parity contract', () => {
  it('isolates legacy workbook charts from later GTP-UAT work orders', () => {
    expect(route).toContain("const legacyBreakdownOrders = breakdownOrders.filter")
    expect(route).toContain("wo.woNumber?.startsWith('GTP-WO-')")
    expect(route).toContain("wo.description.includes('GTP historical workbook')")
    expect(route).toContain('breakdownsByMachine: [...legacyBreakdownAssetMap.values()]')
    expect(route).toContain('breakdownsByWeek: [...legacyBreakdownWeeklyMap.entries()]')
    expect(route).toContain('downtimeByMachine: [...legacyBreakdownAssetMap.values()]')
    expect(route).toContain('responseByWeek: [...legacyBreakdownWeeklyMap.entries()]')
    expect(route).toContain('responseByMachine: [...legacyBreakdownAssetMap.values()]')
  })

  it('keeps modern breakdown performance on the full selected report population', () => {
    expect(route).toContain('breakdownCount: breakdownOrders.length')
    expect(route).toContain('weekly: [...breakdownWeeklyMap.entries()]')
    expect(route).toContain('byAsset: [...breakdownAssetMap.values()]')
  })
})
