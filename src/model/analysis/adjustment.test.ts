import { describe, expect, it } from 'vitest'
import referenceText from '../__fixtures__/analysis/reference.json?raw'
import { parseDagitty } from '../dagitty'
import type { GNode, Graph } from '../graph'
import type { Role } from '../schema'
import {
  adjustment,
  findMinSep,
  forbidden,
  isAdjustmentSet,
  minimalAdjustmentSets,
  properBackdoorGraph,
  properCausalNodes,
} from './adjustment'
import { MAX_SETS, rolesOf, type NodeSet, type Roles } from './types'

/** A graph whose node ids equal their names, from edges written as 'A->B'; roles as 'E:exposure'. */
function dag(
  nodes: string,
  edges: string[],
  roles: Record<string, Role> = {},
): Graph {
  return {
    nodes: nodes.split(' ').map((id) => ({
      id,
      name: id,
      role: roles[id] ?? 'other',
      pos: { x: 0, y: 0 },
    })),
    edges: edges.map((text, i) => {
      const [source, target] = text.split('->')
      return { id: `e${i + 1}`, source, target, evidence: [] }
    }),
  }
}

const sorted = (set: Iterable<string>) => [...set].sort()
const edgeList = (g: Graph) => g.edges.map((e) => `${e.source}->${e.target}`)

/** Sets as an order-free, comparable list of keys. */
function keys(sets: string[][]): string[] {
  return sets.map((s) => [...s].sort().join(',')).sort()
}

/**
 * Brute force: every subset W of R = observed \ (Forb ∪ Y ∪ S) that satisfies `isAdjustmentSet`
 * and has no proper subset that does.
 */
function bruteForce(graph: Graph, roles: Roles): NodeSet[] {
  const { x, y, s } = roles
  const out = new Set([...forbidden(graph, x, y), ...y, ...s])
  const r = roles.observed.filter((v) => !out.has(v))
  expect(r.length).toBeLessThanOrEqual(12)
  const pick = (mask: number) => r.filter((_, i) => mask & (1 << i))
  const total = 1 << r.length
  const ok: boolean[] = []
  for (let mask = 0; mask < total; mask++) {
    ok.push(isAdjustmentSet(graph, x, y, pick(mask), s))
  }
  const result: NodeSet[] = []
  for (let mask = 0; mask < total; mask++) {
    if (!ok[mask]) continue
    let minimal = true
    // Every proper submask, down to the empty set.
    for (let sub = (mask - 1) & mask; ; sub = (sub - 1) & mask) {
      if (sub !== mask && ok[sub]) {
        minimal = false
        break
      }
      if (sub === 0) break
    }
    if (minimal) result.push(pick(mask))
  }
  return result
}

/** Checks the sort order of 4.13: by size, then by the graph order of the members. */
function expectSorted(graph: Graph, sets: NodeSet[]) {
  const order = new Map(graph.nodes.map((n, i) => [n.id, i]))
  for (const set of sets) {
    const idx = set.map((v) => order.get(v) as number)
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  }
  for (let i = 1; i < sets.length; i++) {
    const a = sets[i - 1].map((v) => order.get(v) as number)
    const b = sets[i].map((v) => order.get(v) as number)
    if (a.length !== b.length) {
      expect(a.length).toBeLessThan(b.length)
      continue
    }
    const k = a.findIndex((v, j) => v !== b[j])
    expect(k).toBeGreaterThanOrEqual(0)
    expect(a[k]).toBeLessThan(b[k])
  }
}

describe('proper causal paths on mediation', () => {
  // E -> M -> D, E -> D, C -> M, C -> D
  const g = dag('E M D C', ['E->M', 'M->D', 'E->D', 'C->M', 'C->D'])

  it('properCausalNodes is PCP(X, Y) without X', () => {
    expect(sorted(properCausalNodes(g, ['E'], ['D']))).toEqual(['D', 'M'])
  })

  it('forbidden adds the descendants and X', () => {
    expect(sorted(forbidden(g, ['E'], ['D']))).toEqual(['D', 'E', 'M'])
    const h = dag('E M D K', ['E->M', 'M->D', 'M->K'])
    expect(sorted(forbidden(h, ['E'], ['D']))).toEqual(['D', 'E', 'K', 'M'])
  })

  it('properBackdoorGraph removes the first edge of every proper causal path', () => {
    const pbd = properBackdoorGraph(g, ['E'], ['D'])
    expect(edgeList(pbd)).toEqual(['M->D', 'C->M', 'C->D'])
    expect(g.edges).toHaveLength(5)
  })

  it('keeps edges out of X that start no proper causal path', () => {
    // E -> K with K not an ancestor of D; E -> E2 -> D with E2 also an exposure.
    const h = dag('E E2 K D', ['E->K', 'E->E2', 'E2->D'])
    expect(sorted(properCausalNodes(h, ['E', 'E2'], ['D']))).toEqual(['D'])
    expect(edgeList(properBackdoorGraph(h, ['E', 'E2'], ['D']))).toEqual([
      'E->K',
      'E->E2',
    ])
  })
})

describe('isAdjustmentSet: textbook cases', () => {
  it('a confounder is needed', () => {
    const g = dag('A E D', ['A->E', 'A->D', 'E->D'])
    expect(isAdjustmentSet(g, ['E'], ['D'], [])).toBe(false)
    expect(isAdjustmentSet(g, ['E'], ['D'], ['A'])).toBe(true)
  })

  it('a mediator is forbidden', () => {
    const g = dag('E M D', ['E->M', 'M->D', 'E->D'])
    expect(isAdjustmentSet(g, ['E'], ['D'], [])).toBe(true)
    expect(isAdjustmentSet(g, ['E'], ['D'], ['M'])).toBe(false)
  })

  it('a descendant of a mediator is forbidden', () => {
    const g = dag('E M D K', ['E->M', 'M->D', 'M->K'])
    expect(isAdjustmentSet(g, ['E'], ['D'], ['K'])).toBe(false)
  })

  it('adjusting for the collider opens M-bias', () => {
    const g = dag('E D U1 U2 Z', ['E->D', 'U1->E', 'U1->Z', 'U2->D', 'U2->Z'])
    expect(isAdjustmentSet(g, ['E'], ['D'], [])).toBe(true)
    expect(isAdjustmentSet(g, ['E'], ['D'], ['Z'])).toBe(false)
    expect(isAdjustmentSet(g, ['E'], ['D'], ['Z', 'U1'])).toBe(true)
  })

  it('selection: (b) needs Z ∪ S, (c) and (d) do not depend on Z', () => {
    // selection-recoverable: A -> E, A -> S, C -> E, C -> D, E -> D
    const g = dag('A C E D S', ['E->D', 'A->E', 'A->S', 'C->E', 'C->D'])
    expect(isAdjustmentSet(g, ['E'], ['D'], ['C'], ['S'])).toBe(true)
    expect(isAdjustmentSet(g, ['E'], ['D'], [], ['S'])).toBe(false)
    // selection-bias: E -> S <- C -> D; S d-connected to D given E in G_{X̄}: (c) fails.
    const h = dag('E D S C', ['E->D', 'E->S', 'C->S', 'C->D'])
    expect(isAdjustmentSet(h, ['E'], ['D'], ['C'])).toBe(true)
    expect(isAdjustmentSet(h, ['E'], ['D'], ['C'], ['S'])).toBe(false)
  })

  it('selection condition (d): an exposure that causes S must not reach Y outside X', () => {
    // E causes S; (c) holds, but E <- C -> D keeps E and D d-connected in G_{X̲}: (d) fails.
    const g = dag('C E D S', ['C->E', 'C->D', 'E->D', 'E->S'])
    expect(isAdjustmentSet(g, ['E'], ['D'], ['C'])).toBe(true)
    expect(isAdjustmentSet(g, ['E'], ['D'], ['C'], ['S'])).toBe(false)
    // Without the confounder, E -> S is harmless.
    const h = dag('E D S', ['E->D', 'E->S'])
    expect(isAdjustmentSet(h, ['E'], ['D'], [], ['S'])).toBe(true)
  })
})

describe('minimalAdjustmentSets and adjustment', () => {
  it('lists the sets by size, then graph order', () => {
    // confounding: A -> E, A -> Z, B -> D, B -> Z, E -> D, Z -> D, Z -> E
    const g = dag(
      'A B D E Z',
      ['A->E', 'A->Z', 'B->D', 'B->Z', 'E->D', 'Z->D', 'Z->E'],
      { E: 'exposure', D: 'outcome' },
    )
    expect(minimalAdjustmentSets(g, rolesOf(g))).toEqual({
      sets: [
        ['A', 'Z'],
        ['B', 'Z'],
      ],
      truncated: false,
    })
  })

  it('gives [[]] when the empty set suffices and [] when nothing does', () => {
    const g = dag('E D', ['E->D'], { E: 'exposure', D: 'outcome' })
    expect(minimalAdjustmentSets(g, rolesOf(g)).sets).toEqual([[]])
    const h = dag('U E D', ['U->E', 'U->D', 'E->D'], {
      U: 'latent',
      E: 'exposure',
      D: 'outcome',
    })
    expect(minimalAdjustmentSets(h, rolesOf(h)).sets).toEqual([])
  })

  it('reports Z, the forbidden members of Z and selection bias', () => {
    const g = dag('E M D C', ['E->M', 'M->D', 'E->D', 'C->M', 'C->D'], {
      E: 'exposure',
      D: 'outcome',
      M: 'adjusted',
      C: 'adjusted',
    })
    expect(adjustment(g, rolesOf(g))).toEqual({
      sets: [[]],
      truncated: false,
      zSufficient: false,
      zForbidden: ['M'],
      selectionBias: false,
    })
    const h = dag('A E D', ['A->E', 'A->D', 'E->D'], {
      A: 'adjusted',
      E: 'exposure',
      D: 'outcome',
    })
    expect(adjustment(h, rolesOf(h))).toEqual({
      sets: [['A']],
      truncated: false,
      zSufficient: true,
      zForbidden: [],
      selectionBias: false,
    })
  })

  it('stops at MAX_SETS and sets truncated', () => {
    // E -> D plus k back-door paths E <- A_i <- B_i -> D: 2^k minimal sets.
    const make = (k: number) => {
      const names = ['E', 'D']
      const edges = ['E->D']
      for (let i = 1; i <= k; i++) {
        names.push(`A${i}`, `B${i}`)
        edges.push(`A${i}->E`, `B${i}->A${i}`, `B${i}->D`)
      }
      return dag(names.join(' '), edges, { E: 'exposure', D: 'outcome' })
    }
    const six = make(6)
    const small = minimalAdjustmentSets(six, rolesOf(six))
    expect(small.sets).toHaveLength(64)
    expect(small.truncated).toBe(false)

    const g = make(7)
    const result = minimalAdjustmentSets(g, rolesOf(g))
    expect(result.truncated).toBe(true)
    expect(result.sets).toHaveLength(MAX_SETS)
    expect(new Set(keys(result.sets)).size).toBe(MAX_SETS)
    for (const set of result.sets) {
      expect(set).toHaveLength(7)
      expect(isAdjustmentSet(g, ['E'], ['D'], set)).toBe(true)
    }
    expectSorted(g, result.sets)
    expect(adjustment(g, rolesOf(g)).truncated).toBe(true)
  })
})

describe('findMinSep', () => {
  it('finds a minimal separator inside R, or null', () => {
    // A - B - C - D chain: separators of A and D.
    const g = dag('A B C D', ['A->B', 'B->C', 'C->D'])
    expect(findMinSep(g, ['A'], ['D'], [], ['B', 'C'])).toHaveLength(1)
    expect(findMinSep(g, ['A'], ['D'], [], ['C'])).toEqual(['C'])
    expect(findMinSep(g, ['A'], ['D'], [], [])).toBeNull()
  })

  it('returns the included nodes too and handles separators outside An(X ∪ Y)', () => {
    // X -> W -> I <- Y with I always conditioned on: {W, I} is the only separator.
    const g = dag('X W I Y', ['X->W', 'W->I', 'Y->I'])
    expect(findMinSep(g, ['X'], ['Y'], [], ['W', 'I'])).toEqual([])
    expect(findMinSep(g, ['X'], ['Y'], ['I'], ['W'])).toEqual(['W', 'I'])
    expect(findMinSep(g, ['X'], ['Y'], ['I'], [])).toBeNull()
  })

  it('drops redundant candidates', () => {
    // A <- C -> B, C <- K: {C} suffices, K is not needed.
    const g = dag('K C A B', ['K->C', 'C->A', 'C->B'])
    expect(findMinSep(g, ['A'], ['B'], [], ['K', 'C'])).toEqual(['C'])
  })
})

// --- dagitty-R reference and brute force (spec 4.13, section 9) ---

interface ReferenceGraph {
  exposures: string[]
  outcomes: string[]
  adjusted: string[]
  latent: string[]
  selected: string[]
  adjustmentSets: string[][]
  isAdjustmentSet: boolean
}
interface ReferenceRandom {
  dagitty: string
  exposure: string
  outcome: string
  selected: string
  adjustmentSets: string[][]
}
const reference = JSON.parse(referenceText) as {
  graphs: Record<string, ReferenceGraph>
  random: ReferenceRandom[]
}

const gallery = import.meta.glob<string>(
  '../__fixtures__/analysis/*.dagitty.txt',
  { query: '?raw', import: 'default', eager: true },
)
const galleryFiles = Object.entries(gallery).map(
  ([path, text]) => [path.split('/').pop() as string, text] as const,
)

/** Parses dagitty text and returns the graph with id ↔ name lookups. */
function load(text: string): {
  graph: Graph
  id: (name: string) => string
  names: (ids: string[]) => string[]
} {
  const result = parseDagitty(text)
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '))
  const graph = result.value
  const ids = new Map(graph.nodes.map((n) => [n.name, n.id]))
  const nameOf = new Map(graph.nodes.map((n) => [n.id, n.name]))
  return {
    graph,
    id(name) {
      const id = ids.get(name)
      if (id === undefined) throw new Error(`No node "${name}".`)
      return id
    },
    names: (list) => list.map((v) => nameOf.get(v) as string),
  }
}

/** Every structural check on one graph: brute force, sort order, S never listed, findMinSep. */
function checkAgainstBruteForce(graph: Graph, roles: Roles) {
  const result = minimalAdjustmentSets(graph, roles)
  expect(result.truncated).toBe(false)
  expect(keys(result.sets)).toEqual(keys(bruteForce(graph, roles)))
  expectSorted(graph, result.sets)
  const s = new Set(roles.s)
  for (const set of result.sets) expect(set.some((v) => s.has(v))).toBe(false)

  // findMinSep on G^pbd with I = S returns one of the listed sets (plus S), or null with none.
  const { x, y } = roles
  const out = new Set([...forbidden(graph, x, y), ...y, ...roles.s])
  const r = roles.observed.filter((v) => !out.has(v))
  const one = findMinSep(properBackdoorGraph(graph, x, y), x, y, roles.s, r)
  const bias = adjustment(graph, roles).selectionBias
  if (bias) {
    expect(result.sets).toEqual([])
  } else if (one === null) {
    expect(result.sets).toEqual([])
  } else {
    expect(roles.s.every((v) => one.includes(v))).toBe(true)
    expect(keys(result.sets)).toContain(keys([one.filter((v) => !s.has(v))])[0])
  }
  return result
}

describe('gallery against dagitty-R', () => {
  it.each(galleryFiles)(
    '%s: minimal sets, isAdjustmentSet and brute force',
    (file, text) => {
      const ref = reference.graphs[file]
      const { graph, names } = load(text)
      const roles = rolesOf(graph)
      const result = checkAgainstBruteForce(graph, roles)
      expect(keys(result.sets.map(names))).toEqual(keys(ref.adjustmentSets))
      expect(isAdjustmentSet(graph, roles.x, roles.y, roles.z, roles.s)).toBe(
        ref.isAdjustmentSet,
      )
      expect(adjustment(graph, roles).zSufficient).toBe(ref.isAdjustmentSet)
    },
  )

  it('selection-bias, selection-confounder and selection-on-exposure: no set, selectionBias', () => {
    for (const file of [
      'selection-bias.dagitty.txt',
      'selection-confounder.dagitty.txt',
      'selection-on-exposure.dagitty.txt',
    ]) {
      const { graph } = load(gallery[`../__fixtures__/analysis/${file}`])
      const result = adjustment(graph, rolesOf(graph))
      expect(result.sets).toEqual([])
      expect(result.selectionBias).toBe(true)
    }
  })

  it('selection-recoverable gives C', () => {
    const { graph, id } = load(
      gallery['../__fixtures__/analysis/selection-recoverable.dagitty.txt'],
    )
    const result = adjustment(graph, rolesOf(graph))
    expect(result.sets).toEqual([[id('C')]])
    expect(result.selectionBias).toBe(false)
  })

  it('without a selected node selectionBias is false', () => {
    for (const [, text] of galleryFiles) {
      const { graph } = load(text)
      const roles = rolesOf(graph)
      if (roles.s.length === 0) {
        expect(adjustment(graph, roles).selectionBias).toBe(false)
      }
    }
  })
})

describe('random section of the reference', () => {
  it.each(reference.random.map((entry, i) => [i, entry] as const))(
    'random DAG %i matches dagitty-R',
    (_, entry) => {
      const { graph, id, names } = load(entry.dagitty)
      const roles = rolesOf(graph)
      const result = checkAgainstBruteForce(graph, roles)
      expect(keys(result.sets.map(names))).toEqual(keys(entry.adjustmentSets))
      for (const set of entry.adjustmentSets) {
        expect(
          isAdjustmentSet(graph, roles.x, roles.y, set.map(id), roles.s),
        ).toBe(true)
      }
    },
  )
})

// --- Seeded random DAGs ---

/** mulberry32: a small deterministic PRNG returning numbers in [0, 1). */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A random DAG with 4–10 nodes: edges follow a random order, one or two exposures and outcomes,
 * some latent and adjusted nodes, and a selected node in about half of the graphs.
 */
function randomDag(seed: number): Graph {
  const rand = prng(seed)
  const int = (n: number) => Math.floor(rand() * n)
  const n = 4 + int(7)
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = int(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const density = 0.2 + rand() * 0.35
  const edges: Graph['edges'] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rand() < density) {
        edges.push({
          id: `e${edges.length + 1}`,
          source: `n${order[i]}`,
          target: `n${order[j]}`,
          evidence: [],
        })
      }
    }
  }
  const free = Array.from({ length: n }, (_, i) => i)
  const take = () => free.splice(int(free.length), 1)[0]
  const role = new Map<number, Role>()
  const exposures = n >= 6 && rand() < 0.2 ? 2 : 1
  const outcomes = n >= 6 && rand() < 0.2 ? 2 : 1
  for (let k = 0; k < exposures; k++) role.set(take(), 'exposure')
  for (let k = 0; k < outcomes; k++) role.set(take(), 'outcome')
  if (rand() < 0.5) role.set(take(), 'selected')
  for (const v of [...free]) {
    const p = rand()
    if (p < 0.12) role.set(v, 'latent')
    else if (p < 0.22) role.set(v, 'adjusted')
  }
  const nodes: GNode[] = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    name: `V${i}`,
    role: role.get(i) ?? 'other',
    pos: { x: 0, y: 0 },
  }))
  return { nodes, edges }
}

describe('brute force on 200 seeded random DAGs', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => 1000 + i)

  it('includes graphs with a selected node, and some with and without sets', () => {
    let withS = 0
    let biased = 0
    let none = 0
    let some = 0
    for (const seed of seeds) {
      const g = randomDag(seed)
      const roles = rolesOf(g)
      const result = adjustment(g, roles)
      if (roles.s.length > 0) withS++
      if (result.selectionBias) biased++
      if (result.sets.length === 0) none++
      else some++
    }
    expect(withS).toBeGreaterThan(60)
    expect(biased).toBeGreaterThan(5)
    expect(none).toBeGreaterThan(10)
    expect(some).toBeGreaterThan(60)
  })

  it.each(seeds)('seed %i', (seed) => {
    const g = randomDag(seed)
    const roles = rolesOf(g)
    checkAgainstBruteForce(g, roles)
    const result = adjustment(g, roles)
    const forb = forbidden(g, roles.x, roles.y)
    expect(result.zForbidden).toEqual(roles.z.filter((v) => forb.has(v)))
    expect(result.zSufficient).toBe(
      isAdjustmentSet(g, roles.x, roles.y, roles.z, roles.s),
    )
    if (result.selectionBias) {
      expect(roles.s.length).toBeGreaterThan(0)
      expect(result.sets).toEqual([])
      expect(result.zSufficient).toBe(false)
    }
  })
})
