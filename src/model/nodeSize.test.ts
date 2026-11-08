import { describe, expect, it } from 'vitest'
import {
  LABEL_MAX_CHARS,
  LABEL_MAX_LINES,
  NODE_MAX_DIAMETER,
  NODE_MIN_DIAMETER,
  nodeDiameter,
  wrapLabel,
} from './nodeSize'

describe('wrapLabel and nodeDiameter', () => {
  it.each([
    ['Age', ['Age'], 64],
    ['Birth weight', ['Birth', 'weight'], 72],
    [
      'Maternal smoking during pregnancy',
      ['Maternal', 'smoking during', 'pregnancy'],
      132,
    ],
  ])('wraps %j as in the spec examples', (name, lines, diameter) => {
    expect(wrapLabel(name)).toEqual({ lines, truncated: false })
    expect(nodeDiameter(name)).toBe(diameter)
  })

  it('never goes below the minimum or above the maximum', () => {
    expect(nodeDiameter('A')).toBe(NODE_MIN_DIAMETER)
    expect(nodeDiameter('')).toBe(NODE_MIN_DIAMETER)
    const long = 'word '.repeat(40)
    expect(nodeDiameter(long)).toBeLessThanOrEqual(NODE_MAX_DIAMETER)
    // Three full lines of 14 characters: √(105² + 48²) + 16 ≈ 131.5 → 132.
    expect(nodeDiameter('abcdefghijklmn abcdefghijklmn abcdefghijklmn')).toBe(
      132,
    )
  })

  it('gives even diameters', () => {
    const names = [
      'A',
      'Age',
      'Birth weight',
      'Socioeconomic status',
      'Smoking',
      'Body mass index',
      'Genetic factors',
      'Maternal smoking during pregnancy',
      'x'.repeat(13),
      'a b c d e f g h i j k l m n o p',
    ]
    for (const name of names) {
      const d = nodeDiameter(name)
      expect(d % 2, name).toBe(0)
      expect(d).toBeGreaterThanOrEqual(NODE_MIN_DIAMETER)
      expect(d).toBeLessThanOrEqual(NODE_MAX_DIAMETER)
    }
  })

  it('hard-splits a word longer than 14 characters', () => {
    expect(wrapLabel('Pneumonoultramicroscopic')).toEqual({
      lines: ['Pneumonoultram', 'icroscopic'],
      truncated: false,
    })
    for (const line of wrapLabel('x'.repeat(30)).lines) {
      expect(line.length).toBeLessThanOrEqual(LABEL_MAX_CHARS)
    }
  })

  it('truncates a name that needs more than three lines', () => {
    const label = wrapLabel(
      'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk',
    )
    expect(label).toEqual({
      lines: ['aaaa bbbb cccc', 'dddd eeee ffff', 'gggg hhhh iii…'],
      truncated: true,
    })
    expect(label.lines).toHaveLength(LABEL_MAX_LINES)
    expect(
      nodeDiameter('aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk'),
    ).toBe(132)
  })

  it('prefers fewer lines on a tie', () => {
    // One line and two lines both give the minimum diameter.
    expect(wrapLabel('Ab cd')).toEqual({ lines: ['Ab cd'], truncated: false })
    expect(nodeDiameter('Ab cd')).toBe(NODE_MIN_DIAMETER)
  })

  it('ignores leading, trailing and repeated spaces', () => {
    expect(wrapLabel('  Birth   weight  ')).toEqual(wrapLabel('Birth weight'))
    expect(nodeDiameter('  Age ')).toBe(nodeDiameter('Age'))
  })
})
