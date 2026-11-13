import { describe, expect, it } from 'vitest'
import { parseDagitty, toDagittyIds } from './dagitty'
import { decodeList } from './exchange'
import { exportText, type ExportFormat } from './fileFormat'
import type { Graph } from './graph'
import { NODE_DIAMETER } from './nodeSize'
import { parseYaml } from './yaml'

/**
 * The exchange formats against the real tools (spec 4.15, phase 40). The writers' output for each
 * sample graph is stored in `__fixtures__/formats/samples/`; `scripts/check-formats.py` (with
 * `scripts/check-formats.R`) reads those files with networkx, pydot, causal-learn, bnlearn and
 * dagitty-R and records what each tool saw in `__fixtures__/formats/reference.json`.
 *
 * `UPDATE_FORMAT_SAMPLES=1 npm test -- formats.reference` rewrites the sample files; run the
 * Python script afterwards to refresh the reference.
 */

// `node:fs` and `node:process` are loaded dynamically and typed by hand, as in theme.test.ts:
// the app tsconfig has no Node types.
const fsModule: string = 'node:fs'
const { readFileSync, writeFileSync, existsSync } = (await import(
  /* @vite-ignore */ fsModule
)) as {
  readFileSync(path: URL, encoding: 'utf8'): string
  writeFileSync(path: URL, text: string): void
  existsSync(path: URL): boolean
}
const processModule: string = 'node:process'
const { env } = (await import(/* @vite-ignore */ processModule)) as {
  env: Record<string, string | undefined>
}
const UPDATE = env.UPDATE_FORMAT_SAMPLES === '1'

const sources: Record<string, string> = import.meta.glob(
  [
    './__fixtures__/smoking.dag.yaml',
    './__fixtures__/quoted-names.dagitty.txt',
    './__fixtures__/formats/escapes.dag.yaml',
    './__fixtures__/analysis/*.dagitty.txt',
  ],
  { query: '?raw', import: 'default', eager: true },
)

/** The sample graphs by name: `smoking`, `quoted-names`, `escapes` and the analysis gallery. */
function samples(): [string, Graph][] {
  return Object.entries(sources)
    .map(([path, text]): [string, Graph] => {
      const file = path.split('/').pop()!
      const name = file.replace(/\.(dag\.yaml|dagitty\.txt)$/, '')
      const result = file.endsWith('.yaml')
        ? parseYaml(text)
        : parseDagitty(text)
      if (!result.ok) throw new Error(`${file} does not parse.`)
      return [name, result.value]
    })
    .sort(([a], [b]) => a.localeCompare(b))
}

/** The sample files: one per writer, plus dagitty with and without details. */
const OUTPUTS: { suffix: string; text: (g: Graph) => string }[] = [
  ...(
    [
      ['gml', '.gml'],
      ['dot', '.dot'],
      ['networkx', '.json'],
      ['bnlearn', '.bnlearn.txt'],
      ['tetrad', '.tetrad.txt'],
      ['mermaid', '.mmd'],
    ] as [ExportFormat, string][]
  ).map(([format, suffix]) => ({
    suffix,
    text: (g: Graph) => exportText(g, format),
  })),
  { suffix: '.plain.dagitty.txt', text: (g) => exportText(g, 'dagitty') },
  {
    suffix: '.details.dagitty.txt',
    text: (g) => exportText(g, 'dagitty', { details: true }),
  },
]

const sampleUrl = (file: string) =>
  new URL(`./__fixtures__/formats/samples/${file}`, import.meta.url)

describe('format samples', () => {
  for (const [name, graph] of samples()) {
    for (const output of OUTPUTS) {
      const file = `${name}${output.suffix}`
      it(`${file} is the writer's current output`, () => {
        const text = output.text(graph)
        if (UPDATE) writeFileSync(sampleUrl(file), text)
        expect(existsSync(sampleUrl(file)), `${file} is missing`).toBe(true)
        expect(readFileSync(sampleUrl(file), 'utf8')).toBe(text)
      })
    }
  }
})

type Attrs = Record<string, unknown>
interface ToolGraph {
  nodes: Record<string, Attrs>
  edges: [string, string, Attrs][]
}
interface SampleReference {
  networkx_gml: ToolGraph
  networkx_json: ToolGraph
  pydot: ToolGraph
  causallearn: { nodes: string[]; edges: [string, string][] }
  bnlearn: { nodes: string[]; arcs: [string, string][] }
  dagitty: {
    exposures: string[]
    outcomes: string[]
    latents: string[]
    edges: [string, string][]
    same_as_plain: boolean
    keeps_details: boolean
  }
}
interface Reference {
  tools: Record<string, string>
  samples: Record<string, SampleReference>
}

const reference = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/formats/reference.json', import.meta.url),
    'utf8',
  ),
) as Reference

/** A tool's list-valued attribute: networkx gives one item as a plain value. */
const list = (v: unknown): string[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v.map(String) : [String(v)]

const pairs = (edges: [string, string, ...unknown[]][]) =>
  edges.map(([s, t]) => `${s} -> ${t}`).sort()

/** What the graph should look like to a tool: safe ids, names, metadata and edges. */
function expected(graph: Graph) {
  const ids = toDagittyIds(graph.nodes)
  const id = (nodeId: string) => ids.get(nodeId)!
  const centre = (nodeId: string) => {
    const n = graph.nodes.find((m) => m.id === nodeId)!
    const d = NODE_DIAMETER
    return [n.pos.x + d / 2, n.pos.y + d / 2]
  }
  return {
    ids: graph.nodes.map((n) => id(n.id)).sort(),
    edges: graph.edges.map((e) => `${id(e.source)} -> ${id(e.target)}`).sort(),
    byRole: (role: string) =>
      graph.nodes
        .filter((n) => n.role === role)
        .map((n) => id(n.id))
        .sort(),
    nodes: graph.nodes.map((n) => ({
      id: id(n.id),
      node: n,
      centre: centre(n.id),
    })),
    edgeList: graph.edges.map((e) => ({
      key: `${id(e.source)} -> ${id(e.target)}`,
      edge: e,
    })),
  }
}

/** Compares a tool's node and edge attributes with the graph's metadata, under `keys`. */
function checkMetadata(
  tool: ToolGraph,
  graph: Graph,
  keys: {
    name: string
    role: string
    varType: string
    levels: string
    description: string
    unit: string
    evidence: string
    note: string
  },
  decode: (v: unknown) => string[] | undefined = list,
) {
  const want = expected(graph)
  expect(Object.keys(tool.nodes).sort()).toEqual(want.ids)
  for (const { id, node } of want.nodes) {
    const attrs = tool.nodes[id]
    expect(attrs[keys.name] ?? id, id).toBe(node.name)
    expect(attrs[keys.role] ?? 'other', id).toBe(node.role)
    expect(attrs[keys.varType], id).toBe(node.varType)
    expect(decode(attrs[keys.levels]), id).toEqual(node.levels)
    expect(attrs[keys.description], id).toBe(node.description)
    expect(attrs[keys.unit], id).toBe(node.unit)
  }
  expect(pairs(tool.edges)).toEqual(want.edges)
  for (const { key, edge } of want.edgeList) {
    const attrs = tool.edges.find(([s, t]) => `${s} -> ${t}` === key)![2]
    expect(decode(attrs[keys.evidence]) ?? [], key).toEqual(edge.evidence)
    expect(attrs[keys.note], key).toBe(edge.note)
  }
}

const NX_KEYS = {
  name: 'name',
  role: 'role',
  varType: 'var_type',
  levels: 'levels',
  description: 'description',
  unit: 'unit',
  evidence: 'evidence',
  note: 'note',
}

describe('reference.json (what the real tools read)', () => {
  it('records the tool versions and covers every sample', () => {
    for (const tool of [
      'python',
      'networkx',
      'pydot',
      'causal-learn',
      'R',
      'bnlearn',
      'dagitty',
    ]) {
      expect(reference.tools[tool], tool).toBeTruthy()
    }
    expect(Object.keys(reference.samples).sort()).toEqual(
      samples().map(([name]) => name),
    )
  })

  for (const [name, graph] of samples()) {
    describe(name, () => {
      const ref = () => reference.samples[name]

      it('networkx parse_gml (as DoWhy reads it) sees the safe ids and all metadata', () => {
        checkMetadata(ref().networkx_gml, graph, NX_KEYS)
        for (const { id, centre } of expected(graph).nodes) {
          const g = ref().networkx_gml.nodes[id].graphics as Attrs
          expect(Number(g.x)).toBeCloseTo(centre[0], 1)
          expect(Number(g.y)).toBeCloseTo(centre[1], 1)
        }
      })

      it('networkx node_link_graph sees the safe ids and all metadata', () => {
        checkMetadata(ref().networkx_json, graph, NX_KEYS)
        for (const { id, centre } of expected(graph).nodes) {
          const pos = ref().networkx_json.nodes[id].pos as number[]
          expect(pos[0]).toBeCloseTo(centre[0], 1)
          expect(pos[1]).toBeCloseTo(centre[1], 1)
        }
      })

      it('pydot sees the gc_* attributes', () => {
        checkMetadata(
          ref().pydot,
          graph,
          {
            name: 'label',
            role: 'gc_role',
            varType: 'gc_var_type',
            levels: 'gc_levels',
            description: 'gc_description',
            unit: 'gc_unit',
            evidence: 'gc_evidence',
            note: 'gc_note',
          },
          (v) => (v === undefined ? undefined : decodeList(String(v))),
        )
      })

      it('causal-learn reads the Tetrad text as the same directed graph', () => {
        const want = expected(graph)
        expect([...ref().causallearn.nodes].sort()).toEqual(want.ids)
        expect(pairs(ref().causallearn.edges)).toEqual(want.edges)
      })

      it('bnlearn reads the model string as the same arcs', () => {
        const want = expected(graph)
        expect([...ref().bnlearn.nodes].sort()).toEqual(want.ids)
        expect(pairs(ref().bnlearn.arcs)).toEqual(want.edges)
      })

      it('dagitty-R reads the details file like the plain one and keeps the gc.* attributes', () => {
        const want = expected(graph)
        const d = ref().dagitty
        expect([...d.exposures].sort()).toEqual(want.byRole('exposure'))
        expect([...d.outcomes].sort()).toEqual(want.byRole('outcome'))
        expect([...d.latents].sort()).toEqual(want.byRole('latent'))
        expect(pairs(d.edges)).toEqual(want.edges)
        expect(d.same_as_plain).toBe(true)
        expect(d.keeps_details).toBe(true)
      })
    })
  }
})
