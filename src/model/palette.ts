import type { Role } from './schema'

/**
 * Colours for exported pictures and for the DOT and Mermaid writers (spec 4.11, 4.15): the
 * `:root` (light) and `.dark` values of `--background`, `--foreground`, `--border`, `--edge` and
 * `--role-<role>-fill|line|text` in `src/index.css`, checked by `palette.test.ts`.
 */

export type ImageTheme = 'light' | 'dark'

export interface ExportPalette {
  background: string
  foreground: string
  border: string
  edge: string
  roles: Record<Role, { fill: string; line: string; text: string }>
}

export const EXPORT_PALETTES: Record<ImageTheme, ExportPalette> = {
  light: {
    background: '#ffffff',
    foreground: '#0f172a',
    border: '#e2e8f0',
    edge: '#64748b',
    roles: {
      exposure: { fill: '#e3f1e8', line: '#4a946a', text: '#24563a' },
      outcome: { fill: '#e2eaf8', line: '#5b83cf', text: '#23407a' },
      latent: { fill: '#f3f4f6', line: '#80868f', text: '#374151' },
      adjusted: { fill: '#f8eedd', line: '#ad7a2c', text: '#6b4510' },
      selected: { fill: '#efe7f7', line: '#9375c4', text: '#4c2f75' },
      other: { fill: '#ffffff', line: '#7d8a9c', text: '#0f172a' },
    },
  },
  dark: {
    background: '#0e1513',
    foreground: '#e6eeec',
    border: '#24332f',
    edge: '#8a9aae',
    roles: {
      exposure: { fill: '#1b3326', line: '#6fcf97', text: '#d7f5e3' },
      outcome: { fill: '#1c2740', line: '#8aaef0', text: '#dce6fb' },
      latent: { fill: '#1f2429', line: '#9ca3af', text: '#e5e7eb' },
      adjusted: { fill: '#33281a', line: '#e0b061', text: '#f8e7c8' },
      selected: { fill: '#2a2140', line: '#b9a0e3', text: '#ece3fa' },
      other: { fill: '#15201e', line: '#8a9aae', text: '#e6eeec' },
    },
  },
}
