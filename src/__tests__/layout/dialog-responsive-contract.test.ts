import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src', 'components', 'ui', 'dialog.tsx'),
  'utf8',
)

describe('shared dialog responsive contract', () => {
  it('keeps dialogs within the mobile viewport and scrolls tall content internally', () => {
    expect(source).toContain('max-h-[calc(100dvh-2rem)]')
    expect(source).toContain('max-w-[calc(100%-2rem)]')
    expect(source).toContain('overflow-y-auto')
  })

  it('uses tighter phone padding and restores desktop padding', () => {
    expect(source).toContain('p-4')
    expect(source).toContain('sm:p-6')
  })

  it('keeps dialog actions stacked on phones and horizontal on larger screens', () => {
    expect(source).toContain('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end')
  })
})
