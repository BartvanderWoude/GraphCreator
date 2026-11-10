import type { Graph } from '../graph'
import { findMinSep } from './adjustment'
import type { Independence, Roles } from './types'

/**
 * Conditional independencies implied by the graph (spec 4.13, phase 27). For every unordered pair
 * of observed, non-selected, non-adjacent nodes, one minimal separating set found with FindMinSep
 * (van der Zander, Liśkiewicz & Textor 2019), always conditioning on the selected nodes S.
 */
export function impliedIndependencies(
  graph: Graph,
  roles: Roles,
): Independence[] {
  const selected = new Set(roles.s)
  const candidates = roles.observed.filter((id) => !selected.has(id))
  const adjacent = new Set<string>()
  for (const e of graph.edges) {
    adjacent.add(`${e.source}\u0000${e.target}`)
    adjacent.add(`${e.target}\u0000${e.source}`)
  }
  const result: Independence[] = []
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      if (adjacent.has(`${a}\u0000${b}`)) continue
      const restrict = candidates.filter((id) => id !== a && id !== b)
      const sep = findMinSep(graph, [a], [b], roles.s, restrict)
      if (sep === null) continue
      result.push({ a, b, given: sep.filter((id) => !selected.has(id)) })
    }
  }
  return result
}
