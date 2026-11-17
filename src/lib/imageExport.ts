/**
 * Image export (spec 4.11, phases 22 and 37): SVG, PNG and TikZ drawn from the graph's scene
 * (`imageScene`), which is built from the graph data with the canvas geometry rather than
 * captured from the DOM, so the result does not depend on zoom or selection. Everything but
 * `svgToPng` is pure.
 */
import {
  arrowSize,
  EDGE_WIDTH,
  edgeWidth,
  glyphPathData,
  signTone,
  type DisplayOptions,
  type GlyphSegment,
  type Tone,
} from '@/lib/display'
import {
  EXPORT_MARGIN,
  imageScene,
  type SceneCircle,
  type SceneEdge,
  type SceneMark,
  type SceneText,
} from '@/lib/imageScene'
import type { GNode, Graph } from '@/model/graph'
import { lineHeight, NODE_DIAMETER, nodeLabel } from '@/model/nodeSize'
import { EXPORT_PALETTES, type ImageTheme } from '@/model/palette'
import { ROLES } from '@/model/schema'
import { fileSlug } from '@/model/yaml'

export { EXPORT_MARGIN, EXPORT_PALETTES, type ImageTheme }

export type ImageFormat = 'svg' | 'png' | 'pdf' | 'tikz'

/**
 * Picture options (spec 4.11 "PDF, legend and dark theme", 4.16 "Images", 4.18 "Images"): the
 * theme, the legend and the display options. Defaults: light, no legend, every display option off.
 */
export type ImageOptions = {
  theme?: ImageTheme
  legend?: boolean
} & Partial<DisplayOptions>

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
  const dash = c.dash
    ? ` stroke-dasharray="${num(c.dash[0])} ${num(c.dash[1])}"`
    : ''
  return `<circle cx="${num(c.cx)}" cy="${num(c.cy)}" r="${num(c.r)}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${num(c.strokeWidth)}"${dash}/>`
}

/** An edge (or a legend line sample): the line, then its arrowhead. */
function svgEdge(e: SceneEdge): string[] {
  const [tip, left, right] = e.head
  return [
    `<line x1="${num(e.x1)}" y1="${num(e.y1)}" x2="${num(e.x2)}" y2="${num(e.y2)}" stroke="${e.color}" stroke-width="${num(e.width)}"/>`,
    `<path d="M${num(tip[0])},${num(tip[1])} L${num(left[0])},${num(left[1])} L${num(right[0])},${num(right[1])} Z" fill="${e.color}"/>`,
  ]
}

/** A rim mark (4.18): its circle, then its glyph path or its letter in a font `<g>`. */
function svgMark(m: SceneMark): string[] {
  const out = [svgCircle(m.circle)]
  if (m.path) {
    out.push(
      `<path d="${glyphPathData(m.path.segments)}" fill="none" stroke="${m.path.color}" stroke-width="${num(m.path.width)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
  }
  if (m.text) out.push(svgFontGroup(m.text), svgText(m.text), '</g>')
  return out
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

  for (const e of scene.edges) out.push(...svgEdge(e))

  if (scene.badges.length > 0) {
    out.push(svgFontGroup(scene.badges[0].text))
    for (const b of scene.badges) out.push(svgCircle(b.circle), svgText(b.text))
    out.push('</g>')
  }

  // Each circle is followed by its name lines; the scene keeps both in node order. Every name
  // has its own font size (5.7.6), so each node's lines get their own `<g>`.
  const lineCounts = new Map(
    graph.nodes.map((n) => [n.id, nodeLabel(n.name).lines.length]),
  )
  let next = 0
  scene.circles.forEach((c, i) => {
    out.push(svgCircle(c))
    const count = lineCounts.get(scene.nodeIds[i]) ?? 0
    const texts = scene.texts.slice(next, next + count)
    next += count
    if (texts.length === 0) return
    out.push(svgFontGroup(texts[0]))
    for (const t of texts) out.push(svgText(t))
    out.push('</g>')
  })
  for (const mark of scene.marks) out.push(...svgMark(mark))

  const legend = scene.legend
  if (legend) {
    out.push(
      svgFontGroup(legend.items[0].text),
      `<rect x="${num(legend.x)}" y="${num(legend.y)}" width="${num(legend.width)}" height="${num(legend.height)}" rx="${LEGEND_RADIUS}" fill="${legend.background}" stroke="${legend.border}" stroke-width="${LEGEND_LINE}"/>`,
    )
    for (const item of legend.items) {
      out.push(svgCircle(item.swatch), svgText(item.text))
    }
    for (const row of legend.rows) {
      if (row.line) out.push(...svgEdge(row.line))
      if (row.badge) {
        out.push(
          svgCircle(row.badge.circle),
          svgFontGroup(row.badge.text),
          svgText(row.badge.text),
          '</g>',
        )
      }
      if (row.mark) out.push(...svgMark(row.mark))
      out.push(svgText(row.text))
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
  const d = NODE_DIAMETER
  return { x: node.pos.x + d / 2, y: node.pos.y + d / 2 }
}

/** TikZ math for a badge glyph: `+`, `−` (U+2212) and `±`. */
const TIKZ_GLYPHS: Record<string, string> = {
  '+': '$+$',
  '−': '$-$',
  '±': '$\\pm$',
}

/** The tone colours' names and values (4.18 "Images"), in the order they are defined. */
const TONE_COLORS: Record<Tone, [string, string]> = {
  positive: ['gcPositive', PALETTE.positive],
  negative: ['gcNegative', PALETTE.negative],
  neutral: ['gcNeutral', PALETTE.foreground],
}

/** Points from pixels for a TikZ length: at most three decimals, so 1.5 px stays `1.125pt`. */
function pt(px: number): string {
  const r = Math.round(px * 0.75 * 1000) / 1000
  return `${r === 0 ? 0 : r}pt`
}

/** A glyph path in TikZ: `(x,y) -- (x,y)` and `.. controls (…) and (…) .. (…)`. */
function tikzPath(
  segments: GlyphSegment[],
  at: (x: number, y: number) => string,
): string {
  return segments
    .map((s) => {
      switch (s[0]) {
        case 'M':
          return at(s[1], s[2])
        case 'L':
          return `-- ${at(s[1], s[2])}`
        case 'C':
          return `.. controls ${at(s[1], s[2])} and ${at(s[3], s[4])} .. ${at(s[5], s[6])}`
      }
    })
    .join(' ')
}

/**
 * The graph as a TikZ picture for a LaTeX document with `tikz` and `arrows.meta`. Coordinates
 * are canvas pixels (`x=0.75pt, y=-0.75pt`: 96 px per inch, y down); TikZ finds the rims itself.
 * The display options are drawn as in the scene: edge tones and widths, badges, dashed latent
 * nodes, rim marks and the legend's rows. With `legend`, the scene's legend box is drawn where
 * the scene places it. Always light.
 */
export function toTikz(
  graph: Graph,
  opts: { legend?: boolean } & Partial<DisplayOptions> = {},
): string {
  const scene = imageScene(graph, { ...opts, theme: 'light' })
  const legend = scene.legend
  const title = (graph.name ?? 'Graph').replace(/\s+/g, ' ')

  // The tone colours are defined only when something is drawn in them.
  const tones = new Set<Tone>()
  const toneName = (tone: Tone) => {
    tones.add(tone)
    return TONE_COLORS[tone][0]
  }
  /** The colour name of a scene colour: a tone, else the edge colour. */
  const colorName = (hex: string) => {
    for (const tone of ['positive', 'negative', 'neutral'] as const) {
      if (opts.signColors && hex === TONE_COLORS[tone][1]) return toneName(tone)
    }
    return 'gcEdge'
  }

  const body: string[] = []
  const ids = new Map<string, string>()
  graph.nodes.forEach((node, i) => {
    const id = `v${i + 1}`
    ids.set(node.id, id)
    const d = NODE_DIAMETER
    const c = canvasCentre(node)
    const name = `gc${capitalize(node.role)}`
    // `{}` keeps `\\` from reading a line that starts with `[` or `*` as its own argument.
    const label = nodeLabel(node.name)
    const text = label.lines
      .map((line, j) =>
        j > 0 && /^[[*]/.test(line)
          ? `{}${escapeLatex(line)}`
          : escapeLatex(line),
      )
      .join('\\\\')
    // The name's own size (5.7.6) in points, with the matching line pitch.
    const font = `\\sffamily\\fontsize{${num(0.75 * label.fontSize)}}{${num(0.75 * lineHeight(label.fontSize))}}\\selectfont`
    const dashed = opts.dashedLatent && node.role === 'latent' ? ', dashed' : ''
    body.push(
      `\\node[circle, draw=${name}Line, fill=${name}Fill, text=${name}Text, line width=1.5pt${dashed}, minimum size=${num(0.75 * d)}pt, inner sep=0pt, align=center, font=${font}] (${id}) at (${num(c.x)},${num(c.y)}) {${text}};`,
    )
  })
  for (const edge of graph.edges) {
    const s = ids.get(edge.source)
    const t = ids.get(edge.target)
    if (!s || !t) continue
    const width = opts.strength ? edgeWidth(edge.strength) : EDGE_WIDTH
    const head = pt(arrowSize(width))
    const color = opts.signColors ? toneName(signTone(edge.sign)) : 'gcEdge'
    body.push(
      `\\draw[-{Stealth[length=${head},width=${head}]}, line width=${pt(width)}, draw=${color}, shorten >=1.5pt] (${s}) -- (${t});`,
    )
  }

  // Scene coordinates start at the bounding box minus the margin; TikZ uses canvas ones.
  const ox = Math.min(...graph.nodes.map((n) => n.pos.x)) - EXPORT_MARGIN
  const oy = Math.min(...graph.nodes.map((n) => n.pos.y)) - EXPORT_MARGIN
  const at = (x: number, y: number) => `(${num(x + ox)},${num(y + oy)})`
  /** A circle node's outer diameter: the scene's radius plus half its line. */
  const size = (c: SceneCircle) => pt(2 * (c.r + c.strokeWidth / 2))
  const badge = (circle: SceneCircle, glyph: string) => {
    const color = colorName(circle.stroke)
    return `\\node[circle, draw=${color}, fill=white, line width=${pt(circle.strokeWidth)}, minimum size=${size(circle)}, inner sep=0pt, font=\\sffamily\\scriptsize, text=${color}] at ${at(circle.cx, circle.cy)} {${TIKZ_GLYPHS[glyph]}};`
  }
  const mark = ({ circle, path, text }: SceneMark): string[] => {
    const style = `circle, draw=gcEdge, fill=white, line width=${pt(circle.strokeWidth)}, minimum size=${size(circle)}, inner sep=0pt`
    const where = at(circle.cx, circle.cy)
    if (text) {
      return [
        `\\node[${style}, font=\\sffamily\\scriptsize, text=gcEdge] at ${where} {${escapeLatex(text.text)}};`,
      ]
    }
    const out = [`\\node[${style}] at ${where} {};`]
    if (path) {
      out.push(
        `\\draw[gcEdge, line width=${pt(path.width)}, line cap=round, line join=round] ${tikzPath(path.segments, at)};`,
      )
    }
    return out
  }
  for (const { circle, text } of scene.badges)
    body.push(badge(circle, text.text))
  for (const m of scene.marks) body.push(...mark(m))

  if (legend) {
    body.push(
      `\\draw[gcBorder, fill=white, rounded corners=3pt] ${at(legend.x, legend.y)} rectangle ${at(legend.x + legend.width, legend.y + legend.height)};`,
    )
    const label = (x: number, middle: number, text: string) =>
      `\\node[anchor=west, inner sep=0pt, text=gcText, font=\\sffamily\\footnotesize] at ${at(x, middle)} {${escapeLatex(text)}};`
    for (const { role, swatch, text } of legend.items) {
      const name = `gc${capitalize(role)}`
      const dash = swatch.dash
        ? `, dash pattern=on ${pt(swatch.dash[0])} off ${pt(swatch.dash[1])}`
        : ''
      body.push(
        `\\node[circle, draw=${name}Line, fill=${name}Fill, line width=1.125pt${dash}, minimum size=${num(0.75 * 2 * (swatch.r + swatch.strokeWidth / 2))}pt, inner sep=0pt] at ${at(swatch.cx, swatch.cy)} {};`,
        label(text.x, swatch.cy, text.text),
      )
    }
    for (const row of legend.rows) {
      if (row.line) {
        const { x1, y1, head, width } = row.line
        const [tip, a, b] = head
        const length = pt(
          Math.hypot(tip[0] - (a[0] + b[0]) / 2, tip[1] - (a[1] + b[1]) / 2),
        )
        body.push(
          `\\draw[-{Stealth[length=${length},width=${length}]}, line width=${pt(width)}, draw=${colorName(row.line.color)}] ${at(x1, y1)} -- ${at(tip[0], tip[1])};`,
        )
      }
      if (row.badge) body.push(badge(row.badge.circle, row.badge.text.text))
      if (row.mark) body.push(...mark(row.mark))
      const middle = row.line?.y1 ?? row.mark?.circle.cy ?? row.text.y
      body.push(label(row.text.x, middle, row.text.text))
    }
  }

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
  if (graph.edges.length > 0 || body.some((line) => line.includes('gcEdge'))) {
    out.push(`\\definecolor{gcEdge}{HTML}{${htmlColor(PALETTE.edge)}}`)
  }
  for (const tone of ['positive', 'negative', 'neutral'] as const) {
    if (!tones.has(tone)) continue
    const [name, hex] = TONE_COLORS[tone]
    out.push(`\\definecolor{${name}}{HTML}{${htmlColor(hex)}}`)
  }
  if (legend) {
    out.push(
      `\\definecolor{gcBorder}{HTML}{${htmlColor(legend.border)}}`,
      `\\definecolor{gcText}{HTML}{${htmlColor(legend.items[0].text.color)}}`,
    )
  }
  out.push('\\begin{tikzpicture}[x=0.75pt, y=-0.75pt]', ...body)
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
