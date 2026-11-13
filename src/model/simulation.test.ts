import { describe, expect, it } from 'vitest'
import type { GEdge, GNode, Graph } from './graph'
import type { VarType } from './schema'
import {
  equalShares,
  hasSimulationDetails,
  isNominal,
  setLevels,
  sharesTotal,
  signBadge,
  signLevelsNode,
  signShape,
  type SignShape,
} from './simulation'

function node(
  id: string,
  varType?: VarType,
  levels?: string[],
  extra: Partial<GNode> = {},
): GNode {
  const n: GNode = { id, name: id, role: 'other', pos: { x: 0, y: 0 } }
  if (varType) n.varType = varType
  if (levels) n.levels = levels
  return { ...n, ...extra }
}

function edge(
  id: string,
  source: string,
  target: string,
  extra: Partial<GEdge> = {},
): GEdge {
  return { id, source, target, evidence: [], ...extra }
}

/** The end kinds of the signShape table. */
const ENDS = {
  cat2: () => node('x', 'categorical', ['no', 'yes']),
  cat3: () => node('x', 'categorical', ['a', 'b', 'c']),
  ord3: () => node('x', 'ordinal', ['low', 'mid', 'high']),
  continuous: () => node('x', 'continuous'),
  untyped: () => node('x'),
  missing: () => null,
} as const
type End = keyof typeof ENDS
const NOMINAL: Record<End, boolean> = {
  cat2: false,
  cat3: true,
  ord3: false,
  continuous: false,
  untyped: false,
  missing: false,
}

/** A graph P → C built from two end kinds; a missing end has no node. */
function pair(parent: End, child: End): { graph: Graph; edge: GEdge } {
  const nodes: GNode[] = []
  const p = ENDS[parent]()
  const c = ENDS[child]()
  if (p) nodes.push({ ...p, id: 'P', name: 'P' })
  if (c) nodes.push({ ...c, id: 'C', name: 'C' })
  const e = edge('e1', 'P', 'C')
  return { graph: { nodes, edges: [e] }, edge: e }
}

describe('isNominal', () => {
  it('is true only for categorical nodes with three or more levels', () => {
    expect(isNominal(node('a', 'categorical', ['a', 'b', 'c']))).toBe(true)
    expect(isNominal(node('a', 'categorical', ['a', 'b', 'c', 'd']))).toBe(true)
    expect(isNominal(node('a', 'categorical', ['no', 'yes']))).toBe(false)
    expect(isNominal(node('a', 'categorical', []))).toBe(false)
    expect(isNominal(node('a', 'categorical'))).toBe(false)
    expect(isNominal(node('a', 'ordinal', ['low', 'mid', 'high']))).toBe(false)
    expect(isNominal(node('a', 'continuous'))).toBe(false)
    expect(isNominal(node('a', 'discrete'))).toBe(false)
    expect(isNominal(node('a'))).toBe(false)
  })
})

describe('signShape and signLevelsNode', () => {
  const ends = Object.keys(ENDS) as End[]
  const cases = ends.flatMap((p) => ends.map((c) => [p, c] as const))

  it.each(cases)('parent %s, child %s', (parent, child) => {
    const { graph, edge: e } = pair(parent, child)
    const expected: SignShape =
      NOMINAL[parent] && NOMINAL[child]
        ? 'none'
        : NOMINAL[child]
          ? 'child-levels'
          : NOMINAL[parent]
            ? 'parent-levels'
            : 'single'
    expect(signShape(graph, e)).toBe(expected)
    const levelsNode = signLevelsNode(graph, e)
    if (expected === 'child-levels') expect(levelsNode?.id).toBe('C')
    else if (expected === 'parent-levels') expect(levelsNode?.id).toBe('P')
    else expect(levelsNode).toBeUndefined()
  })

  it('treats an edge between two missing nodes as single', () => {
    const e = edge('e1', 'gone', 'also-gone')
    expect(signShape({ nodes: [], edges: [e] }, e)).toBe('single')
    expect(signLevelsNode({ nodes: [], edges: [e] }, e)).toBeUndefined()
  })
})

describe('signBadge', () => {
  it('gives the word, the common value of a map, or mixed', () => {
    expect(signBadge('positive')).toBe('positive')
    expect(signBadge('negative')).toBe('negative')
    expect(signBadge({ a: 'negative', b: 'negative' })).toBe('negative')
    expect(signBadge({ a: 'positive' })).toBe('positive')
    expect(signBadge({ a: 'positive', b: 'negative' })).toBe('mixed')
    expect(signBadge({})).toBeUndefined()
    expect(signBadge(undefined)).toBeUndefined()
  })
})

describe('equalShares and sharesTotal', () => {
  it('gives equal shares rounded to 4 decimals, the last taking the remainder', () => {
    expect(equalShares(1)).toEqual([1])
    expect(equalShares(2)).toEqual([0.5, 0.5])
    expect(equalShares(3)).toEqual([0.3333, 0.3333, 0.3334])
    expect(equalShares(4)).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(equalShares(6)).toEqual([
      0.1667, 0.1667, 0.1667, 0.1667, 0.1667, 0.1665,
    ])
    expect(equalShares(0)).toEqual([])
  })

  it('sums to 1 exactly for 1 to 4 levels', () => {
    for (const n of [1, 2, 3, 4]) expect(sharesTotal(equalShares(n))).toBe(1)
    for (let n = 1; n <= 20; n++)
      expect(sharesTotal(equalShares(n))).toBeCloseTo(1, 10)
  })

  it('adds up the shares', () => {
    expect(sharesTotal([])).toBe(0)
    expect(sharesTotal([0.6, 0.3])).toBeCloseTo(0.9, 12)
    expect(sharesTotal([0.88, 0.12])).toBe(1)
    expect(sharesTotal([2, 3])).toBe(5)
  })
})

describe('setLevels', () => {
  /** Wound class (3 levels, shares) with a parent, a child and an unrelated edge. */
  function graph(): Graph {
    return {
      nodes: [
        node('W', 'categorical', ['clean', 'mixed', 'dirty'], {
          shares: [0.6, 0.3, 0.1],
        }),
        node('D', 'categorical', ['no', 'yes']),
        node('S', 'ordinal', ['low', 'high']),
        node('T', 'continuous'),
      ],
      edges: [
        // child-levels: W is the levels node.
        edge('e1', 'D', 'W', {
          sign: { clean: 'negative', dirty: 'positive', other: 'positive' },
          strength: 'small',
        }),
        // parent-levels: W is the levels node.
        edge('e2', 'W', 'S', {
          sign: { mixed: 'positive', dirty: 'positive' },
        }),
        // single, not incident to W: untouched.
        edge('e3', 'D', 'S', { sign: 'positive' }),
        // single from S: its map (stray, keyed by S's levels) is not W's.
        edge('e4', 'S', 'T', { sign: { clean: 'negative' } }),
      ],
    }
  }
  const W = (g: Graph) => g.nodes.find((n) => n.id === 'W')!
  const sign = (g: Graph, id: string) => g.edges.find((e) => e.id === id)!.sign

  it('keeps shares on their levels when a level is added', () => {
    const g = setLevels(
      graph(),
      'W',
      ['clean', 'mixed', 'dirty', 'unknown'],
      [0, 1, 2, null],
    )
    expect(W(g).levels).toEqual(['clean', 'mixed', 'dirty', 'unknown'])
    expect(W(g).shares).toEqual([0.6, 0.3, 0.1, 0])
  })

  it('keeps shares on their levels when a level is removed', () => {
    const g = setLevels(graph(), 'W', ['clean', 'dirty'], [0, 2])
    expect(W(g).shares).toEqual([0.6, 0.1])
  })

  it('keeps shares on their levels when a level is renamed or moved', () => {
    const renamed = setLevels(
      graph(),
      'W',
      ['clean', 'contaminated', 'dirty'],
      [0, 1, 2],
    )
    expect(W(renamed).shares).toEqual([0.6, 0.3, 0.1])
    const moved = setLevels(
      graph(),
      'W',
      ['dirty', 'clean', 'mixed'],
      [2, 0, 1],
    )
    expect(W(moved).shares).toEqual([0.1, 0.6, 0.3])
  })

  it('gives a node without shares none', () => {
    const g0 = graph()
    const { shares: _s, ...plain } = W(g0)
    void _s
    g0.nodes[0] = plain
    const g = setLevels(g0, 'W', ['clean', 'new'], [0, null])
    expect(W(g).levels).toEqual(['clean', 'new'])
    expect('shares' in W(g)).toBe(false)
  })

  it('drops the shares when every level is removed', () => {
    const g = setLevels(graph(), 'W', [], [])
    expect(W(g).levels).toEqual([])
    expect('shares' in W(g)).toBe(false)
  })

  it('renames and drops sign-map keys on child-levels and parent-levels edges', () => {
    const g = setLevels(
      graph(),
      'W',
      ['dirty', 'clean-ish', 'new'],
      [2, 0, null],
    )
    // e1 (child-levels): dirty kept, clean renamed, mixed absent; the stray key stays last.
    expect(sign(g, 'e1')).toEqual({
      dirty: 'positive',
      'clean-ish': 'negative',
      other: 'positive',
    })
    expect(Object.keys(sign(g, 'e1') as object)).toEqual([
      'dirty',
      'clean-ish',
      'other',
    ])
    // e2 (parent-levels): mixed removed, dirty kept.
    expect(sign(g, 'e2')).toEqual({ dirty: 'positive' })
    expect(g.edges.find((e) => e.id === 'e1')!.strength).toBe('small')
  })

  it('removes a map left empty', () => {
    const g = setLevels(
      graph(),
      'W',
      ['clean', 'brand new', 'other'],
      [0, null, null],
    )
    expect('sign' in g.edges.find((e) => e.id === 'e2')!).toBe(false)
    // e1 keeps clean and its stray key (now also a level name, not duplicated).
    expect(sign(g, 'e1')).toEqual({ clean: 'negative', other: 'positive' })
  })

  it('leaves edges alone where the node is not the levels node', () => {
    const before = graph()
    const g = setLevels(before, 'W', ['a', 'b', 'c'], [null, null, null])
    expect(g.edges.find((e) => e.id === 'e3')).toBe(before.edges[2])
    expect(g.edges.find((e) => e.id === 'e4')).toBe(before.edges[3])
    // Renaming the levels of S (not nominal) leaves every map alone.
    const s = setLevels(before, 'S', ['clean', 'x'], [null, null])
    expect(s.edges).toEqual(before.edges)
  })

  it('uses the shape on the old graph', () => {
    // Removing a level makes W binary; e1's keys are still renamed and dropped.
    const g = setLevels(graph(), 'W', ['spotless', 'dirty'], [0, 2])
    expect(sign(g, 'e1')).toEqual({
      spotless: 'negative',
      dirty: 'positive',
      other: 'positive',
    })
  })

  it('drops the levels of a node without a leveled type', () => {
    const g = setLevels(graph(), 'T', ['a', 'b'], [null, null])
    const t = g.nodes.find((n) => n.id === 'T')!
    expect('levels' in t).toBe(false)
    expect('shares' in t).toBe(false)
  })

  it('handles level names that are object keys', () => {
    const g0 = graph()
    g0.edges[0] = edge('e1', 'D', 'W', { sign: { clean: 'positive' } })
    const g = setLevels(
      g0,
      'W',
      ['constructor', '__proto__', 'dirty'],
      [0, null, 2],
    )
    expect(Object.keys(sign(g, 'e1') as object)).toEqual(['constructor'])
    expect(Object.getPrototypeOf(sign(g, 'e1'))).toBe(Object.prototype)
  })

  it('does not change its input, and ignores an unknown node', () => {
    const before = graph()
    const snapshot = structuredClone(before)
    setLevels(before, 'W', ['x', 'y', 'z'], [2, 1, 0])
    expect(before).toEqual(snapshot)
    expect(setLevels(before, 'nope', ['x'], [null])).toBe(before)
  })

  it('throws when origin and levels differ in length', () => {
    expect(() => setLevels(graph(), 'W', ['a'], [])).toThrow()
  })
})

describe('hasSimulationDetails', () => {
  it('is true when shares, form, sign or strength is set', () => {
    expect(hasSimulationDetails(node('a'))).toBe(false)
    expect(hasSimulationDetails(node('a', 'categorical', ['a', 'b']))).toBe(
      false,
    )
    expect(
      hasSimulationDetails(
        node('a', 'categorical', ['a', 'b'], { shares: [0.5, 0.5] }),
      ),
    ).toBe(true)
    expect(
      hasSimulationDetails(node('a', undefined, undefined, { form: 'smooth' })),
    ).toBe(true)
    expect(hasSimulationDetails(edge('e', 'a', 'b'))).toBe(false)
    expect(hasSimulationDetails(edge('e', 'a', 'b', { note: 'x' }))).toBe(false)
    expect(
      hasSimulationDetails(edge('e', 'a', 'b', { sign: 'negative' })),
    ).toBe(true)
    expect(
      hasSimulationDetails(edge('e', 'a', 'b', { strength: 'large' })),
    ).toBe(true)
  })
})
