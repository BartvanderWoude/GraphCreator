import { decodeList, encodeList } from './exchange'
import type { GEdge, GNode, Graph, Position } from './graph'
import { autoLayout } from './layout'
import type { Issue, Result } from './result'
import { VAR_TYPES, type Role, type VarType } from './schema'
import { validateGraph } from './validate'

/** dagitty `pos` units are multiplied by this to get canvas px. */
export const DAGITTY_SCALE = 100

const DAGITTY_ROLES = [
  'exposure',
  'outcome',
  'latent',
  'adjusted',
  'selected',
] as const satisfies readonly Role[]

/** Graph-type keywords dagitty knows; only `dag` is accepted. */
const GRAPH_TYPES = new Set(['dag', 'pdag', 'mag', 'pag', 'graph', 'digraph'])

/** GraphCreator details carried as dagitty attributes (spec 4.2, phase 32). */
const GC_VAR_TYPE = 'gc.var_type'
const GC_LEVELS = 'gc.levels'
const GC_DESCRIPTION = 'gc.description'
const GC_UNIT = 'gc.unit'
const GC_EVIDENCE = 'gc.evidence'
const GC_NOTE = 'gc.note'

const LAYOUT_WARNING =
  'Some nodes had no position, so the graph was laid out automatically.'

const WORD_CHAR = /[0-9A-Za-z_.]/
const OP_CHAR = /[<>@-]/

// ---------------------------------------------------------------------------
// Tokenizer

type TokenKind = 'word' | 'string' | 'number' | 'op' | 'punct' | 'eof'

interface Token {
  kind: TokenKind
  /** For strings the unescaped content, otherwise the source text. */
  value: string
  line: number
}

/** A user-facing syntax error; caught in `parseDagitty` and turned into an `Issue`. */
class DagittySyntaxError extends Error {
  line: number
  constructor(line: number, message: string) {
    super(`Line ${line}: ${message}`)
    this.line = line
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  const at = (k: number) => text.charAt(k)

  const readOp = (start: number): number => {
    let j = start
    for (;;) {
      while (j < text.length && OP_CHAR.test(at(j))) j++
      // Circle marks written as `o` (`-o`, `o->`, `-o-`): keep them in the operator.
      if (
        at(j - 1) === '-' &&
        at(j) === 'o' &&
        (j + 1 >= text.length ||
          OP_CHAR.test(at(j + 1)) ||
          !WORD_CHAR.test(at(j + 1)))
      ) {
        j++
        continue
      }
      return j
    }
  }

  while (i < text.length) {
    const c = at(i)
    if (c === '\n') {
      line++
      i++
    } else if (/\s/.test(c)) {
      i++
    } else if (c === '"') {
      const startLine = line
      let value = ''
      let j = i + 1
      for (;;) {
        if (j >= text.length) {
          throw new DagittySyntaxError(
            startLine,
            'a quoted name or value is not closed (missing ").',
          )
        }
        const d = at(j)
        if (d === '"') break
        if (d === '\\' && (at(j + 1) === '"' || at(j + 1) === '\\')) {
          value += at(j + 1)
          j += 2
          continue
        }
        if (d === '\n') line++
        value += d
        j++
      }
      tokens.push({ kind: 'string', value, line: startLine })
      i = j + 1
    } else if (c === '-' && /[0-9.]/.test(at(i + 1))) {
      let j = i + 1
      while (j < text.length && WORD_CHAR.test(at(j))) j++
      tokens.push({ kind: 'number', value: text.slice(i, j), line })
      i = j
    } else if (WORD_CHAR.test(c)) {
      let j = i
      while (j < text.length && WORD_CHAR.test(at(j))) j++
      const word = text.slice(i, j)
      if (word === 'o' && OP_CHAR.test(at(j))) {
        // `o->`, `o-o`: an edge with a circle mark.
        const end = readOp(j)
        tokens.push({ kind: 'op', value: text.slice(i, end), line })
        i = end
      } else {
        tokens.push({ kind: 'word', value: word, line })
        i = j
      }
    } else if (OP_CHAR.test(c)) {
      const end = readOp(i)
      tokens.push({ kind: 'op', value: text.slice(i, end), line })
      i = end
    } else if ('{}[],=;'.includes(c)) {
      tokens.push({ kind: 'punct', value: c, line })
      i++
    } else {
      throw new DagittySyntaxError(line, `"${c}" is not valid dagitty syntax.`)
    }
  }
  tokens.push({ kind: 'eof', value: '', line })
  return tokens
}

/** Checks an edge operator; returns whether it points forwards (`->`) or backwards (`<-`). */
function edgeDirection(tok: Token): 'forward' | 'backward' {
  const op = tok.value
  if (op === '->') return 'forward'
  if (op === '<-') return 'backward'
  const unsupported = (what: string) =>
    new DagittySyntaxError(
      tok.line,
      `${what} (${op}) are not supported yet. GraphCreator v1 supports directed edges only.`,
    )
  if (op === '<->') throw unsupported('bidirected edges')
  if (op === '--') throw unsupported('undirected edges')
  if (/[@o]/.test(op)) throw unsupported('edges with circle marks')
  throw new DagittySyntaxError(tok.line, `"${op}" is not valid dagitty syntax.`)
}

// ---------------------------------------------------------------------------
// Parser

interface Attr {
  key: string
  value?: string
  line: number
}

interface ParsedNode {
  dagittyId: string
  line: number
  roles: Role[]
  rolesLine: number
  label?: string
  pos?: Position
  varType?: VarType
  levels?: string[]
  description?: string
  unit?: string
}

interface ParsedEdge {
  from: string
  to: string
  evidence?: string[]
  note?: string
}

interface Parsed {
  nodes: Map<string, ParsedNode>
  edges: ParsedEdge[]
  /** Ignored attribute key → line of its first use. */
  ignored: Map<string, number>
}

function parseTokens(tokens: Token[]): Parsed {
  let index = 0
  const peek = (k = 0): Token => tokens[Math.min(index + k, tokens.length - 1)]
  const next = (): Token => {
    const tok = peek()
    if (tok.kind !== 'eof') index++
    return tok
  }
  const isPunct = (tok: Token, p: string) =>
    tok.kind === 'punct' && tok.value === p
  const unexpected = (tok: Token): DagittySyntaxError =>
    tok.kind === 'eof'
      ? new DagittySyntaxError(tok.line, 'the text ends too early.')
      : new DagittySyntaxError(tok.line, `"${tok.value}" is not valid here.`)
  const expectPunct = (p: string): Token => {
    const tok = next()
    if (!isPunct(tok, p)) throw unexpected(tok)
    return tok
  }

  const nodes = new Map<string, ParsedNode>()
  const edges: ParsedEdge[] = []
  const edgeByKey = new Map<string, ParsedEdge>()
  const ignored = new Map<string, number>()

  const ignore = (attr: Attr) => {
    if (!ignored.has(attr.key)) ignored.set(attr.key, attr.line)
  }

  const nodeFor = (tok: Token): string => {
    if (!nodes.has(tok.value)) {
      nodes.set(tok.value, {
        dagittyId: tok.value,
        line: tok.line,
        roles: [],
        rolesLine: tok.line,
      })
    }
    return tok.value
  }

  const isId = (tok: Token) => tok.kind === 'word' || tok.kind === 'string'

  const operand = (): { ids: string[]; group: boolean } => {
    const tok = next()
    if (isId(tok)) return { ids: [nodeFor(tok)], group: false }
    if (isPunct(tok, '{')) {
      const ids: string[] = []
      while (!isPunct(peek(), '}')) {
        const member = next()
        if (!isId(member)) throw unexpected(member)
        ids.push(nodeFor(member))
      }
      next()
      return { ids, group: true }
    }
    throw unexpected(tok)
  }

  const attrs = (): Attr[] => {
    expectPunct('[')
    const list: Attr[] = []
    if (isPunct(peek(), ']')) {
      next()
      return list
    }
    for (;;) {
      const keyTok = next()
      if (keyTok.kind !== 'word') throw unexpected(keyTok)
      const attr: Attr = { key: keyTok.value, line: keyTok.line }
      if (isPunct(peek(), '=')) {
        next()
        const valueTok = next()
        if (
          valueTok.kind !== 'string' &&
          valueTok.kind !== 'word' &&
          valueTok.kind !== 'number'
        ) {
          throw unexpected(valueTok)
        }
        attr.value = valueTok.value
      }
      list.push(attr)
      const sep = next()
      if (isPunct(sep, ']')) return list
      if (!isPunct(sep, ',')) throw unexpected(sep)
    }
  }

  const applyVertexAttr = (node: ParsedNode, attr: Attr) => {
    if ((DAGITTY_ROLES as readonly string[]).includes(attr.key)) {
      const role = attr.key as Role
      if (!node.roles.includes(role)) {
        node.roles.push(role)
        node.rolesLine = attr.line
      }
    } else if (attr.key === 'pos') {
      const match = /^\s*([^,\s]+)\s*,\s*([^,\s]+)\s*$/.exec(attr.value ?? '')
      const x = match ? Number(match[1]) : NaN
      const y = match ? Number(match[2]) : NaN
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new DagittySyntaxError(
          attr.line,
          `pos="${attr.value ?? ''}" is not a valid position; dagitty positions look like pos="1.5,-0.3".`,
        )
      }
      node.pos = { x: toPx(x), y: toPx(y) }
    } else if (attr.key === 'label') {
      if (attr.value === undefined) {
        throw new DagittySyntaxError(
          attr.line,
          'label needs a value, as in label="Age".',
        )
      }
      node.label = attr.value
    } else if (attr.key === GC_VAR_TYPE) {
      const value = detail(attr)
      if (value === undefined) return
      if (!(VAR_TYPES as readonly string[]).includes(value)) {
        throw new DagittySyntaxError(
          attr.line,
          `gc.var_type must be one of ${VAR_TYPES.join(', ')}.`,
        )
      }
      node.varType = value as VarType
    } else if (attr.key === GC_LEVELS) {
      const value = detailList(attr)
      if (value !== undefined) node.levels = value
    } else if (attr.key === GC_DESCRIPTION) {
      const value = detail(attr)
      if (value !== undefined) node.description = value
    } else if (attr.key === GC_UNIT) {
      const value = detail(attr)
      if (value !== undefined) node.unit = value
    } else {
      ignore(attr)
    }
  }

  const applyEdgeAttr = (edge: ParsedEdge, attr: Attr) => {
    if (attr.key === GC_EVIDENCE) {
      const value = detailList(attr)
      if (value !== undefined) edge.evidence = value
    } else if (attr.key === GC_NOTE) {
      const value = detail(attr)
      if (value !== undefined) edge.note = value
    } else {
      ignore(attr)
    }
  }

  const statement = () => {
    const first = peek()
    // Graph attribute `bb="…"`: ignored silently.
    if (
      first.kind === 'word' &&
      first.value === 'bb' &&
      isPunct(peek(1), '=')
    ) {
      next()
      next()
      const value = next()
      if (value.kind !== 'string') throw unexpected(value)
      return
    }

    const start = operand()
    let left = start.ids
    let isEdge = false
    // Every edge of this statement, so attributes after a chain or group apply to all of them.
    const statementEdges: ParsedEdge[] = []
    while (peek().kind === 'op') {
      const direction = edgeDirection(next())
      const right = operand().ids
      for (const a of left) {
        for (const b of right) {
          const [from, to] = direction === 'forward' ? [a, b] : [b, a]
          const key = `${from}\u0000${to}`
          let edge = edgeByKey.get(key)
          if (!edge) {
            edge = { from, to }
            edgeByKey.set(key, edge)
            edges.push(edge)
          }
          statementEdges.push(edge)
        }
      }
      left = right
      isEdge = true
    }

    if (!isEdge && start.group) {
      throw new DagittySyntaxError(
        first.line,
        'a group { … } must be part of an edge, as in { a b } -> c.',
      )
    }
    if (isPunct(peek(), '[')) {
      const list = attrs()
      if (isEdge) {
        for (const attr of list) {
          if (attr.key === GC_EVIDENCE || attr.key === GC_NOTE) {
            for (const edge of statementEdges) applyEdgeAttr(edge, attr)
          } else {
            ignore(attr)
          }
        }
      } else {
        const node = nodes.get(start.ids[0])!
        for (const attr of list) applyVertexAttr(node, attr)
      }
    }
  }

  // Optional header: `dag [name] {`.
  const head = peek()
  if (
    head.kind === 'word' &&
    GRAPH_TYPES.has(head.value) &&
    (isPunct(peek(1), '{') || (isId(peek(1)) && isPunct(peek(2), '{')))
  ) {
    if (head.value !== 'dag') {
      throw new DagittySyntaxError(
        head.line,
        `graph type "${head.value}" is not supported. GraphCreator v1 supports dag graphs only.`,
      )
    }
    next()
    if (isId(peek())) next() // the graph name is not used
    expectPunct('{')
  }

  for (;;) {
    const tok = peek()
    if (tok.kind === 'eof') break
    if (isPunct(tok, ';')) {
      next()
      continue
    }
    if (isPunct(tok, '}')) {
      next()
      const rest = peek()
      if (rest.kind !== 'eof') throw unexpected(rest)
      break
    }
    statement()
    // Statements are separated by `;` or a newline.
    const after = peek()
    const lastLine = tokens[index - 1].line
    if (
      after.kind !== 'eof' &&
      !isPunct(after, ';') &&
      !isPunct(after, '}') &&
      after.line === lastLine
    ) {
      throw unexpected(after)
    }
  }
  // The closing brace is optional, as in dagitty.

  return { nodes, edges, ignored }
}

/** A `gc.*` value; a missing, empty or whitespace-only value counts as absent. */
function detail(attr: Attr): string | undefined {
  const value = attr.value
  return value === undefined || value.trim() === '' ? undefined : value
}

/** A `gc.*` list value (`encodeList` text); empty → absent. */
function detailList(attr: Attr): string[] | undefined {
  const value = detail(attr)
  if (value === undefined) return undefined
  const items = decodeList(value)
  return items.length > 0 ? items : undefined
}

/** dagitty units → canvas px, rounded to 0.001 px to drop floating-point noise. */
function toPx(v: number): number {
  return Math.round(v * DAGITTY_SCALE * 1000) / 1000
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Parses dagitty text (spec 4.2) with an own tokenizer and recursive-descent parser.
 *
 * - Supports `dag [name] { … }` (header optional), vertex statements with attributes, chains
 *   (`a -> b -> c`), `<-` and groups (`{a b} -> c`); `bb="…"` is ignored.
 * - Roles `exposure`, `outcome`, `latent`, `adjusted`, `selected`; more than one role on a node
 *   is an error. `pos="x,y"` → `{ x: x * DAGITTY_SCALE, y: y * DAGITTY_SCALE }`. `label="…"` sets
 *   the name. The GraphCreator details `gc.var_type`, `gc.levels`, `gc.description`, `gc.unit`
 *   (nodes) and `gc.evidence`, `gc.note` (edges; on a chain or group they apply to every edge of
 *   the statement) are always read; empty values count as absent and a `gc.var_type` outside
 *   `VAR_TYPES` is a line-numbered error. Other attributes are ignored with one warning per key.
 * - Duplicate edges merge silently; self-edges and cycles are errors. `<->`, `--`, `@-`/`-@`/`o-`
 *   edges, graph types other than `dag` and unexpected tokens are rejected with a line-numbered
 *   error. Two ids with the same label are an error.
 * - If any node lacks `pos`, the whole graph is auto-laid out with the same warning as `parseYaml`;
 *   `validateGraph` warnings follow.
 */
export function parseDagitty(text: string): Result<Graph> {
  let parsed: Parsed
  try {
    parsed = parseTokens(tokenize(text))
  } catch (e) {
    if (e instanceof DagittySyntaxError) {
      return { ok: false, errors: [{ message: e.message, line: e.line }] }
    }
    throw e
  }

  const errors: Issue[] = []
  const internalId = new Map<string, string>()
  const nodes: GNode[] = []
  let missingPos = false
  for (const p of parsed.nodes.values()) {
    const id = `n${nodes.length + 1}`
    internalId.set(p.dagittyId, id)
    const name = (p.label ?? p.dagittyId).trim()
    if (p.roles.length > 1) {
      errors.push({
        message: `Node "${name}" has more than one role (${p.roles.join(', ')}); GraphCreator allows one role per node.`,
        line: p.rolesLine,
      })
    }
    if (!p.pos) missingPos = true
    const node: GNode = {
      id,
      name,
      role: p.roles[0] ?? 'other',
      pos: p.pos ?? { x: 0, y: 0 },
    }
    if (p.varType) node.varType = p.varType
    if (p.levels) node.levels = p.levels
    if (p.description !== undefined) node.description = p.description
    if (p.unit !== undefined) node.unit = p.unit
    nodes.push(node)
  }

  const byName = new Map<string, number>()
  for (const n of nodes) byName.set(n.name, (byName.get(n.name) ?? 0) + 1)
  const collisions = [...byName].filter(([name, count]) => name && count > 1)
  for (const [name] of collisions) {
    errors.push({ message: `Two dagitty nodes have the label "${name}".` })
  }

  const edges: GEdge[] = parsed.edges.map((e, i) => {
    const edge: GEdge = {
      id: `e${i + 1}`,
      source: internalId.get(e.from)!,
      target: internalId.get(e.to)!,
      evidence: e.evidence ?? [],
    }
    if (e.note !== undefined) edge.note = e.note
    return edge
  })

  let graph: Graph = { nodes, edges }
  // Self-edges, cycles and empty names; duplicate names are reported above as label collisions.
  for (const issue of validateGraph(graph).errors) {
    if (!issue.message.startsWith('Node name "')) errors.push(issue)
  }
  if (errors.length > 0) return { ok: false, errors }

  const warnings: Issue[] = [...parsed.ignored].map(([key, line]) => ({
    message: `Ignored dagitty attribute "${key}" (not used by GraphCreator).`,
    line,
  }))
  if (missingPos) {
    graph = autoLayout(graph)
    warnings.push({ message: LAYOUT_WARNING })
  }
  warnings.push(...validateGraph(graph).warnings)
  return { ok: true, value: graph, warnings }
}

/** px → dagitty units with 3 decimals, never `-0.000`. */
function formatCoord(px: number): string {
  const s = (px / DAGITTY_SCALE).toFixed(3)
  return s === '-0.000' ? '0.000' : s
}

function quote(s: string): string {
  return `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`
}

/**
 * Writes dagitty (spec 4.2), without the graph name: `dag {`, one vertex line per node
 * (`id [role,label="…",pos="x,y"]`, role omitted for `other`, label only when the name differs
 * from the id, pos in px ÷ 100 with 3 decimals), one edge line per edge, `}`.
 *
 * With `details: true` the GraphCreator metadata is added as `gc.*` attributes (spec 4.2
 * "GraphCreator details in dagitty"): `gc.var_type`, `gc.levels`, `gc.description`, `gc.unit` on
 * nodes and `gc.evidence`, `gc.note` in `[…]` after edges, each only when set. Lists are written
 * with `encodeList`.
 */
export function toDagitty(
  graph: Graph,
  opts: { details?: boolean } = {},
): string {
  const details = opts.details === true
  const ids = toDagittyIds(graph.nodes)
  const lines = ['dag {']
  for (const node of graph.nodes) {
    const id = ids.get(node.id)!
    const attrs: string[] = []
    if (node.role !== 'other') attrs.push(node.role)
    if (node.name !== id) attrs.push(`label=${quote(node.name)}`)
    attrs.push(`pos="${formatCoord(node.pos.x)},${formatCoord(node.pos.y)}"`)
    if (details) {
      if (node.varType) attrs.push(`${GC_VAR_TYPE}=${quote(node.varType)}`)
      if (node.levels && node.levels.length > 0) {
        attrs.push(`${GC_LEVELS}=${quote(encodeList(node.levels))}`)
      }
      if (node.description) {
        attrs.push(`${GC_DESCRIPTION}=${quote(node.description)}`)
      }
      if (node.unit) attrs.push(`${GC_UNIT}=${quote(node.unit)}`)
    }
    lines.push(`${id} [${attrs.join(',')}]`)
  }
  for (const edge of graph.edges) {
    const from = ids.get(edge.source)
    const to = ids.get(edge.target)
    if (from === undefined || to === undefined) continue
    const attrs: string[] = []
    if (details) {
      if (edge.evidence.length > 0) {
        attrs.push(`${GC_EVIDENCE}=${quote(encodeList(edge.evidence))}`)
      }
      if (edge.note) attrs.push(`${GC_NOTE}=${quote(edge.note)}`)
    }
    lines.push(
      attrs.length > 0
        ? `${from} -> ${to} [${attrs.join(',')}]`
        : `${from} -> ${to}`,
    )
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

/**
 * Maps node id → dagitty id (spec 4.2): whitespace runs → `_`, then every character outside
 * `[0-9A-Za-z_.]` → `_`; empty → `node`. Assigned in node order; on collision `_2`, `_3`, … is
 * appended (the first keeps the plain id).
 */
export function toDagittyIds(nodes: GNode[]): Map<string, string> {
  const result = new Map<string, string>()
  const taken = new Set<string>()
  for (const node of nodes) {
    const base =
      node.name.replace(/\s+/gu, '_').replace(/[^0-9A-Za-z_.]/gu, '_') || 'node'
    let id = base
    for (let i = 2; taken.has(id); i++) id = `${base}_${i}`
    taken.add(id)
    result.set(node.id, id)
  }
  return result
}
