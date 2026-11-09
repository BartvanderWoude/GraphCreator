import { describe, expect, it } from 'vitest'
import referenceText from '../__fixtures__/analysis/reference.json?raw'
import { parseDagitty } from '../dagitty'
import type { Graph } from '../graph'
import type { Role } from '../schema'
import { dConnected } from './dsep'
import { impliedIndependencies } from './independencies'
import { rolesOf, type Independence } from './types'

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

const independencies = (graph: Graph) =>
  impliedIndependencies(graph, rolesOf(graph))

/** Every subset of `items`, as arrays keeping the order of `items`. */
function subsets<T>(items: T[]): T[][] {
  const out: T[][] = [[]]
  for (const item of items) {
    for (const s of out.slice()) out.push([...s, item])
  }
  return out
}

/**
 * Checks the properties every result must have: a before b in graph order, both observed and not
 * selected, not adjacent; `given` in graph order, observed, not selected, without a and b; `given`
 * plus S d-separates the pair and no proper subset of `given` (plus S) does.
 */
function checkResult(graph: Graph, result: Independence[]) {
  const roles = rolesOf(graph)
  const order = new Map(graph.nodes.map((n, i) => [n.id, i]))
  const allowed = new Set(roles.observed.filter((id) => !roles.s.includes(id)))
  const adjacent = (a: string, b: string) =>
    graph.edges.some(
      (e) =>
        (e.source === a && e.target === b) ||
        (e.source === b && e.target === a),
    )
  const seen = new Set<string>()
  for (const { a, b, given } of result) {
    const label = `${a} and ${b} given {${given.join(', ')}}`
    expect(order.get(a)!, label).toBeLessThan(order.get(b)!)
    expect(seen.has(`${a} ${b}`), label).toBe(false)
    seen.add(`${a} ${b}`)
    expect(allowed.has(a) && allowed.has(b), label).toBe(true)
    expect(adjacent(a, b), label).toBe(false)
    for (const id of given) {
      expect(allowed.has(id) && id !== a && id !== b, label).toBe(true)
    }
    expect(
      given.map((id) => order.get(id)!),
      label,
    ).toEqual(given.map((id) => order.get(id)!).sort((p, q) => p - q))
    expect(dConnected(graph, [a], [b], [...given, ...roles.s]), label).toBe(
      false,
    )
    for (const sub of subsets(given)) {
      if (sub.length === given.length) continue
      expect(
        dConnected(graph, [a], [b], [...sub, ...roles.s]),
        `${label}: {${sub.join(', ')}} also separates`,
      ).toBe(true)
    }
  }
  // Pairs come in graph order: a's index, then b's.
  const keys = result.map(({ a, b }) => [order.get(a)!, order.get(b)!])
  const sortedKeys = keys.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1])
  expect(keys).toEqual(sortedKeys)
}

/**
 * The pairs that have some separating set inside the observed, non-selected nodes (always with S),
 * by brute force over every subset.
 */
function bruteForcePairs(graph: Graph): string[] {
  const roles = rolesOf(graph)
  const allowed = roles.observed.filter((id) => !roles.s.includes(id))
  const pairs: string[] = []
  for (let i = 0; i < allowed.length; i++) {
    for (let j = i + 1; j < allowed.length; j++) {
      const [a, b] = [allowed[i], allowed[j]]
      const rest = allowed.filter((id) => id !== a && id !== b)
      if (
        subsets(rest).some(
          (w) => !dConnected(graph, [a], [b], [...w, ...roles.s]),
        )
      ) {
        pairs.push(`${a} ${b}`)
      }
    }
  }
  return pairs
}

describe('impliedIndependencies', () => {
  it('chain, fork and collider', () => {
    expect(
      independencies(
        dag({ A: 'other', M: 'other', B: 'other' }, 'A->M', 'M->B'),
      ),
    ).toEqual([{ a: 'A', b: 'B', given: ['M'] }])
    expect(
      independencies(
        dag({ A: 'other', C: 'other', B: 'other' }, 'C->A', 'C->B'),
      ),
    ).toEqual([{ a: 'A', b: 'B', given: ['C'] }])
    expect(
      independencies(
        dag(
          { A: 'other', B: 'other', K: 'other', L: 'other' },
          'A->K',
          'B->K',
          'K->L',
        ),
      ),
    ).toEqual([
      { a: 'A', b: 'B', given: [] },
      { a: 'A', b: 'L', given: ['K'] },
      { a: 'B', b: 'L', given: ['K'] },
    ])
  })

  it('lists pairs in graph order with a before b', () => {
    const g = dag({ B: 'other', M: 'other', A: 'other' }, 'A->M', 'M->B')
    expect(independencies(g)).toEqual([{ a: 'B', b: 'A', given: ['M'] }])
  })

  it('gives a minimal set, not every blocking node', () => {
    // A -> M1 -> B and A -> M2 -> B need M1 and M2; M1 is a collider on A -> M1 <- C -> B, so
    // conditioning on it opens that path, which C then blocks.
    const g = dag(
      { A: 'other', M1: 'other', M2: 'other', C: 'other', B: 'other' },
      'A->M1',
      'M1->B',
      'A->M2',
      'M2->B',
      'C->M1',
      'C->B',
    )
    const result = independencies(g)
    expect(result).toContainEqual({ a: 'A', b: 'B', given: ['M1', 'M2', 'C'] })
    checkResult(g, result)
  })

  it('leaves out a pair that only a latent node separates', () => {
    const g = dag(
      { U: 'latent', L: 'other', E: 'other', D: 'other' },
      'U->L',
      'L->E',
      'U->D',
      'E->D',
    )
    expect(independencies(g)).toEqual([])
  })

  it('never uses a latent node in a set and routes around it', () => {
    // A <- U -> M -> B, U latent: M separates A and B.
    const g = dag(
      { A: 'other', U: 'latent', M: 'other', B: 'other' },
      'U->A',
      'U->M',
      'M->B',
    )
    expect(independencies(g)).toEqual([{ a: 'A', b: 'B', given: ['M'] }])
  })

  it('always conditions on S and leaves it out of pairs and sets', () => {
    // A -> S <- B with S selected: A and B are dependent in the selected data.
    const collider = dag(
      { A: 'other', S: 'selected', B: 'other' },
      'A->S',
      'B->S',
    )
    expect(independencies(collider)).toEqual([])
    // A -> S -> B: S already separates, so the set is empty.
    const chain = dag({ A: 'other', S: 'selected', B: 'other' }, 'A->S', 'S->B')
    expect(independencies(chain)).toEqual([{ a: 'A', b: 'B', given: [] }])
    // A -> K <- B, K -> S: selecting on a collider's descendant opens the collider.
    const descendant = dag(
      { A: 'other', K: 'other', B: 'other', S: 'selected' },
      'A->K',
      'B->K',
      'K->S',
    )
    expect(independencies(descendant)).toEqual([])
  })

  it('selection-bias and selection-recoverable gallery cases', () => {
    const bias = parse('selection-bias.dagitty.txt')
    expect(named(bias.graph, independencies(bias.graph))).toEqual([])
    const recoverable = parse('selection-recoverable.dagitty.txt')
    expect(named(recoverable.graph, independencies(recoverable.graph))).toEqual(
      ['A ⫫ C', 'A ⫫ D | C, E'],
    )
  })

  it('an empty graph and a single node give nothing', () => {
    expect(independencies({ nodes: [], edges: [] })).toEqual([])
    expect(independencies(dag({ A: 'other' }))).toEqual([])
  })
})

// --- Gallery and dagitty-R reference ---

interface ReferenceGraph {
  latent: string[]
  selected: string[]
  independencies: { a: string; b: string; given: string[] }[]
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

function parse(file: string): { graph: Graph } {
  const entry = galleryFiles.find(([name]) => name === file)
  if (!entry) throw new Error(`No gallery file ${file}.`)
  return { graph: load(entry[1]) }
}

/** Results written as `A ⫫ B | C, D` with names. */
function named(graph: Graph, result: Independence[]): string[] {
  const name = new Map(graph.nodes.map((n) => [n.id, n.name]))
  return result.map(
    ({ a, b, given }) =>
      `${name.get(a)} ⫫ ${name.get(b)}` +
      (given.length > 0
        ? ` | ${given.map((id) => name.get(id)).join(', ')}`
        : ''),
  )
}

/** Unordered name pairs as sorted "A|B" keys, without duplicates. */
function pairKeys(pairs: { a: string; b: string }[]): string[] {
  return [...new Set(pairs.map(({ a, b }) => [a, b].sort().join('|')))].sort()
}

describe('gallery', () => {
  const withoutS = galleryFiles.filter(
    ([file]) => reference.graphs[file].selected.length === 0,
  )
  const withS = galleryFiles.filter(
    ([file]) => reference.graphs[file].selected.length > 0,
  )

  it('has files with and without a selected node', () => {
    expect(withoutS.length).toBeGreaterThan(0)
    expect(withS.length).toBeGreaterThan(0)
  })

  it.each(withoutS)('%s: pairs equal reference.json', (file, text) => {
    const graph = load(text)
    const name = new Map(graph.nodes.map((n) => [n.id, n.name]))
    const ours = independencies(graph).map(({ a, b }) => ({
      a: name.get(a)!,
      b: name.get(b)!,
    }))
    expect(pairKeys(ours)).toEqual(
      pairKeys(reference.graphs[file].independencies),
    )
  })

  it.each(galleryFiles)(
    '%s: every set separates, minimally, and only allowed nodes appear',
    (file, text) => {
      void file
      const graph = load(text)
      checkResult(graph, independencies(graph))
    },
  )

  it.each(galleryFiles)(
    '%s: latent and selected nodes never appear',
    (file, text) => {
      const graph = load(text)
      const ref = reference.graphs[file]
      const hidden = new Set(
        graph.nodes
          .filter(
            (n) => ref.latent.includes(n.name) || ref.selected.includes(n.name),
          )
          .map((n) => n.id),
      )
      for (const { a, b, given } of independencies(graph)) {
        for (const id of [a, b, ...given]) expect(hidden.has(id)).toBe(false)
      }
    },
  )

  it.each(galleryFiles)('%s: adjacent pairs never appear', (file, text) => {
    void file
    const graph = load(text)
    for (const { a, b } of independencies(graph)) {
      expect(
        graph.edges.some(
          (e) =>
            (e.source === a && e.target === b) ||
            (e.source === b && e.target === a),
        ),
      ).toBe(false)
    }
  })

  it.each(withS)(
    '%s: lists exactly the pairs that some set separates (brute force)',
    (file, text) => {
      void file
      const graph = load(text)
      const ours = independencies(graph).map(({ a, b }) => `${a} ${b}`)
      expect(ours).toEqual(bruteForcePairs(graph))
    },
  )
})

// --- Seeded random DAGs against brute force ---

/** mulberry32: a small seeded generator in [0, 1). */
function random(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A random DAG with 4–9 nodes, some latent and some selected, edges in a shuffled order. */
function randomDag(seed: number): Graph {
  const rand = random(seed)
  const n = 4 + Math.floor(rand() * 6)
  const ids = Array.from({ length: n }, (_, i) => `N${i}`)
  // Causal order differs from graph order, so graph order is really exercised.
  const causal = ids.slice()
  for (let i = causal.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[causal[i], causal[j]] = [causal[j], causal[i]]
  }
  const density = 0.2 + rand() * 0.4
  const edges: string[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rand() < density) edges.push(`${causal[i]}->${causal[j]}`)
    }
  }
  const roles: Record<string, Role> = {}
  for (const id of ids) {
    const r = rand()
    roles[id] = r < 0.15 ? 'latent' : r < 0.25 ? 'selected' : 'other'
  }
  return dag(roles, ...edges)
}

describe('random DAGs', () => {
  it('match brute force on 200 seeded DAGs (4–9 nodes, latent and selected)', () => {
    let withSelected = 0
    let withLatent = 0
    let listed = 0
    for (let seed = 1; seed <= 200; seed++) {
      const graph = randomDag(seed)
      const result = independencies(graph)
      checkResult(graph, result)
      expect(
        result.map(({ a, b }) => `${a} ${b}`),
        `seed ${seed}`,
      ).toEqual(bruteForcePairs(graph))
      if (graph.nodes.some((n) => n.role === 'selected')) withSelected++
      if (graph.nodes.some((n) => n.role === 'latent')) withLatent++
      listed += result.length
    }
    // The generator really covers the interesting cases.
    expect(withSelected).toBeGreaterThan(50)
    expect(withLatent).toBeGreaterThan(50)
    expect(listed).toBeGreaterThan(200)
  })
})
