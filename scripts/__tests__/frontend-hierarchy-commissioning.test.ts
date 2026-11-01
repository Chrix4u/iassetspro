import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const assetDetail = readFileSync(join(root, 'src/components/modules/AssetDetailPage.tsx'), 'utf8')
const machineStructure = readFileSync(join(root, 'src/components/assets/HierarchyCommissioningPanel.tsx'), 'utf8')
const commissioning = readFileSync(join(root, 'src/components/assets/HierarchyCommissioningForm.tsx'), 'utf8')
const pmTarget = readFileSync(join(root, 'src/components/modules/pm/PmTargetTreePicker.tsx'), 'utf8')
const pmAssignment = readFileSync(join(root, 'src/components/modules/pm/PmAssignmentFormDialog.tsx'), 'utf8')
const pmApi = readFileSync(join(root, 'src/app/api/pm-schedules/route.ts'), 'utf8')

describe('frontend hierarchy commissioning and PM targeting', () => {
  it('shows registered machine structure and keeps bulk hierarchy commissioning available', () => {
    expect(assetDetail).toContain('HierarchyCommissioningPanel')
    expect(assetDetail).toContain('Commission Hierarchy')
    expect(machineStructure).toContain('MachineVisualExplorer')
    expect(machineStructure).toContain('Registered machine structure')
    expect(machineStructure).toContain('HierarchyCommissioningForm')
    expect(commissioning).toContain("api.post<any>('/api/component-registry/bulk'")
    expect(commissioning).toContain('componentCode,name,componentType,parentCode,criticality')
    expect(commissioning).toContain("new Set(['assembly', 'subassembly', 'component', 'part', 'auxiliary', 'instrument'])")
    expect(commissioning).toContain('committed atomically on the server')
  })

  it('allows PM schedules to target any component-registry hierarchy node', () => {
    expect(pmApi).toContain('componentId: componentId || null')
    expect(pmApi).toContain('Selected component does not belong to the selected asset')
    expect(pmApi).toContain("const legacyComponentUsageRequested = ['meter_based'].includes(effectiveFrequencyType)")
    expect(pmApi).toContain("source: 'component_operating_hours'")
    expect(pmAssignment).toContain("api.post('/api/pm-assignments', { assetId, componentId, assignments })")
    expect(pmTarget).toContain('Choose PM Target')
    expect(pmTarget).toContain('Use Selected Target')
    expect(pmTarget).toContain('<MachineVisualExplorer')
    expect(pmTarget).toContain('onSelectionChange={setDraft}')
  })
})
