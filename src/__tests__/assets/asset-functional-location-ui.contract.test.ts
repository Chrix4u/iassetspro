import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const assetPages = readFileSync(resolve(process.cwd(), 'src/components/modules/AssetPages.tsx'), 'utf8')
const assetDetail = readFileSync(resolve(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'), 'utf8')

describe('asset functional-location UX contract', () => {
  it('uses the reusable plant-scoped functional-location picker on Add/Edit Asset', () => {
    expect(assetPages).toContain("import { FunctionalLocationPicker } from '@/components/assets/FunctionalLocationPicker'")
    expect(assetPages).toContain("functionalLocationId: ''")
    expect(assetPages).toContain('<FunctionalLocationPicker')
    expect(assetPages).toContain('plantId={form.plantId}')
    expect(assetPages).toContain('value={form.functionalLocationId}')
  })

  it('loads the current primary assignment when an existing asset is edited', () => {
    expect(assetPages).toContain('/functional-locations`')
    expect(assetPages).toContain('data?.primary?.functionalLocationId')
  })

  it('assigns or relocates through the authoritative history endpoint after saving the asset', () => {
    expect(assetPages).toContain("functionalLocationId: form.functionalLocationId")
    expect(assetPages).toContain("reason: editId ? 'Asset form relocation' : 'Initial asset location assignment'")
  })

  it('shows Installed At / Asset Path from the primary assignment and coded breadcrumb', () => {
    expect(assetDetail).toContain('/api/assets/${id}/functional-locations')
    expect(assetDetail).toContain('/api/functional-locations/${encodeURIComponent(primaryLocationId)}/path')
    expect(assetDetail).toContain('Installed At / Asset Path')
    expect(assetDetail).toContain('locationCode')
    expect(assetDetail).toContain('assetPath')
  })

  it('keeps legacy physical location fields as migration fallback instead of deleting them', () => {
    expect(assetPages).toContain("location: ''")
    expect(assetPages).toContain("building: ''")
    expect(assetPages).toContain("floor: ''")
    expect(assetPages).toContain("area: ''")
    expect(assetDetail).toContain('Legacy location')
  })
})
