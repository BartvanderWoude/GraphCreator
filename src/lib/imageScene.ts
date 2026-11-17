/**
 * The picture of a graph as shapes in image coordinates (spec 4.11 "PDF, legend and dark
 * theme"): what SVG, PNG, PDF and TikZ draw, with the legend placed once. The types are fixed in
 * phase 31; `imageScene` is built in phase 37. Pure, no DOM.
 */
import {
  FORM_LABELS,
  LEGEND_LABELS,
  ROLE_LABELS,
  VAR_TYPE_LABELS,
} from '@/lib/copy'
import {
  arrowSize,
  EDGE_WIDTH,
  edgeWidth,
  FORM_GLYPHS,
  MARK_GLYPH,
  MARK_SIZE,
  markCentre,
  placeGlyph,
  signTone,
  TYPE_LETTERS,
  type GlyphSegment,
  type MarkCorner,
  type Tone,
} from '@/lib/display'
import { edgeEndpoints, type Circle } from '@/lib/geometry'
import type { ImageOptions } from '@/lib/imageExport'
import type { GEdge, GNode, Graph } from '@/model/graph'
import { lineHeight, NODE_DIAMETER, nodeLabel } from '@/model/nodeSize'
import { EXPORT_PALETTES, type ExportPalette } from '@/model/palette'
import {
  FORMS,
  ROLES,
  STRENGTHS,
  VAR_TYPES,
  type Form,
  type Role,
} from '@/model/schema'
import { signBadge } from '@/model/simulation'

/** Space around the nodes' bounding box, in px (re-exported by `imageExport.ts`). */
export const EXPORT_MARGIN = 24

/** Legend box sizes in px. */
export const LEGEND = {
  width: 96,
  padding: 8,
  row: 20,
  swatch: 10,
  gap: 8,
  beside: 16,
  font: 12,
} as const

export type LegendCorner =
  'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'beside'

export interface SceneCircle {
  cx: number
  cy: number
  r: number
  fill: string
  stroke: string
  strokeWidth: number
  /** Dash and gap lengths of a dashed outline (Dashed latent, spec 4.18); solid when absent. */
  dash?: [number, number]
}

/** A line of text; `y` is its baseline. */
export interface SceneText {
  x: number
  y: number
  text: string
  size: number
  weight: 400 | 500
  color: string
  anchor: 'middle' | 'start'
}

/** An edge line and its arrowhead triangle (tip first). */
export interface SceneEdge {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width: number
  head: [[number, number], [number, number], [number, number]]
}

export interface SceneLegend {
  x: number
  y: number
  width: number
  height: number
  corner: LegendCorner
  background: string
  border: string
  items: { role: Role; label: string; swatch: SceneCircle; text: SceneText }[]
  /**
   * The display options' rows (4.18 "Images"), after the roles: empty without display options
   * that show something in this graph.
   */
  rows: SceneLegendRow[]
}

/**
 * A legend row of the display options (4.18 "Images"): a swatch made of a line sample with its
 * arrowhead (signs, strength), perhaps with a badge on it, or of a rim mark (forms, types), then
 * the label. Rows that would look the same are merged, their labels joined with ` or `.
 */
export interface SceneLegendRow {
  label: string
  line?: SceneEdge
  badge?: SceneBadge
  mark?: SceneMark
  text: SceneText
}

/** A sign badge on an edge (4.16 "Images"): a small circle and its glyph, `+`, `−` or `±`. */
export interface SceneBadge {
  circle: SceneCircle
  text: SceneText
}

/** A stroked, unfilled path in absolute image coordinates (a mark's glyph, spec 4.18). */
export interface ScenePath {
  segments: GlyphSegment[]
  color: string
  width: number
}

/** A rim mark (spec 4.18): a small circle holding a glyph (Forms) or a letter (Variable types). */
export interface SceneMark {
  circle: SceneCircle
  path?: ScenePath
  text?: SceneText
}

/** Everything a picture shows. The image's top-left is 0,0 and y grows downward. */
export interface Scene {
  title: string
  width: number
  height: number
  background: string
  /** In drawing order. */
  edges: SceneEdge[]
  /** Sign badges (only with the `signs` option), drawn after the edges and before the circles. */
  badges: SceneBadge[]
  circles: SceneCircle[]
  /** The wrapped name lines. */
  texts: SceneText[]
  /** `circles[i]` belongs to graph node `nodeIds[i]`. */
  nodeIds: string[]
  /** Rim marks (Forms, Variable types), drawn after the circles and names, before the legend. */
  marks: SceneMark[]
  legend: SceneLegend | null
}

/** Circle outline, edge stroke and arrowhead, as on the canvas (5.7.7, `FloatingEdge`). */
const OUTLINE_WIDTH = 2
const EDGE_GAP = 2
/**
 * How far the line runs into the arrowhead, so no seam shows between them. The head's length and
 * width are `arrowSize(width)` (4.18), 9 px for the default 1.5 px line.
 */
const ARROW_OVERLAP = 1
/**
 * Baseline below the middle of a line box, in em: half of IBM Plex Sans's ascent (1.025 em) minus
 * its descent (0.275 em), where CSS puts it. 4.875 px for 13 px text in a 16 px line.
 */
const BASELINE = 0.375
/** The legend swatch's outline width. */
const SWATCH_LINE = 1.5
/** Sign badge (4.16 "Images", 5.9 "Canvas"): a 16 px circle with a 1 px line, 12 px glyph. */
const BADGE_RADIUS = 8
const BADGE_LINE = 1
const BADGE_FONT = 12
const BADGE_GLYPHS = {
  positive: '+',
  negative: '\u2212',
  mixed: '\u00b1',
} as const
/** Free space the legend box keeps from circles and edges when it sits in a corner. */
const LEGEND_CLEARANCE = 8
/** Rim marks (4.18): their 1 px line, the glyph's 1.5 px line and the letter's size. */
const MARK_LINE = 1
const MARK_GLYPH_LINE = 1.5
const MARK_FONT = 11
/** Dash and gap of a dashed latent outline, and of the Latent swatch in the legend. */
const LATENT_DASH: [number, number] = [5, 3]
const SWATCH_DASH: [number, number] = [2, 1.5]
/** The legend's swatch column when it has display rows (4.18 "Images"). */
const ROW_SWATCH = 24
/** Legend marks are drawn this size instead of `MARK_SIZE`, and badges at the same scale. */
const LEGEND_MARK = 16
/** A legend line sample's arrowhead, as a fraction of the drawing's `arrowSize`. */
const LEGEND_HEAD = 2 / 3
/** Estimated label width per character, as a fraction of `LEGEND.font`. */
const CHAR_WIDTH = 0.6

/**
 * `v` scaled from a `MARK_SIZE` mark to a `size` one, as `v × size / MARK_SIZE` so the result
 * stays short (9.6, not 9.600…01).
 */
function scaled(v: number, size: number): number {
  return (v * size) / MARK_SIZE
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** The circle a node occupies on the canvas: centred on `pos + d/2`, radius `d/2`. */
function circleOf(node: GNode): Circle {
  const d = NODE_DIAMETER
  return { cx: node.pos.x + d / 2, cy: node.pos.y + d / 2, r: d / 2 }
}

/** True when the open boxes share an area (touching edges do not count). */
function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  )
}

/** True when the segment touches or crosses the closed box, or lies in it (Liang–Barsky). */
function segmentHitsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: Box,
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  let t0 = 0
  let t1 = 1
  for (const [p, q] of [
    [-dx, x1 - box.left],
    [dx, box.right - x1],
    [-dy, y1 - box.top],
    [dy, box.bottom - y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      t0 = Math.max(t0, t)
    } else {
      if (t < t0) return false
      t1 = Math.min(t1, t)
    }
  }
  return true
}

/** The palette colour of a tone (4.18 "Colours"): green, red, or the foreground colour. */
function toneColor(tone: Tone, palette: ExportPalette): string {
  return tone === 'neutral' ? palette.foreground : palette[tone]
}

/**
 * An edge from `sx`, `sy` to the arrowhead's tip at `tx`, `ty`: a closed head `head` px long and
 * wide, and the line stopping `head − 1` px before the tip, inside the head.
 */
function edgeShape(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  color: string,
  width: number,
  head: number,
): SceneEdge {
  const length = Math.hypot(tx - sx, ty - sy)
  const ux = length > 0 ? (tx - sx) / length : 0
  const uy = length > 0 ? (ty - sy) / length : 0
  // The line stops inside the arrowhead; the head's base and perpendicular half-width.
  const back = Math.min(head - ARROW_OVERLAP, length)
  const bx = tx - head * ux
  const by = ty - head * uy
  const px = (-uy * head) / 2
  const py = (ux * head) / 2
  return {
    x1: sx,
    y1: sy,
    x2: tx - back * ux,
    y2: ty - back * uy,
    color,
    width,
    head: [
      [tx, ty],
      [bx + px, by + py],
      [bx - px, by - py],
    ],
  }
}

/**
 * A sign badge centred on `x`, `y` in `color`: the circle's 1 px line lies inside its 8 px radius,
 * as the canvas draws a 16 px circle with a border, and the glyph's baseline follows the node
 * text rule. `markSize` shrinks circle and glyph (not the line) as a mark of that size shrinks,
 * for the legend.
 */
function badgeAt(
  x: number,
  y: number,
  glyph: string,
  color: string,
  palette: ExportPalette,
  markSize = MARK_SIZE,
): SceneBadge {
  const size = scaled(BADGE_FONT, markSize)
  return {
    circle: {
      cx: x,
      cy: y,
      r: scaled(BADGE_RADIUS, markSize) - BADGE_LINE / 2,
      fill: palette.background,
      stroke: color,
      strokeWidth: BADGE_LINE,
    },
    text: {
      x,
      y: y + size * BASELINE,
      text: glyph,
      size,
      weight: 500,
      color,
      anchor: 'middle',
    },
  }
}

/** What a rim mark holds: a form's glyph or a variable type's letter. */
type MarkContent = { form: Form } | { letter: string }

/**
 * A rim mark centred on `x`, `y` (4.18 "Images"): a `MARK_SIZE` circle in the background colour
 * with a 1 px line inside it, holding the form's glyph (1.5 px line) or the type's letter (11 px,
 * weight 500), all in the edge colour. `markSize` shrinks it (not its circle's line) for the
 * legend.
 */
function markAt(
  x: number,
  y: number,
  content: MarkContent,
  palette: ExportPalette,
  markSize = MARK_SIZE,
): SceneMark {
  const mark: SceneMark = {
    circle: {
      cx: x,
      cy: y,
      r: markSize / 2 - MARK_LINE / 2,
      fill: palette.background,
      stroke: palette.edge,
      strokeWidth: MARK_LINE,
    },
  }
  if ('form' in content) {
    mark.path = {
      segments: placeGlyph(
        FORM_GLYPHS[content.form],
        x,
        y,
        scaled(MARK_GLYPH, markSize),
      ),
      color: palette.edge,
      width: scaled(MARK_GLYPH_LINE, markSize),
    }
  } else {
    const size = scaled(MARK_FONT, markSize)
    mark.text = {
      x,
      y: y + size * BASELINE,
      text: content.letter,
      size,
      weight: 500,
      color: palette.edge,
      anchor: 'middle',
    }
  }
  return mark
}

/**
 * How a display row's swatch looks: a line sample (colour, width, perhaps a badge glyph) or a
 * mark. Rows with equal looks are merged.
 */
type Look =
  { color: string; width: number; badge?: string } | { mark: MarkContent }

interface LegendRowSpec {
  labels: string[]
  look: Look
}

/** What the legend lists: the roles in use and the merged display rows. */
interface LegendContent {
  roles: Role[]
  rows: LegendRowSpec[]
  dashedLatent: boolean
}

/**
 * The display options' legend rows for this graph (4.18 "Images"), in the order signs, strength,
 * forms, types, with rows of the same look merged into the first.
 */
function displayRows(
  graph: Graph,
  drawn: GEdge[],
  opts: ImageOptions,
  palette: ExportPalette,
): LegendRowSpec[] {
  const specs: LegendRowSpec[] = []
  // Signs and Sign colors: only when a drawn edge has a sign to show.
  if ((opts.signs || opts.signColors) && drawn.some((e) => signBadge(e.sign))) {
    const used = new Set(drawn.map((e) => signBadge(e.sign) ?? 'noSign'))
    for (const value of ['positive', 'negative', 'mixed', 'noSign'] as const) {
      if (!used.has(value) || (value === 'noSign' && !opts.signColors)) continue
      const tone: Tone =
        value === 'positive' || value === 'negative' ? value : 'neutral'
      const look: Look = {
        color: opts.signColors ? toneColor(tone, palette) : palette.edge,
        width: EDGE_WIDTH,
      }
      if (opts.signs && value !== 'noSign') look.badge = BADGE_GLYPHS[value]
      specs.push({ labels: [LEGEND_LABELS[value]], look })
    }
  }
  // Strength: only when a drawn edge has a strength; edges without one are 1.5 px.
  if (opts.strength && drawn.some((e) => e.strength)) {
    const used = new Set(drawn.map((e) => e.strength ?? 'noStrength'))
    for (const value of [...STRENGTHS, 'noStrength'] as const) {
      if (!used.has(value)) continue
      const width = edgeWidth(value === 'noStrength' ? undefined : value)
      specs.push({
        labels: [LEGEND_LABELS[value]],
        look: { color: palette.edge, width },
      })
    }
  }
  if (opts.forms) {
    const used = new Set(graph.nodes.map((n) => n.form))
    for (const form of FORMS) {
      if (used.has(form))
        specs.push({ labels: [FORM_LABELS[form]], look: { mark: { form } } })
    }
  }
  if (opts.types) {
    const used = new Set(graph.nodes.map((n) => n.varType))
    for (const type of VAR_TYPES) {
      if (!used.has(type)) continue
      specs.push({
        labels: [VAR_TYPE_LABELS[type]],
        look: { mark: { letter: TYPE_LETTERS[type] } },
      })
    }
  }
  const merged = new Map<string, LegendRowSpec>()
  for (const spec of specs) {
    const key = JSON.stringify(spec.look)
    const first = merged.get(key)
    if (first) first.labels.push(...spec.labels)
    else merged.set(key, spec)
  }
  return [...merged.values()]
}

/**
 * The legend box's size: `LEGEND.width` wide without display rows; with them, wide enough for
 * the 24 px swatch column and the longest label at `CHAR_WIDTH` × `LEGEND.font` per character.
 */
function legendSize(content: LegendContent): { width: number; height: number } {
  const n = content.roles.length + content.rows.length
  const height = 2 * LEGEND.padding + n * LEGEND.row
  if (content.rows.length === 0) return { width: LEGEND.width, height }
  const labels = [
    ...content.roles.map((role) => ROLE_LABELS[role]),
    ...content.rows.map((row) => row.labels.join(' or ')),
  ]
  const chars = Math.max(...labels.map((label) => [...label].length))
  const width =
    2 * LEGEND.padding +
    ROW_SWATCH +
    LEGEND.gap +
    chars * CHAR_WIDTH * LEGEND.font
  return { width: Math.max(LEGEND.width, width), height }
}

/**
 * The legend box at `x`, `y`: one row per role, then one per display row, each a swatch and a
 * label, the label's baseline placed as CSS would centre 12 px text in the row. With display rows
 * every swatch is centred in a 24 px column.
 */
function legendAt(
  x: number,
  y: number,
  corner: LegendCorner,
  content: LegendContent,
  palette: ExportPalette,
): SceneLegend {
  const { roles, rows } = content
  const column = rows.length > 0 ? ROW_SWATCH : LEGEND.swatch
  const left = x + LEGEND.padding
  const swatchX = left + column / 2
  const middleOf = (i: number) => y + LEGEND.padding + (i + 0.5) * LEGEND.row
  const label = (text: string, middle: number): SceneText => ({
    x: left + column + LEGEND.gap,
    y: middle + LEGEND.font * BASELINE,
    text,
    size: LEGEND.font,
    weight: 400,
    color: palette.foreground,
    anchor: 'start',
  })
  return {
    x,
    y,
    ...legendSize(content),
    corner,
    background: palette.background,
    border: palette.border,
    items: roles.map((role, i) => {
      const middle = middleOf(i)
      const swatch: SceneCircle = {
        cx: swatchX,
        cy: middle,
        r: LEGEND.swatch / 2 - SWATCH_LINE / 2,
        fill: palette.roles[role].fill,
        stroke: palette.roles[role].line,
        strokeWidth: SWATCH_LINE,
      }
      if (role === 'latent' && content.dashedLatent) swatch.dash = SWATCH_DASH
      return {
        role,
        label: ROLE_LABELS[role],
        swatch,
        text: label(ROLE_LABELS[role], middle),
      }
    }),
    rows: rows.map(({ labels, look }, i) => {
      const middle = middleOf(roles.length + i)
      const text = labels.join(' or ')
      const row: SceneLegendRow = { label: text, text: label(text, middle) }
      if ('mark' in look) {
        row.mark = markAt(swatchX, middle, look.mark, palette, LEGEND_MARK)
        return row
      }
      // A line sample across the column, its head two thirds of the drawing's.
      const head = arrowSize(look.width) * LEGEND_HEAD
      const tip = left + ROW_SWATCH
      row.line = edgeShape(
        left,
        middle,
        tip,
        middle,
        look.color,
        look.width,
        head,
      )
      // The badge sits in the middle of the line before the head.
      if (look.badge) {
        row.badge = badgeAt(
          left + (ROW_SWATCH - head) / 2,
          middle,
          look.badge,
          look.color,
          palette,
          LEGEND_MARK,
        )
      }
      return row
    }),
  }
}

/**
 * The scene for `graph` (4.11, 4.18 "Images"): the canvas geometry moved so the nodes' bounding
 * box starts at `EXPORT_MARGIN`, coloured by `opts.theme`, with the display options that are on
 * and the legend in the first free corner of the bounding box or beside it. With `opts.signs`,
 * each drawn edge whose `signBadge` is defined gets a badge halfway between its start and its
 * arrowhead's tip.
 */
export function imageScene(graph: Graph, opts: ImageOptions = {}): Scene {
  const palette = EXPORT_PALETTES[opts.theme ?? 'light']
  const scene: Scene = {
    title: graph.name ?? 'Graph',
    width: 2 * EXPORT_MARGIN,
    height: 2 * EXPORT_MARGIN,
    background: palette.background,
    edges: [],
    badges: [],
    circles: [],
    texts: [],
    nodeIds: [],
    marks: [],
    legend: null,
  }
  if (graph.nodes.length === 0) return scene

  const canvasCircles = new Map(graph.nodes.map((n) => [n.id, circleOf(n)]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of graph.nodes) {
    const d = NODE_DIAMETER
    minX = Math.min(minX, node.pos.x)
    minY = Math.min(minY, node.pos.y)
    maxX = Math.max(maxX, node.pos.x + d)
    maxY = Math.max(maxY, node.pos.y + d)
  }
  // Canvas coordinates minus the origin are image coordinates.
  const ox = minX - EXPORT_MARGIN
  const oy = minY - EXPORT_MARGIN
  scene.width = Math.ceil(maxX - minX + 2 * EXPORT_MARGIN)
  scene.height = Math.ceil(maxY - minY + 2 * EXPORT_MARGIN)

  const drawn: GEdge[] = []
  for (const edge of graph.edges) {
    const source = canvasCircles.get(edge.source)
    const target = canvasCircles.get(edge.target)
    const ends =
      source && target ? edgeEndpoints(source, target, EDGE_GAP) : null
    if (!ends) continue
    drawn.push(edge)
    const sx = ends.sx - ox
    const sy = ends.sy - oy
    const tx = ends.tx - ox
    const ty = ends.ty - oy
    const color = opts.signColors
      ? toneColor(signTone(edge.sign), palette)
      : palette.edge
    const width = opts.strength ? edgeWidth(edge.strength) : EDGE_WIDTH
    scene.edges.push(edgeShape(sx, sy, tx, ty, color, width, arrowSize(width)))
    const badge = opts.signs ? signBadge(edge.sign) : undefined
    if (badge) {
      scene.badges.push(
        badgeAt(
          (sx + tx) / 2,
          (sy + ty) / 2,
          BADGE_GLYPHS[badge],
          color,
          palette,
        ),
      )
    }
  }

  for (const node of graph.nodes) {
    const c = canvasCircles.get(node.id)!
    const colors = palette.roles[node.role]
    const cx = c.cx - ox
    const cy = c.cy - oy
    // The outline is drawn inside the circle, so the outer size matches the canvas.
    const circle: SceneCircle = {
      cx,
      cy,
      r: c.r - OUTLINE_WIDTH / 2,
      fill: colors.fill,
      stroke: colors.line,
      strokeWidth: OUTLINE_WIDTH,
    }
    if (opts.dashedLatent && node.role === 'latent') circle.dash = LATENT_DASH
    scene.circles.push(circle)
    scene.nodeIds.push(node.id)
    // Each name is drawn at its own size (5.7.6), with the matching line pitch and baseline.
    const { lines, fontSize } = nodeLabel(node.name)
    const pitch = lineHeight(fontSize)
    lines.forEach((line, i) => {
      const middle = cy + (i - (lines.length - 1) / 2) * pitch
      scene.texts.push({
        x: cx,
        y: middle + fontSize * BASELINE,
        text: line,
        size: fontSize,
        weight: 500,
        color: colors.text,
        anchor: 'middle',
      })
    })
    // Rim marks on the canvas circle (radius d/2): the type's at the top left, then the form's.
    const marks: [MarkCorner, MarkContent][] = []
    if (opts.types && node.varType)
      marks.push(['top-left', { letter: TYPE_LETTERS[node.varType] }])
    if (opts.forms && node.form) marks.push(['top-right', { form: node.form }])
    for (const [corner, content] of marks) {
      const at = markCentre(cx, cy, NODE_DIAMETER / 2, corner)
      scene.marks.push(markAt(at.x, at.y, content, palette))
    }
  }

  if (opts.legend) {
    const used = new Set(graph.nodes.map((n) => n.role))
    const content: LegendContent = {
      roles: ROLES.filter((role) => used.has(role)),
      rows: displayRows(graph, drawn, opts, palette),
      dashedLatent: opts.dashedLatent === true,
    }
    scene.legend = placeLegend(
      scene,
      content,
      palette,
      maxX - minX,
      maxY - minY,
    )
  }
  return scene
}

/**
 * The legend: in the first free corner of the drawing area (the nodes' bounding box, `width` ×
 * `height` at the margin), else beside it, growing the scene.
 */
function placeLegend(
  scene: Scene,
  content: LegendContent,
  palette: ExportPalette,
  width: number,
  height: number,
): SceneLegend | null {
  if (content.roles.length === 0) return null
  const { width: w, height: h } = legendSize(content)
  const left = EXPORT_MARGIN
  const top = EXPORT_MARGIN
  const right = EXPORT_MARGIN + width
  const bottom = EXPORT_MARGIN + height
  const corners: [LegendCorner, number, number][] = [
    ['top-right', right - w, top],
    ['top-left', left, top],
    ['bottom-right', right - w, bottom - h],
    ['bottom-left', left, bottom - h],
  ]
  // Circles count as their bounding squares (outline included); edges run from start to tip.
  const squares: Box[] = scene.circles.map((c) => {
    const r = c.r + c.strokeWidth / 2
    return { left: c.cx - r, top: c.cy - r, right: c.cx + r, bottom: c.cy + r }
  })
  for (const [corner, x, y] of corners) {
    const grown: Box = {
      left: x - LEGEND_CLEARANCE,
      top: y - LEGEND_CLEARANCE,
      right: x + w + LEGEND_CLEARANCE,
      bottom: y + h + LEGEND_CLEARANCE,
    }
    const blocked =
      squares.some((square) => overlaps(grown, square)) ||
      scene.edges.some((e) =>
        segmentHitsBox(e.x1, e.y1, e.head[0][0], e.head[0][1], grown),
      )
    if (!blocked) return legendAt(x, y, corner, content, palette)
  }
  // Beside: right of the bounding box, top-aligned; the image grows to hold it with the margin.
  scene.width = Math.ceil(scene.width + LEGEND.beside + w)
  scene.height = Math.max(scene.height, Math.ceil(h + 2 * EXPORT_MARGIN))
  return legendAt(right + LEGEND.beside, top, 'beside', content, palette)
}
