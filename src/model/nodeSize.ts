/**
 * Circle size and label fitting (spec 5.7.6). Every circle has the same diameter; a long name
 * gets a smaller font so that it still fits. A pure estimate of IBM Plex Sans 500, so
 * `autoLayout`, the store and the image export can use it without the DOM.
 */

/** Diameter of every circle, in px. */
export const NODE_DIAMETER = 96
/** Largest label font size, in px. */
export const LABEL_FONT_MAX = 14
/** Smallest label font size, in px. */
export const LABEL_FONT_MIN = 9
/** Most lines a label is wrapped into. */
export const LABEL_MAX_LINES = 5

/** Estimated character width as a fraction of the font size. */
const CHAR_WIDTH_RATIO = 7.5 / 13
/** Line height as a multiple of the font size. */
const LINE_HEIGHT_RATIO = 1.25
/** Space between the text and the circle's outline, in px. */
const LABEL_INSET = 6
/** Step between the font sizes that are tried, in px. */
const FONT_STEP = 0.5

export interface NodeLabel {
  lines: string[]
  /** Font size of the lines, in px. */
  fontSize: number
  truncated: boolean
}

/** Line pitch for `fontSize`, in px. */
export function lineHeight(fontSize: number): number {
  return LINE_HEIGHT_RATIO * fontSize
}

/** Length in code points, so a character outside the BMP counts once. */
function len(text: string): number {
  return Array.from(text).length
}

/**
 * Characters that fit on line `index` of a block of `count` lines: the chord of the circle at
 * the line's edge farthest from the centre, inside `LABEL_INSET`. 0 when the line lies outside.
 */
function lineCapacity(index: number, count: number, fontSize: number): number {
  const radius = NODE_DIAMETER / 2 - LABEL_INSET
  const pitch = lineHeight(fontSize)
  const top = (index - count / 2) * pitch
  const edge = Math.max(Math.abs(top), Math.abs(top + pitch))
  if (edge >= radius) return 0
  const chord = 2 * Math.sqrt(radius * radius - edge * edge)
  return Math.floor(chord / (CHAR_WIDTH_RATIO * fontSize))
}

/** Whether `lines`, stacked and centred, fit the circle at `fontSize`. */
function fits(lines: string[], fontSize: number): boolean {
  return lines.every(
    (line, i) => len(line) <= lineCapacity(i, lines.length, fontSize),
  )
}

/** Splits the trimmed name on whitespace. Words are never broken here. */
function words(name: string): string[] {
  return name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
}

/** Greedy line filling: each line takes words while it stays within `limit` characters. */
function fill(parts: string[], limit: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of parts) {
    if (line === '') line = word
    else if (len(line) + 1 + len(word) <= limit) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/** The widest wrapping of `parts` into at most `count` lines, or null when there is none. */
function wrapInto(parts: string[], count: number): string[] | null {
  const total = len(parts.join(' '))
  const longest = Math.max(0, ...parts.map(len))
  for (
    let limit = Math.max(longest, Math.ceil(total / count));
    limit <= total;
    limit++
  ) {
    const lines = fill(parts, limit)
    if (lines.length <= count) return lines
  }
  return null
}

/**
 * Fills a block of `count` lines, each up to its own width, breaking a word that is too wide
 * for the line it starts. `rest` holds the words that did not fit in the block.
 */
function pack(
  parts: string[],
  count: number,
  fontSize: number,
): { lines: string[]; rest: string[] } {
  const rest = [...parts]
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    const capacity = lineCapacity(i, count, fontSize)
    let line = ''
    while (rest.length > 0) {
      const word = rest[0]
      const joined = line === '' ? word : `${line} ${word}`
      if (len(joined) <= capacity) {
        rest.shift()
        line = joined
        continue
      }
      // A word wider than the whole line has to be broken.
      if (line === '' && capacity > 0) {
        const chars = Array.from(word)
        line = chars.slice(0, capacity).join('')
        rest[0] = chars.slice(capacity).join('')
      }
      break
    }
    lines.push(line)
    if (rest.length === 0) break
  }
  return { lines, rest }
}

/**
 * Last resort for a name that does not fit at `LABEL_FONT_MIN` with its words kept whole: break
 * the words that are too wide, and cut the text with an ellipsis when it still does not fit.
 */
function cut(parts: string[]): NodeLabel {
  const fontSize = LABEL_FONT_MIN
  for (let count = 1; count <= LABEL_MAX_LINES; count++) {
    const { lines, rest } = pack(parts, count, fontSize)
    if (rest.length === 0) return { lines, fontSize, truncated: false }
  }
  const { lines } = pack(parts, LABEL_MAX_LINES, fontSize)
  const last = lines.length - 1
  const room = Math.max(1, lineCapacity(last, lines.length, fontSize) - 1)
  lines[last] =
    Array.from(lines[last]).slice(0, room).join('').replace(/\s+$/, '') + '…'
  return { lines, fontSize, truncated: true }
}

/**
 * Wrapping, font size and truncation of a node's name: the largest font size at which the name
 * fits the circle, preferring fewer lines.
 */
export function nodeLabel(name: string): NodeLabel {
  const parts = words(name)
  const candidates: string[][] = []
  for (let count = 1; count <= LABEL_MAX_LINES; count++) {
    const lines = wrapInto(parts, count)
    if (lines) candidates.push(lines)
  }
  for (
    let fontSize = LABEL_FONT_MAX;
    fontSize >= LABEL_FONT_MIN;
    fontSize -= FONT_STEP
  ) {
    for (const lines of candidates) {
      if (fits(lines, fontSize)) return { lines, fontSize, truncated: false }
    }
  }
  return cut(parts)
}
