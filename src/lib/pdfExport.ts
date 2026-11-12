/**
 * PDF export (spec 4.11 "PDF, legend and dark theme"): a hand-written vector PDF 1.4 of a
 * picture's scene, with no dependency and no DOM. The file is built as text in which every
 * character is one byte (ASCII plus WinAnsi codes), so string offsets are byte offsets.
 */
import type { ImageOptions } from '@/lib/imageExport'
import {
  imageScene,
  type Scene,
  type SceneBadge,
  type SceneCircle,
  type SceneEdge,
  type SceneLegend,
  type SceneText,
} from '@/lib/imageScene'
import type { Graph } from '@/model/graph'

/** CSS pixels (96 per inch) to PDF points (72 per inch). */
const PX_TO_PT = 0.75
/** Bézier handle length for a quarter circle, as a fraction of the radius. */
const KAPPA = 0.5523
/** The legend box's corner radius and outline width, in px (4.11 "Legend"). */
const LEGEND_RADIUS = 4
const LEGEND_BORDER_WIDTH = 1

/**
 * Helvetica advance widths (in 1/1000 em) for WinAnsiEncoding codes 32–255, from Adobe's
 * Helvetica.afm in the Core 14 AFM files (Adobe Systems, 1997; the AFM files may be freely
 * copied and redistributed). Glyph names are mapped to codes as in the PDF 1.7 reference,
 * appendix D. The unused codes 127, 129, 141, 143, 144 and 157 get the bullet's width, which
 * viewers show for them; the writer never emits them.
 */
// prettier-ignore
const HELVETICA_WIDTHS: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // 32–47
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 48–63
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // 64–79
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // 80–95
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // 96–111
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 350, // 112–127
  556, 350, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350, // 128–143
  350, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 350, 500, 667, // 144–159
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, // 160–175
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, // 176–191
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, // 192–207
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, // 208–223
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, // 224–239
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500, // 240–255
]

/** Unicode code points of WinAnsi codes 128–159 (the rest of 32–255 equals Latin-1). */
// prettier-ignore
const WIN_ANSI_HIGH: ReadonlyMap<number, number> = new Map([
  [0x20ac, 128], [0x201a, 130], [0x0192, 131], [0x201e, 132], [0x2026, 133], [0x2020, 134],
  [0x2021, 135], [0x02c6, 136], [0x2030, 137], [0x0160, 138], [0x2039, 139], [0x0152, 140],
  [0x017d, 142], [0x2018, 145], [0x2019, 146], [0x201c, 147], [0x201d, 148], [0x2022, 149],
  [0x2013, 150], [0x2014, 151], [0x02dc, 152], [0x2122, 153], [0x0161, 154], [0x203a, 155],
  [0x0153, 156], [0x017e, 158], [0x0178, 159],
])

const QUESTION_MARK = 63

/** The WinAnsi codes of `text`; characters outside WinAnsi (and control characters) become `?`. */
function winAnsiCodes(text: string): number[] {
  const codes: number[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? QUESTION_MARK
    if ((cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255)) codes.push(cp)
    else codes.push(WIN_ANSI_HIGH.get(cp) ?? QUESTION_MARK)
  }
  return codes
}

/** The width of a line of Helvetica at `size`, in the same unit as `size`. */
function textWidth(codes: number[], size: number): number {
  let units = 0
  for (const code of codes) units += HELVETICA_WIDTHS[code - 32]
  return (units * size) / 1000
}

/** A PDF literal string body (without the parentheses), one character per byte. */
function pdfString(codes: number[]): string {
  let out = ''
  for (const code of codes) {
    const ch = String.fromCharCode(code)
    out += ch === '(' || ch === ')' || ch === '\\' ? '\\' + ch : ch
  }
  return out
}

/** A PDF text string for the `/Info` dictionary: literal when printable ASCII, else UTF-16BE hex. */
function infoString(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/[()\\]/g, '\\$&')})`
  let hex = 'FEFF'
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')
  }
  return `<${hex}>`
}

/** A number with at most `decimals` decimals, no trailing zeros, never `-0` or `NaN`. */
function num(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '0'
  const f = 10 ** decimals
  const r = Math.round(n * f) / f
  return String(r === 0 ? 0 : r)
}

function nums(...values: number[]): string {
  return values.map((v) => num(v)).join(' ')
}

/** `r g b` in 0–1 from `#rgb` or `#rrggbb`; anything else is black. */
function rgb(hex: string): string {
  let h = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return '0 0 0'
  return [0, 2, 4]
    .map((i) => num(parseInt(h.slice(i, i + 2), 16) / 255, 3))
    .join(' ')
}

function edgeOps(edge: SceneEdge): string[] {
  const [tip, a, b] = edge.head
  return [
    `${rgb(edge.color)} RG ${num(edge.width)} w`,
    `${nums(edge.x1, edge.y1)} m ${nums(edge.x2, edge.y2)} l S`,
    `${rgb(edge.color)} rg`,
    `${nums(...tip)} m ${nums(...a)} l ${nums(...b)} l h f`,
  ]
}

function circleOps(c: SceneCircle): string[] {
  const { cx, cy, r } = c
  const k = r * KAPPA
  const stroked = c.strokeWidth > 0
  return [
    `${rgb(c.fill)} rg ${rgb(c.stroke)} RG ${num(Math.max(c.strokeWidth, 0))} w`,
    `${nums(cx + r, cy)} m`,
    `${nums(cx + r, cy + k, cx + k, cy + r, cx, cy + r)} c`,
    `${nums(cx - k, cy + r, cx - r, cy + k, cx - r, cy)} c`,
    `${nums(cx - r, cy - k, cx - k, cy - r, cx, cy - r)} c`,
    `${nums(cx + k, cy - r, cx + r, cy - k, cx + r, cy)} c`,
    stroked ? 'h B' : 'h f',
  ]
}

function textOps(t: SceneText): string[] {
  const codes = winAnsiCodes(t.text)
  const x = t.anchor === 'middle' ? t.x - textWidth(codes, t.size) / 2 : t.x
  return [
    `${rgb(t.color)} rg`,
    `BT /F1 ${num(t.size)} Tf 1 0 0 -1 ${nums(x, t.y)} Tm (${pdfString(codes)}) Tj ET`,
  ]
}

function legendOps(legend: SceneLegend): string[] {
  const { x, y, width: w, height: h } = legend
  const r = Math.min(LEGEND_RADIUS, w / 2, h / 2)
  const k = r * KAPPA
  const ops = [
    `${rgb(legend.background)} rg ${rgb(legend.border)} RG ${num(LEGEND_BORDER_WIDTH)} w`,
    `${nums(x + r, y)} m`,
    `${nums(x + w - r, y)} l`,
    `${nums(x + w - r + k, y, x + w, y + r - k, x + w, y + r)} c`,
    `${nums(x + w, y + h - r)} l`,
    `${nums(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)} c`,
    `${nums(x + r, y + h)} l`,
    `${nums(x + r - k, y + h, x, y + h - r + k, x, y + h - r)} c`,
    `${nums(x, y + r)} l`,
    `${nums(x, y + r - k, x + r - k, y, x + r, y)} c`,
    'h B',
  ]
  for (const item of legend.items)
    ops.push(...circleOps(item.swatch), ...textOps(item.text))
  return ops
}

/**
 * A sign badge: its circle, then its glyph. Helvetica's WinAnsi set has no minus sign (U+2212),
 * so `−` is drawn as the en dash, which has about its width and height.
 */
function badgeOps(badge: SceneBadge): string[] {
  const text = badge.text.text.replace(/\u2212/g, '\u2013')
  return [...circleOps(badge.circle), ...textOps({ ...badge.text, text })]
}

/**
 * The page's content stream: the flip, the background, edges, sign badges, circles, names and
 * legend.
 */
function contentStream(scene: Scene): string {
  const ops = [
    `${PX_TO_PT} 0 0 -${PX_TO_PT} 0 ${num(scene.height * PX_TO_PT)} cm`,
    `${rgb(scene.background)} rg`,
    `0 0 ${nums(scene.width, scene.height)} re f`,
  ]
  for (const edge of scene.edges) ops.push(...edgeOps(edge))
  for (const badge of scene.badges) ops.push(...badgeOps(badge))
  for (const circle of scene.circles) ops.push(...circleOps(circle))
  for (const text of scene.texts) ops.push(...textOps(text))
  if (scene.legend) ops.push(...legendOps(scene.legend))
  return ops.join('\n') + '\n'
}

/** The bytes of a one-page PDF drawing `scene`. */
export function sceneToPdf(scene: Scene): Uint8Array {
  const content = contentStream(scene)
  const title = scene.title.trim() || 'Graph'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nums(scene.width * PX_TO_PT, scene.height * PX_TO_PT)}]` +
      ' /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    `<< /Title ${infoString(title)} /Producer (GraphCreator) >>`,
  ]
  // The second line's bytes above 127 mark the file as binary for transfer programs.
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets)
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i)
  return bytes
}

/** The graph as a PDF file. */
export function toPdf(graph: Graph, opts: ImageOptions = {}): Uint8Array {
  return sceneToPdf(imageScene(graph, opts))
}
