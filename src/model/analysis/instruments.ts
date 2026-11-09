import type { Graph } from '../graph'
import type { Instrument, Roles } from './types'

/**
 * Conditional instrumental variables (spec 4.13, phase 28). Phase 24 stub: none, or
 * 'needs-single' unless there is exactly one exposure and one outcome.
 */
export function instrumentalVariables(
  _graph: Graph,
  roles: Roles,
): Instrument[] | 'needs-single' {
  if (roles.x.length !== 1 || roles.y.length !== 1) return 'needs-single'
  return []
}
