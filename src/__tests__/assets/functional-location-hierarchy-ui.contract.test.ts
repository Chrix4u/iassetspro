import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const hierarchyPagePath = resolve(process.cwd(), 'src/components/modules/FunctionalLocationHierarchyPage.tsx')
const pickerPath = resolve(process.cwd(), 'src/components/assets/FunctionalLocationPicker.tsx')
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

  it('keeps location, equipment, and machine structures visibly separate', () => {
    const source = readFileSync(hierarchyPagePath, 'utf8')
    expect(source).toContain('Functional Locations')
    expect(source).toContain('Equipment Structure')
    expect(source).toContain('Machine Structure')
  })

  it('routes Assets → Hierarchy to the dedicated workspace', () => {
    const source = readFileSync(appPath, 'utf8')
    expect(source).toContain("'assets-hierarchy': () => import('./modules/FunctionalLocationHierarchyPage').then(m => m.default)")
  })

  it('picker displays code plus breadcrumb and supports assignable-location filtering', () => {
    const source = readFileSync(pickerPath, 'utf8')
    expect(source).toContain('allowAssetAssignment')
    expect(source).toContain('locationCode')
    expect(source).toContain('breadcrumb')
  })
})
