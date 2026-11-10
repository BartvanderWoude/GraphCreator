import type { Graph } from '../graph'

/**
 * Types of the causal analysis (spec 4.13). Every function takes and returns node ids; sets are
 * sorted in graph order (the order of `graph.nodes`) and hold no duplicates.
 */

/** Node ids, graph order, no duplicates. */
export type NodeSet = string[]

/** The analysis roles of a graph's nodes (spec 4.13 role table), each in graph order. */
export interface Roles {
  /** Exposures. */
  x: NodeSet
  /** Outcomes. */
  y: NodeSet
  /**
   * Selected nodes: the data exist only for S = 1. Always conditioned on, never listed inside a
   * set; sets are judged by the selection criterion.
   */
  s: NodeSet
  /** Adjusted nodes: the user's own adjustment set. */
  z: NodeSet
  latent: NodeSet
  /** Every node that is not latent. */
  observed: NodeSet
}

/** The roles of `graph`'s nodes; observed = every non-latent node; all in graph order. */
export function rolesOf(graph: Graph): Roles {
  const roles: Roles = { x: [], y: [], s: [], z: [], latent: [], observed: [] }
  for (const node of graph.nodes) {
    if (node.role === 'latent') roles.latent.push(node.id)
    else roles.observed.push(node.id)
    if (node.role === 'exposure') roles.x.push(node.id)
    else if (node.role === 'outcome') roles.y.push(node.id)
    else if (node.role === 'selected') roles.s.push(node.id)
    else if (node.role === 'adjusted') roles.z.push(node.id)
  }
  return roles
}

export interface AdjustmentResult {
  /** Minimal sufficient adjustment sets, S excluded; [] = none exists; [[]] = the empty set suffices. */
  sets: NodeSet[]
  /** True when more than MAX_SETS exist; `sets` holds the first MAX_SETS. */
  truncated: boolean
  /** Z satisfies the adjustment criterion (with S: the selection criterion). */
  zSufficient: boolean
  /** Members of Z that lie on or after a proper causal path (Forb(X, Y)), for the report. */
  zForbidden: NodeSet
  /**
   * S is not empty and condition (c) or (d) of the selection criterion fails: no set can work.
   */
  selectionBias: boolean
}

export type PathKind = 'causal' | 'biasing'

/** A path from an exposure to an outcome; `nodes` runs from the exposure end. */
export interface PathInfo {
  nodes: string[]
  kind: PathKind
  open: boolean
}

export interface PathsResult {
  /** Sorted: causal before biasing, then by length, then by the names along the path. */
  paths: PathInfo[]
  /** More than PATH_LIMIT paths exist; `paths` is then empty and nothing is highlighted. */
  truncated: boolean
  /** Edge ids on at least one open causal path (and on no open biasing path). */
  causalEdges: string[]
  /** Edge ids on at least one open biasing path. */
  biasingEdges: string[]
}

/** `a` is independent of `b` given `given`; `a` comes before `b` in graph order. */
export interface Independence {
  a: string
  b: string
  given: NodeSet
}

export interface Instrument {
  instrument: string
  given: NodeSet
}

export type AnalysisStatus = 'ok' | 'no-exposure-or-outcome'

export interface Analysis {
  /** 'no-exposure-or-outcome' when X or Y is empty; then only roles and independencies are filled. */
  status: AnalysisStatus
  roles: Roles
  adjustment: AdjustmentResult | null
  paths: PathsResult | null
  /** Does not need X or Y. */
  independencies: Independence[]
  /** 'needs-single' unless |X| = |Y| = 1. */
  instruments: Instrument[] | 'needs-single'
}

/** Most adjustment sets listed. */
export const MAX_SETS = 100
/** Most paths enumerated before giving up. */
export const PATH_LIMIT = 500
