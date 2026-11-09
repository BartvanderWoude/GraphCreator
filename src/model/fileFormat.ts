import { toBnlearn } from './bnlearn'
import { parseDagitty, toDagitty } from './dagitty'
import { parseDot, toDot } from './dot'
import { parseGml, toGml } from './gml'
import type { Graph } from './graph'
import { toMermaid } from './mermaid'
import { parseNetworkx, toNetworkx } from './networkx'
import type { Result } from './result'
import { toTetrad } from './tetrad'
import { fileSlug, parseYaml, toYaml } from './yaml'

/** The text formats GraphCreator opens (spec 4.1, 4.2, 4.15). */
export type GraphFormat = 'yaml' | 'dagitty' | 'gml' | 'dot' | 'networkx'
/** The text formats Save as… writes (spec 4.15). */
export type ExportFormat = GraphFormat | 'bnlearn' | 'tetrad' | 'mermaid'

/** Save as… menu order. */
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  'yaml',
  'dagitty',
  'gml',
  'dot',
  'networkx',
  'bnlearn',
  'tetrad',
  'mermaid',
]

/** Display label, file extension and MIME type of each format (spec 4.15). */
export const EXPORT_FILES: Record<
  ExportFormat,
  { label: string; extension: string; mime: string }
> = {
  yaml: {
    label: 'GraphCreator',
    extension: '.dag.yaml',
    mime: 'application/yaml',
  },
  dagitty: { label: 'dagitty', extension: '.dagitty.txt', mime: 'text/plain' },
  gml: { label: 'GML', extension: '.gml', mime: 'text/plain' },
  dot: { label: 'DOT', extension: '.dot', mime: 'text/vnd.graphviz' },
  networkx: {
    label: 'networkx JSON',
    extension: '.json',
    mime: 'application/json',
  },
  bnlearn: { label: 'bnlearn', extension: '.bnlearn.txt', mime: 'text/plain' },
  tetrad: { label: 'Tetrad', extension: '.tetrad.txt', mime: 'text/plain' },
  mermaid: { label: 'Mermaid', extension: '.mmd', mime: 'text/plain' },
}

/** The graph as text in `format`. `details` applies to dagitty only (spec 4.2). */
export function exportText(
  graph: Graph,
  format: ExportFormat,
  opts: { details?: boolean } = {},
): string {
  switch (format) {
    case 'yaml':
      return toYaml(graph)
    case 'dagitty':
      return toDagitty(graph, { details: opts.details ?? false })
    case 'gml':
      return toGml(graph)
    case 'dot':
      return toDot(graph)
    case 'networkx':
      return toNetworkx(graph)
    case 'bnlearn':
      return toBnlearn(graph)
    case 'tetrad':
      return toTetrad(graph)
    case 'mermaid':
      return toMermaid(graph)
  }
}

/** The download's file name: `<slug><extension>`, e.g. `smoking-and-birth-weight.gml`. */
export function exportFileName(
  graphName: string | undefined,
  format: ExportFormat,
): string {
  return `${fileSlug(graphName)}${EXPORT_FILES[format].extension}`
}

/** A top-level key of a GraphCreator file at the start of a line, e.g. `schema: …`. */
const YAML_KEY = /^(schema|name|nodes|edges)\s*:/m

/** True for text that parses as a JSON object with a `nodes` array. */
function isNetworkxJson(text: string): boolean {
  if (!text.trimStart().startsWith('{')) return false
  try {
    const data: unknown = JSON.parse(text)
    return (
      typeof data === 'object' &&
      data !== null &&
      Array.isArray((data as { nodes?: unknown }).nodes)
    )
  } catch {
    return false
  }
}

/** The text after leading blank lines and `#` comment lines. */
function withoutHashComments(text: string): string {
  return text.replace(/^(?:[ \t]*(?:#[^\n]*)?(?:\r?\n|$))*/, '')
}

/** The text after leading whitespace and `//`, `/* … *\/` and `#` comments (DOT's). */
function withoutDotComments(text: string): string {
  let rest = text
  for (;;) {
    const next = rest
      .replace(/^\s+/, '')
      .replace(/^\/\/[^\n]*/, '')
      .replace(/^\/\*[\s\S]*?\*\//, '')
      .replace(/^#[^\n]*/, '')
    if (next === rest) return rest
    rest = next
  }
}

/**
 * Recognises the format of a graph's text (spec 4.15 "Detection"): the file name first
 * (`.yaml`/`.yml`, `.gml`, `.dot`/`.gv`, `.json`), then networkx JSON, GML (`graph [`), DOT
 * (`digraph`), GraphCreator YAML (a top-level key at the start of a line), and otherwise dagitty,
 * whose `dag { … }` header is optional and so cannot be required.
 */
export function detectFormat(text: string, fileName?: string): GraphFormat {
  if (fileName !== undefined) {
    if (/\.ya?ml$/i.test(fileName)) return 'yaml'
    if (/\.gml$/i.test(fileName)) return 'gml'
    if (/\.(dot|gv)$/i.test(fileName)) return 'dot'
    if (/\.json$/i.test(fileName)) return 'networkx'
  }
  if (isNetworkxJson(text)) return 'networkx'
  if (/^\s*graph\s*\[/.test(withoutHashComments(text))) return 'gml'
  if (/^(strict\s+)?digraph\b/i.test(withoutDotComments(text))) return 'dot'
  return YAML_KEY.test(text) ? 'yaml' : 'dagitty'
}

/** Parses the text with the parser for whichever format `detectFormat` recognises. */
export function parseGraphText(text: string, fileName?: string): Result<Graph> {
  switch (detectFormat(text, fileName)) {
    case 'yaml':
      return parseYaml(text)
    case 'dagitty':
      return parseDagitty(text)
    case 'gml':
      return parseGml(text)
    case 'dot':
      return parseDot(text)
    case 'networkx':
      return parseNetworkx(text)
  }
}
