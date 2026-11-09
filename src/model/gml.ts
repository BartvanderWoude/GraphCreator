import { toDagittyIds } from './dagitty'
import {
  buildGraph,
  ignoredAttribute,
  type ExchangeEdge,
  type ExchangeNode,
} from './exchange'
import type { Graph } from './graph'
import { nodeDiameter } from './nodeSize'
import type { Issue, Result } from './result'

/**
 * GML (spec 4.15, phase 33): the Graph Modelling Language as networkx, DoWhy, yEd and Gephi
 * read it. Nodes are labelled with the safe ids of `toDagittyIds`, and every GraphCreator field
 * travels as a node or edge key, so the round trip keeps everything.
 */

// ---------------------------------------------------------------------------
// Writing

/** At most two decimals, no trailing zeros, never `-0`. */
function num(n: number): string {
  const r = Math.round(n * 100) / 100
  return String(r === 0 ? 0 : r)
}

/**
 * A quoted GML string. Characters outside printable ASCII, `"` and `&` become `&#<decimal>;`,
 * as networkx's `write_gml` writes them.
 */
function gmlString(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) as number
    out +=
      code >= 0x20 && code <= 0x7e && ch !== '"' && ch !== '&'
        ? ch
        : `&#${code};`
  }
  return `"${out}"`
}

/** Writes GML (spec 4.15). */
export function toGml(graph: Graph): string {
  const ids = toDagittyIds(graph.nodes)
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]))
  const out: string[] = ['graph [', '  directed 1']
  if (graph.name !== undefined) out.push(`  name ${gmlString(graph.name)}`)

  graph.nodes.forEach((node, i) => {
    out.push('  node [', `    id ${i}`)
    out.push(`    label ${gmlString(ids.get(node.id) as string)}`)
    out.push(`    name ${gmlString(node.name)}`)
    if (node.role !== 'other') out.push(`    role ${gmlString(node.role)}`)
    if (node.varType) out.push(`    var_type ${gmlString(node.varType)}`)
    for (const level of node.levels ?? []) {
      out.push(`    levels ${gmlString(level)}`)
    }
    if (node.description !== undefined) {
      out.push(`    description ${gmlString(node.description)}`)
    }
    if (node.unit !== undefined) out.push(`    unit ${gmlString(node.unit)}`)
    const r = nodeDiameter(node.name) / 2
    out.push(
      '    graphics [',
      `      x ${num(node.pos.x + r)}`,
      `      y ${num(node.pos.y + r)}`,
      '    ]',
      '  ]',
    )
  })

  for (const edge of graph.edges) {
    const source = index.get(edge.source)
    const target = index.get(edge.target)
    if (source === undefined || target === undefined) continue
    out.push('  edge [', `    source ${source}`, `    target ${target}`)
    for (const item of edge.evidence) {
      out.push(`    evidence ${gmlString(item)}`)
    }
    if (edge.note !== undefined) out.push(`    note ${gmlString(edge.note)}`)
    out.push('  ]')
  }

  out.push(']')
  return out.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Tokenizer

type TokenKind = 'key' | 'number' | 'string' | 'open' | 'close' | 'eof'

interface Token {
  kind: TokenKind
  /** The source text; for strings the content between the quotes, with references decoded. */
  text: string
  line: number
}

/** A user-facing syntax error; caught in `parseGml` and turned into an `Issue`. */
class GmlSyntaxError extends Error {
  line: number
  constructor(line: number, message: string) {
    super(`Line ${line}: ${message}`)
    this.line = line
  }
}

const NAMED_REFERENCES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
}

/** Decodes `&#34;`, `&#x22;` and the named references `&quot; &amp; &lt; &gt; &apos;`. */
function decodeReferences(text: string): string {
  return text.replace(
    /&(?:#([0-9]+)|#[xX]([0-9A-Fa-f]+)|([A-Za-z]+));/g,
    (match, dec?: string, hex?: string, name?: string) => {
      if (name !== undefined) return NAMED_REFERENCES[name] ?? match
      const code = dec !== undefined ? Number(dec) : parseInt(hex as string, 16)
      return code <= 0x10ffff ? String.fromCodePoint(code) : match
    },
  )
}

const KEY_START = /[A-Za-z_]/
const KEY_CHAR = /[0-9A-Za-z_]/
const NUMBER = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  while (i < text.length) {
    const c = text[i]
    if (c === '\n') {
      line++
      i++
    } else if (/\s/.test(c)) {
      i++
    } else if (c === '#') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '[' || c === ']') {
      tokens.push({ kind: c === '[' ? 'open' : 'close', text: c, line })
      i++
    } else if (c === '"') {
      const end = text.indexOf('"', i + 1)
      if (end < 0) {
        throw new GmlSyntaxError(
          line,
          'a quoted name or value is not closed (missing ").',
        )
      }
      const raw = text.slice(i + 1, end)
      tokens.push({ kind: 'string', text: decodeReferences(raw), line })
      line += raw.split('\n').length - 1
      i = end + 1
    } else if (KEY_START.test(c)) {
      let j = i + 1
      while (j < text.length && KEY_CHAR.test(text[j])) j++
      tokens.push({ kind: 'key', text: text.slice(i, j), line })
      i = j
    } else {
      const match = NUMBER.exec(text.slice(i, i + 64))
      if (!match) {
        throw new GmlSyntaxError(line, `"${c}" is not valid GML syntax.`)
      }
      tokens.push({ kind: 'number', text: match[0], line })
      i += match[0].length
    }
  }
  tokens.push({ kind: 'eof', text: '', line })
  return tokens
}

// ---------------------------------------------------------------------------
// Parser: GML's `key value` pairs, values being numbers, strings or lists

type GmlValue =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'list'; pairs: Pair[] }

interface Pair {
  key: string
  value: GmlValue
  line: number
}

function parsePairs(tokens: Token[]): Pair[] {
  let pos = 0

  const unexpected = (tok: Token): never => {
    if (tok.kind === 'eof') {
      throw new GmlSyntaxError(tok.line, 'the text ends too early.')
    }
    throw new GmlSyntaxError(tok.line, `"${tok.text}" is not valid here.`)
  }

  /** Pairs up to the `]` that closes the list opened at `openLine`, or to the end of the text. */
  const list = (openLine?: number): Pair[] => {
    const pairs: Pair[] = []
    for (;;) {
      const tok = tokens[pos]
      if (tok.kind === 'eof') {
        if (openLine === undefined) return pairs
        throw new GmlSyntaxError(
          openLine,
          'a list [ … ] is not closed (missing ]).',
        )
      }
      if (tok.kind === 'close' && openLine !== undefined) {
        pos++
        return pairs
      }
      if (tok.kind !== 'key') unexpected(tok)
      pos++
      const valueTok = tokens[pos]
      let value: GmlValue
      if (valueTok.kind === 'number') {
        value = { kind: 'number', value: Number(valueTok.text) }
        pos++
      } else if (valueTok.kind === 'string') {
        value = { kind: 'string', value: valueTok.text }
        pos++
      } else if (valueTok.kind === 'open') {
        pos++
        value = { kind: 'list', pairs: list(valueTok.line) }
      } else {
        return unexpected(valueTok)
      }
      pairs.push({ key: tok.text, value, line: tok.line })
    }
  }

  return list()
}

// ---------------------------------------------------------------------------
// Reading the graph

const GRAPH_KEYS = new Set(['directed', 'multigraph', 'name', 'label'])
const NODE_KEYS = new Set([
  'id',
  'label',
  'name',
  'role',
  'var_type',
  'levels',
  'description',
  'unit',
  'graphics',
])
const EDGE_KEYS = new Set([
  'source',
  'target',
  'evidence',
  'note',
  'id',
  'label',
  'graphics',
])

/** The pairs of a list grouped by key, in file order. */
function byKey(pairs: Pair[]): Map<string, Pair[]> {
  const map = new Map<string, Pair[]>()
  for (const pair of pairs) {
    const group = map.get(pair.key)
    if (group) group.push(pair)
    else map.set(pair.key, [pair])
  }
  return map
}

/** A value as `buildGraph` takes it: text, a number, or (for a list) something that is neither. */
function plain(value: GmlValue): unknown {
  return value.kind === 'list' ? { list: true } : value.value
}

/** Reads GML (spec 4.15). */
export function parseGml(text: string): Result<Graph> {
  let top: Pair[]
  try {
    top = parsePairs(tokenize(text))
  } catch (err) {
    if (err instanceof GmlSyntaxError) {
      return { ok: false, errors: [{ message: err.message, line: err.line }] }
    }
    throw err
  }

  const graphs = top.filter((p) => p.key === 'graph' && p.value.kind === 'list')
  if (graphs.length === 0) {
    return {
      ok: false,
      errors: [
        { message: 'This text is not a GML graph (graph [ … ] is missing).' },
      ],
    }
  }
  if (graphs.length > 1) {
    return {
      ok: false,
      errors: [
        {
          message: `Line ${graphs[1].line}: this text has more than one GML graph; GraphCreator reads one.`,
          line: graphs[1].line,
        },
      ],
    }
  }
  const graphPairs = (graphs[0].value as { pairs: Pair[] }).pairs
  const graphKeys = byKey(graphPairs)

  const isOne = (pairs: Pair[] | undefined) =>
    pairs !== undefined &&
    pairs[0].value.kind === 'number' &&
    pairs[0].value.value === 1
  if (!isOne(graphKeys.get('directed'))) {
    return {
      ok: false,
      errors: [
        {
          message:
            'This GML graph is not directed. GraphCreator reads directed graphs (directed 1) only.',
        },
      ],
    }
  }
  if (isOne(graphKeys.get('multigraph'))) {
    return {
      ok: false,
      errors: [{ message: 'GML multigraphs are not supported.' }],
    }
  }

  const errors: Issue[] = []
  const warnings: Issue[] = []
  const warned = new Set<string>()
  const fail = (line: number, message: string) =>
    errors.push({ message: `Line ${line}: ${message}`, line })
  const ignore = (pair: Pair) => {
    if (warned.has(pair.key)) return
    warned.add(pair.key)
    warnings.push(ignoredAttribute('GML', pair.key, pair.line))
  }

  /** One number or text as text; `undefined` when absent, `null` (with an error) otherwise. */
  const scalar = (pairs: Pair[] | undefined): string | undefined | null => {
    if (pairs === undefined) return undefined
    const value = pairs[0].value
    if (pairs.length > 1 || value.kind === 'list') {
      fail(
        pairs[pairs.length > 1 ? 1 : 0].line,
        `${pairs[0].key} must be one number or text.`,
      )
      return null
    }
    return String(value.value)
  }
  /** One value, or a list of them when the key is repeated. */
  const field = (pairs: Pair[] | undefined): unknown => {
    if (pairs === undefined) return undefined
    return pairs.length === 1
      ? plain(pairs[0].value)
      : pairs.map((p) => plain(p.value))
  }

  const nodes: ExchangeNode[] = []
  const edges: ExchangeEdge[] = []
  let graphName: string | undefined
  const nameText = scalar(graphKeys.get('name') ?? graphKeys.get('label'))
  if (typeof nameText === 'string') graphName = nameText

  for (const pair of graphPairs) {
    if (pair.key === 'node') {
      if (pair.value.kind !== 'list') {
        fail(pair.line, 'node must be a list, as in node [ id 0 ].')
        continue
      }
      const keys = byKey(pair.value.pairs)
      for (const p of pair.value.pairs) if (!NODE_KEYS.has(p.key)) ignore(p)
      const id = scalar(keys.get('id'))
      const name = scalar(keys.get('name') ?? keys.get('label'))
      if (id === undefined) fail(pair.line, 'a node has no id.')
      if (typeof id !== 'string' || name === null) continue
      const node: ExchangeNode = {
        key: id,
        name: (name ?? id).trim(),
        line: pair.line,
      }
      node.role = field(keys.get('role'))
      node.varType = field(keys.get('var_type'))
      const levels = keys.get('levels')
      if (levels) node.levels = levels.map((p) => plain(p.value))
      node.description = field(keys.get('description'))
      node.unit = field(keys.get('unit'))
      const graphics = keys.get('graphics')?.[0].value
      if (graphics?.kind === 'list') {
        const g = byKey(graphics.pairs)
        const x = g.get('x')?.[0]
        const y = g.get('y')?.[0]
        if (x && y) {
          if (
            x.value.kind === 'number' &&
            y.value.kind === 'number' &&
            Number.isFinite(x.value.value) &&
            Number.isFinite(y.value.value)
          ) {
            node.centre = { x: x.value.value, y: y.value.value }
          } else {
            fail(x.line, 'graphics x and y must be numbers.')
          }
        }
      }
      nodes.push(node)
    } else if (pair.key === 'edge') {
      if (pair.value.kind !== 'list') {
        fail(
          pair.line,
          'edge must be a list, as in edge [ source 0 target 1 ].',
        )
        continue
      }
      const keys = byKey(pair.value.pairs)
      for (const p of pair.value.pairs) if (!EDGE_KEYS.has(p.key)) ignore(p)
      const source = scalar(keys.get('source'))
      const target = scalar(keys.get('target'))
      if (source === undefined) fail(pair.line, 'an edge has no source.')
      if (target === undefined) fail(pair.line, 'an edge has no target.')
      if (typeof source !== 'string' || typeof target !== 'string') continue
      const edge: ExchangeEdge = { source, target, line: pair.line }
      const evidence = keys.get('evidence')
      if (evidence) edge.evidence = evidence.map((p) => plain(p.value))
      edge.note = field(keys.get('note'))
      edges.push(edge)
    } else if (!GRAPH_KEYS.has(pair.key)) {
      ignore(pair)
    }
  }

  const result = buildGraph({ name: graphName, nodes, edges }, warnings)
  if (errors.length === 0) return result
  return { ok: false, errors: [...errors, ...(result.ok ? [] : result.errors)] }
}
