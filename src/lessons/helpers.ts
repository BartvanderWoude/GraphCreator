import type { GEdge, GNode, Graph } from '@/model/graph'
import type { Role } from '@/model/schema'
import { parseYaml } from '@/model/yaml'
import type { LessonEventKind } from '@/store/lessonEvents'
import type { LessonContext, LessonStep } from './types'

/**
 * Helpers for lesson files: the notation for checks in docs/LESSONS.md (spec 5.7.10). Nodes are
 * found by name, so a node the user renamed no longer matches.
 */

/** Reads a practice graph's YAML text; throws when it does not parse. */
export function practiceGraph(yaml: string): Graph {
  const result = parseYaml(yaml)
  if (!result.ok) {
    throw new Error(
      `Practice graph does not parse: ${result.errors[0]?.message ?? 'unknown error'}`,
    )
  }
  return result.value
}

/** The node with this exact name. */
export function nodeNamed(graph: Graph, name: string): GNode | undefined {
  return graph.nodes.find((n) => n.name === name)
}

/** The edge from the node named `from` to the node named `to`. */
export function edgeNamed(
  graph: Graph,
  from: string,
  to: string,
): GEdge | undefined {
  const source = nodeNamed(graph, from)
  const target = nodeNamed(graph, to)
  if (!source || !target) return undefined
  return graph.edges.find(
    (e) => e.source === source.id && e.target === target.id,
  )
}

/** `role(N) = r`: node N exists and has role r. */
export function roleIs(ctx: LessonContext, name: string, role: Role): boolean {
  return nodeNamed(ctx.graph, name)?.role === role
}

/** `adjusted = {A, B}`: exactly these nodes have role `adjusted`. */
export function adjustedIs(ctx: LessonContext, names: string[]): boolean {
  const adjusted = new Set(
    ctx.graph.nodes.filter((n) => n.role === 'adjusted').map((n) => n.name),
  )
  const wanted = new Set(names)
  return (
    adjusted.size === wanted.size && [...wanted].every((n) => adjusted.has(n))
  )
}

/**
 * `event(kind)` / `event(kind, f1 | f2)`: an event of that kind, with one of `formats` when given,
 * was recorded since the step began.
 */
export function hasEvent(
  ctx: LessonContext,
  kind: LessonEventKind,
  formats?: string[],
): boolean {
  return ctx.events.some(
    (e) =>
      e.kind === kind &&
      (formats === undefined ||
        (e.format !== undefined && formats.includes(e.format))),
  )
}

/** The selected node's name; undefined when nothing or an edge is selected. */
export function selectedNodeName(ctx: LessonContext): string | undefined {
  const { selection } = ctx
  if (selection?.kind !== 'node') return undefined
  return ctx.graph.nodes.find((n) => n.id === selection.id)?.name
}

/** `selected edge(A, B)`: the selection is the edge from A to B. */
export function selectedEdgeIs(
  ctx: LessonContext,
  from: string,
  to: string,
): boolean {
  const { selection } = ctx
  if (selection?.kind !== 'edge') return false
  return edgeNamed(ctx.graph, from, to)?.id === selection.id
}

/**
 * Whether the step is done: its pick is answered (the selected node is one of the answers) when it
 * has one, and its check holds when it has one. A step with neither is done at once.
 */
export function stepDone(step: LessonStep, ctx: LessonContext): boolean {
  if (step.pick) {
    const name = selectedNodeName(ctx)
    if (name === undefined || !step.pick.answers.includes(name)) return false
  }
  return step.check ? step.check(ctx) : true
}
