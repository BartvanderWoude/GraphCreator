import type { Graph } from './graph'
import type { Result } from './result'

/** Writes DOT (spec 4.15). Stub until phase 34. */
export function toDot(graph: Graph): string {
  void graph
  return ''
}

/** Reads DOT (spec 4.15). Stub until phase 34. */
export function parseDot(text: string): Result<Graph> {
  void text
  return {
    ok: false,
    errors: [{ message: 'DOT files cannot be opened yet.' }],
  }
}
