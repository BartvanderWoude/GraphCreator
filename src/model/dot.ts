import { toDagittyIds } from './dagitty'
import {
  buildGraph,
  decodeList,
  encodeList,
  ignoredAttribute,
  type ExchangeEdge,
  type ExchangeNode,
} from './exchange'
import type { Graph } from './graph'
import type { Issue, Result } from './result'
import { nodeDiameter } from './nodeSize'
import { EXPORT_PALETTES } from './palette'

/**
 * Graphviz DOT (spec 4.15, phase 34): `toDot` writes the graph with the GraphCreator metadata as
 * `gc_*` attributes, positions in points with y up and the light role colours; `parseDot` reads a
 * subset of the DOT grammar with an own tokenizer and recursive-descent parser.
 */

/** Canvas px → points (96 → 72 per inch). */
const PT_PER_PX = 0.75

/** Keys read silently: styling from Graphviz and from `toDot` itself. */
const STYLE_KEYS = new Set([
  'shape',
  'style',
  'color',
  'fillcolor',
  'fontcolor',
  'fontname',
  'fontsize',
  'width',
  'height',
  'fixedsize',
  'penwidth',
  'arrowhead',
  'arrowsize',
  'xlabel',
])

/** DOT keywords; they are case-insensitive and cannot be bare node ids. */
const KEYWORDS = new Set([
  'strict',
  'graph',
  'digraph',
  'subgraph',
  'node',
  'edge',
])

const BARE_START = /[A-Za-z_\u0080-￿]/
const BARE_CHAR = /[A-Za-z0-9_\u0080-￿]/
const BARE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/

// ---------------------------------------------------------------------------
// Writer

/** At most two decimals, no trailing zeros, never `-0`. */
function num(n: number): string {
  const r = Math.round(n * 100) / 100
  return String(r === 0 ? 0 : r)
}

/** A quoted DOT string, with `\` and `"` escaped by a backslash. */
function quote(text: string): string {
  return `"${text.replace(/[\\"]/g, (c) => `\\${c}`)}"`
}

/** A node id as written: bare when it is a plain DOT word, otherwise quoted. */
function writeId(id: string): string {
  return BARE_ID.test(id) && !KEYWORDS.has(id.toLowerCase()) ? id : quote(id)
}

/** Writes DOT (spec 4.15). */
export function toDot(graph: Graph): string {
  const palette = EXPORT_PALETTES.light
  const ids = toDagittyIds(graph.nodes)
  const lines = [
    graph.name ? `digraph ${quote(graph.name)} {` : 'digraph {',
    '  node [shape=circle, style=filled, fontname="Helvetica"]',
    `  edge [color=${quote(palette.edge)}]`,
  ]
  for (const node of graph.nodes) {
    const id = ids.get(node.id)!
    const attrs: string[] = []
    const add = (key: string, value: string | undefined) => {
      if (value !== undefined) attrs.push(`${key}=${quote(value)}`)
    }
    if (node.name !== id) add('label', node.name)
    if (node.role !== 'other') add('gc_role', node.role)
    add('gc_var_type', node.varType)
    if (node.levels && node.levels.length > 0) {
      add('gc_levels', encodeList(node.levels))
    }
    add('gc_description', node.description)
    add('gc_unit', node.unit)
    const r = nodeDiameter(node.name) / 2
    const x = (node.pos.x + r) * PT_PER_PX
    const y = -(node.pos.y + r) * PT_PER_PX
    add('pos', `${num(x)},${num(y)}!`)
    const colours = palette.roles[node.role]
    add('fillcolor', colours.fill)
    add('color', colours.line)
    add('fontcolor', colours.text)
    lines.push(`  ${writeId(id)} [${attrs.join(', ')}]`)
  }
  for (const edge of graph.edges) {
    const from = ids.get(edge.source)
    const to = ids.get(edge.target)
    if (from === undefined || to === undefined) continue
    const attrs: string[] = []
    if (edge.evidence.length > 0) {
      attrs.push(`gc_evidence=${quote(encodeList(edge.evidence))}`)
    }
    if (edge.note !== undefined) attrs.push(`gc_note=${quote(edge.note)}`)
    const tail = attrs.length > 0 ? ` [${attrs.join(', ')}]` : ''
    lines.push(`  ${writeId(from)} -> ${writeId(to)}${tail}`)
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

// ---------------------------------------------------------------------------
// Tokenizer

type Token =
  /** An id: a bare word, a numeral or a quoted string (`value` unescaped, `raw` as written). */
  | { kind: 'id'; value: string; raw: string; quoted: boolean; line: number }
  /** `{ } [ ] = ; , +` and `->`. */
  | { kind: 'punct'; value: string; line: number }
  /** A syntax error found by the tokenizer, raised when the parser reaches it. */
  | { kind: 'error'; message: string; line: number }
  | { kind: 'eof'; line: number }

/** A user-facing syntax error; caught in `parseDot` and turned into an `Issue`. */
class DotSyntaxError extends Error {
  line: number
  constructor(line: number, message: string) {
    super(`Line ${line}: ${message}`)
    this.line = line
  }
}

const UNDIRECTED_EDGES =
  'undirected edges (--) are not supported yet. GraphCreator v1 supports directed edges only.'
const UNDIRECTED_GRAPH =
  'undirected graphs (graph { … }) are not supported. GraphCreator reads directed graphs (digraph) only.'

/**
 * Splits DOT text into tokens. Errors become `error` tokens and end the list, so the parser
 * reports them only when it gets there, in source order.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  /** Whether only whitespace precedes `i` on its line (for `#` lines). */
  let lineStart = true
  const at = (k: number) => text.charAt(k)
  const fail = (message: string, errorLine = line) => {
    tokens.push({ kind: 'error', message, line: errorLine })
  }

  while (i < text.length) {
    const c = at(i)
    if (c === '\n') {
      line++
      i++
      lineStart = true
      continue
    }
    if (/\s/.test(c)) {
      i++
      continue
    }
    const atLineStart = lineStart
    lineStart = false

    if (c === '#' && atLineStart) {
      while (i < text.length && at(i) !== '\n') i++
    } else if (c === '/' && at(i + 1) === '/') {
      while (i < text.length && at(i) !== '\n') i++
    } else if (c === '/' && at(i + 1) === '*') {
      const startLine = line
      const end = text.indexOf('*/', i + 2)
      if (end < 0) {
        fail('a comment /* … */ is not closed (missing */).', startLine)
        return tokens
      }
      for (let k = i; k < end; k++) if (at(k) === '\n') line++
      i = end + 2
    } else if (c === '"') {
      const startLine = line
      let value = ''
      let j = i + 1
      for (;;) {
        if (j >= text.length) {
          fail('a quoted name or value is not closed (missing ").', startLine)
          return tokens
        }
        const d = at(j)
        if (d === '"') break
        if (d === '\\') {
          const e = at(j + 1)
          if (e === '"' || e === '\\') {
            value += e
            j += 2
            continue
          }
          // A backslash before a line break continues the string on the next line.
          const skip = e === '\n' ? 2 : e === '\r' && at(j + 2) === '\n' ? 3 : 0
          if (skip > 0) {
            line++
            j += skip
            continue
          }
        }
        if (d === '\n') line++
        value += d
        j++
      }
      const raw = text.slice(i + 1, j)
      tokens.push({ kind: 'id', value, raw, quoted: true, line: startLine })
      i = j + 1
    } else if (c === '-' && at(i + 1) === '>') {
      tokens.push({ kind: 'punct', value: '->', line })
      i += 2
    } else if (c === '-' && at(i + 1) === '-') {
      fail(UNDIRECTED_EDGES)
      return tokens
    } else if (/[0-9.]/.test(c) || (c === '-' && /[0-9.]/.test(at(i + 1)))) {
      const match = /^-?(\.[0-9]+|[0-9]+(\.[0-9]*)?)/.exec(text.slice(i))
      let j = i + (match ? match[0].length : 1)
      if (!match || BARE_CHAR.test(at(j))) {
        while (j < text.length && BARE_CHAR.test(at(j))) j++
        fail(`"${text.slice(i, j)}" is not valid DOT syntax.`)
        return tokens
      }
      const value = text.slice(i, j)
      tokens.push({ kind: 'id', value, raw: value, quoted: false, line })
      i = j
    } else if (BARE_START.test(c)) {
      let j = i
      while (j < text.length && BARE_CHAR.test(at(j))) j++
      const value = text.slice(i, j)
      tokens.push({ kind: 'id', value, raw: value, quoted: false, line })
      i = j
    } else if ('{}[]=;,+'.includes(c)) {
      tokens.push({ kind: 'punct', value: c, line })
      i++
    } else if (c === '<') {
      fail('HTML labels (<…>) are not supported.')
      return tokens
    } else if (c === ':') {
      fail('ports (a:n) are not supported.')
      return tokens
    } else {
      fail(`"${c}" is not valid DOT syntax.`)
      return tokens
    }
  }
  tokens.push({ kind: 'eof', line })
  return tokens
}

// ---------------------------------------------------------------------------
// Parser

interface Id {
  value: string
  raw: string
  line: number
}

interface Attr {
  key: string
  value: string
  raw: string
  line: number
}

interface ParsedNode {
  key: string
  line: number
  /** Whether `line` is that of a node statement (rather than of the first edge naming it). */
  stated: boolean
  label?: Id
  role?: string
  varType?: string
  levels?: string
  description?: string
  unit?: string
  centre?: { x: number; y: number }
}

interface Parsed {
  name?: string
  nodes: Map<string, ParsedNode>
  edges: ExchangeEdge[]
  /** Ignored attribute key → line of its first use, in order of first use. */
  ignored: Map<string, number>
}

/** `"x,y"` or `"x,y!"` in points, y up → the centre in canvas px, y down. */
function readPos(value: string): { x: number; y: number } | undefined {
  const n = '([-+]?(?:[0-9]+\\.?[0-9]*|\\.[0-9]+)(?:[eE][-+]?[0-9]+)?)'
  const match = new RegExp(`^\\s*${n}\\s*,\\s*${n}\\s*!?\\s*$`).exec(value)
  if (!match) return undefined
  return {
    x: Number(match[1]) / PT_PER_PX + 0,
    y: 0 - Number(match[2]) / PT_PER_PX,
  }
}

function parseTokens(tokens: Token[]): Parsed {
  let index = 0
  const peek = (): Token => {
    const tok = tokens[Math.min(index, tokens.length - 1)]
    if (tok.kind === 'error') throw new DotSyntaxError(tok.line, tok.message)
    return tok
  }
  const next = (): Token => {
    const tok = peek()
    if (tok.kind !== 'eof') index++
    return tok
  }
  const isPunct = (tok: Token, p: string) =>
    tok.kind === 'punct' && tok.value === p
  const isKeyword = (tok: Token, ...words: string[]) =>
    tok.kind === 'id' && !tok.quoted && words.includes(tok.value.toLowerCase())
  const unexpected = (tok: Token): DotSyntaxError => {
    if (tok.kind === 'eof') {
      return new DotSyntaxError(tok.line, 'the text ends too early.')
    }
    const text =
      tok.kind === 'id' ? tok.raw : tok.kind === 'punct' ? tok.value : ''
    return new DotSyntaxError(tok.line, `"${text}" is not valid here.`)
  }
  const expectPunct = (p: string) => {
    const tok = next()
    if (!isPunct(tok, p)) throw unexpected(tok)
  }

  /** An id, with `"a" + "b"` concatenation; keywords only where `keywords` allows them. */
  const readId = (keywords: boolean): Id => {
    const tok = next()
    if (tok.kind !== 'id' || (!keywords && isKeyword(tok, ...KEYWORDS))) {
      throw unexpected(tok)
    }
    const id: Id = { value: tok.value, raw: tok.raw, line: tok.line }
    if (!tok.quoted) return id
    while (isPunct(peek(), '+')) {
      next()
      const more = next()
      if (more.kind !== 'id' || !more.quoted) throw unexpected(more)
      id.value += more.value
      id.raw += more.raw
    }
    return id
  }

  /** Zero or more `[ key = value, … ]` lists, joined. */
  const readAttrs = (): Attr[] => {
    const attrs: Attr[] = []
    while (isPunct(peek(), '[')) {
      next()
      while (!isPunct(peek(), ']')) {
        const key = readId(true)
        expectPunct('=')
        const value = readId(true)
        attrs.push({
          key: key.value,
          value: value.value,
          raw: value.raw,
          line: key.line,
        })
        const sep = peek()
        if (isPunct(sep, ',') || isPunct(sep, ';')) next()
      }
      next()
    }
    return attrs
  }

  const nodes = new Map<string, ParsedNode>()
  const edges: ExchangeEdge[] = []
  const ignored = new Map<string, number>()
  /** The node keys mentioned inside each open subgraph, innermost last. */
  const groups: Set<string>[] = []
  let headerName: string | undefined
  let labelName: string | undefined

  const ignore = (attr: Attr) => {
    if (!ignored.has(attr.key)) ignored.set(attr.key, attr.line)
  }

  const mention = (id: Id): string => {
    if (!nodes.has(id.value)) {
      nodes.set(id.value, { key: id.value, line: id.line, stated: false })
    }
    for (const group of groups) group.add(id.value)
    return id.value
  }

  const applyNodeAttrs = (node: ParsedNode, attrs: Attr[]) => {
    for (const attr of attrs) {
      switch (attr.key) {
        case 'label':
          node.label = { value: attr.value, raw: attr.raw, line: attr.line }
          break
        case 'gc_role':
          node.role = attr.value
          break
        case 'gc_var_type':
          node.varType = attr.value
          break
        case 'gc_levels':
          node.levels = attr.value
          break
        case 'gc_description':
          node.description = attr.value
          break
        case 'gc_unit':
          node.unit = attr.value
          break
        case 'pos': {
          const centre = readPos(attr.value)
          if (!centre) {
            throw new DotSyntaxError(
              attr.line,
              `pos="${attr.value}" is not a valid position; DOT positions look like pos="31.5,-27!".`,
            )
          }
          node.centre = centre
          break
        }
        default:
          if (!STYLE_KEYS.has(attr.key)) ignore(attr)
      }
    }
  }

  const addEdges = (operands: string[][], attrs: Attr[], line: number) => {
    let evidence: string | undefined
    let note: string | undefined
    for (const attr of attrs) {
      if (attr.key === 'gc_evidence') evidence = attr.value
      else if (attr.key === 'gc_note') note = attr.value
      else if (attr.key !== 'pos' && !STYLE_KEYS.has(attr.key)) ignore(attr)
    }
    for (let k = 0; k + 1 < operands.length; k++) {
      for (const source of operands[k]) {
        for (const target of operands[k + 1]) {
          const edge: ExchangeEdge = { source, target, line }
          if (evidence !== undefined) edge.evidence = decodeList(evidence)
          if (note !== undefined) edge.note = note
          edges.push(edge)
        }
      }
    }
  }

  /** `{ … }` or `subgraph [id] { … }`; returns the node keys mentioned inside, in order. */
  const subgraph = (): string[] => {
    if (isKeyword(peek(), 'subgraph')) {
      next()
      if (!isPunct(peek(), '{')) readId(false)
    }
    expectPunct('{')
    const group = new Set<string>()
    groups.push(group)
    statements(false)
    groups.pop()
    expectPunct('}')
    return [...group]
  }

  const isSubgraphStart = (tok: Token) =>
    isPunct(tok, '{') || isKeyword(tok, 'subgraph')

  /** An edge operand: a node id or a subgraph. */
  const operand = (): string[] =>
    isSubgraphStart(peek()) ? subgraph() : [mention(readId(false))]

  /** The rest of an edge statement after its first operand. */
  const edgeRest = (first: string[], line: number) => {
    const operands = [first]
    while (isPunct(peek(), '->')) {
      next()
      operands.push(operand())
    }
    addEdges(operands, readAttrs(), line)
  }

  const statement = (top: boolean) => {
    const tok = peek()
    if (isSubgraphStart(tok)) {
      const members = subgraph()
      if (isPunct(peek(), '->')) edgeRest(members, tok.line)
      return
    }
    if (isKeyword(tok, 'graph', 'node', 'edge')) {
      next()
      if (!isPunct(peek(), '[')) throw unexpected(peek())
      const attrs = readAttrs()
      if (top && tok.kind === 'id' && tok.value.toLowerCase() === 'graph') {
        for (const attr of attrs)
          if (attr.key === 'label') labelName = attr.value
      }
      return
    }
    const id = readId(false)
    if (isPunct(peek(), '=')) {
      next()
      const value = readId(true)
      if (top && id.value === 'label') labelName = value.value
      return
    }
    const key = mention(id)
    if (isPunct(peek(), '->')) {
      edgeRest([key], id.line)
      return
    }
    const node = nodes.get(key)!
    if (!node.stated) {
      node.stated = true
      node.line = id.line
    }
    applyNodeAttrs(node, readAttrs())
  }

  const statements = (top: boolean) => {
    for (;;) {
      const tok = peek()
      if (isPunct(tok, '}') || tok.kind === 'eof') return
      if (isPunct(tok, ';')) {
        next()
        continue
      }
      statement(top)
    }
  }

  // Header: [strict] digraph [id] {
  let tok = next()
  if (isKeyword(tok, 'strict')) tok = next()
  if (isKeyword(tok, 'graph'))
    throw new DotSyntaxError(tok.line, UNDIRECTED_GRAPH)
  if (!isKeyword(tok, 'digraph')) throw unexpected(tok)
  if (!isPunct(peek(), '{')) headerName = readId(false).value
  expectPunct('{')
  statements(true)
  expectPunct('}')
  const end = peek()
  if (end.kind !== 'eof') throw unexpected(end)

  return { name: headerName ?? labelName, nodes, edges, ignored }
}

/** Reads DOT (spec 4.15). */
export function parseDot(text: string): Result<Graph> {
  let parsed: Parsed
  try {
    parsed = parseTokens(tokenize(text))
  } catch (e) {
    if (e instanceof DotSyntaxError) {
      return { ok: false, errors: [{ message: e.message, line: e.line }] }
    }
    throw e
  }

  const nodes: ExchangeNode[] = []
  for (const p of parsed.nodes.values()) {
    // `\N` (as written, before unescaping) stands for the node id; an empty label counts as absent.
    const label =
      p.label && p.label.raw !== '\\N' && p.label.value.trim() !== ''
        ? p.label.value
        : undefined
    const node: ExchangeNode = {
      key: p.key,
      name: (label ?? p.key).trim(),
      line: p.line,
    }
    if (p.role !== undefined) node.role = p.role
    if (p.varType !== undefined) node.varType = p.varType
    if (p.levels !== undefined) node.levels = decodeList(p.levels)
    if (p.description !== undefined) node.description = p.description
    if (p.unit !== undefined) node.unit = p.unit
    if (p.centre) node.centre = p.centre
    nodes.push(node)
  }
  const warnings: Issue[] = [...parsed.ignored].map(([key, line]) =>
    ignoredAttribute('DOT', key, line),
  )
  const input: { name?: string; nodes: ExchangeNode[]; edges: ExchangeEdge[] } =
    {
      nodes,
      edges: parsed.edges,
    }
  if (parsed.name !== undefined) input.name = parsed.name
  return buildGraph(input, warnings)
}
