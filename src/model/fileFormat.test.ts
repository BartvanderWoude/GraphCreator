import { describe, expect, it } from 'vitest'
import { detectFormat, parseGraphText } from './fileFormat'

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

  it('returns the parser errors', () => {
    expect(parseGraphText(fixture('cycle.dag.yaml')).ok).toBe(false)
    expect(parseGraphText(fixture('bidirected.dagitty.txt')).ok).toBe(false)
  })
})
