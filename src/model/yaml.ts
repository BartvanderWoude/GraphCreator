import {
  Document,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  Scalar,
  visit,
  type Node as YamlNode,
} from 'yaml'
import type { core } from 'zod'
import type { GEdge, GNode, Graph } from './graph'
import { newId } from './graph'
import { autoLayout } from './layout'
import type { Issue, Result } from './result'
import {
  FORMS,
  GraphFileSchema,
  KNOWN_SCHEMAS,
  SCHEMA_ID,
  STRENGTHS,
  type EdgeSign,
} from './schema'
import { signLevelsNode } from './simulation'
import { validateGraph } from './validate'

const LAYOUT_WARNING =
  'Some nodes had no position, so the graph was laid out automatically.'

type Path = (string | number)[]

/** Value at `path` inside plain data, or undefined. */
function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let cur = data
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<PropertyKey, unknown>)[key]
  }
  return cur
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Looks up 1-based line numbers of positions in the parsed document. */
class Lines {
  private readonly doc: Document.Parsed
  private readonly counter: LineCounter

  constructor(doc: Document.Parsed, counter: LineCounter) {
    this.doc = doc
    this.counter = counter
  }

  at(offset: number): number {
    return this.counter.linePos(offset).line
  }

  private node(path: Path): unknown {
    return path.length === 0 ? this.doc.contents : this.doc.getIn(path, true)
  }

  /** Line of the value at `path`, or of its closest existing ancestor. */
  of(path: Path): number | undefined {
    for (let k = path.length; k >= 0; k--) {
      const node = this.node(path.slice(0, k)) as YamlNode | undefined
      if (node?.range) return this.at(node.range[0])
    }
    return undefined
  }

  /** Line of the key `key` in the map at `path`. */
  ofKey(path: Path, key: string): number | undefined {
    const map = this.node(path)
    if (isMap(map)) {
      for (const pair of map.items) {
        if (isScalar(pair.key) && pair.key.value === key && pair.key.range) {
          return this.at(pair.key.range[0])
        }
      }
    }
    return this.of(path)
  }
}

/** `Node "SES"` / `Edge from "A" to "B"` for paths inside a node or edge, else null. */
function subjectOf(raw: unknown, path: Path): string | null {
  const [list, index] = path
  if (typeof index !== 'number') return null
  const entry = valueAt(raw, [list, index])
  const text = (key: string) => {
    const v = isRecord(entry) ? entry[key] : undefined
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }
  if (list === 'nodes') {
    const name = text('name')
    return name ? `Node "${name}"` : `Node ${index + 1}`
  }
  if (list === 'edges') {
    const from = text('from')
    const to = text('to')
    return from && to ? `Edge from "${from}" to "${to}"` : `Edge ${index + 1}`
  }
  return null
}

/** Human name of a field path relative to its node or edge: `levels.1` → `item 2 of levels`. */
function fieldName(field: Path): string {
  const last = field[field.length - 1]
  if (typeof last === 'number' && field.length > 1) {
    return `item ${last + 1} of ${field.slice(0, -1).join('.')}`
  }
  return field.join('.')
}

function expectedText(expected: string): string {
  switch (expected) {
    case 'string':
      return 'text'
    case 'number':
      return 'a number'
    case 'array':
      return 'a list'
    case 'object':
      return 'a map of fields'
    default:
      return `of type ${expected}`
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Messages for any problem inside a simulation-detail field (spec 4.16 "File"). */
const SIMULATION_MESSAGES: Record<string, string> = {
  shares: 'shares must be a list of numbers.',
  form: `form must be one of ${FORMS.join(', ')}.`,
  sign: 'sign must be positive or negative, or a map from levels to positive or negative.',
  strength: `strength must be one of ${STRENGTHS.join(', ')}.`,
}

/** Turns one Zod issue into user-facing issues (an unknown-keys issue gives one per key). */
function zodIssues(issue: core.$ZodIssue, raw: unknown, lines: Lines): Issue[] {
  const path = issue.path.filter(
    (k): k is string | number => typeof k !== 'symbol',
  )
  const subject = subjectOf(raw, path)
  const field = subject ? path.slice(2) : path
  const name = fieldName(field)
  const dotted = path.join('.')
  const sentence = (body: string) =>
    subject ? `${subject}: ${body}` : capitalize(body)

  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => {
      let message: string
      if (path.length === 0) message = `Unknown field "${key}" at top level.`
      else if (subject && field.length === 0)
        message = `${subject}: unknown field "${key}".`
      else message = `Unknown field "${key}" in ${dotted}.`
      return {
        message,
        path: [...path, key].join('.'),
        line: lines.ofKey(path, key),
      }
    })
  }

  // Simulation details (spec 4.16): one message per field, whatever went wrong inside it.
  const simulation = SIMULATION_MESSAGES[String(field[0])]
  if (subject && simulation) {
    const fieldPath = path.slice(0, 3)
    return [
      {
        message: `${subject}: ${simulation}`,
        path: fieldPath.join('.'),
        line: lines.of(fieldPath),
      },
    ]
  }

  let message: string
  if (field[0] === 'pos' && field.length <= 2) {
    message = sentence('pos must be a list of two numbers, like [0, 0].')
  } else if (issue.code === 'invalid_value') {
    message = sentence(
      `${name} must be one of ${issue.values.map(String).join(', ')}.`,
    )
  } else if (issue.code === 'invalid_type') {
    if (field.length === 0 && subject) {
      message = `${subject} must be ${expectedText(issue.expected)}.`
    } else if (valueAt(raw, path) === undefined) {
      message = sentence(`${name} is missing.`)
    } else {
      message = sentence(`${name} must be ${expectedText(issue.expected)}.`)
    }
  } else {
    const body = issue.message.replace(/\.$/, '')
    message = sentence(name ? `${name}: ${body}.` : `${body}.`)
  }
  return [{ message, path: dotted || undefined, line: lines.of(path) }]
}

/** A sign from the file: a word as it is, a map as a copy in file order, `{}` as absent (spec 4.16). */
function readSign(sign: EdgeSign | undefined): EdgeSign | undefined {
  if (sign === undefined || typeof sign === 'string') return sign
  const entries = Object.entries(sign)
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

/** Empty or whitespace-only strings become undefined (spec 3.2). */
function optionalText(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value
}

/**
 * Parses a GraphCreator YAML file (spec 4.1).
 *
 * 1. Parses with `yaml`'s `parseDocument`; syntax errors become issues with a 1-based `line`.
 * 2. Checks the `schema` line: missing → `This file has no "schema" line, so it is not a
 *    GraphCreator file.`; unknown → `This file uses format "<value>", which this version of
 *    GraphCreator cannot read.`
 * 3. Validates with `GraphFileSchema`; Zod issues get a dotted `path` and name the node where possible.
 * 4. Semantic checks, all collected: empty or duplicate names, `from`/`to` naming no node,
 *    self-edges, duplicate edges, misplaced `levels`/`unit`, a directed cycle.
 * 5. Any errors → `{ ok: false, errors }`; nothing is loaded.
 * 6. Builds the graph with fresh internal ids. If any node lacks `pos`, the whole graph is
 *    auto-laid out with the warning `Some nodes had no position, so the graph was laid out automatically.`
 * 7. Adds the `validateGraph` warnings.
 */
export function parseYaml(text: string): Result<Graph> {
  // 1. Syntax.
  const counter = new LineCounter()
  const doc = parseDocument(text, {
    lineCounter: counter,
    prettyErrors: false,
  })
  const lines = new Lines(doc, counter)
  if (doc.errors.length > 0) {
    return {
      ok: false,
      errors: doc.errors.map((e) => ({
        message: `The file is not valid YAML: ${e.message.replace(/\.$/, '')}.`,
        line: lines.at(e.pos[0]),
      })),
    }
  }
  const raw: unknown = doc.toJS()

  // 2. Schema line.
  if (!isRecord(raw) || raw.schema === undefined || raw.schema === null) {
    return {
      ok: false,
      errors: [
        {
          message:
            'This file has no "schema" line, so it is not a GraphCreator file.',
          line: 1,
        },
      ],
    }
  }
  if (!(KNOWN_SCHEMAS as readonly unknown[]).includes(raw.schema)) {
    return {
      ok: false,
      errors: [
        {
          message: `This file uses format "${String(raw.schema)}", which this version of GraphCreator cannot read.`,
          path: 'schema',
          line: lines.of(['schema']),
        },
      ],
    }
  }

  // 3. Shape.
  const parsed = GraphFileSchema.safeParse(raw)
  if (!parsed.success) {
    // Several problems inside one simulation field (two bad shares) give one issue.
    const seen = new Set<string>()
    const errors = parsed.error.issues
      .flatMap((i) => zodIssues(i, raw, lines))
      .filter((issue) => {
        const key = `${issue.path ?? ''}\n${issue.message}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    return { ok: false, errors }
  }
  const file = parsed.data

  // 4. Semantic checks on the graph the file describes.
  const nodes: GNode[] = []
  const idByName = new Map<string, string>()
  for (const n of file.nodes) {
    const node: GNode = {
      id: newId(
        'n',
        nodes.map((x) => x.id),
      ),
      name: n.name.trim(),
      role: n.role,
      pos: n.pos ? { x: n.pos[0], y: n.pos[1] } : { x: 0, y: 0 },
    }
    if (n.var_type !== undefined) node.varType = n.var_type
    if (n.levels !== undefined) node.levels = [...n.levels]
    if (n.shares !== undefined) node.shares = [...n.shares]
    if (n.form !== undefined) node.form = n.form
    const description = optionalText(n.description)
    if (description !== undefined) node.description = description
    const unit = optionalText(n.unit)
    if (unit !== undefined) node.unit = unit
    nodes.push(node)
    if (!idByName.has(node.name)) idByName.set(node.name, node.id)
  }

  const edges: GEdge[] = []
  const refErrors: Issue[] = []
  file.edges.forEach((e, i) => {
    const from = e.from.trim()
    const to = e.to.trim()
    const source = idByName.get(from)
    const target = idByName.get(to)
    for (const [key, name, id] of [
      ['from', from, source],
      ['to', to, target],
    ] as const) {
      if (id === undefined) {
        refErrors.push({
          message: `The edge from "${from}" to "${to}" refers to "${name}", but there is no node with that name.`,
          path: `edges.${i}.${key}`,
          line: lines.of(['edges', i, key]),
        })
      }
    }
    if (source === undefined || target === undefined) return
    const edge: GEdge = {
      id: newId(
        'e',
        edges.map((x) => x.id),
      ),
      source,
      target,
      evidence: [...e.evidence],
    }
    const note = optionalText(e.note)
    if (note !== undefined) edge.note = note
    const sign = readSign(e.sign)
    if (sign !== undefined) edge.sign = sign
    if (e.strength !== undefined) edge.strength = e.strength
    edges.push(edge)
  })

  let graph: Graph = { nodes, edges }
  const name = optionalText(file.name)
  if (name !== undefined) graph.name = name
  // `locked: false` is the same as no lock at all (spec 4.17).
  if (file.locked === true) graph.locked = true

  const { errors: graphErrors, warnings } = validateGraph(graph)
  // Missing names go where validateGraph reports dangling edges: before the cycle.
  const cycleAt = graphErrors.findIndex((e) =>
    e.message.startsWith('The graph has a cycle'),
  )
  const errors =
    cycleAt === -1
      ? [...graphErrors, ...refErrors]
      : [
          ...graphErrors.slice(0, cycleAt),
          ...refErrors,
          ...graphErrors.slice(cycleAt),
        ]

  // 5. Nothing is loaded when anything is wrong.
  if (errors.length > 0) return { ok: false, errors }

  // 6. Positions.
  const layoutWarnings: Issue[] = []
  if (file.nodes.some((n) => n.pos === undefined)) {
    graph = autoLayout(graph)
    layoutWarnings.push({ message: LAYOUT_WARNING })
  }

  // 7. Warnings.
  return { ok: true, value: graph, warnings: [...layoutWarnings, ...warnings] }
}

/** Rounds to an integer without producing `-0`. */
function roundPx(v: number): number {
  return Math.round(v) || 0
}

/** A number as JavaScript writes it, with `-0` as `0`. */
function noNegativeZero(v: number): number {
  return Object.is(v, -0) ? 0 : v
}

/**
 * Plain text that a YAML 1.1 reader (PyYAML) resolves to something other than a string: a
 * boolean, null, an integer (also `0x`, `0o`, `0b`, `_` and base 60 forms), a float (also `.inf`,
 * `.nan`), a timestamp, or the merge (`<<`) and value (`=`) keys. Patterns follow PyYAML's
 * resolver and the YAML 1.1 type definitions.
 */
const YAML11_NON_STRING = new RegExp(
  '^(?:' +
    [
      // bool (YAML 1.1 also counts y and n)
      'y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF',
      // null
      '~|null|Null|NULL',
      // int
      '[-+]?0b[01_]+',
      '[-+]?0o?[0-7_]+',
      '[-+]?(?:0|[1-9][0-9_]*)',
      '[-+]?0x[0-9a-fA-F_]+',
      '[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+',
      // float
      '[-+]?[0-9][0-9_]*\\.[0-9_]*(?:[eE][-+]?[0-9]+)?',
      '[-+]?\\.[0-9_]+(?:[eE][-+]?[0-9]+)?',
      '[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*',
      '[-+]?\\.(?:inf|Inf|INF)',
      '\\.(?:nan|NaN|NAN)',
      // timestamp
      '[0-9]{4}-[0-9]{2}-[0-9]{2}',
      '[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt]|[ \\t]+)[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]*)?(?:[ \\t]*(?:Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?',
      // merge and value keys
      '<<|=',
    ].join('|') +
    ')$',
)

/** Whether a YAML 1.1 reader would read `text`, written plain, as something other than text. */
function isYaml11NonString(text: string): boolean {
  return YAML11_NON_STRING.test(text)
}

/**
 * Writes a graph as canonical GraphCreator YAML (spec 4.1): keys in table order, undefined,
 * default and empty fields omitted, flow style for `levels`, `pos` and `evidence`, positions
 * rounded to integers, trailing newline. For a canonical file `toYaml(parseYaml(text).value) === text`.
 * Evidence items are always double-quoted (they often contain `:`), as in the spec example.
 * Edges whose endpoints are not in the graph are skipped.
 *
 * Simulation details (spec 4.16) follow the same rules: `shares` and a sign map in flow style, the
 * map's keys in the level order of `signLevelsNode` and any other keys after them.
 * Text that a YAML 1.1 reader would take for a boolean, null, number or date is double-quoted.
 */
export function toYaml(graph: Graph): string {
  const nameById = new Map(graph.nodes.map((n) => [n.id, n.name]))
  const doc = new Document({})
  const writeSign = (g: Graph, e: GEdge) => {
    const sign = e.sign
    if (sign === undefined || typeof sign === 'string') return sign
    const entries = new Map(Object.entries(sign))
    if (entries.size === 0) return undefined
    const ordered = new Map<string, unknown>()
    for (const level of signLevelsNode(g, e)?.levels ?? []) {
      const value = entries.get(level)
      if (value !== undefined && !ordered.has(level)) ordered.set(level, value)
    }
    for (const [key, value] of entries) {
      if (!ordered.has(key)) ordered.set(key, value)
    }
    const map = doc.createNode(ordered)
    map.flow = true
    return map
  }
  const flow = (items: unknown[], quote = false) => {
    const seq = doc.createNode(items)
    seq.flow = true
    if (quote && isSeq(seq)) {
      for (const item of seq.items) {
        if (isScalar(item)) item.type = Scalar.QUOTE_DOUBLE
      }
    }
    return seq
  }

  const file: Record<string, unknown> = { schema: SCHEMA_ID }
  if (graph.name !== undefined) file.name = graph.name
  if (graph.locked) file.locked = true
  file.nodes = graph.nodes.map((n) => {
    const out: Record<string, unknown> = { name: n.name }
    if (n.role !== 'other') out.role = n.role
    if (n.varType !== undefined) out.var_type = n.varType
    if (n.levels !== undefined) out.levels = flow(n.levels)
    if (n.shares !== undefined) out.shares = flow(n.shares.map(noNegativeZero))
    if (n.description !== undefined) out.description = n.description
    if (n.unit !== undefined) out.unit = n.unit
    if (n.form !== undefined) out.form = n.form
    out.pos = flow([roundPx(n.pos.x), roundPx(n.pos.y)])
    return out
  })
  file.edges = graph.edges.flatMap((e) => {
    const from = nameById.get(e.source)
    const to = nameById.get(e.target)
    if (from === undefined || to === undefined) return []
    const out: Record<string, unknown> = { from, to }
    const sign = writeSign(graph, e)
    if (sign !== undefined) out.sign = sign
    if (e.strength !== undefined) out.strength = e.strength
    if (e.evidence.length > 0) out.evidence = flow(e.evidence, true)
    if (e.note !== undefined) out.note = e.note
    return [out]
  })
  doc.contents = doc.createNode(file)
  visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value === 'string' && isYaml11NonString(node.value)) {
        node.type = Scalar.QUOTE_DOUBLE
      }
    },
  })
  return doc.toString({ flowCollectionPadding: false, lineWidth: 0 })
}

/**
 * File name stem for a graph name (spec 4.1): lower-cased, runs of characters outside `[a-z0-9]`
 * replaced by `-`, leading/trailing `-` trimmed; empty → `graph`. E.g. `"Smoking & BW"` → `smoking-bw`.
 * The file is saved as `<slug>.dag.yaml`.
 */
export function fileSlug(name?: string): string {
  const slug = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'graph'
}
