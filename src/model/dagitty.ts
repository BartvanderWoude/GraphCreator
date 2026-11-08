import type { GNode, Graph } from './graph'
import type { Result } from './result'

/** dagitty `pos` units are multiplied by this to get canvas px. */
export const DAGITTY_SCALE = 100

/**
 * Parses dagitty text (spec 4.2) with an own tokenizer and recursive-descent parser.
 *
 * - Supports `dag [name] { … }` (header optional), vertex statements with attributes, chains
 *   (`a -> b -> c`), `<-` and groups (`{a b} -> c`); `bb="…"` is ignored.
 * - Roles `exposure`, `outcome`, `latent`, `adjusted`, `selected`; more than one role on a node
 *   is an error. `pos="x,y"` → `{ x: x * DAGITTY_SCALE, y: y * DAGITTY_SCALE }`. `label="…"` sets
 *   the name. Other attributes are ignored with one warning per key.
 * - Duplicate edges merge silently; self-edges and cycles are errors. `<->`, `--`, `@-`/`-@`/`o-`
 *   edges, graph types other than `dag` and unexpected tokens are rejected with a line-numbered
 *   error. Two ids with the same label are an error.
 * - If any node lacks `pos`, the whole graph is auto-laid out with the same warning as `parseYaml`;
 *   `validateGraph` warnings follow.
 */
export function parseDagitty(text: string): Result<Graph> {
  void text
  throw new Error('Not implemented yet (spec phase 5).')
}

/**
 * Writes plain dagitty (spec 4.2), without GraphCreator metadata or the graph name: `dag {`, one
 * vertex line per node (`id [role,label="…",pos="x,y"]`, role omitted for `other`, label only when
 * the name differs from the id, pos in px ÷ 100 with 3 decimals), one edge line per edge, `}`.
 */
export function toDagitty(graph: Graph): string {
  void graph
  throw new Error('Not implemented yet (spec phase 5).')
}

/**
 * Maps node id → dagitty id (spec 4.2): whitespace runs → `_`, then every character outside
 * `[0-9A-Za-z_.]` → `_`; empty → `node`. Assigned in node order; on collision `_2`, `_3`, … is
 * appended (the first keeps the plain id).
 */
export function toDagittyIds(nodes: GNode[]): Map<string, string> {
  void nodes
  throw new Error('Not implemented yet (spec phase 5).')
}
