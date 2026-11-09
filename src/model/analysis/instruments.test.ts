import { describe, expect, it } from 'vitest'
import referenceText from '../__fixtures__/analysis/reference.json?raw'
import { parseDagitty } from '../dagitty'
import type { Graph } from '../graph'
import type { Role } from '../schema'
import { ancestors, dConnected, descendants, withoutEdges } from './dsep'
import { instrumentalVariables } from './instruments'
import { rolesOf, type Instrument, type Roles } from './types'

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

function ivs(graph: Graph): Instrument[] {
  const result = instrumentalVariables(graph, rolesOf(graph))
  if (result === 'needs-single') throw new Error('Expected instruments.')
  return result
}

/** PCP({x}, {y}) written out from its definition in spec 4.13. */
function pcpOf(graph: Graph, x: string, y: string): Set<string> {
  const down = descendants(
    withoutEdges(graph, (e) => e.target === x),
    [x],
  )
  const up = ancestors(
    withoutEdges(graph, (e) => e.source === x),
    [y],
  )
  return new Set([...down].filter((v) => v !== x && up.has(v)))
}

/** Whether i is a conditional instrument given w by the definition in spec 4.13. */
function isInstrument(
  graph: Graph,
  roles: Roles,
  i: string,
  w: string[],
): boolean {
  const [x] = roles.x
  const [y] = roles.y
  const s = roles.s
  const pcp = pcpOf(graph, x, y)
  const forbidden = descendants(graph, [...pcp, y])
  const pbd = withoutEdges(graph, (e) => e.source === x && pcp.has(e.target))
  const observed = new Set(roles.observed)
  return (
    observed.has(i) &&
    i !== x &&
    i !== y &&
    !s.includes(i) &&
    w.every((v) => observed.has(v) && !s.includes(v) && !forbidden.has(v)) &&
    dConnected(graph, [i], [x], [...w, ...s]) &&
    !dConnected(pbd, [i], [y], [...w, ...s])
  )
}

/** Every subset of `items`. */
function subsets<T>(items: T[]): T[][] {
  let result: T[][] = [[]]
  for (const item of items)
    result = result.concat(result.map((s) => [...s, item]))
  return result
}

describe('instrumentalVariables', () => {
  it("returns 'needs-single' unless there is exactly one exposure and one outcome", () => {
    const two = dag(
      { E1: 'exposure', E2: 'exposure', D: 'outcome', Z: 'other' },
      'Z->E1',
      'E1->D',
      'E2->D',
    )
    expect(instrumentalVariables(two, rolesOf(two))).toBe('needs-single')
    const twoOutcomes = dag(
      { E: 'exposure', D1: 'outcome', D2: 'outcome' },
      'E->D1',
      'E->D2',
    )
    expect(instrumentalVariables(twoOutcomes, rolesOf(twoOutcomes))).toBe(
      'needs-single',
    )
    const none = dag({ A: 'other', D: 'outcome' }, 'A->D')
    expect(instrumentalVariables(none, rolesOf(none))).toBe('needs-single')
  })

  it('finds the classic instrument unconditionally', () => {
    const g = dag(
      { Z: 'other', X: 'exposure', Y: 'outcome', U: 'latent' },
      'Z->X',
      'X->Y',
      'U->X',
      'U->Y',
    )
    expect(ivs(g)).toEqual([{ instrument: 'Z', given: [] }])
  })

  it('finds a conditional instrument with the right conditioning set (paper, Fig. 1B)', () => {
    // Z is confounded with Y through W; given W it is an instrument. W itself is not one.
    const g = dag(
      { W: 'other', Z: 'other', X: 'exposure', Y: 'outcome', U: 'latent' },
      'W->Z',
      'W->Y',
      'Z->X',
      'X->Y',
      'U->X',
      'U->Y',
    )
    expect(ivs(g)).toEqual([{ instrument: 'Z', given: ['W'] }])
  })

  it('conditions on the nearest separator, not on a farther one', () => {
    // Both {A} and {B} separate Z from Y; the nearest one to Y is {A}.
    const g = dag(
      {
        B: 'other',
        A: 'other',
        Z: 'other',
        X: 'exposure',
        Y: 'outcome',
        U: 'latent',
      },
      'B->A',
      'A->Y',
      'B->Z',
      'Z->X',
      'X->Y',
      'U->X',
      'U->Y',
    )
    const z = ivs(g).find((i) => i.instrument === 'Z')
    expect(z).toEqual({ instrument: 'Z', given: ['A'] })
  })

  it('never conditions on a mediator; the separator goes around it', () => {
    // I <- B -> M -> Y: M is nearer to Y but lies on the causal path, so B is used.
    const g = dag(
      {
        B: 'other',
        I: 'other',
        X: 'exposure',
        M: 'other',
        Y: 'outcome',
        U: 'latent',
      },
      'B->M',
      'B->I',
      'I->X',
      'X->M',
      'M->Y',
      'X->Y',
      'U->X',
      'U->Y',
    )
    expect(ivs(g)).toEqual([{ instrument: 'I', given: ['B'] }])
  })

  it('lists no instrument when the only separator is a descendant of a mediator', () => {
    // Z <- U2 -> M -> Y with U2 latent: only M could block, and M is on the causal path.
    const g = dag(
      {
        Z: 'other',
        X: 'exposure',
        M: 'other',
        Y: 'outcome',
        U: 'latent',
        U2: 'latent',
      },
      'Z->X',
      'X->M',
      'M->Y',
      'U2->Z',
      'U2->M',
      'U->X',
      'U->Y',
    )
    expect(ivs(g)).toEqual([])
  })

  it('never conditions on a descendant of the outcome, even without a causal path', () => {
    // X is not an ancestor of Y, so PCP is empty; V3 (a child of Y) would separate V4 from Y.
    const g = dag(
      { X: 'exposure', Y: 'outcome', V3: 'other', V4: 'other' },
      'X->V4',
      'Y->V3',
      'V3->V4',
    )
    expect(ivs(g)).toEqual([])
  })

  it('conditions on selected nodes without listing them', () => {
    // Selecting on S opens Z -> S <- C -> Y; C closes it again.
    const g = dag(
      {
        Z: 'other',
        C: 'other',
        S: 'selected',
        X: 'exposure',
        Y: 'outcome',
        U: 'latent',
      },
      'Z->X',
      'Z->S',
      'C->S',
      'C->Y',
      'X->Y',
      'U->X',
      'U->Y',
    )
    expect(ivs(g)).toEqual([{ instrument: 'Z', given: ['C'] }])
  })

  it('never uses latent nodes and sorts by graph order', () => {
    const g = dag(
      {
        Z2: 'other',
        U: 'latent',
        Z1: 'other',
        X: 'exposure',
        Y: 'outcome',
        L: 'latent',
      },
      'Z2->X',
      'Z1->X',
      'L->Z1',
      'X->Y',
      'U->X',
      'U->Y',
    )
    expect(ivs(g)).toEqual([
      { instrument: 'Z2', given: [] },
      { instrument: 'Z1', given: [] },
    ])
  })
})

// --- Agreement with the dagitty-R reference answers (spec 4.13) ---

interface ReferenceGraph {
  instruments: { instrument: string; given: string[] }[] | null
}
const reference = JSON.parse(referenceText) as {
  graphs: Record<string, ReferenceGraph>
}

const gallery = import.meta.glob<string>(
  '../__fixtures__/analysis/*.dagitty.txt',
  { query: '?raw', import: 'default', eager: true },
)
const galleryFiles = Object.entries(gallery).map(
  ([path, text]) => [path.split('/').pop() as string, text] as const,
)

function load(text: string): Graph {
  const result = parseDagitty(text)
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '))
  return result.value
}

/** Instruments as `name | given names` strings, order-free. */
function named(graph: Graph, list: Instrument[]): string[] {
  const name = new Map(graph.nodes.map((n) => [n.id, n.name]))
  return list
    .map((i) => {
      const given = i.given.map((v) => name.get(v) as string).sort()
      return `${name.get(i.instrument)} | ${given.join(', ')}`
    })
    .sort()
}

/**
 * Recorded differences from dagitty-R (spec 4.13, "Where GraphCreator differs from dagitty-R on
 * purpose"): dagitty-R 0.3.4 does not condition on selected nodes, which GraphCreator always
 * does. In `selection-confounder` (A -> E, A -> S <- C -> D, S selected) selecting on S opens a path from
 * A to D that C closes: the spec gives A | C, dagitty-R gives A unconditionally.
 */
const SPEC_DIFFERS: Record<string, string[]> = {
  'selection-confounder.dagitty.txt': ['A | C'],
}

describe('dagitty-R reference', () => {
  it('the instrument file gives Z unconditionally', () => {
    const [, text] = galleryFiles.find(([f]) => f === 'instrument.dagitty.txt')!
    const graph = load(text)
    expect(named(graph, ivs(graph))).toEqual(['Z | '])
  })

  it.each(galleryFiles)(
    '%s: instruments equal reference.json',
    (file, text) => {
      const graph = load(text)
      const ref = reference.graphs[file].instruments
      const result = instrumentalVariables(graph, rolesOf(graph))
      if (ref === null) {
        expect(result).toBe('needs-single')
        return
      }
      if (result === 'needs-single') throw new Error('Expected instruments.')
      const expected =
        SPEC_DIFFERS[file] ??
        ref
          .map((i) => `${i.instrument} | ${[...i.given].sort().join(', ')}`)
          .sort()
      expect(named(graph, result)).toEqual(expected)
    },
  )

  it.each(galleryFiles)(
    '%s: every instrument meets the 4.13 conditions',
    (file, text) => {
      void file
      const graph = load(text)
      const roles = rolesOf(graph)
      const result = instrumentalVariables(graph, roles)
      if (result === 'needs-single') return
      for (const { instrument, given } of result) {
        expect(isInstrument(graph, roles, instrument, given)).toBe(true)
      }
    },
  )
})

// --- Seeded random DAGs: validity and completeness against brute force ---

/** mulberry32: a small seeded generator, so the random graphs are the same on every run. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A random DAG with 4–8 nodes, one exposure, one outcome, some latent and maybe a selected node. */
function randomDag(rand: () => number): Graph {
  const n = 4 + Math.floor(rand() * 5)
  const ids = Array.from({ length: n }, (_, k) => `V${k + 1}`)
  const p = 0.2 + rand() * 0.35
  const edges: string[] = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++)
      if (rand() < p) edges.push(`${ids[a]}->${ids[b]}`)
  }
  const order = [...ids].sort(() => rand() - 0.5)
  const roles: Record<string, Role> = {}
  for (const id of ids) roles[id] = rand() < 0.25 ? 'latent' : 'other'
  roles[order[0]] = 'exposure'
  roles[order[1]] = 'outcome'
  if (n > 5 && rand() < 0.3) roles[order[2]] = 'selected'
  return dag(roles, ...edges)
}

describe('random DAGs', () => {
  const rand = random(28)
  const graphs = Array.from({ length: 300 }, () => randomDag(rand))

  it('every listed instrument meets the 4.13 conditions with its given set', () => {
    let count = 0
    for (const graph of graphs) {
      const roles = rolesOf(graph)
      for (const { instrument, given } of ivs(graph)) {
        expect(isInstrument(graph, roles, instrument, given)).toBe(true)
        count++
      }
    }
    expect(count).toBeGreaterThan(50)
  })

  it('lists every node that some set of ancestors of the outcome, it or S instrumentalizes', () => {
    // The paper's Theorem 4.3: the nearest separator finds an ancestral instrument whenever one
    // exists. Brute force over every allowed W inside the ancestors in G^pbd.
    let conditional = 0
    for (const graph of graphs) {
      const roles = rolesOf(graph)
      const [x] = roles.x
      const [y] = roles.y
      const pcp = pcpOf(graph, x, y)
      const pbd = withoutEdges(
        graph,
        (e) => e.source === x && pcp.has(e.target),
      )
      const listed = new Map(ivs(graph).map((i) => [i.instrument, i.given]))
      for (const i of roles.observed) {
        if (i === x || i === y || roles.s.includes(i)) continue
        const an = ancestors(pbd, [y, i, ...roles.s])
        const pool = roles.observed.filter(
          (v) =>
            an.has(v) && v !== i && v !== y && v !== x && !roles.s.includes(v),
        )
        const exists = subsets(pool).some((w) =>
          isInstrument(graph, roles, i, w),
        )
        expect(listed.has(i), `${i} in ${JSON.stringify(graph.edges)}`).toBe(
          exists,
        )
        if (exists && (listed.get(i) ?? []).length > 0) conditional++
      }
    }
    expect(conditional).toBeGreaterThan(10)
  })
})
