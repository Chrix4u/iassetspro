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
  it('documents the known stale workbook pivot-cache classification', () => {
    const reportingPage = readFileSync(
      join(process.cwd(), 'src/components/repairs/reporting/RWOPReportingPage.tsx'),
      'utf8',
    )
    expect(reportingPage).toContain('Source integrity: EAM follows the workbook&apos;s authoritative JobRecords rows')
    expect(reportingPage).toContain('WO 161418 is Corrective in JobRecords but remains cached as Breakdown')
    expect(reportingPage).toContain('inflating week 32 from 6 to 7')
    expect(reportingPage).toContain('411 source-row breakdown records')
  })

})
