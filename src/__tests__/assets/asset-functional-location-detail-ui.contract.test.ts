import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const assetPages = readFileSync(join(process.cwd(), 'src/components/modules/AssetPages.tsx'), 'utf8')
const assetDetail = readFileSync(join(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'), 'utf8')

describe('asset functional-location UI integration', () => {
  it('uses the structured Functional Location picker on Add/Edit Asset and keeps it plant-scoped', () => {
    expect(assetPages).toContain("import { FunctionalLocationPicker } from '@/components/assets/FunctionalLocationPicker'")
    expect(assetPages).toContain("functionalLocationId: ''")
    expect(assetPages).toContain('<FunctionalLocationPicker')
    expect(assetPages).toContain('plantId={form.plantId}')
    expect(assetPages).toContain("label=\"Functional Location / Installed At\"")
  })

  it('assigns or relocates through the dedicated asset functional-location API after asset save', () => {
    expect(assetPages).toContain("`/api/assets/${savedAssetId}/functional-locations`")
    expect(assetPages).toContain('functionalLocationId')
    expect(assetPages).toContain("Asset saved, but its functional location could not be updated")
  })

  it('loads the primary coded asset path on asset detail with a legacy fallback', () => {
    expect(assetDetail).toContain("`/api/assets/${id}/functional-locations`")
    expect(assetDetail).toContain("`/api/functional-locations/${primary.functionalLocation.id}/path`")
    expect(assetDetail).toContain('Installed At / Asset Path')
    expect(assetDetail).toContain('Legacy location')
    expect(assetDetail).toContain('locationCode')
    expect(assetDetail).toContain('item.locationCode')
  })

  it('keeps lazy asset-detail reloaders promise-returning for the shared loading gate', () => {
    expect(assetDetail).toContain('const reloadComponents = useCallback(() => {\n    return api.get')
    expect(assetDetail).toContain('const reloadInventoryItems = useCallback(() => {\n    return api.get')
    expect(assetDetail).toContain('const reloadToolOptions = useCallback(() => {\n    return api.get')
    expect(assetDetail).toContain('const reloadTwin = useCallback(() => {\n    return api.get')
    expect(assetDetail).toContain('const reloadDiagrams = useCallback(() => {\n    return api.get')
  })

  it('separates equipment structure from machine structure instead of showing generic No Hierarchy', () => {
    expect(assetDetail).toContain('Equipment Structure')
    expect(assetDetail).toContain('Machine Structure')
    expect(assetDetail).toContain('<HierarchyCommissioningPanel assetId={id}')
    expect(assetDetail).not.toContain('title="No Hierarchy"')
    expect(assetDetail).not.toContain('This asset is not part of a hierarchy.')
  })
})
