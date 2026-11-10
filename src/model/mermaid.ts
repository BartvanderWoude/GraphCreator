import type { Graph } from './graph'
import { EXPORT_PALETTES } from './palette'
import { ROLES } from './schema'

/** Mermaid's entity codes. `#` goes first, so the codes themselves are not escaped again. */
function escapeName(name: string): string {
  return name
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
}

/**
 * Writes a Mermaid flowchart (spec 4.15): a `%% <name>` comment when the graph has a name,
 * `flowchart TB`, one circle node `v<i>` per node and one `-->` per edge in graph order, then a
 * `classDef` line and a `class` line per role in use, in `ROLES` order, with the colours of
 * `EXPORT_PALETTES.light`. The output ends with a newline; edges whose endpoints are missing are
 * skipped. Line breaks in the graph name become spaces, so the comment stays one line.
 */
export function toMermaid(graph: Graph): string {
  const lines: string[] = []
  if (graph.name !== undefined)
    lines.push(`%% ${graph.name.replace(/\s*[\r\n]+\s*/g, ' ')}`)
  lines.push('flowchart TB')
  const ids = new Map<string, string>()
  graph.nodes.forEach((node, i) => {
    const id = `v${i + 1}`
    ids.set(node.id, id)
    lines.push(`  ${id}(("${escapeName(node.name)}"))`)
  })
  for (const edge of graph.edges) {
    const source = ids.get(edge.source)
    const target = ids.get(edge.target)
    if (source === undefined || target === undefined) continue
    lines.push(`  ${source} --> ${target}`)
  }
  const used = ROLES.map((role) => ({
    role,
    members: graph.nodes
      .filter((n) => n.role === role)
      .map((n) => ids.get(n.id)),
  })).filter(({ members }) => members.length > 0)
  for (const { role } of used) {
    const { fill, line, text } = EXPORT_PALETTES.light.roles[role]
    lines.push(`  classDef ${role} fill:${fill},stroke:${line},color:${text}`)
  }
  for (const { role, members } of used)
    lines.push(`  class ${members.join(',')} ${role}`)
  return `${lines.join('\n')}\n`
}
