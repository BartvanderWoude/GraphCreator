/** A problem found while parsing or validating. `message` is a complete sentence shown to the user verbatim. */
export interface Issue {
  message: string
  /** 1-based line number in the source text, when known. */
  line?: number
  /** Dotted path into the file structure, e.g. `nodes.2.var_type`. */
  path?: string
  /** Internal id of the node the issue is about (set on `validateGraph` node warnings), so the UI can select it. */
  nodeId?: string
  /** Internal id of the edge the issue is about (spec 4.16), so the UI can select it. */
  edgeId?: string
}

/** Outcome of every parser and every operation that can fail. */
export type Result<T> =
  { ok: true; value: T; warnings: Issue[] } | { ok: false; errors: Issue[] }
