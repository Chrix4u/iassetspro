import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src', 'components', 'modules', 'PlannerWorkbench.tsx'),
  'utf8',
)

describe('Planner Workbench responsive contract', () => {
  it('keeps the Kanban readable on standard desktops and reserves five columns for very wide screens', () => {
    expect(source).toContain('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-5')
    expect(source).not.toContain('grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3')
  })

  it('only shows the capacity rail when the viewport is wide enough for it', () => {
    expect(source).toContain('w-72 shrink-0 hidden min-[1800px]:block')
    expect(source).not.toContain('w-72 shrink-0 hidden xl:block')
  })

  it('protects the main workspace and header actions from compact-width overflow', () => {
    expect(source).toContain('flex min-w-0 gap-4 mt-4')
    expect(source).toContain('flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end')
  })

  it('reflows backlog summary cards and planner action headers on small screens', () => {
    expect(source).toContain('grid grid-cols-2 gap-3 mb-6 sm:grid-cols-3 xl:grid-cols-5')
    expect(source).toContain('flex flex-wrap items-center justify-between gap-3')
  })
})
