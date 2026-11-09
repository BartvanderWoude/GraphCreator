import type { Graph } from './graph'
import type { Result } from './result'

/** Writes GML (spec 4.15). Stub until phase 33. */
export function toGml(graph: Graph): string {
  void graph
  return ''
}

/** Reads GML (spec 4.15). Stub until phase 33. */
export function parseGml(text: string): Result<Graph> {
  void text
  return {
    ok: false,
    errors: [{ message: 'GML files cannot be opened yet.' }],
  }
}
