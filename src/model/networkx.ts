import { toDagittyIds } from './dagitty'
import {
  buildGraph,
  ignoredAttribute,
  type ExchangeEdge,
  type ExchangeNode,
} from './exchange'
import type { Graph } from './graph'
import { NODE_DIAMETER } from './nodeSize'
import type { Issue, Result } from './result'

/**
 * networkx node-link JSON (spec 4.15, phase 35): what `nx.node_link_data` writes and
 * `nx.node_link_graph(data, edges="edges")` reads.
 */

const FORMAT = 'networkx'
const NODE_KEYS = new Set([
  'id',
  'name',
  'label',
  'role',
  'var_type',
  'levels',
  'description',
  'unit',
  'pos',
])
const EDGE_KEYS = new Set(['source', 'target', 'evidence', 'note'])
const GRAPH_KEYS = new Set(['name'])

/** At most two decimals, never `-0` (spec 4.15 "Numbers"). */
function num(n: number): number {
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r
}

/**
 * A JSON array that `JSON.stringify(…, null, 2)` spread over several lines and whose items are all
 * strings or numbers. Stringified strings never contain a raw newline, so one item is one line.
 */
const SHORT_ARRAY =
  /\[\n((?: *(?:"(?:[^"\\\n]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?),?\n)+) *\]/g

/** Puts arrays of strings and numbers back on one line: `["a", "b"]`, `[42, 42]`. */
function joinShortArrays(json: string): string {
  return json.replace(SHORT_ARRAY, (_, body: string) => {
    const items = body
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => line.trim().replace(/,$/, ''))
    return `[${items.join(', ')}]`
  })
}

/** Writes networkx JSON (spec 4.15). */
export function toNetworkx(graph: Graph): string {
  const ids = toDagittyIds(graph.nodes)
  const nodes = graph.nodes.map((n) => {
    const node: Record<string, unknown> = { id: ids.get(n.id), name: n.name }
    if (n.role !== 'other') node.role = n.role
    if (n.varType) node.var_type = n.varType
    if (n.levels && n.levels.length > 0) node.levels = n.levels
    if (n.description) node.description = n.description
    if (n.unit) node.unit = n.unit
    const r = NODE_DIAMETER / 2
    node.pos = [num(n.pos.x + r), num(n.pos.y + r)]
    return node
  })
  const edges = graph.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => {
      const edge: Record<string, unknown> = {
        source: ids.get(e.source),
        target: ids.get(e.target),
      }
      if (e.evidence.length > 0) edge.evidence = e.evidence
      if (e.note) edge.note = e.note
      return edge
    })
  const data = {
    directed: true,
    multigraph: false,
    graph: graph.name ? { name: graph.name } : {},
    nodes,
    edges,
  }
  return `${joinShortArrays(JSON.stringify(data, null, 2))}\n`
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A JSON id (string or number) as text, or undefined when it is neither. */
function idText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

const fail = (message: string): Result<Graph> => ({
  ok: false,
  errors: [{ message }],
})

/** Reads networkx JSON (spec 4.15). */
export function parseNetworkx(text: string): Result<Graph> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).replace(
      /\.$/,
      '',
    )
    return fail(`The file is not valid JSON: ${message}.`)
  }
  if (!isObject(data) || !Array.isArray(data.nodes)) {
    return fail('This JSON is not a networkx graph (it has no "nodes" list).')
  }
  if (data.directed !== true) {
    return fail(
      'This networkx graph is not directed. GraphCreator reads directed graphs only.',
    )
  }
  if (data.multigraph === true) {
    return fail('networkx multigraphs are not supported.')
  }
  const edgeKey = data.edges !== undefined ? 'edges' : 'links'
  const rawEdges = data[edgeKey] ?? []
  if (!Array.isArray(rawEdges)) {
    return fail(
      `This JSON is not a networkx graph ("${edgeKey}" is not a list).`,
    )
  }

  const warnings: Issue[] = []
  const warned = new Set<string>()
  const checkKeys = (obj: JsonObject, known: Set<string>) => {
    for (const key of Object.keys(obj)) {
      if (known.has(key) || warned.has(key)) continue
      warned.add(key)
      warnings.push(ignoredAttribute(FORMAT, key))
    }
  }

  // Item-level problems: without an id or endpoints there is nothing to build.
  const structure: Issue[] = []
  // Field-level problems, reported together with buildGraph's.
  const fields: Issue[] = []

  let name: string | undefined
  if (isObject(data.graph)) {
    checkKeys(data.graph, GRAPH_KEYS)
    const graphName = data.graph.name
    if (graphName !== undefined && graphName !== null) {
      name = idText(graphName)
      if (name === undefined) {
        fields.push({ message: 'The graph name must be text.' })
      }
    }
  }

  const nodes: ExchangeNode[] = []
  data.nodes.forEach((raw: unknown, i) => {
    const where = `Node ${i + 1} in the "nodes" list`
    if (!isObject(raw)) {
      structure.push({ message: `${where} is not an object.` })
      return
    }
    checkKeys(raw, NODE_KEYS)
    const key = idText(raw.id)
    if (key === undefined) {
      structure.push({ message: `${where} needs an "id" (text or a number).` })
      return
    }
    const label = raw.name ?? raw.label
    let nodeName = key
    if (label !== undefined && label !== null) {
      const text = idText(label)
      if (text === undefined) {
        fields.push({ message: `Node "${key}": name must be text.` })
      } else {
        nodeName = text
      }
    }
    nodeName = nodeName.trim()
    const node: ExchangeNode = {
      key,
      name: nodeName,
      role: raw.role,
      varType: raw.var_type,
      levels: raw.levels,
      description: raw.description,
      unit: raw.unit,
    }
    const pos = raw.pos
    if (pos !== undefined && pos !== null) {
      if (
        Array.isArray(pos) &&
        pos.length === 2 &&
        pos.every((v) => typeof v === 'number' && Number.isFinite(v))
      ) {
        node.centre = { x: pos[0] as number, y: pos[1] as number }
      } else {
        fields.push({
          message: `Node "${nodeName}": pos must be a list of two numbers, like [42, 42].`,
        })
      }
    }
    nodes.push(node)
  })

  const edges: ExchangeEdge[] = []
  rawEdges.forEach((raw: unknown, i) => {
    const where = `Edge ${i + 1} in the "${edgeKey}" list`
    if (!isObject(raw)) {
      structure.push({ message: `${where} is not an object.` })
      return
    }
    checkKeys(raw, EDGE_KEYS)
    const source = idText(raw.source)
    const target = idText(raw.target)
    if (source === undefined || target === undefined) {
      structure.push({
        message: `${where} needs a "source" and a "target" (text or a number).`,
      })
      return
    }
    edges.push({ source, target, evidence: raw.evidence, note: raw.note })
  })

  if (structure.length > 0) return { ok: false, errors: structure }
  const result = buildGraph({ name, nodes, edges }, warnings)
  if (fields.length === 0) return result
  return {
    ok: false,
    errors: [...fields, ...(result.ok ? [] : result.errors)],
  }
}
