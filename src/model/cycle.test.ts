import { describe, expect, it } from 'vitest'
import { findCycle, findPath } from './cycle'
import type { Graph } from './graph'

/** Graph whose node ids are the given letters; edges as 'AB' strings. Edges are not validated. */
function raw(ids: string, edges: string[]): Graph {
  return {
    nodes: [...ids].map((id) => ({
      id,
      name: id,
      role: 'other',
      pos: { x: 0, y: 0 },
    })),
    edges: edges.map((e, i) => ({
      id: `e${i + 1}`,
      source: e[0],
      target: e[1],
      evidence: [],
    })),
  }
}

describe('findCycle', () => {
  it('returns null for acyclic graphs', () => {
    expect(findCycle(raw('', []))).toBeNull()
    expect(findCycle(raw('ABCD', ['AB', 'AC', 'BD', 'CD']))).toBeNull() // diamond
    expect(findCycle(raw('ABCDE', ['AB', 'CD', 'DE']))).toBeNull() // disconnected
  })

  it('returns a closed path for a cycle', () => {
    expect(findCycle(raw('ABC', ['AB', 'BC', 'CA']))).toEqual([
      'A',
      'B',
      'C',
      'A',
    ])
    expect(findCycle(raw('A', ['AA']))).toEqual(['A', 'A'])
  })

  it('finds a cycle that does not include the first node', () => {
    const cycle = findCycle(raw('ABCD', ['AB', 'BC', 'CD', 'DB']))
    expect(cycle).toEqual(['B', 'C', 'D', 'B'])
  })
})

describe('findPath', () => {
  const g = raw('ABCDE', ['AB', 'BC', 'AD', 'DC'])

  it('finds a shortest directed path', () => {
    expect(findPath(g, 'A', 'C')).toHaveLength(3)
    expect(findPath(g, 'A', 'B')).toEqual(['A', 'B'])
    expect(findPath(g, 'A', 'A')).toEqual(['A'])
  })

  it('follows edge direction only', () => {
    expect(findPath(g, 'C', 'A')).toBeNull()
    expect(findPath(g, 'A', 'E')).toBeNull()
  })
})
