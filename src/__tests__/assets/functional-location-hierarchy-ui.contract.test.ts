import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const hierarchyPagePath = resolve(process.cwd(), 'src/components/modules/FunctionalLocationHierarchyPage.tsx')
const pickerPath = resolve(process.cwd(), 'src/components/assets/FunctionalLocationPicker.tsx')
const commissioningPanelPath = resolve(process.cwd(), 'src/components/assets/HierarchyCommissioningPanel.tsx')
const appPath = resolve(process.cwd(), 'src/components/EAMApp.tsx')

describe('functional-location Phase 2 UI contract', () => {
  it('provides a dedicated hierarchy workspace and reusable location picker', () => {
    expect(existsSync(hierarchyPagePath)).toBe(true)
    expect(existsSync(pickerPath)).toBe(true)
  })

  it('loads hierarchy systems, functional locations, and coded location paths', () => {
    const source = readFileSync(hierarchyPagePath, 'utf8')
    expect(source).toContain("/api/hierarchy-systems")
    expect(source).toContain("/api/functional-locations")
    expect(source).toContain("/path")
    expect(source).toContain('Location Code')
    expect(source).toContain('Functional Locations')
  })

  it('uses the exact persisted API contract for systems and locations', () => {
    const source = readFileSync(hierarchyPagePath, 'utf8')
    const picker = readFileSync(pickerPath, 'utf8')
    expect(source).toContain('hierarchySystemId=${encodeURIComponent(systemId)}&status=active')
    expect(source).toContain('codeSeparator: systemForm.separator')
    expect(source).toContain('locationCode: locationForm.code.trim() || undefined')
    expect(source).toContain("selectedSystem.purpose || 'functional_location'")
    expect(source).not.toContain('labelPlural')
    expect(picker).toContain("hierarchySystemId: resolvedSystemId, status: 'active'")
    expect(picker).toContain('location.hierarchyLevel?.allowAssetAssignment')
  })

  it('keeps location, equipment, and machine structures visibly separate', () => {
    const source = readFileSync(hierarchyPagePath, 'utf8')
    expect(source).toContain('Functional Locations')
    expect(source).toContain('Equipment Structure')
    expect(source).toContain('Machine Structure')
  })

  it('routes Assets → Hierarchy to the dedicated workspace and names it clearly', () => {
    const source = readFileSync(appPath, 'utf8')
    expect(source).toContain("'assets-hierarchy': 'Asset & Location Hierarchy'")
    expect(source).toContain("'assets-hierarchy': () => import('./modules/FunctionalLocationHierarchyPage').then(m => m.default)")
  })

  it('picker displays code plus breadcrumb and supports assignable-location filtering', () => {
    const source = readFileSync(pickerPath, 'utf8')
    expect(source).toContain('allowAssetAssignment')
    expect(source).toContain('locationCode')
    expect(source).toContain('breadcrumb')
  })

  it('picker cannot offer a different-plant location when an asset plant is supplied', () => {
    const source = readFileSync(pickerPath, 'utf8')
    expect(source).toContain('!plantId || location.plantId === plantId')
  })

  it('standalone machine commissioning loads every existing node before enabling imports', () => {
    const source = readFileSync(commissioningPanelPath, 'utf8')
    expect(source).toContain('/api/component-registry?assetId=${encodeURIComponent(assetId)}&page=${page}&limit=${COMPONENT_PAGE_SIZE}')
    expect(source).toContain('providedExistingComponents ?? loadedExistingComponents')
    expect(source).toContain('validationUnavailable = existingLoading || Boolean(existingLoadError)')
    expect(source).toContain('disabled={importing || validationUnavailable || parsed.length === 0 || validation.length > 0}')
    expect(source).toContain('if (providedExistingComponents === undefined) await loadExistingComponents()')
  })
})
