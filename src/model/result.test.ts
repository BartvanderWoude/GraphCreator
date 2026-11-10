import { describe, expect, it } from 'vitest'
import type { Issue, Result } from './result'

function half(n: number): Result<number> {
  if (n % 2 !== 0) return { ok: false, errors: [{ message: `${n} is odd.` }] }
  return { ok: true, value: n / 2, warnings: [] }
}

describe('Result', () => {
  it('carries a value and warnings on success', () => {
    const r = half(4)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBe(2)
      expect(r.warnings).toEqual([])
    }
  })

  it('carries issues on failure', () => {
    const r = half(3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toEqual<Issue[]>([{ message: '3 is odd.' }])
  })
})
