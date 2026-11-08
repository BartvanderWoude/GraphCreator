import { findCycle } from './cycle'
import type { Graph } from './graph'
import type { Issue } from './result'
import { isLeveledType, isNumericType } from './schema'

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

    if (node.varType === undefined) {
      warnings.push({ message: `Node "${name}" has no variable type.` })
    } else if (isLeveledType(node.varType)) {
      const levels = node.levels ?? []
      if (levels.length < 2) {
        warnings.push({
          message: `Node "${name}" is ${node.varType} but has fewer than two levels.`,
        })
      }
      const dupes = [
        ...new Set(levels.filter((l, i) => levels.indexOf(l) !== i)),
      ]
      if (dupes.length > 0) {
        warnings.push({
          message: `Node "${name}" has duplicate levels (${dupes.map((d) => `"${d}"`).join(', ')}).`,
        })
      }
    }
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
