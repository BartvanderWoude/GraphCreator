import type { Graph } from '../graph'
import { adjustment } from './adjustment'
import { impliedIndependencies } from './independencies'
import { instrumentalVariables } from './instruments'
import { classifyPaths } from './paths'
import { rolesOf, type Analysis } from './types'

export * from './types'

/**
 * The whole analysis of `graph` (spec 4.13): roles, then the status. Without an exposure or an
 * outcome only the roles and the independencies are filled.
 */
export function analyze(graph: Graph): Analysis {
  const roles = rolesOf(graph)
  const independencies = impliedIndependencies(graph, roles)
  if (roles.x.length === 0 || roles.y.length === 0) {
    return {
      status: 'no-exposure-or-outcome',
      roles,
      adjustment: null,
      paths: null,
      independencies,
      instruments: 'needs-single',
    }
  }
  return {
    status: 'ok',
    roles,
    adjustment: adjustment(graph, roles),
    paths: classifyPaths(graph, roles),
    independencies,
    instruments: instrumentalVariables(graph, roles),
  }
}
