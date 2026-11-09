import { describe, expect, it } from 'vitest'
import {
  detectFormat,
  EXPORT_FILES,
  EXPORT_FORMATS,
  exportFileName,
  exportText,
  parseGraphText,
} from './fileFormat'
import { toDagitty } from './dagitty'
import type { Graph } from './graph'
import { toYaml } from './yaml'

const fixtures: Record<string, string> = import.meta.glob('./__fixtures__/*', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function fixture(name: string): string {
  const text = fixtures[`./__fixtures__/${name}`]
  if (text === undefined) throw new Error(`No fixture ${name}.`)
  return text
}

describe('detectFormat', () => {
  it('recognises every YAML fixture from its text alone', () => {
    for (const name of [
      'smoking.dag.yaml',
      'minimal.dag.yaml',
      'cycle.dag.yaml',
      'bad-schema.dag.yaml',
      'unknown-key.dag.yaml',
    ]) {
      expect(detectFormat(fixture(name)), name).toBe('yaml')
    }
  })

  it('recognises every dagitty fixture from its text alone', () => {
    for (const name of [
      'confounding.dagitty.txt',
      'bidirected.dagitty.txt',
      'groups-and-chains.dagitty.txt',
      'no-positions.dagitty.txt',
      'pdag.dagitty.txt',
      'quoted-names.dagitty.txt',
    ]) {
      expect(detectFormat(fixture(name)), name).toBe('dagitty')
    }
  })

  it('reads dagitty without a header', () => {
    expect(detectFormat('A -> B\nB -> C')).toBe('dagitty')
  })

  it('treats .yaml and .yml file names as YAML whatever the text', () => {
    expect(detectFormat('A -> B', 'graph.yaml')).toBe('yaml')
    expect(detectFormat('A -> B', 'graph.YML')).toBe('yaml')
    expect(detectFormat('dag { A -> B }', 'graph.dagitty.txt')).toBe('dagitty')
  })

  it('finds YAML keys after comments', () => {
    expect(detectFormat('# my graph\nschema: graphcreator/0.1\n')).toBe('yaml')
  })

  it('lets .gml, .dot, .gv and .json file names force their format', () => {
    expect(detectFormat('A -> B', 'g.gml')).toBe('gml')
    expect(detectFormat('A -> B', 'g.DOT')).toBe('dot')
    expect(detectFormat('A -> B', 'g.gv')).toBe('dot')
    expect(detectFormat('A -> B', 'g.json')).toBe('networkx')
  })

  it('recognises GML after # comments', () => {
    expect(detectFormat('graph [\n  directed 1\n]')).toBe('gml')
    expect(detectFormat('# from networkx\n\n  graph[ directed 1 ]')).toBe('gml')
  })

  it('recognises DOT, also strict and after comments', () => {
    expect(detectFormat('digraph { A -> B }')).toBe('dot')
    expect(detectFormat('strict digraph G {\n A -> B\n}')).toBe('dot')
    expect(
      detectFormat(
        '// made by Graphviz\n/* a\nb */\n# x\ndigraph G { A -> B }',
      ),
    ).toBe('dot')
  })

  it('recognises networkx JSON by its nodes array', () => {
    expect(detectFormat('  {"directed": true, "nodes": [], "edges": []}')).toBe(
      'networkx',
    )
  })

  it('keeps dagitty groups, JSON without nodes and dagitty graph headers as dagitty', () => {
    expect(detectFormat('{a b} -> c')).toBe('dagitty')
    expect(detectFormat('{ "x": 1 }')).toBe('dagitty')
    expect(detectFormat('graph { a -- b }')).toBe('dagitty')
    expect(detectFormat('dag { graph -> b }')).toBe('dagitty')
  })
})

describe('parseGraphText', () => {
  it('parses YAML with parseYaml', () => {
    const result = parseGraphText(fixture('smoking.dag.yaml'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.name).toBe('Smoking and birth weight')
  })

  it('parses dagitty with parseDagitty', () => {
    const result = parseGraphText(fixture('confounding.dagitty.txt'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(5)
      expect(result.value.edges).toHaveLength(7)
    }
  })

  it('sends GML, DOT and networkx JSON to their parsers', () => {
    expect(parseGraphText('graph [ directed 1 ]')).toEqual({
      ok: true,
      value: { nodes: [], edges: [] },
      warnings: [],
    })
    const dot = parseGraphText('digraph { A -> B }')
    expect(dot.ok && dot.value.nodes.map((n) => n.name)).toEqual(['A', 'B'])
    const json = parseGraphText('{"nodes": []}')
    expect(!json.ok && json.errors[0].message).toBe(
      'This networkx graph is not directed. GraphCreator reads directed graphs only.',
    )
  })

  it('returns the parser errors', () => {
    expect(parseGraphText(fixture('cycle.dag.yaml')).ok).toBe(false)
    expect(parseGraphText(fixture('bidirected.dagitty.txt')).ok).toBe(false)
  })
})

describe('exportText and exportFileName', () => {
  const graph: Graph = {
    name: 'Smoking and birth weight',
    nodes: [
      { id: 'n1', name: 'A', role: 'exposure', pos: { x: 0, y: 0 } },
      { id: 'n2', name: 'B', role: 'outcome', pos: { x: 100, y: 0 } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', evidence: [] }],
  }

  it('lists the eight formats in menu order, each with a file entry', () => {
    expect(EXPORT_FORMATS).toEqual([
      'yaml',
      'dagitty',
      'gml',
      'dot',
      'networkx',
      'bnlearn',
      'tetrad',
      'mermaid',
    ])
    expect(Object.keys(EXPORT_FILES).sort()).toEqual([...EXPORT_FORMATS].sort())
  })

  it('dispatches to the writers', () => {
    expect(exportText(graph, 'yaml')).toBe(toYaml(graph))
    expect(exportText(graph, 'dagitty')).toBe(toDagitty(graph))
    expect(exportText(graph, 'dagitty', { details: true })).toBe(
      toDagitty(graph, { details: true }),
    )
    // The other writers are stubs until wave 17.
    for (const f of EXPORT_FORMATS)
      expect(typeof exportText(graph, f)).toBe('string')
  })

  it('names files with the slug and the extension', () => {
    expect(exportFileName(graph.name, 'gml')).toBe(
      'smoking-and-birth-weight.gml',
    )
    expect(exportFileName(graph.name, 'networkx')).toBe(
      'smoking-and-birth-weight.json',
    )
    expect(exportFileName(graph.name, 'yaml')).toBe(
      'smoking-and-birth-weight.dag.yaml',
    )
    expect(exportFileName(undefined, 'mermaid')).toBe('graph.mmd')
    expect(exportFileName(undefined, 'bnlearn')).toBe('graph.bnlearn.txt')
    expect(exportFileName(undefined, 'tetrad')).toBe('graph.tetrad.txt')
    expect(exportFileName(undefined, 'dot')).toBe('graph.dot')
  })
})
