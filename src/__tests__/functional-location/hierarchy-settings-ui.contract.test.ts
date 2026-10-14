import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const typesSource = read('src/types/index.ts')
const appSource = read('src/components/EAMApp.tsx')
const sidebarSource = read('src/components/shared/Sidebar.tsx')
const pageSource = read('src/components/modules/FunctionalLocationSettingsPage.tsx')

describe('functional location settings UI contract', () => {
  it('registers a dedicated settings route without conflating asset hierarchy', () => {
    expect(typesSource).toContain("| 'settings-hierarchy'")
    expect(appSource).toContain("'settings-hierarchy': 'Hierarchy & Locations'")
    expect(appSource).toContain("'settings-hierarchy': () => import('./modules/FunctionalLocationSettingsPage').then(m => m.FunctionalLocationSettingsPage)")
    expect(sidebarSource).toContain("{ page: 'settings-hierarchy', label: 'Hierarchy & Locations'")
    expect(sidebarSource).not.toContain("{ page: 'assets-hierarchy', label: 'Hierarchy & Locations'")
  })

  it('uses the existing hierarchy-system API for customer-defined levels and Location Code rules', () => {
    expect(pageSource).toContain("api.get<HierarchySystem[]>('/api/hierarchy-systems')")
    expect(pageSource).toContain("api.post('/api/hierarchy-systems'")
    expect(pageSource).toContain("codeMode: 'mixed'")
    expect(pageSource).toContain("codeSeparator: '-'")
    expect(pageSource).toContain('allowAssetAssignment')
    expect(pageSource).toContain('codePrefix')
    expect(pageSource).toContain('isRequired')
  })

  it('loads and creates functional locations through the server-authoritative APIs', () => {
    expect(pageSource).toContain('/api/functional-locations?hierarchySystemId=')
    expect(pageSource).toContain("api.post('/api/functional-locations'")
    expect(pageSource).toContain('hierarchyLevelId')
    expect(pageSource).toContain('parentId')
    expect(pageSource).toContain('locationCode')
    expect(pageSource).toContain('codeSegment')
    expect(pageSource).toContain('location._count?.children')
  })

  it('uses guarded move rather than drag and drop', () => {
    expect(pageSource).toContain("api.post(`/api/functional-locations/${moveTarget.id}/move`")
    expect(pageSource).toContain('newParentId')
    expect(pageSource).toContain("candidate.id !== moveTarget?.id")
    expect(pageSource).not.toContain('onDragEnd')
    expect(pageSource).not.toContain('draggable=')
  })

  it('keeps the builder responsive and permission-aware', () => {
    expect(pageSource).toContain('grid min-w-0 gap-4 lg:grid-cols-[minmax(18rem,0.36fr)_minmax(0,1fr)]')
    expect(pageSource).toContain("hasPermission('assets.hierarchy.manage')")
    expect(pageSource).toContain("hasPermission('assets.functional_locations.manage')")
    expect(pageSource).toContain('overflow-x-auto')
  })
})
