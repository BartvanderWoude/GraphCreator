import { describe, expect, it } from 'vitest'
import { ANALYSIS_KEYS } from '@/store/uiStore'
import { ANALYSIS_TEXT, ANALYSIS_TITLES, joinNames } from './copy'

describe('joinNames', () => {
  it('joins zero, one, two and three names', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A and B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
    expect(joinNames(['Age', 'Maternal smoking', 'SES', 'Sex'])).toBe(
      'Age, Maternal smoking, SES and Sex',
    )
  })
})

describe('ANALYSIS_TITLES', () => {
  it('has a title for every section, in section order', () => {
    expect(ANALYSIS_KEYS.map((k) => ANALYSIS_TITLES[k])).toEqual([
      'Report',
      'Adjustment sets',
      'Paths',
      'Instruments',
      'Independencies',
    ])
  })
})

describe('ANALYSIS_TEXT templates', () => {
  const t = ANALYSIS_TEXT

  it('fill in the report sentences', () => {
    expect(t.totalEffect(['Maternal smoking'], ['Birth weight'])).toBe(
      'Total effect of Maternal smoking on Birth weight.',
    )
    expect(t.totalEffect(['E1', 'E2'], ['D1', 'D2', 'D3'])).toBe(
      'Total effect of E1 and E2 on D1, D2 and D3.',
    )
    expect(t.zSufficient(['SES', 'Age'])).toBe(
      'Your adjusted set (SES, Age) is sufficient, as implied by this DAG.',
    )
    expect(t.zNotSufficient([])).toBe(
      'Your adjusted set (empty) is not sufficient, as implied by this DAG.',
    )
    expect(t.zNotSufficient(['Z'])).toBe(
      'Your adjusted set (Z) is not sufficient, as implied by this DAG.',
    )
    expect(t.zForbidden(['M', 'K'])).toBe(
      'M and K lie on or after a causal path from the exposure; adjusting for them can block or bias the effect.',
    )
    expect(t.selectionBias(['Hospital admission'])).toBe(
      'Selecting on Hospital admission biases the effect, and no adjustment set can remove that bias.',
    )
    expect(t.selectionBias(['S1', 'S2'])).toBe(
      'Selecting on S1 and S2 biases the effect, and no adjustment set can remove that bias.',
    )
    expect(t.selected(['Hospital admission'])).toBe(
      'Always conditioned on (selected): Hospital admission.',
    )
    expect(t.latent([])).toBe('Latent: none.')
    expect(t.latent(['U1', 'U2'])).toBe('Latent: U1 and U2.')
  })

  it('fill in the list rows and counts', () => {
    expect(t.set([])).toBe('(empty set)')
    expect(t.set(['A', 'Z'])).toBe('A, Z')
    expect(t.count(3)).toBe('(3)')
    expect(t.showAll(42)).toBe('Show all 42')
    expect(t.switchLabel('Adjustment sets')).toBe('Show adjustment sets')
    expect(t.pathTag('causal', true)).toBe('causal · open')
    expect(t.pathTag('biasing', false)).toBe('biasing · closed')
    expect(t.instrument('Z', [])).toBe('Z')
    expect(t.instrument('A', ['B', 'M'])).toBe('A | B, M')
    expect(t.independence('A', 'B', [])).toBe('A ⫫ B')
    expect(t.independence('A', 'B', ['C', 'D'])).toBe('A ⫫ B | C, D')
    expect(t.independence('A', 'B', [])).toContain('⫫')
  })

  it('has the fixed sentences of spec 5.8', () => {
    expect(t.noExposureOrOutcome).toBe(
      'Mark at least one exposure and one outcome to see the analysis.',
    )
    expect(t.setsTruncated).toBe('Showing the first 100 sets.')
    expect(t.pathsTruncated).toBe(
      'There are more than 500 paths, too many to list or highlight.',
    )
  })
})
