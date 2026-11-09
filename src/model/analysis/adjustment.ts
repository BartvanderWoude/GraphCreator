import type { Graph } from '../graph'
import type { AdjustmentResult, NodeSet, Roles } from './types'

/**
 * Adjustment sets (spec 4.13, phase 25). Phase 24 stub: the final signatures with empty results,
 * so the app works until phase 25 writes the algorithms.
 */

const NOT_IMPLEMENTED = 'Not implemented'

/** PCP(X, Y): the nodes on proper causal paths from X to Y, X excluded. */
export function properCausalNodes(
  _graph: Graph,
  _xs: NodeSet,
  _ys: NodeSet,
): Set<string> {
  throw new Error(NOT_IMPLEMENTED)
}

/** Forb(X, Y) = descendants(PCP(X, Y)) ∪ X. */
export function forbidden(
  _graph: Graph,
  _xs: NodeSet,
  _ys: NodeSet,
): Set<string> {
  throw new Error(NOT_IMPLEMENTED)
}

/** The proper back-door graph: without every edge x → w with x ∈ X and w ∈ PCP(X, Y). */
export function properBackdoorGraph(
  _graph: Graph,
  _xs: NodeSet,
  _ys: NodeSet,
): Graph {
  throw new Error(NOT_IMPLEMENTED)
}

/**
 * Whether `zs` is sufficient for (X, Y): the adjustment criterion, or with a non-empty `s` the
 * selection criterion.
 */
export function isAdjustmentSet(
  _graph: Graph,
  _xs: NodeSet,
  _ys: NodeSet,
  _zs: NodeSet,
  _s: NodeSet = [],
): boolean {
  throw new Error(NOT_IMPLEMENTED)
}

/** The minimal sufficient sets W ⊆ R (S excluded), at most MAX_SETS. */
export function minimalAdjustmentSets(
  _graph: Graph,
  _roles: Roles,
): { sets: NodeSet[]; truncated: boolean } {
  return { sets: [], truncated: false }
}

/** Minimal sets and the check of the user's own set Z. */
export function adjustment(_graph: Graph, _roles: Roles): AdjustmentResult {
  return {
    sets: [],
    truncated: false,
    zSufficient: false,
    zForbidden: [],
    selectionBias: false,
  }
}
