import { findCycle } from './cycle'
import type { GEdge, GNode, Graph } from './graph'
import type { Issue } from './result'
import { isLeveledType, isNumericType } from './schema'
import { sharesTotal, signLevelsNode, signShape } from './simulation'

/**
 * Checks a whole graph. Errors are invalid states (what `parseYaml` rejects); warnings are
 * non-blocking hints shown in the UI. All problems are collected, not just the first.
 */
export function validateGraph(graph: Graph): {
  errors: Issue[]
  warnings: Issue[]
} {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))

  const seenNames = new Set<string>()
  const reportedNames = new Set<string>()
  for (const node of graph.nodes) {
    const name = node.name.trim()
    if (name === '') {
      errors.push({ message: 'A node has no name.' })
    } else if (seenNames.has(name)) {
      if (!reportedNames.has(name)) {
        errors.push({ message: `Node name "${name}" is used more than once.` })
        reportedNames.add(name)
      }
    }
    seenNames.add(name)

    if (node.levels !== undefined && !isLeveledType(node.varType)) {
      errors.push({
        message: `Node "${name}" has levels, but only categorical and ordinal variables can have levels.`,
      })
    }
    if (node.unit !== undefined && !isNumericType(node.varType)) {
      errors.push({
        message: `Node "${name}" has a unit, but only continuous and discrete variables can have a unit.`,
      })
    }
    errors.push(...shareErrors(node, name))

    if (node.varType === undefined) {
      warnings.push({
        message: `Node "${name}" has no variable type.`,
        nodeId: node.id,
      })
    } else if (isLeveledType(node.varType)) {
      const levels = node.levels ?? []
      if (levels.length < 2) {
        warnings.push({
          message: `Node "${name}" is ${node.varType} but has fewer than two levels.`,
          nodeId: node.id,
        })
      }
      const dupes = [
        ...new Set(levels.filter((l, i) => levels.indexOf(l) !== i)),
      ]
      if (dupes.length > 0) {
        warnings.push({
          message: `Node "${name}" has duplicate levels (${dupes.map((d) => `"${d}"`).join(', ')}).`,
          nodeId: node.id,
        })
      }
    }
  }

  // Simulation details (spec 4.16): node warnings after the existing ones, then edge warnings.
  for (const node of graph.nodes) {
    warnings.push(...nodeDetailWarnings(graph, node))
  }

  const seenEdges = new Set<string>()
  let danglingEdges = false
  for (const edge of graph.edges) {
    const from = byId.get(edge.source)
    const to = byId.get(edge.target)
    if (!from || !to) {
      danglingEdges = true
      continue
    }
    if (edge.source === edge.target) {
      errors.push({ message: `Node "${from.name}" points to itself.` })
      continue
    }
    const key = `${edge.source}\u0000${edge.target}`
    if (seenEdges.has(key)) {
      errors.push({
        message: `The edge from "${from.name}" to "${to.name}" appears more than once.`,
      })
    }
    seenEdges.add(key)
  }
  for (const edge of graph.edges) {
    warnings.push(...signWarnings(graph, edge))
  }
  if (danglingEdges) {
    errors.push({ message: 'An edge refers to a node that does not exist.' })
  }

  // Self-edges are reported above; look for longer cycles without them.
  const cycle = findCycle({
    ...graph,
    edges: graph.edges.filter(
      (e) => e.source !== e.target && byId.has(e.source) && byId.has(e.target),
    ),
  })
  if (cycle) {
    const names = cycle.map((id) => byId.get(id)!.name)
    errors.push({ message: `The graph has a cycle: ${names.join(' → ')}.` })
  }

  return { errors, warnings }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The simulation-detail errors of one node (spec 4.16 "Validation"): shares that cannot be read. */
function shareErrors(node: GNode, name: string): Issue[] {
  const shares = node.shares
  if (shares === undefined) return []
  const errors: Issue[] = []
  const levels = node.levels ?? []
  if (!isLeveledType(node.varType) || levels.length === 0) {
    errors.push({
      message: `Node "${name}" has shares, but only categorical and ordinal variables with levels can have shares.`,
    })
  } else if (shares.length !== levels.length) {
    errors.push({
      message: `Node "${name}" has ${plural(shares.length, 'share')} for ${plural(levels.length, 'level')}.`,
    })
  }
  if (shares.some((s) => !Number.isFinite(s) || s < 0)) {
    errors.push({ message: `Node "${name}" has a negative share.` })
  }
  return errors
}

/** A proportion as a percentage rounded to one decimal, without trailing zeros: `90%`, `99.5%`. */
function percent(total: number): string {
  const rounded = Math.round(total * 1000) / 10
  return `${rounded === 0 ? 0 : rounded}%`
}

/** The simulation-detail warnings of one node: shares that do not add up to 1, a form without causes. */
function nodeDetailWarnings(graph: Graph, node: GNode): Issue[] {
  const warnings: Issue[] = []
  const name = node.name.trim()
  const shares = node.shares
  // Non-finite shares are an error already; their total means nothing.
  if (shares !== undefined && shares.every((s) => Number.isFinite(s))) {
    const total = sharesTotal(shares)
    if (Math.abs(total - 1) > 0.001) {
      warnings.push({
        message: `The shares of "${name}" add up to ${percent(total)}, not 100%.`,
        nodeId: node.id,
      })
    }
  }
  if (node.form !== undefined) {
    const ids = new Set(graph.nodes.map((n) => n.id))
    const hasCause = graph.edges.some(
      (e) => e.target === node.id && e.source !== node.id && ids.has(e.source),
    )
    if (!hasCause) {
      warnings.push({
        message: `Node "${name}" has a functional form but no causes.`,
        nodeId: node.id,
      })
    }
  }
  return warnings
}

/** The sign warnings of one edge: a sign that does not fit the shape of the edge (spec 4.16). */
function signWarnings(graph: Graph, edge: GEdge): Issue[] {
  const sign = edge.sign
  if (sign === undefined) return []
  const from = graph.nodes.find((n) => n.id === edge.source)
  const to = graph.nodes.find((n) => n.id === edge.target)
  // Dangling edges and self-edges are errors already.
  if (!from || !to || from === to) return []
  const prefix = `The edge from "${from.name}" to "${to.name}"`
  const warn = (text: string): Issue => ({
    message: `${prefix} ${text}`,
    edgeId: edge.id,
  })

  const shape = signShape(graph, edge)
  if (shape === 'none') {
    return [
      warn(
        `has a sign, but "${from.name}" and "${to.name}" are both categorical with more than two levels, so a sign has no clear meaning.`,
      ),
    ]
  }
  if (shape === 'single') {
    if (typeof sign === 'string') return []
    return [
      warn(
        `has a sign per level, but neither "${from.name}" nor "${to.name}" is categorical with more than two levels. Give one sign instead.`,
      ),
    ]
  }

  // A level shape: the sign should be a map keyed by the levels of the nominal end.
  const levelsNode = signLevelsNode(graph, edge)!
  const levels = levelsNode.levels ?? []
  if (typeof sign === 'string') {
    return [
      warn(
        `has one sign, but "${levelsNode.name}" is categorical with more than two levels. Give a sign per level instead.`,
      ),
    ]
  }
  const warnings: Issue[] = []
  const entries = Object.entries(sign)
  for (const [key] of entries) {
    if (!levels.includes(key)) {
      warnings.push(
        warn(
          `has a sign for level "${key}", but "${levelsNode.name}" has no such level.`,
        ),
      )
    }
  }
  const reference = levels[0]
  if (shape === 'parent-levels' && entries.some(([key]) => key === reference)) {
    warnings.push(
      warn(
        `has a sign for "${reference}", but "${reference}" is the reference level of "${levelsNode.name}" and cannot have a sign.`,
      ),
    )
  }
  if (shape === 'child-levels') {
    const values = new Map(entries)
    const levelSigns = new Set(levels.map((level) => values.get(level)))
    if (levelSigns.size === 1 && !levelSigns.has(undefined)) {
      const [more, less] = levelSigns.has('positive')
        ? ['more', 'less']
        : ['less', 'more']
      warnings.push(
        warn(
          `makes every level of "${levelsNode.name}" ${more} likely, but their chances add up to 100%, so at least one must become ${less} likely.`,
        ),
      )
    }
  }
  return warnings
}
