import { describe, expect, it } from 'vitest'
import { edgeEndpoints, type Circle } from './geometry'

function expectPoints(
  actual: ReturnType<typeof edgeEndpoints>,
  expected: { sx: number; sy: number; tx: number; ty: number },
) {
  expect(actual).not.toBeNull()
  for (const key of ['sx', 'sy', 'tx', 'ty'] as const) {
    expect(actual![key]).toBeCloseTo(expected[key], 9)
  }
}

describe('edgeEndpoints', () => {
  it('starts on the source rim and ends 2 px before the target rim (horizontal)', () => {
    const source: Circle = { cx: 0, cy: 0, r: 32 }
    const target: Circle = { cx: 200, cy: 0, r: 36 }
    expectPoints(edgeEndpoints(source, target), {
      sx: 32,
      sy: 0,
      tx: 162,
      ty: 0,
    })
  })

  it('points the other way when the target is on the left', () => {
    const source: Circle = { cx: 300, cy: 50, r: 40 }
    const target: Circle = { cx: 100, cy: 50, r: 32 }
    expectPoints(edgeEndpoints(source, target), {
      sx: 260,
      sy: 50,
      tx: 134,
      ty: 50,
    })
  })

  it('follows the line between the centres (diagonal)', () => {
    // Centres 50 px apart along (0.6, 0.8).
    const source: Circle = { cx: 10, cy: 20, r: 10 }
    const target: Circle = { cx: 40, cy: 60, r: 5 }
    expectPoints(edgeEndpoints(source, target), {
      sx: 16,
      sy: 28,
      tx: 40 - 7 * 0.6,
      ty: 60 - 7 * 0.8,
    })
  })

  it('handles vertical edges', () => {
    const source: Circle = { cx: 0, cy: 0, r: 32 }
    const target: Circle = { cx: 0, cy: -100, r: 32 }
    expectPoints(edgeEndpoints(source, target), {
      sx: 0,
      sy: -32,
      tx: 0,
      ty: -66,
    })
  })

  it('uses the given gap', () => {
    const source: Circle = { cx: 0, cy: 0, r: 32 }
    const target: Circle = { cx: 200, cy: 0, r: 36 }
    expectPoints(edgeEndpoints(source, target, 0), {
      sx: 32,
      sy: 0,
      tx: 164,
      ty: 0,
    })
    expectPoints(edgeEndpoints(source, target, 10), {
      sx: 32,
      sy: 0,
      tx: 154,
      ty: 0,
    })
  })

  it('mirrors the end points when source and target are swapped', () => {
    const a: Circle = { cx: 10, cy: 20, r: 10 }
    const b: Circle = { cx: 40, cy: 60, r: 5 }
    const ab = edgeEndpoints(a, b)!
    const ba = edgeEndpoints(b, a)!
    // From b to a the direction is reversed: (-0.6, -0.8).
    expectPoints(ba, {
      sx: 40 - 5 * 0.6,
      sy: 60 - 5 * 0.8,
      tx: 10 + 12 * 0.6,
      ty: 20 + 12 * 0.8,
    })
    // With no gap, swapping exactly exchanges the start and the end.
    const ab0 = edgeEndpoints(a, b, 0)!
    const ba0 = edgeEndpoints(b, a, 0)!
    expectPoints(ba0, { sx: ab0.tx, sy: ab0.ty, tx: ab0.sx, ty: ab0.sy })
    // Both lines lie on the same line through the centres.
    expect((ab.ty - ab.sy) / (ab.tx - ab.sx)).toBeCloseTo(
      (ba.ty - ba.sy) / (ba.tx - ba.sx),
      9,
    )
  })

  it('returns null when the centres coincide', () => {
    expect(
      edgeEndpoints({ cx: 5, cy: 5, r: 32 }, { cx: 5, cy: 5, r: 40 }),
    ).toBeNull()
    expect(
      edgeEndpoints({ cx: 0, cy: 0, r: 32 }, { cx: 0, cy: 0, r: 32 }, 0),
    ).toBeNull()
  })
})
