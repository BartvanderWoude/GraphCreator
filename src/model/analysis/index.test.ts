import { describe, expect, it } from 'vitest'
import { emptyGraph, type Graph } from '../graph'
import type { Role } from '../schema'
import { analyze, rolesOf } from './index'

/** A graph whose node ids equal their names; `nodes` maps each id to its role. */
function dag(nodes: Record<string, Role>, ...edges: string[]): Graph {
  return {
    nodes: Object.entries(nodes).map(([id, role]) => ({
      id,
      name: id,
      role,
      pos: { x: 0, y: 0 },
    })),
    edges: edges.map((text, i) => {
      const [source, target] = text.split('->')
      return { id: `e${i + 1}`, source, target, evidence: [] }
    }),
  }
}

describe('rolesOf', () => {
  it('sorts by graph order and leaves latent nodes out of observed', () => {
    const g = dag({
      D2: 'outcome',
      U: 'latent',
      E2: 'exposure',
      Z: 'adjusted',
      S: 'selected',
      E1: 'exposure',
      O: 'other',
      D1: 'outcome',
      U2: 'latent',
      Z2: 'adjusted',
    })
    expect(rolesOf(g)).toEqual({
      x: ['E2', 'E1'],
      y: ['D2', 'D1'],
      s: ['S'],
      z: ['Z', 'Z2'],
      latent: ['U', 'U2'],
      observed: ['D2', 'E2', 'Z', 'S', 'E1', 'O', 'D1', 'Z2'],
    })
  })
})

describe('analyze', () => {
  it('without an exposure or an outcome fills only roles and independencies', () => {
    for (const g of [
      dag({ A: 'other', D: 'outcome' }, 'A->D'),
      dag({ E: 'exposure', B: 'other' }, 'E->B'),
    ]) {
      const a = analyze(g)
      expect(a.status).toBe('no-exposure-or-outcome')
      expect(a.adjustment).toBeNull()
      expect(a.paths).toBeNull()
      expect(a.instruments).toBe('needs-single')
      expect(a.roles).toEqual(rolesOf(g))
      expect(Array.isArray(a.independencies)).toBe(true)
    }
  })

  it('with an exposure and an outcome gives every result', () => {
    const a = analyze(
      dag({ C: 'other', E: 'exposure', D: 'outcome' }, 'C->E', 'C->D', 'E->D'),
    )
    expect(a.status).toBe('ok')
    expect(a.adjustment).not.toBeNull()
    expect(a.paths).not.toBeNull()
    expect(Array.isArray(a.instruments)).toBe(true)
  })

  it("gives 'needs-single' instruments with two exposures", () => {
    const a = analyze(
      dag({ E1: 'exposure', E2: 'exposure', D: 'outcome' }, 'E1->D', 'E2->D'),
    )
    expect(a.status).toBe('ok')
    expect(a.instruments).toBe('needs-single')
  })

  it('does not throw on an empty graph', () => {
    const a = analyze(emptyGraph())
    expect(a.status).toBe('no-exposure-or-outcome')
    expect(a.roles).toEqual({
      x: [],
      y: [],
      s: [],
      z: [],
      latent: [],
      observed: [],
    })
    expect(a.independencies).toEqual([])
  })
})
