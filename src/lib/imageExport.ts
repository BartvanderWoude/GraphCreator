/**
 * Image export (spec 4.11, phase 22): SVG, PNG and TikZ drawn from the graph data with the
 * canvas geometry, not captured from the DOM, so the result does not depend on zoom, selection
 * or theme. Everything but `svgToPng` is pure.
 */
import { edgeEndpoints, type Circle } from '@/lib/geometry'
import type { GNode, Graph } from '@/model/graph'
import { nodeDiameter, wrapLabel } from '@/model/nodeSize'
import { EXPORT_PALETTES, type ImageTheme } from '@/model/palette'
import { ROLES } from '@/model/schema'
import { fileSlug } from '@/model/yaml'

export { EXPORT_PALETTES, type ImageTheme }

export type ImageFormat = 'svg' | 'png' | 'pdf' | 'tikz'

/**
 * Picture options (spec 4.11 "PDF, legend and dark theme"). Defaults: light, no legend. Accepted
 * and ignored until phase 37 draws them.
 */
export interface ImageOptions {
  theme?: ImageTheme
  legend?: boolean
}

/** The light theme's colours (4.11 "Palette"); the theme option is drawn from phase 37. */
const PALETTE = EXPORT_PALETTES.light

/** Space around the nodes' bounding box, in px. */
export const EXPORT_MARGIN = 24

/** Circle outline, edge stroke and arrowhead, as on the canvas (5.7.7, `FloatingEdge`). */
const OUTLINE_WIDTH = 2
const EDGE_WIDTH = 1.5
const EDGE_GAP = 2
const ARROW_LENGTH = 9
const ARROW_WIDTH = 9
/** How far the line runs into the arrowhead, so no seam shows between them. */
const ARROW_OVERLAP = 1
/** Node text (5.7.3): 13 px, weight 500, 16 px line pitch. */
const FONT_SIZE = 13
const LINE_PITCH = 16
/**
 * Baseline below the middle of a 16 px line box for 13 px IBM Plex Sans (ascent 1.025 em,
 * descent 0.275 em), so the SVG text sits where the canvas's CSS puts it.
 */
const BASELINE_OFFSET = 4.875
const FONT_FAMILY = "'IBM Plex Sans', system-ui, sans-serif"

/** A number for SVG or TikZ: at most two decimals, no trailing zeros, never `-0`. */
function num(n: number): string {
  const r = Math.round(n * 100) / 100
  return String(r === 0 ? 0 : r)
}

function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  )
}

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '%': '\\%',
}

function escapeLatex(text: string): string {
  return text.replace(/[\\{}$&#^_~%]/g, (c) => LATEX_ESCAPES[c])
}

/** The circle a node occupies on the canvas: centred on `pos + d/2`, radius `d/2`. */
function circleOf(node: GNode): Circle {
  const d = nodeDiameter(node.name)
  return { cx: node.pos.x + d / 2, cy: node.pos.y + d / 2, r: d / 2 }
}

/** The nodes' bounding box, or null for a graph without nodes. */
function bounds(graph: Graph) {
  if (graph.nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of graph.nodes) {
    const d = nodeDiameter(node.name)
    minX = Math.min(minX, node.pos.x)
    minY = Math.min(minY, node.pos.y)
    maxX = Math.max(maxX, node.pos.x + d)
    maxY = Math.max(maxY, node.pos.y + d)
  }
  return { minX, minY, maxX, maxY }
}

/** Width and height of the image: the bounding box plus the margin on each side, rounded up. */
export function svgSize(
  graph: Graph,
  opts: ImageOptions = {},
): { width: number; height: number } {
  void opts
  const b = bounds(graph)
  if (!b) return { width: 2 * EXPORT_MARGIN, height: 2 * EXPORT_MARGIN }
  return {
    width: Math.ceil(b.maxX - b.minX + 2 * EXPORT_MARGIN),
    height: Math.ceil(b.maxY - b.minY + 2 * EXPORT_MARGIN),
  }
}

/** The edge as a line plus a closed arrowhead whose tip is the end point; null without direction. */
function svgEdge(
  source: Circle,
  target: Circle,
  ox: number,
  oy: number,
): string | null {
  const ends = edgeEndpoints(source, target, EDGE_GAP)
  if (!ends) return null
  const sx = ends.sx - ox
  const sy = ends.sy - oy
  const tx = ends.tx - ox
  const ty = ends.ty - oy
  const length = Math.hypot(tx - sx, ty - sy)
  const ux = length > 0 ? (tx - sx) / length : 0
  const uy = length > 0 ? (ty - sy) / length : 0
  const back = Math.min(ARROW_LENGTH - ARROW_OVERLAP, length)
  // Base of the arrowhead, and the perpendicular half-width.
  const bx = tx - ARROW_LENGTH * ux
  const by = ty - ARROW_LENGTH * uy
  const px = (-uy * ARROW_WIDTH) / 2
  const py = (ux * ARROW_WIDTH) / 2
  const line = `<line x1="${num(sx)}" y1="${num(sy)}" x2="${num(tx - back * ux)}" y2="${num(ty - back * uy)}" stroke="${PALETTE.edge}" stroke-width="${EDGE_WIDTH}"/>`
  const head = `<path d="M${num(tx)},${num(ty)} L${num(bx + px)},${num(by + py)} L${num(bx - px)},${num(by - py)} Z" fill="${PALETTE.edge}"/>`
  return `${line}\n${head}`
}

/**
 * The graph as a standalone SVG document. With `fontDataUrl` (a data URL of IBM Plex Sans 500),
 * the font is embedded, so the image looks like the canvas where the font is not installed.
 */
export function toSvg(
  graph: Graph,
  opts: ImageOptions & { fontDataUrl?: string } = {},
): string {
  const { width, height } = svgSize(graph)
  const b = bounds(graph)
  const ox = (b?.minX ?? 0) - EXPORT_MARGIN
  const oy = (b?.minY ?? 0) - EXPORT_MARGIN
  const circles = new Map(graph.nodes.map((n) => [n.id, circleOf(n)]))

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(graph.name ?? 'Graph')}</title>`,
  ]
  if (opts.fontDataUrl) {
    out.push(
      `<style>@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:500;src:url(${opts.fontDataUrl}) format('woff2');}</style>`,
    )
  }
  out.push(
    `<rect width="${width}" height="${height}" fill="${PALETTE.background}"/>`,
  )

  for (const edge of graph.edges) {
    const s = circles.get(edge.source)
    const t = circles.get(edge.target)
    const drawn = s && t ? svgEdge(s, t, ox, oy) : null
    if (drawn) out.push(drawn)
  }

  out.push(
    `<g font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}" font-weight="500" text-anchor="middle">`,
  )
  for (const node of graph.nodes) {
    const c = circles.get(node.id)!
    const colors = PALETTE.roles[node.role]
    const cx = c.cx - ox
    const cy = c.cy - oy
    out.push(
      `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(c.r - OUTLINE_WIDTH / 2)}" fill="${colors.fill}" stroke="${colors.line}" stroke-width="${OUTLINE_WIDTH}"/>`,
    )
    const lines = wrapLabel(node.name).lines
    lines.forEach((line, i) => {
      const middle = cy + (i - (lines.length - 1) / 2) * LINE_PITCH
      out.push(
        `<text x="${num(cx)}" y="${num(middle + BASELINE_OFFSET)}" fill="${colors.text}">${escapeXml(line)}</text>`,
      )
    })
  }
  out.push('</g>', '</svg>')
  return out.join('\n') + '\n'
}

/**
 * Renders `svg` (as made by `toSvg`) to a PNG of `width × scale` by `height × scale` pixels.
 * The only function here that needs the DOM.
 */
export function svgToPng(svg: string, scale: 1 | 2 | 3): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Could not create the PNG image.'))
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const image = new Image()
    image.onerror = () => {
      URL.revokeObjectURL(url)
      fail()
    }
    image.onload = () => {
      URL.revokeObjectURL(url)
      const attr = (name: string) =>
        Number(new RegExp(`<svg[^>]*\\s${name}="([\\d.]+)"`).exec(svg)?.[1])
      const width = attr('width') || image.naturalWidth
      const height = attr('height') || image.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const context = canvas.getContext('2d')
      if (!context || canvas.width === 0 || canvas.height === 0) return fail()
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : fail()), 'image/png')
    }
    image.src = url
  })
}

/** `exposure` → `Exposure`, for the colour names `gcExposureFill` and so on. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** `#e3f1e8` → `E3F1E8`, for xcolor's HTML model. */
function htmlColor(hex: string): string {
  return hex.slice(1).toUpperCase()
}

/**
 * The graph as a TikZ picture for a LaTeX document with `tikz` and `arrows.meta`. Coordinates
 * are canvas pixels (`x=0.75pt, y=-0.75pt`: 96 px per inch, y down); TikZ finds the rims itself.
 */
export function toTikz(graph: Graph, opts: { legend?: boolean } = {}): string {
  void opts
  const title = (graph.name ?? 'Graph').replace(/\s+/g, ' ')
  const out: string[] = [
    `% GraphCreator export: ${title}`,
    '% Needs \\usepackage{tikz} and \\usetikzlibrary{arrows.meta}',
  ]
  const used = new Set(graph.nodes.map((n) => n.role))
  for (const role of ROLES) {
    if (!used.has(role)) continue
    const colors = PALETTE.roles[role]
    const name = `gc${capitalize(role)}`
    out.push(
      `\\definecolor{${name}Fill}{HTML}{${htmlColor(colors.fill)}}`,
      `\\definecolor{${name}Line}{HTML}{${htmlColor(colors.line)}}`,
      `\\definecolor{${name}Text}{HTML}{${htmlColor(colors.text)}}`,
    )
  }
  if (graph.edges.length > 0) {
    out.push(`\\definecolor{gcEdge}{HTML}{${htmlColor(PALETTE.edge)}}`)
  }
  out.push('\\begin{tikzpicture}[x=0.75pt, y=-0.75pt]')

  const ids = new Map<string, string>()
  graph.nodes.forEach((node, i) => {
    const id = `v${i + 1}`
    ids.set(node.id, id)
    const d = nodeDiameter(node.name)
    const c = circleOf(node)
    const name = `gc${capitalize(node.role)}`
    // `{}` keeps `\\` from reading a line that starts with `[` or `*` as its own argument.
    const text = wrapLabel(node.name)
      .lines.map((line, j) =>
        j > 0 && /^[[*]/.test(line)
          ? `{}${escapeLatex(line)}`
          : escapeLatex(line),
      )
      .join('\\\\')
    out.push(
      `\\node[circle, draw=${name}Line, fill=${name}Fill, text=${name}Text, line width=1.5pt, minimum size=${num(0.75 * d)}pt, inner sep=0pt, align=center, font=\\sffamily\\small] (${id}) at (${num(c.cx)},${num(c.cy)}) {${text}};`,
    )
  })
  for (const edge of graph.edges) {
    const s = ids.get(edge.source)
    const t = ids.get(edge.target)
    if (!s || !t) continue
    out.push(
      `\\draw[-{Stealth[length=6.75pt,width=6.75pt]}, line width=1.125pt, draw=gcEdge, shorten >=1.5pt] (${s}) -- (${t});`,
    )
  }
  out.push('\\end{tikzpicture}')
  return out.join('\n') + '\n'
}

const EXTENSIONS: Record<ImageFormat, string> = {
  svg: 'svg',
  png: 'png',
  pdf: 'pdf',
  tikz: 'tex',
}

/** The download's file name: `<slug>.svg`, `<slug>.png`, `<slug>.pdf` or `<slug>.tex`. */
export function imageFileName(
  graphName: string | undefined,
  format: ImageFormat,
): string {
  return `${fileSlug(graphName)}.${EXTENSIONS[format]}`
}
