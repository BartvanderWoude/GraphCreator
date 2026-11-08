import { parseDagitty } from './dagitty'
import type { Graph } from './graph'
import type { Result } from './result'
import { parseYaml } from './yaml'

/** The text formats GraphCreator opens (spec 4.1, 4.2). */
export type GraphFormat = 'yaml' | 'dagitty'

/** A top-level key of a GraphCreator file at the start of a line, e.g. `schema: …`. */
const YAML_KEY = /^(schema|name|nodes|edges)\s*:/m

/**
 * Recognises the format of a graph's text (spec 5.4 "Open"). A `.yaml`/`.yml` file name, or a
 * line starting with one of the file's top-level keys, means GraphCreator YAML; anything else is
 * read as dagitty, whose `dag { … }` header is optional and so cannot be required.
 */
export function detectFormat(text: string, fileName?: string): GraphFormat {
  if (fileName !== undefined && /\.ya?ml$/i.test(fileName)) return 'yaml'
  return YAML_KEY.test(text) ? 'yaml' : 'dagitty'
}

/** Parses GraphCreator YAML or dagitty text, whichever `detectFormat` recognises. */
export function parseGraphText(text: string, fileName?: string): Result<Graph> {
  return detectFormat(text, fileName) === 'yaml'
    ? parseYaml(text)
    : parseDagitty(text)
}
