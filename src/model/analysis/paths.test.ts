import { describe, expect, it } from 'vitest'
import referenceText from '../__fixtures__/analysis/reference.json?raw'
import smokingText from '../__fixtures__/smoking.dag.yaml?raw'
import { parseDagitty } from '../dagitty'
import type { Graph } from '../graph'
import type { Role } from '../schema'
import { parseYaml } from '../yaml'
import { classifyPaths } from './paths'
import { PATH_LIMIT, rolesOf, type PathInfo, type PathsResult } from './types'

/** A graph whose node ids equal their names, from 'A:role' nodes and 'A->B' edges (id 'A->B'). */
function dag(nodes: string, ...edges: string[]): Graph {
  return {
    nodes: nodes.split(' ').map((text) => {
      const [id, role = 'other'] = text.split(':')
      return { id, name: id, role: role as Role, pos: { x: 0, y: 0 } }
    }),
    edges: edges.map((text) => {
      const [source, target] = text.split('->')
      return { id: text, source, target, evidence: [] }
    }),
  }
}

function withRole(graph: Graph, name: string, role: Role): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.name === name ? { ...n, role } : n)),
  }
}

const classify = (graph: Graph) => classifyPaths(graph, rolesOf(graph))

/** A path written with names and arrows, as dagitty-R writes it: `E <- A -> D`. */
function pathText(graph: Graph, path: PathInfo): string {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name
  let text = name(path.nodes[0]) as string
  for (let i = 1; i < path.nodes.length; i++) {
    const [a, b] = [path.nodes[i - 1], path.nodes[i]]
    const forward = graph.edges.some((e) => e.source === a && e.target === b)
    text += `${forward ? ' -> ' : ' <- '}${name(b)}`
  }
  return text
}

/** `[path text, kind, open]` per path, in result order. */
function summary(graph: Graph, result: PathsResult) {
  return result.paths.map((p) => [pathText(graph, p), p.kind, p.open])
}

/** Edge ids written as `From->To` with names. */
function edgeNames(graph: Graph, ids: string[]): string[] {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name
  return ids.map((id) => {
    const e = graph.edges.find((x) => x.id === id)
    return `${name(e?.source as string)}->${name(e?.target as string)}`
  })
}

function loadSmoking(): Graph {
  const result = parseYaml(smokingText)
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '))
  return result.value
}

describe('classifyPaths on the smoking graph', () => {
  const smoking = loadSmoking()

  it('gives one open causal and one open biasing path', () => {
    const result = classify(smoking)
    expect(result.truncated).toBe(false)
    expect(summary(smoking, result)).toEqual([
      ['Maternal smoking -> Birth weight', 'causal', true],
      ['Maternal smoking <- SES -> Birth weight', 'biasing', true],
    ])
    expect(edgeNames(smoking, result.causalEdges)).toEqual([
      'Maternal smoking->Birth weight',
    ])
    expect(edgeNames(smoking, result.biasingEdges)).toEqual([
      'SES->Maternal smoking',
      'SES->Birth weight',
    ])
  })

  it('closes the biasing path when SES is adjusted', () => {
    const adjusted = withRole(smoking, 'SES', 'adjusted')
    const result = classify(adjusted)
    expect(summary(adjusted, result)).toEqual([
      ['Maternal smoking -> Birth weight', 'causal', true],
      ['Maternal smoking <- SES -> Birth weight', 'biasing', false],
    ])
    expect(edgeNames(adjusted, result.causalEdges)).toEqual([
      'Maternal smoking->Birth weight',
    ])
    expect(result.biasingEdges).toEqual([])
  })

  it('returns node ids, starting at the exposure', () => {
    const result = classify(smoking)
    const id = (name: string) => smoking.nodes.find((n) => n.name === name)?.id
    expect(result.paths[1].nodes).toEqual([
      id('Maternal smoking'),
      id('SES'),
      id('Birth weight'),
    ])
  })
})

describe('classifyPaths', () => {
  it('M-bias: the path through the collider Z is closed until Z is adjusted', () => {
    const g = dag(
      'E:exposure D:outcome U1:latent U2:latent Z',
      'E->D',
      'U1->E',
      'U1->Z',
      'U2->D',
      'U2->Z',
    )
    expect(summary(g, classify(g))).toEqual([
      ['E -> D', 'causal', true],
      ['E <- U1 -> Z <- U2 -> D', 'biasing', false],
    ])
    expect(classify(g).biasingEdges).toEqual([])

    const adjusted = withRole(g, 'Z', 'adjusted')
    const result = classify(adjusted)
    expect(summary(adjusted, result)).toEqual([
      ['E -> D', 'causal', true],
      ['E <- U1 -> Z <- U2 -> D', 'biasing', true],
    ])
    expect(result.biasingEdges).toEqual(['U1->E', 'U1->Z', 'U2->D', 'U2->Z'])
  })

  it('a descendant of a collider in C opens the collider', () => {
    const g = dag(
      'E:exposure D:outcome A B C K:selected',
      'A->E',
      'A->C',
      'B->C',
      'B->D',
      'C->K',
    )
    expect(summary(g, classify(g))).toEqual([
      ['E <- A -> C <- B -> D', 'biasing', true],
    ])
  })

  it('an adjusted mediator closes the causal path through it', () => {
    const g = dag('E:exposure M:adjusted D:outcome', 'E->M', 'M->D', 'E->D')
    const result = classify(g)
    expect(summary(g, result)).toEqual([
      ['E -> D', 'causal', true],
      ['E -> M -> D', 'causal', false],
    ])
    expect(result.causalEdges).toEqual(['E->D'])
  })

  it('a selected node is conditioned on like an adjusted one', () => {
    const g = dag('E:exposure M:selected D:outcome', 'E->M', 'M->D')
    expect(summary(g, classify(g))).toEqual([['E -> M -> D', 'causal', false]])
  })

  it('biasing wins: an edge on an open causal and an open biasing path is biasing only', () => {
    const g = dag('X:exposure M Y:outcome C', 'X->M', 'M->Y', 'C->X', 'C->M')
    const result = classify(g)
    expect(summary(g, result)).toEqual([
      ['X -> M -> Y', 'causal', true],
      ['X <- C -> M -> Y', 'biasing', true],
    ])
    expect(result.causalEdges).toEqual(['X->M'])
    expect(result.biasingEdges).toEqual(['M->Y', 'C->X', 'C->M'])
  })

  it('closed paths mark no edges', () => {
    const g = dag('X:exposure Y:outcome C:adjusted', 'C->X', 'C->Y')
    const result = classify(g)
    expect(summary(g, result)).toEqual([['X <- C -> Y', 'biasing', false]])
    expect(result.causalEdges).toEqual([])
    expect(result.biasingEdges).toEqual([])
  })

  it('inner exposures and outcomes end a path', () => {
    const g = dag(
      'X1:exposure X2:exposure Y1:outcome Y2:outcome',
      'X1->X2',
      'X2->Y1',
      'Y1->Y2',
    )
    expect(summary(g, classify(g))).toEqual([['X2 -> Y1', 'causal', true]])
  })

  it('lists paths from every exposure to every outcome', () => {
    const g = dag(
      'X1:exposure X2:exposure Y1:outcome Y2:outcome',
      'X1->Y1',
      'X2->Y2',
      'X2->Y1',
    )
    expect(summary(g, classify(g))).toEqual([
      ['X1 -> Y1', 'causal', true],
      ['X2 -> Y1', 'causal', true],
      ['X2 -> Y2', 'causal', true],
    ])
  })

  it('sorts causal before biasing, then by length, then by the names along the path', () => {
    const g = dag(
      'X:exposure Y:outcome B A M N',
      'X->M',
      'M->N',
      'N->Y',
      'B->X',
      'B->Y',
      'A->X',
      'A->Y',
      'X->Y',
    )
    expect(summary(g, classify(g)).map(([text]) => text)).toEqual([
      'X -> Y',
      'X -> M -> N -> Y',
      'X <- A -> Y',
      'X <- B -> Y',
    ])
  })

  it('gives no paths without a connection', () => {
    const g = dag('X:exposure Y:outcome A', 'A->X')
    expect(classify(g)).toEqual({
      paths: [],
      truncated: false,
      causalEdges: [],
      biasingEdges: [],
    })
  })
})

describe('PATH_LIMIT', () => {
  /** X → M_i → Y for `n` mediators, plus X → Y when `direct`. */
  function parallel(n: number, direct: boolean): Graph {
    const mediators = Array.from({ length: n }, (_, i) => `M${i + 1}`)
    const edges = mediators.flatMap((m) => [`X->${m}`, `${m}->Y`])
    return dag(
      ['X:exposure', 'Y:outcome', ...mediators].join(' '),
      ...edges,
      ...(direct ? ['X->Y'] : []),
    )
  }

  it('lists exactly PATH_LIMIT paths', () => {
    const result = classify(parallel(PATH_LIMIT, false))
    expect(result.truncated).toBe(false)
    expect(result.paths).toHaveLength(PATH_LIMIT)
    expect(result.causalEdges).toHaveLength(2 * PATH_LIMIT)
  })

  it('gives truncated and empty lists above PATH_LIMIT', () => {
    expect(classify(parallel(PATH_LIMIT, true))).toEqual({
      paths: [],
      truncated: true,
      causalEdges: [],
      biasingEdges: [],
    })
  })

  it('stops early on a graph with a huge number of paths', () => {
    // Four complete layers of eight: millions of skeleton paths.
    const layers = [1, 2, 3, 4].map((l) =>
      Array.from({ length: 8 }, (_, i) => `L${l}_${i}`),
    )
    const edges = [
      ...layers[0].map((v) => `X->${v}`),
      ...layers
        .slice(1)
        .flatMap((layer, l) =>
          layers[l].flatMap((u) => layer.map((v) => `${u}->${v}`)),
        ),
      ...layers[3].map((v) => `${v}->Y`),
    ]
    const g = dag(
      ['X:exposure', 'Y:outcome', ...layers.flat()].join(' '),
      ...edges,
    )
    const result = classify(g)
    expect(result.truncated).toBe(true)
    expect(result.paths).toEqual([])
  })
})

// --- Agreement with the dagitty-R reference answers (spec 4.13) ---

interface ReferencePath {
  path: string
  nodes: string[]
  open: boolean
}
const reference = JSON.parse(referenceText) as {
  graphs: Record<string, { paths: ReferencePath[] }>
}

const gallery = import.meta.glob<string>(
  '../__fixtures__/analysis/*.dagitty.txt',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
)
const galleryFiles = Object.entries(gallery).map(
  ([path, text]) => [path.split('/').pop() as string, text] as const,
)

describe('dagitty-R reference', () => {
  it('covers every gallery file', () => {
    expect(galleryFiles.length).toBeGreaterThan(0)
    expect(Object.keys(reference.graphs).sort()).toEqual(
      galleryFiles.map(([f]) => f).sort(),
    )
  })

  it.each(galleryFiles)(
    '%s: paths and open flags equal the reference',
    (file, text) => {
      const parsed = parseDagitty(text)
      if (!parsed.ok)
        throw new Error(parsed.errors.map((e) => e.message).join(' '))
      const graph = parsed.value
      const result = classify(graph)
      expect(result.truncated).toBe(false)
      const ours = result.paths
        .map((p) => `${pathText(graph, p)}: ${p.open}`)
        .sort()
      const theirs = reference.graphs[file].paths
        .map((p) => `${p.path}: ${p.open}`)
        .sort()
      expect(ours).toEqual(theirs)
      for (const p of result.paths) {
        const causal = !pathText(graph, p).includes('<-')
        expect(p.kind).toBe(causal ? 'causal' : 'biasing')
      }
    },
  )
})
