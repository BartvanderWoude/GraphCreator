import { describe, expect, it } from 'vitest'
import { FORMS, STRENGTHS, VAR_TYPES } from '@/model/schema'
import {
  arrowSize,
  DISPLAY_DEFAULTS,
  DISPLAY_KEYS,
  EDGE_WIDTH,
  edgeWidth,
  FORM_GLYPHS,
  GLYPH_BOX,
  glyphPathData,
  markCentre,
  placeGlyph,
  signTone,
  STRENGTH_WIDTHS,
  TYPE_LETTERS,
  type GlyphSegment,
} from './display'

describe('display options', () => {
  it('lists the six keys in switch order, all off by default', () => {
    expect(DISPLAY_KEYS).toEqual([
      'signs',
      'signColors',
      'strength',
      'forms',
      'types',
      'dashedLatent',
    ])
    expect(Object.keys(DISPLAY_DEFAULTS).sort()).toEqual(
      [...DISPLAY_KEYS].sort(),
    )
    for (const key of DISPLAY_KEYS) expect(DISPLAY_DEFAULTS[key]).toBe(false)
  })
})

describe('signTone', () => {
  it('gives the tone of each sign and of none', () => {
    expect(signTone('positive')).toBe('positive')
    expect(signTone('negative')).toBe('negative')
    expect(signTone(undefined)).toBe('neutral')
  })

  it('reads a level map as its badge', () => {
    expect(signTone({ a: 'positive', b: 'negative' })).toBe('neutral')
    expect(signTone({ a: 'negative', b: 'negative' })).toBe('negative')
    expect(signTone({ a: 'positive' })).toBe('positive')
    expect(signTone({})).toBe('neutral')
  })
})

describe('edge widths and arrowheads', () => {
  it('gives each strength its width and none the default', () => {
    expect(STRENGTHS.map((s) => edgeWidth(s))).toEqual([1.5, 3, 4.5])
    expect(STRENGTHS.map((s) => STRENGTH_WIDTHS[s])).toEqual([1.5, 3, 4.5])
    expect(edgeWidth(undefined)).toBe(EDGE_WIDTH)
    expect(EDGE_WIDTH).toBe(1.5)
  })

  it('grows the arrowhead with the width', () => {
    expect(arrowSize(1.5)).toBe(9)
    expect(arrowSize(3)).toBe(12)
    expect(arrowSize(4.5)).toBe(15)
  })
})

describe('marks', () => {
  it('has a letter for every type', () => {
    expect(VAR_TYPES.map((t) => TYPE_LETTERS[t])).toEqual(['C', 'O', 'N', 'D'])
  })

  it('has a glyph for every form, inside the box', () => {
    for (const form of FORMS) {
      const glyph = FORM_GLYPHS[form]
      expect(glyph.length).toBeGreaterThan(1)
      expect(glyph[0][0]).toBe('M')
      for (const [, ...values] of glyph) {
        for (const v of values) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(GLYPH_BOX)
        }
      }
    }
    expect(glyphPathData(FORM_GLYPHS.linear)).toBe('M 1 11 L 11 1')
    expect(glyphPathData(FORM_GLYPHS.smooth)).toBe('M 1 11 C 6 11 6 1 11 1')
    expect(glyphPathData(FORM_GLYPHS.threshold)).toBe(
      'M 1 10 L 6 10 L 6 2 L 11 2',
    )
  })

  it('maps the glyph box onto the square', () => {
    const box: GlyphSegment[] = [
      ['M', 0, 0],
      ['L', GLYPH_BOX, GLYPH_BOX],
      ['C', 0, GLYPH_BOX, GLYPH_BOX, 0, 6, 6],
    ]
    expect(placeGlyph(box, 100, 50, 10)).toEqual([
      ['M', 95, 45],
      ['L', 105, 55],
      ['C', 95, 55, 105, 45, 100, 50],
    ])
    expect(placeGlyph(box, 6, 6, GLYPH_BOX)).toEqual(box)
  })

  it('writes path data with at most two decimals', () => {
    expect(
      glyphPathData([
        ['M', 1 / 3, -0.001],
        ['L', 2.006, 10],
        ['C', 1.5, 2.25, 3.125, 4, 5.999, 6.1],
      ]),
    ).toBe('M 0.33 0 L 2.01 10 C 1.5 2.25 3.13 4 6 6.1')
  })

  it('puts the marks on the rim at 45°', () => {
    const d = 30 / Math.SQRT2
    const left = markCentre(100, 200, 30, 'top-left')
    const right = markCentre(100, 200, 30, 'top-right')
    expect(left.x).toBeCloseTo(100 - d, 10)
    expect(left.y).toBeCloseTo(200 - d, 10)
    expect(right.x).toBeCloseTo(100 + d, 10)
    expect(right.y).toBeCloseTo(200 - d, 10)
    expect(Math.hypot(right.x - 100, right.y - 200)).toBeCloseTo(30, 10)
  })
})
