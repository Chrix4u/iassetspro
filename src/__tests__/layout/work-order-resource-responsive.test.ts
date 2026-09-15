import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src', 'components', 'modules', 'TechnicianWorkOrderV11Panels.tsx'),
  'utf8',
)

describe('work order resource request responsive layout', () => {
  it('keeps material requests stacked on phones, two-column on tablets, and inline on wide screens', () => {
    expect(source).toContain('grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-[minmax(12rem,2fr)')
    expect(source).toContain('sm:col-span-2 2xl:col-span-1')
    expect(source).toContain('Request Material')
  })

  it('keeps tool requests stacked on phones, two-column on tablets, and inline on wide screens', () => {
    expect(source).toContain('grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-[minmax(13rem,2fr)')
    expect(source).toContain('2xl:w-auto whitespace-nowrap')
    expect(source).toContain('Request Tool')
  })

  it('protects resource cards and controls from desktop overflow', () => {
    expect(source).toContain('<Card className="min-w-0">')
    expect(source).toContain('CardContent className="space-y-4 min-w-0"')
    expect(source).toContain('w-full min-w-0 rounded-md border')
  })

  it('uses the same wide-screen inline pattern for personal tools', () => {
    expect(source).toContain('xl:grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1fr)_minmax(7rem,.75fr)_auto]')
    expect(source).toContain('sm:col-span-2 xl:col-span-1 xl:w-auto whitespace-nowrap')
  })
})
