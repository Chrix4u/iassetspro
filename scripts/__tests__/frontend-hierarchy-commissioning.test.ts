import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const assetDetail = readFileSync(join(root, 'src/components/modules/AssetDetailPage.tsx'), 'utf8')
const commissioning = readFileSync(join(root, 'src/components/assets/HierarchyCommissioningPanel.tsx'), 'utf8')
const maintenance = readFileSync(join(root, 'src/components/modules/MaintenancePages.tsx'), 'utf8')
const pmApi = readFileSync(join(root, 'src/app/api/pm-schedules/route.ts'), 'utf8')

describe('frontend hierarchy commissioning and PM targeting', () => {
  it('offers bulk hierarchy commissioning from the asset component tab', () => {
    expect(assetDetail).toContain('HierarchyCommissioningPanel')
    expect(assetDetail).toContain('Commission Hierarchy')
    expect(commissioning).toContain("api.post<any>('/api/component-registry/bulk'")
    expect(commissioning).toContain('componentCode,name,componentType,parentCode,criticality')
    expect(commissioning).toContain("new Set(['assembly', 'subassembly', 'component', 'part', 'auxiliary', 'instrument'])")
    expect(commissioning).toContain('committed atomically on the server')
  })

  it('allows PM schedules to target any component-registry hierarchy node', () => {
    expect(pmApi).toContain('componentId: componentId || null')
    expect(pmApi).toContain('Selected component does not belong to the selected asset')
    expect(pmApi).toContain("['custom_hours', 'meter_based'].includes(frequencyType)")
    expect(maintenance).toContain('PM Target — Assembly / Component / Part')
    expect(maintenance).toContain('assembly, subassembly, component, part, auxiliary or instrument')
    expect(maintenance).toContain('s.component.componentType')
    expect(maintenance).toContain("join(' › ')")
  })
})
