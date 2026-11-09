import { describe, expect, it } from 'vitest'
import { EXPORT_PALETTES } from './palette'
import { ROLES } from './schema'

// `node:fs` is loaded dynamically and typed by hand, as in theme.test.ts: the app tsconfig has
// no Node types, and Vitest turns CSS imports (even `?raw`) into empty strings.
const fsModule: string = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
  readFileSync(path: URL, encoding: 'utf8'): string
}
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

/** Hex custom properties of the top-level block whose selector is `selector` (as theme.test.ts). */
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

describe('EXPORT_PALETTES', () => {
  it.each([
    ['light', ':root'],
    ['dark', '.dark'],
  ] as const)('%s equals the %s tokens of index.css', (theme, selector) => {
    const t = tokens(selector)
    const palette = EXPORT_PALETTES[theme]
    expect(palette.background).toBe(t.get('--background'))
    expect(palette.foreground).toBe(t.get('--foreground'))
    expect(palette.border).toBe(t.get('--border'))
    expect(palette.edge).toBe(t.get('--edge'))
    for (const role of ROLES) {
      expect(palette.roles[role]).toEqual({
        fill: t.get(`--role-${role}-fill`),
        line: t.get(`--role-${role}-line`),
        text: t.get(`--role-${role}-text`),
      })
    }
  })

  it('has a white light background', () => {
    expect(EXPORT_PALETTES.light.background).toBe('#ffffff')
  })
})
