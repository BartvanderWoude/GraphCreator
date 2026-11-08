/**
 * Circle size from a node's name (spec 5.7.6). A pure estimate of 13 px IBM Plex Sans 500 at line
 * height 1.25, so `autoLayout` and the store can use it without the DOM.
 */

export const NODE_MIN_DIAMETER = 64
export const NODE_MAX_DIAMETER = 136
/** Characters per line. */
export const LABEL_MAX_CHARS = 14
export const LABEL_MAX_LINES = 3

/** Estimated width of one character, in px. */
const CHAR_WIDTH = 7.5
/** Line height, in px. */
const LINE_HEIGHT = 16
/** Space between the text's bounding box and the circle, in px (both sides together). */
const PADDING = 16

export interface NodeLabel {
  lines: string[]
  truncated: boolean
}

/** Length in code points, so a character outside the BMP counts once. */
function len(text: string): number {
  return Array.from(text).length
}

/** Diameter of the circle that holds `lines`: clamped to the limits and rounded up to even. */
function diameterOf(lines: string[]): number {
  const w = Math.max(0, ...lines.map(len)) * CHAR_WIDTH
  const h = lines.length * LINE_HEIGHT
  const d = Math.ceil(Math.sqrt(w * w + h * h) + PADDING)
  const clamped = Math.min(NODE_MAX_DIAMETER, Math.max(NODE_MIN_DIAMETER, d))
  return clamped % 2 === 0 ? clamped : clamped + 1
}

/** Splits the trimmed name on whitespace; words longer than LABEL_MAX_CHARS become 14-character pieces. */
function words(name: string): string[] {
  const result: string[] = []
  for (const word of name.trim().split(/\s+/)) {
    if (word === '') continue
    const chars = Array.from(word)
    for (let i = 0; i < chars.length; i += LABEL_MAX_CHARS) {
      result.push(chars.slice(i, i + LABEL_MAX_CHARS).join(''))
    }
  }
  return result
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

/** Wraps a node name into at most three lines of at most 14 characters, for the smallest circle. */
export function wrapLabel(name: string): NodeLabel {
  const parts = words(name)
  const total = len(parts.join(' '))
  const longest = Math.max(0, ...parts.map(len))

  let best: string[] | null = null
  let bestDiameter = Infinity
  for (let k = 1; k <= LABEL_MAX_LINES; k++) {
    for (
      let limit = Math.max(longest, Math.ceil(total / k));
      limit <= LABEL_MAX_CHARS;
      limit++
    ) {
      const lines = fill(parts, limit)
      if (lines.length <= k) {
        const d = diameterOf(lines)
        if (
          d < bestDiameter ||
          (d === bestDiameter && best && lines.length < best.length)
        ) {
          best = lines
          bestDiameter = d
        }
        break
      }
    }
  }
  if (best) return { lines: best, truncated: false }

  const lines = fill(parts, LABEL_MAX_CHARS).slice(0, LABEL_MAX_LINES)
  const last = Array.from(lines[LABEL_MAX_LINES - 1])
  lines[LABEL_MAX_LINES - 1] = last.slice(0, LABEL_MAX_CHARS - 1).join('') + '…'
  return { lines, truncated: true }
}

/** Diameter in px of the circle for a node called `name`: even, within the min and max. */
export function nodeDiameter(name: string): number {
  return diameterOf(wrapLabel(name).lines)
}
