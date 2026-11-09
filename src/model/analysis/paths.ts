import type { Graph } from '../graph'
import type { PathsResult, Roles } from './types'

/**
 * Paths between the exposures and the outcomes (spec 4.13, phase 26). Phase 24 stub: no paths.
 */
export function classifyPaths(_graph: Graph, _roles: Roles): PathsResult {
  return { paths: [], truncated: false, causalEdges: [], biasingEdges: [] }
}
