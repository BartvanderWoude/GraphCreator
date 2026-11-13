import { describe, expect, it } from 'vitest'
import {
  LABEL_FONT_MAX,
  LABEL_FONT_MIN,
  LABEL_MAX_LINES,
  NODE_DIAMETER,
  nodeLabel,
  lineHeight,
} from './nodeSize'

/**
 * The fit test of spec 5.7.6, written out again here: every line must be no wider than the
 * circle's chord at the line's edge farthest from the centre, inside the 6 px inset.
 */
function everyLineFits(lines: string[], fontSize: number): boolean {
  const radius = NODE_DIAMETER / 2 - 6
  const pitch = 1.25 * fontSize
  const charWidth = (7.5 / 13) * fontSize
  return lines.every((line, i) => {
    const top = (i - lines.length / 2) * pitch
    const edge = Math.max(Math.abs(top), Math.abs(top + pitch))
    if (edge >= radius) return false
    const chord = 2 * Math.sqrt(radius * radius - edge * edge)
    return [...line].length * charWidth <= chord
  })
}

const NAMES = [
  'A',
  'Age',
  'Birth weight',
  'Smoking',
  'Body mass index',
  'Socioeconomic status',
  'Genetic factors',
  'Gestational age at birth',
  'Maternal smoking during pregnancy',
  'Pre-existing cardiovascular disease',
  'Antihypertensive medication use',
  'Number of cigarettes smoked per day during pregnancy',
  'Pneumonoultramicroscopic',
  'x'.repeat(30),
]

describe('nodeLabel', () => {
  it.each([
    ['Age', ['Age'], 14],
    ['Birth weight', ['Birth', 'weight'], 14],
    ['Socioeconomic status', ['Socioeconomic', 'status'], 10.5],
    [
      'Maternal smoking during pregnancy',
      ['Maternal', 'smoking', 'during', 'pregnancy'],
      11.5,
    ],
    [
      'Pre-existing cardiovascular disease',
      ['Pre-existing', 'cardiovascular', 'disease'],
      10,
    ],
  ])('wraps %j as in the spec examples', (name, lines, fontSize) => {
    expect(nodeLabel(name)).toEqual({ lines, fontSize, truncated: false })
  })

  it('gives a short name the largest font', () => {
    for (const name of ['A', 'Age', 'SES', 'Smoking']) {
      expect(nodeLabel(name).fontSize, name).toBe(LABEL_FONT_MAX)
    }
  })

  it('keeps every font size within the limits, in steps of 0.5 px', () => {
    for (const name of NAMES) {
      const { fontSize } = nodeLabel(name)
      expect(fontSize, name).toBeLessThanOrEqual(LABEL_FONT_MAX)
      expect(fontSize, name).toBeGreaterThanOrEqual(LABEL_FONT_MIN)
      expect((fontSize * 2) % 1, name).toBe(0)
    }
  })

  it('fits every line in the circle, and uses at most LABEL_MAX_LINES', () => {
    for (const name of NAMES) {
      const { lines, fontSize } = nodeLabel(name)
      expect(lines.length, name).toBeLessThanOrEqual(LABEL_MAX_LINES)
      expect(everyLineFits(lines, fontSize), name).toBe(true)
    }
  })

  it('prefers fewer lines at the same font size', () => {
    expect(nodeLabel('Ab cd').lines).toEqual(['Ab cd'])
    // Two lines at LABEL_FONT_MAX beat three lines at the same size.
    expect(nodeLabel('Body mass index').lines).toEqual(['Body mass', 'index'])
  })

  it('breaks a word that is too wide for any line', () => {
    const label = nodeLabel('Pneumonoultramicroscopic')
    expect(label.truncated).toBe(false)
    expect(label.lines.join('')).toBe('Pneumonoultramicroscopic')
    expect(label.lines.length).toBeGreaterThan(1)
    expect(everyLineFits(label.lines, label.fontSize)).toBe(true)
  })

  it('truncates a name that cannot fit at the smallest font', () => {
    const label = nodeLabel('x'.repeat(200))
    expect(label.truncated).toBe(true)
    expect(label.fontSize).toBe(LABEL_FONT_MIN)
    expect(label.lines).toHaveLength(LABEL_MAX_LINES)
    expect(label.lines.at(-1)?.endsWith('…')).toBe(true)
    expect(everyLineFits(label.lines, label.fontSize)).toBe(true)
  })

  it('ignores leading, trailing and repeated spaces', () => {
    expect(nodeLabel('  Birth   weight  ')).toEqual(nodeLabel('Birth weight'))
    expect(nodeLabel('  Age ')).toEqual(nodeLabel('Age'))
  })

  it('gives an empty name no lines', () => {
    expect(nodeLabel('')).toEqual({
      lines: [],
      fontSize: LABEL_FONT_MAX,
      truncated: false,
    })
  })

  it('counts a character outside the BMP once', () => {
    // Four astral characters are as wide as four ordinary ones, not eight.
    expect(nodeLabel('𝔄𝔅ℭ𝔇').lines).toEqual(['𝔄𝔅ℭ𝔇'])
    expect(nodeLabel('𝔄𝔅ℭ𝔇').fontSize).toBe(LABEL_FONT_MAX)
  })

  it('gives the line pitch for a font size', () => {
    expect(lineHeight(13)).toBeCloseTo(16.25)
    expect(lineHeight(10)).toBeCloseTo(12.5)
  })
})
