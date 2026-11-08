import type { Graph } from './graph'
import type { Result } from './result'

/**
 * Parses a GraphCreator YAML file (spec 4.1).
 *
 * 1. Parses with `yaml`'s `parseDocument`; syntax errors become issues with a 1-based `line`.
 * 2. Checks the `schema` line: missing → `This file has no "schema" line, so it is not a
 *    GraphCreator file.`; unknown → `This file uses format "<value>", which this version of
 *    GraphCreator cannot read.`
 * 3. Validates with `GraphFileSchema`; Zod issues get a dotted `path` and name the node where possible.
 * 4. Semantic checks, all collected: empty or duplicate names, `from`/`to` naming no node,
 *    self-edges, duplicate edges, misplaced `levels`/`unit`, a directed cycle.
 * 5. Any errors → `{ ok: false, errors }`; nothing is loaded.
 * 6. Builds the graph with fresh internal ids. If any node lacks `pos`, the whole graph is
 *    auto-laid out with the warning `Some nodes had no position, so the graph was laid out automatically.`
 * 7. Adds the `validateGraph` warnings.
 */
export function parseYaml(text: string): Result<Graph> {
  void text
  throw new Error('Not implemented yet (spec phase 4).')
}

/**
 * Writes a graph as canonical GraphCreator YAML (spec 4.1): keys in table order, undefined,
 * default and empty fields omitted, flow style for `levels`, `pos` and `evidence`, positions
 * rounded to integers, trailing newline. For a canonical file `toYaml(parseYaml(text).value) === text`.
 */
export function toYaml(graph: Graph): string {
  void graph
  throw new Error('Not implemented yet (spec phase 4).')
}

/**
 * File name stem for a graph name (spec 4.1): lower-cased, runs of characters outside `[a-z0-9]`
 * replaced by `-`, leading/trailing `-` trimmed; empty → `graph`. E.g. `"Smoking & BW"` → `smoking-bw`.
 * The file is saved as `<slug>.dag.yaml`.
 */
export function fileSlug(name?: string): string {
  void name
  throw new Error('Not implemented yet (spec phase 4).')
}
