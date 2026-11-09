import { describe, expect, it } from 'vitest'
import referenceText from '../__fixtures__/analysis/reference.json?raw'
import { parseDagitty } from '../dagitty'
import type { Graph } from '../graph'
import {
  ancestors,
  children,
  dConnected,
  descendants,
  parents,
  reachable,
  withoutEdges,
} from './dsep'

/** A graph whose node ids equal their names, from edges written as 'A->B'. */
function dag(nodes: string, ...edges: string[]): Graph {
  return {
    nodes: nodes.split(' ').map((id) => ({
      id,
      name: id,
      role: 'other' as const,
      pos: { x: 0, y: 0 },
    })),
    edges: edges.map((text, i) => {
      const [source, target] = text.split('->')
      return { id: `e${i + 1}`, source, target, evidence: [] }
    }),
  }
}

const sorted = (set: Set<string>) => [...set].sort()

describe('parents and children', () => {
  const g = dag('A B C D', 'C->D', 'A->D', 'B->D', 'A->B')

  it('lists them in graph order', () => {
    expect(parents(g, 'D')).toEqual(['A', 'B', 'C'])
    expect(children(g, 'A')).toEqual(['B', 'D'])
    expect(parents(g, 'A')).toEqual([])
    expect(children(g, 'D')).toEqual([])
  })
})

describe('ancestors and descendants', () => {
  const g = dag('A B C D E', 'A->B', 'B->C', 'D->C', 'C->E')

  it('include the start nodes', () => {
    expect(sorted(ancestors(g, ['C']))).toEqual(['A', 'B', 'C', 'D'])
    expect(sorted(descendants(g, ['B']))).toEqual(['B', 'C', 'E'])
    expect(sorted(ancestors(g, ['A']))).toEqual(['A'])
    expect(sorted(descendants(g, ['E']))).toEqual(['E'])
  })

  it('take several start nodes and ignore unknown ids', () => {
    expect(sorted(ancestors(g, ['B', 'D', 'nope']))).toEqual(['A', 'B', 'D'])
    expect(sorted(descendants(g, ['A', 'D']))).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
    expect(sorted(ancestors(g, []))).toEqual([])
  })
})

describe('dConnected', () => {
  it('chain: open, blocked by the middle node', () => {
    const g = dag('A M B', 'A->M', 'M->B')
    expect(dConnected(g, ['A'], ['B'], [])).toBe(true)
    expect(dConnected(g, ['A'], ['B'], ['M'])).toBe(false)
    expect(dConnected(g, ['B'], ['A'], ['M'])).toBe(false)
  })

  it('fork: open, blocked by the common cause', () => {
    const g = dag('C A B', 'C->A', 'C->B')
    expect(dConnected(g, ['A'], ['B'], [])).toBe(true)
    expect(dConnected(g, ['A'], ['B'], ['C'])).toBe(false)
  })

  it('collider: blocked, opened by the collider or its descendant', () => {
    const g = dag('A B K L', 'A->K', 'B->K', 'K->L')
    expect(dConnected(g, ['A'], ['B'], [])).toBe(false)
    expect(dConnected(g, ['A'], ['B'], ['K'])).toBe(true)
    expect(dConnected(g, ['A'], ['B'], ['L'])).toBe(true)
  })

  it('an opened collider is blocked again on a conditioned non-collider', () => {
    // A -> K <- M <- B with K conditioned (open) and M conditioned (blocks).
    const g = dag('A K M B', 'A->K', 'M->K', 'B->M')
    expect(dConnected(g, ['A'], ['B'], ['K'])).toBe(true)
    expect(dConnected(g, ['A'], ['B'], ['K', 'M'])).toBe(false)
  })

  it('M-bias: closed until the collider is conditioned on, closed again by U1', () => {
    const g = dag('E D U1 U2 Z', 'E->D', 'U1->E', 'U1->Z', 'U2->D', 'U2->Z')
    const noDirect = withoutEdges(
      g,
      (e) => e.source === 'E' && e.target === 'D',
    )
    expect(dConnected(noDirect, ['E'], ['D'], [])).toBe(false)
    expect(dConnected(noDirect, ['E'], ['D'], ['Z'])).toBe(true)
    expect(dConnected(noDirect, ['E'], ['D'], ['Z', 'U1'])).toBe(false)
  })

  it('treats sets jointly and a shared node outside the given set as connected', () => {
    const g = dag('A B C', 'A->B')
    expect(dConnected(g, ['A', 'C'], ['B'], [])).toBe(true)
    expect(dConnected(g, ['C'], ['A', 'B'], [])).toBe(false)
    expect(dConnected(g, ['C'], ['C'], [])).toBe(true)
    expect(dConnected(g, ['C'], ['C'], ['C'])).toBe(false)
  })

  it('a conditioned target is never reached', () => {
    const g = dag('A B', 'A->B')
    expect(dConnected(g, ['A'], ['B'], ['B'])).toBe(false)
  })
})

describe('reachable', () => {
  const g = dag('A B C D E F', 'A->C', 'B->C', 'C->D', 'E->F')

  it('starts from several nodes and includes the start nodes', () => {
    expect(sorted(reachable(g, ['A', 'E'], []))).toEqual([
      'A',
      'C',
      'D',
      'E',
      'F',
    ])
  })

  it('leaves out the given nodes and follows opened colliders', () => {
    expect(sorted(reachable(g, ['A'], ['C']))).toEqual(['A', 'B'])
    expect(sorted(reachable(g, ['A'], ['D']))).toEqual(['A', 'B', 'C'])
    expect(sorted(reachable(g, ['A', 'B'], ['A']))).toEqual(['B', 'C', 'D'])
  })
})

describe('withoutEdges', () => {
  it('removes the matching edges and leaves the input unchanged', () => {
    const g = dag('A B C', 'A->B', 'B->C')
    const h = withoutEdges(g, (e) => e.source === 'A')
    expect(h.edges.map((e) => e.id)).toEqual(['e2'])
    expect(h.nodes).toBe(g.nodes)
    expect(g.edges).toHaveLength(2)
  })
})

// --- Agreement with the dagitty-R reference answers (spec 4.13) ---

interface ReferenceGraph {
  exposures: string[]
  outcomes: string[]
  adjusted: string[]
  latent: string[]
  selected: string[]
  independencies: { a: string; b: string; given: string[] }[]
}
interface ReferenceRandom {
  dagitty: string
  exposure: string
  outcome: string
  selected: string
  adjustmentSets: string[][]
}
const reference = JSON.parse(referenceText) as {
  dagitty: string
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

/** Parses a gallery file and returns it with a name → id lookup. */
function load(text: string): { graph: Graph; id: (name: string) => string } {
  const result = parseDagitty(text)
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '))
  const graph = result.value
  const ids = new Map(graph.nodes.map((n) => [n.name, n.id]))
  return {
    graph,
    id(name) {
      const id = ids.get(name)
      if (id === undefined) throw new Error(`No node "${name}".`)
      return id
    },
  }
}

describe('dagitty-R reference', () => {
  it('records the dagitty version and covers every gallery file', () => {
    expect(reference.dagitty).toMatch(/^\d+\.\d+/)
    expect(galleryFiles).toHaveLength(13)
    expect(Object.keys(reference.graphs).sort()).toEqual(
      galleryFiles.map(([file]) => file).sort(),
    )
  })

  it.each(galleryFiles)('%s: roles match parseDagitty', (file, text) => {
    const { graph } = load(text)
    const ref = reference.graphs[file]
    const named = (role: string) =>
      graph.nodes
        .filter((n) => n.role === role)
        .map((n) => n.name)
        .sort()
    expect(named('exposure')).toEqual(ref.exposures)
    expect(named('outcome')).toEqual(ref.outcomes)
    expect(named('adjusted')).toEqual(ref.adjusted)
    expect(named('latent')).toEqual(ref.latent)
    expect(named('selected')).toEqual(ref.selected)
  })

  it.each(galleryFiles)(
    '%s: each implied independence is d-separated by its set',
    (file, text) => {
      const { graph, id } = load(text)
      for (const { a, b, given } of reference.graphs[file].independencies) {
        expect(
          dConnected(graph, [id(a)], [id(b)], given.map(id)),
          `${a} and ${b} given {${given.join(', ')}}`,
        ).toBe(false)
      }
    },
  )

  it.each(galleryFiles)(
    '%s: adjacent pairs are d-connected whatever is conditioned on',
    (file, text) => {
      void file
      const { graph } = load(text)
      for (const e of graph.edges) {
        const others = graph.nodes
          .map((n) => n.id)
          .filter((n) => n !== e.source && n !== e.target)
        for (const given of [[], others]) {
          expect(dConnected(graph, [e.source], [e.target], given)).toBe(true)
          expect(dConnected(graph, [e.target], [e.source], given)).toBe(true)
        }
      }
    },
  )

  it('has 100 random DAGs that parse with one exposure, outcome and selected node', () => {
    expect(reference.random).toHaveLength(100)
    for (const entry of reference.random) {
      const { graph, id } = load(entry.dagitty)
      expect(graph.nodes.length).toBeGreaterThanOrEqual(5)
      expect(graph.nodes.length).toBeLessThanOrEqual(8)
      const withRole = (role: string) =>
        graph.nodes.filter((n) => n.role === role).map((n) => n.name)
      expect(withRole('exposure')).toEqual([entry.exposure])
      expect(withRole('outcome')).toEqual([entry.outcome])
      expect(withRole('selected')).toEqual([entry.selected])
      for (const set of entry.adjustmentSets) {
        for (const name of set) {
          expect(() => id(name)).not.toThrow()
          expect([entry.exposure, entry.outcome, entry.selected]).not.toContain(
            name,
          )
        }
      }
    }
  })
})
