import type { Graph } from './graph'
import type { Result } from './result'

/** Writes networkx JSON (spec 4.15). Stub until phase 35. */
export function toNetworkx(graph: Graph): string {
  void graph
  return ''
}

/** Reads networkx JSON (spec 4.15). Stub until phase 35. */
export function parseNetworkx(text: string): Result<Graph> {
  void text
  return {
    ok: false,
    errors: [{ message: 'networkx JSON files cannot be opened yet.' }],
  }
}
