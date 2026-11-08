import { describe, expect, it } from 'vitest'
import { ROLES } from '@/model/schema'

/**
 * Contrast checks for the Calm teal tokens (spec 5.7.2): text pairs at least 4.5:1; circle
 * outlines, edges and the selection border at least 3:1 against --canvas. Both themes.
 */

// `node:fs` is loaded dynamically and typed by hand: the app tsconfig has no Node types, and
// Vitest turns CSS imports (even `?raw`) into empty strings.
const fsModule: string = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
  readFileSync(path: URL, encoding: 'utf8'): string
}
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

/** Hex custom properties of every top-level block whose selector is exactly `selector`. */
function tokens(selector: string): Map<string, string> {
  const result = new Map<string, string>()
  const blocks = /(^|\n)([^{}\n]+)\{([^{}]*)\}/g
  for (const [, , head, body] of css.matchAll(blocks)) {
    if (head.trim() !== selector) continue
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const v = value.trim()
      if (/^#[0-9a-f]{6}$/i.test(v)) result.set(name, v.toLowerCase())
    }
  }
  return result
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = 4.5
const GRAPHIC = 3

/** [foreground token, background token, minimum ratio] */
const PAIRS: [string, string, number][] = [
  // Text on background, surfaces and canvas.
  ...['--background', '--card', '--popover', '--canvas'].flatMap(
    (bg): [string, string, number][] => [
      ['--foreground', bg, TEXT],
      ['--muted-foreground', bg, TEXT],
    ],
  ),
  ['--card-foreground', '--card', TEXT],
  ['--popover-foreground', '--popover', TEXT],
  ['--secondary-foreground', '--secondary', TEXT],
  ['--primary-foreground', '--primary', TEXT],
  ['--accent-foreground', '--accent', TEXT],
  ['--warning-fg', '--warning-bg', TEXT],
  ['--error-fg', '--error-bg', TEXT],
  // Roles: text on fill, outline against the canvas.
  ...ROLES.flatMap((role): [string, string, number][] => [
    [`--role-${role}-text`, `--role-${role}-fill`, TEXT],
    [`--role-${role}-line`, '--canvas', GRAPHIC],
  ]),
  // Edges and the selection border against the canvas.
  ['--edge', '--canvas', GRAPHIC],
  ['--primary', '--canvas', GRAPHIC],
]

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
])('%s theme tokens', (_theme, selector) => {
  const t = tokens(selector)

  it.each(PAIRS)('%s on %s meets %d:1', (fg, bg, min) => {
    const a = t.get(fg)
    const b = t.get(bg)
    expect(a, `${fg} is not a hex value in ${selector}`).toBeDefined()
    expect(b, `${bg} is not a hex value in ${selector}`).toBeDefined()
    expect(contrast(a!, b!)).toBeGreaterThanOrEqual(min)
  })
})

describe('token parsing', () => {
  it('reads the raw source of index.css', () => {
    expect(css).toContain(':root {')
    expect(tokens(':root').get('--primary')).toBe('#0f766e')
    expect(tokens('.dark').get('--primary')).toBe('#2dd4bf')
  })
})

describe('contrast', () => {
  it('matches the WCAG formula', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff')).toBe(1)
    expect(contrast('#0f766e', '#ffffff')).toBeCloseTo(5.47, 2)
  })
})
