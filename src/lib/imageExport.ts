/**
 * Image export (spec 4.11, phases 22 and 37): SVG, PNG and TikZ drawn from the graph's scene
 * (`imageScene`), which is built from the graph data with the canvas geometry rather than
 * captured from the DOM, so the result does not depend on zoom or selection. Everything but
 * `svgToPng` is pure.
 */
import {
  EXPORT_MARGIN,
  imageScene,
  type SceneCircle,
  type SceneText,
} from '@/lib/imageScene'
import type { GNode, Graph } from '@/model/graph'
import { nodeDiameter, wrapLabel } from '@/model/nodeSize'
import { EXPORT_PALETTES, type ImageTheme } from '@/model/palette'
import { ROLES } from '@/model/schema'
import { fileSlug } from '@/model/yaml'

export { EXPORT_MARGIN, EXPORT_PALETTES, type ImageTheme }

export type ImageFormat = 'svg' | 'png' | 'pdf' | 'tikz'

/** Picture options (spec 4.11 "PDF, legend and dark theme"). Defaults: light, no legend. */
export interface ImageOptions {
  theme?: ImageTheme
  legend?: boolean
}

/** TikZ is always drawn in the light theme's colours: LaTeX documents are printed on white. */
const PALETTE = EXPORT_PALETTES.light

const FONT_FAMILY = "'IBM Plex Sans', system-ui, sans-serif"
/** The legend box's corner radius and outline width, in px. */
const LEGEND_RADIUS = 4
const LEGEND_LINE = 1

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

/**
 * Width and height of the image: the nodes' bounding box plus the margin on each side, rounded
 * up, widened (and if needed heightened) by a legend placed beside the graph.
 */
export function svgSize(
  graph: Graph,
  opts: ImageOptions = {},
): { width: number; height: number } {
  const { width, height } = imageScene(graph, opts)
  return { width, height }
}

function svgCircle(c: SceneCircle): string {
  return `<circle cx="${num(c.cx)}" cy="${num(c.cy)}" r="${num(c.r)}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${num(c.strokeWidth)}"/>`
}

/** A line of text; the font attributes come from the enclosing `<g>`. */
function svgText(t: SceneText): string {
  return `<text x="${num(t.x)}" y="${num(t.y)}" fill="${t.color}">${escapeXml(t.text)}</text>`
}

/** The `<g>` opening tag carrying a group of texts' font attributes. */
function svgFontGroup(t: Pick<SceneText, 'size' | 'weight' | 'anchor'>) {
  const anchor = t.anchor === 'middle' ? ' text-anchor="middle"' : ''
  return `<g font-family="${FONT_FAMILY}" font-size="${t.size}" font-weight="${t.weight}"${anchor}>`
}

/**
 * The graph as a standalone SVG document. With `fontDataUrl` (a data URL of IBM Plex Sans 500),
 * the font is embedded, so the image looks like the canvas where the font is not installed.
 */
export function toSvg(
  graph: Graph,
  opts: ImageOptions & { fontDataUrl?: string } = {},
): string {
  const scene = imageScene(graph, opts)
  const { width, height } = scene

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(scene.title)}</title>`,
  ]
  if (opts.fontDataUrl) {
    out.push(
      `<style>@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:500;src:url(${opts.fontDataUrl}) format('woff2');}</style>`,
    )
  }
  out.push(
    `<rect width="${width}" height="${height}" fill="${scene.background}"/>`,
  )

  for (const e of scene.edges) {
    const [tip, left, right] = e.head
    out.push(
      `<line x1="${num(e.x1)}" y1="${num(e.y1)}" x2="${num(e.x2)}" y2="${num(e.y2)}" stroke="${e.color}" stroke-width="${num(e.width)}"/>`,
      `<path d="M${num(tip[0])},${num(tip[1])} L${num(left[0])},${num(left[1])} L${num(right[0])},${num(right[1])} Z" fill="${e.color}"/>`,
    )
  }

  // Each circle is followed by its name lines; the scene keeps both in node order.
  const lineCounts = new Map(
    graph.nodes.map((n) => [n.id, wrapLabel(n.name).lines.length]),
  )
  out.push(
    svgFontGroup(scene.texts[0] ?? { size: 13, weight: 500, anchor: 'middle' }),
  )
  let next = 0
  scene.circles.forEach((c, i) => {
    out.push(svgCircle(c))
    const count = lineCounts.get(scene.nodeIds[i]) ?? 0
    for (const t of scene.texts.slice(next, next + count)) out.push(svgText(t))
    next += count
  })
  out.push('</g>')

  const legend = scene.legend
  if (legend) {
    out.push(
      svgFontGroup(legend.items[0].text),
      `<rect x="${num(legend.x)}" y="${num(legend.y)}" width="${num(legend.width)}" height="${num(legend.height)}" rx="${LEGEND_RADIUS}" fill="${legend.background}" stroke="${legend.border}" stroke-width="${LEGEND_LINE}"/>`,
    )
    for (const item of legend.items) {
      out.push(svgCircle(item.swatch), svgText(item.text))
    }
    out.push('</g>')
  }
  out.push('</svg>')
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

/** The node's centre on the canvas, which is where TikZ puts it. */
function canvasCentre(node: GNode): { x: number; y: number } {
  const d = nodeDiameter(node.name)
  return { x: node.pos.x + d / 2, y: node.pos.y + d / 2 }
}

/**
 * The graph as a TikZ picture for a LaTeX document with `tikz` and `arrows.meta`. Coordinates
 * are canvas pixels (`x=0.75pt, y=-0.75pt`: 96 px per inch, y down); TikZ finds the rims itself.
 * With `legend`, the scene's legend box is drawn where the scene places it. Always light.
 */
export function toTikz(graph: Graph, opts: { legend?: boolean } = {}): string {
  const scene = imageScene(graph, { theme: 'light', legend: opts.legend })
  const legend = scene.legend
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
  if (legend) {
    out.push(
      `\\definecolor{gcBorder}{HTML}{${htmlColor(legend.border)}}`,
      `\\definecolor{gcText}{HTML}{${htmlColor(legend.items[0].text.color)}}`,
    )
  }
  out.push('\\begin{tikzpicture}[x=0.75pt, y=-0.75pt]')

  const ids = new Map<string, string>()
  graph.nodes.forEach((node, i) => {
    const id = `v${i + 1}`
    ids.set(node.id, id)
    const d = nodeDiameter(node.name)
    const c = canvasCentre(node)
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
      `\\node[circle, draw=${name}Line, fill=${name}Fill, text=${name}Text, line width=1.5pt, minimum size=${num(0.75 * d)}pt, inner sep=0pt, align=center, font=\\sffamily\\small] (${id}) at (${num(c.x)},${num(c.y)}) {${text}};`,
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

  if (legend) {
    // Scene coordinates start at the bounding box minus the margin; TikZ uses canvas ones.
    const ox = Math.min(...graph.nodes.map((n) => n.pos.x)) - EXPORT_MARGIN
    const oy = Math.min(...graph.nodes.map((n) => n.pos.y)) - EXPORT_MARGIN
    const at = (x: number, y: number) => `(${num(x + ox)},${num(y + oy)})`
    out.push(
      `\\draw[gcBorder, fill=white, rounded corners=3pt] ${at(legend.x, legend.y)} rectangle ${at(legend.x + legend.width, legend.y + legend.height)};`,
    )
    for (const { role, swatch, text } of legend.items) {
      const name = `gc${capitalize(role)}`
      out.push(
        `\\node[circle, draw=${name}Line, fill=${name}Fill, line width=1.125pt, minimum size=${num(0.75 * 2 * (swatch.r + swatch.strokeWidth / 2))}pt, inner sep=0pt] at ${at(swatch.cx, swatch.cy)} {};`,
        `\\node[anchor=west, inner sep=0pt, text=gcText, font=\\sffamily\\footnotesize] at ${at(text.x, swatch.cy)} {${escapeLatex(text.text)}};`,
      )
    }
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
