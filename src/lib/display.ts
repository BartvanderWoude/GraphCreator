/**
 * Display options (spec 4.18): what the canvas and every exported image show besides names, roles
 * and arrows, and the helpers both use so the two cannot drift (tones, widths, arrowheads, the
 * rim marks and their glyphs). Pure, no DOM.
 */
import type { EdgeSign, Form, Strength, VarType } from '@/model/schema'
import { signBadge } from '@/model/simulation'

/** One display option (4.18). */
export type DisplayKey =
  'signs' | 'signColors' | 'strength' | 'forms' | 'types' | 'dashedLatent'

/** The display options, in this order; also the order of the Display section's switches. */
export const DISPLAY_KEYS: readonly DisplayKey[] = [
  'signs',
  'signColors',
  'strength',
  'forms',
  'types',
  'dashedLatent',
]

export type DisplayOptions = Record<DisplayKey, boolean>

/** Every option off, Signs included. */
export const DISPLAY_DEFAULTS: DisplayOptions = {
  signs: false,
  signColors: false,
  strength: false,
  forms: false,
  types: false,
  dashedLatent: false,
}

/** An edge's colour with Sign colors on: green, red, or the foreground colour. */
export type Tone = 'positive' | 'negative' | 'neutral'

/**
 * The edge's tone, from its `signBadge`: positive and negative give themselves, a mixed sign or
 * none gives 'neutral'.
 */
export function signTone(sign: EdgeSign | undefined): Tone {
  const badge = signBadge(sign)
  return badge === 'positive' || badge === 'negative' ? badge : 'neutral'
}

/** The default edge width in px (5.7.7). */
export const EDGE_WIDTH = 1.5

/** Edge widths in px by strength, with Strength on. */
export const STRENGTH_WIDTHS: Record<Strength, number> = {
  small: 1.5,
  medium: 3,
  large: 4.5,
}

/** The edge's width with Strength on: its strength's width, else `EDGE_WIDTH`. */
export function edgeWidth(strength: Strength | undefined): number {
  return strength === undefined ? EDGE_WIDTH : STRENGTH_WIDTHS[strength]
}

/**
 * Length and width of the closed arrowhead for a line `width` px wide: `6 + 2 × width`, so 9 at
 * 1.5 px (the default head), 12 at 3 and 15 at 4.5.
 */
export function arrowSize(width: number): number {
  return 6 + 2 * width
}

/** The letter of a variable type's mark, with Variable types on. */
export const TYPE_LETTERS: Record<VarType, string> = {
  categorical: 'C',
  ordinal: 'O',
  continuous: 'N',
  discrete: 'D',
}

/** One command of a glyph path: move, line, or cubic Bézier (two controls, then the end). */
export type GlyphSegment =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]

/** Glyph coordinates lie in a `GLYPH_BOX` × `GLYPH_BOX` box, y down. */
export const GLYPH_BOX = 12

/** The glyph of each functional form's mark, with Forms on: stroked, not filled. */
export const FORM_GLYPHS: Record<Form, GlyphSegment[]> = {
  linear: [
    ['M', 1, 11],
    ['L', 11, 1],
  ],
  smooth: [
    ['M', 1, 11],
    ['C', 6, 11, 6, 1, 11, 1],
  ],
  threshold: [
    ['M', 1, 10],
    ['L', 6, 10],
    ['L', 6, 2],
    ['L', 11, 2],
  ],
}

/** The glyph scaled from its box onto a `size` × `size` square centred on `cx`, `cy`. */
export function placeGlyph(
  segments: GlyphSegment[],
  cx: number,
  cy: number,
  size: number,
): GlyphSegment[] {
  const scale = size / GLYPH_BOX
  const left = cx - size / 2
  const top = cy - size / 2
  const x = (v: number) => left + v * scale
  const y = (v: number) => top + v * scale
  return segments.map((s): GlyphSegment => {
    switch (s[0]) {
      case 'M':
      case 'L':
        return [s[0], x(s[1]), y(s[2])]
      case 'C':
        return ['C', x(s[1]), y(s[2]), x(s[3]), y(s[4]), x(s[5]), y(s[6])]
    }
  })
}

/** A number with at most two decimals, no trailing zeros, never `-0`. */
function num(n: number): string {
  const r = Math.round(n * 100) / 100
  return String(r === 0 ? 0 : r)
}

/** The glyph as an SVG path `d`, such as `M 1 11 L 11 1`; numbers with at most two decimals. */
export function glyphPathData(segments: GlyphSegment[]): string {
  return segments
    .map(([command, ...values]) => [command, ...values.map(num)].join(' '))
    .join(' ')
}

/** The rim marks' diameter in px (as the untyped dot, 5.7.7). */
export const MARK_SIZE = 20

/** The glyph's square inside a mark, in px. */
export const MARK_GLYPH = 10

/** Where a rim mark sits: Variable types top left, Forms top right. */
export type MarkCorner = 'top-left' | 'top-right'

/** The centre of a rim mark: on the circle of radius `r` at 45°, `(cx ± r/√2, cy − r/√2)`. */
export function markCentre(
  cx: number,
  cy: number,
  r: number,
  corner: MarkCorner,
): { x: number; y: number } {
  const d = r / Math.SQRT2
  return { x: corner === 'top-left' ? cx - d : cx + d, y: cy - d }
}
