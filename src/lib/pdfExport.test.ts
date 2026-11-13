import { describe, expect, it } from 'vitest'
import type { Graph } from '@/model/graph'
import { nodeLabel } from '@/model/nodeSize'
import type { Scene, SceneCircle, SceneText } from './imageScene'
import { sceneToPdf, toPdf } from './pdfExport'

function circle(cx: number, cy: number, r: number): SceneCircle {
  return { cx, cy, r, fill: '#e3f1e8', stroke: '#4a946a', strokeWidth: 2 }
}

function text(
  x: number,
  y: number,
  value: string,
  anchor: SceneText['anchor'] = 'middle',
): SceneText {
  return { x, y, text: value, size: 13, weight: 500, color: '#24563a', anchor }
}

/** Two nodes, one edge, and a legend with one row. */
function scene(over: Partial<Scene> = {}): Scene {
  return {
    title: 'Smoking & birth weight',
    width: 320,
    height: 200,
    background: '#ffffff',
    edges: [
      {
        x1: 90,
        y1: 60,
        x2: 210,
        y2: 60,
        color: '#64748b',
        width: 1.5,
        head: [
          [211, 60],
          [202, 55.5],
          [202, 64.5],
        ],
      },
    ],
    badges: [],
    circles: [circle(60, 60, 29), circle(240, 60, 29)],
    texts: [
      text(60, 64.88, 'AV'),
      text(240, 56.88, 'f(x) \\ y'),
      text(240, 72.88, 'é β'),
    ],
    nodeIds: ['n1', 'n2'],
    legend: {
      x: 200,
      y: 120,
      width: 96,
      height: 36,
      corner: 'bottom-right',
      background: '#ffffff',
      border: '#e2e8f0',
      items: [
        {
          role: 'exposure',
          label: 'Exposure',
          swatch: { ...circle(213, 138, 5), strokeWidth: 1.5 },
          text: {
            ...text(226, 142, 'Exposure', 'start'),
            size: 12,
            weight: 400,
            color: '#0f172a',
          },
        },
      ],
    },
    ...over,
  }
}

/** The file as text, one character per byte. */
function latin1(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes)
}

function stream(pdf: string): string {
  const match = /stream\n([\s\S]*?)endstream/.exec(pdf)
  if (!match) throw new Error('no stream')
  return match[1]
}

const count = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].length

describe('sceneToPdf', () => {
  it('starts with %PDF-1.4 and ends with %%EOF', () => {
    const bytes = sceneToPdf(scene())
    expect(bytes).toBeInstanceOf(Uint8Array)
    const pdf = latin1(bytes)
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('points every xref offset at its object and startxref at the table', () => {
    const pdf = latin1(sceneToPdf(scene()))
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)?.[1])
    expect(pdf.slice(startxref, startxref + 5)).toBe('xref\n')
    const table = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(pdf)
    expect(table).not.toBeNull()
    const size = Number(table![1])
    const entries = table![2].match(/.{20}/gs) ?? []
    expect(entries).toHaveLength(size)
    expect(entries[0]).toBe('0000000000 65535 f \n')
    for (let i = 1; i < size; i++) {
      expect(entries[i]).toMatch(/^\d{10} 00000 n \n$/)
      const offset = Number(entries[i].slice(0, 10))
      expect(pdf.slice(offset).startsWith(`${i} 0 obj\n`)).toBe(true)
    }
    expect(pdf).toContain(`/Size ${size} /Root 1 0 R /Info 6 0 R`)
  })

  it('gives the stream its byte length', () => {
    const pdf = latin1(sceneToPdf(scene()))
    const length = Number(/\/Length (\d+)/.exec(pdf)?.[1])
    expect(length).toBe(stream(pdf).length)
  })

  it('has the catalog, the page and the Helvetica font', () => {
    const pdf = latin1(sceneToPdf(scene()))
    expect(pdf).toContain('/Type /Catalog /Pages 2 0 R')
    expect(pdf).toContain('/Type /Pages /Kids [3 0 R] /Count 1')
    expect(pdf).toContain(
      '/Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding',
    )
    expect(pdf).not.toContain('/Filter')
  })

  it('sizes the MediaBox as the scene size × 0.75', () => {
    const pdf = latin1(sceneToPdf(scene({ width: 321, height: 200 })))
    expect(pdf).toContain('/MediaBox [0 0 240.75 150]')
  })

  it('flips the page and draws one B per circle and one Tj per text line', () => {
    const body = stream(latin1(sceneToPdf(scene({ legend: null }))))
    expect(body.startsWith('0.75 0 0 -0.75 0 150 cm\n')).toBe(true)
    expect(body).toContain('1 1 1 rg\n0 0 320 200 re f\n')
    expect(count(body, /^h B$/gm)).toBe(2)
    expect(count(body, / Tj ET$/gm)).toBe(3)
    expect(count(body, / c$/gm)).toBe(8)
  })

  it('draws an edge as a stroked line and a filled arrowhead', () => {
    const body = stream(latin1(sceneToPdf(scene())))
    expect(body).toContain('0.392 0.455 0.545 RG 1.5 w\n90 60 m 210 60 l S\n')
    expect(body).toContain('211 60 m 202 55.5 l 202 64.5 l h f')
  })

  it('draws a circle with four Béziers, κ = 0.5523', () => {
    const body = stream(latin1(sceneToPdf(scene())))
    // r = 29, k = 16.0167
    expect(body).toContain('89 60 m\n89 76.02 76.02 89 60 89 c\n')
    expect(body).toContain('0.89 0.945 0.91 rg 0.29 0.58 0.416 RG 2 w')
  })

  it('draws the legend as a rounded box with its swatch and label', () => {
    const body = stream(latin1(sceneToPdf(scene())))
    expect(count(body, /^h B$/gm)).toBe(4)
    expect(body).toContain(
      '1 1 1 rg 0.886 0.91 0.941 RG 1 w\n204 120 m\n292 120 l\n',
    )
    expect(body).toContain('1 0 0 -1 226 142 Tm (Exposure) Tj ET')
  })

  it('draws a sign badge after the edges and before the nodes, − as an en dash', () => {
    const badge = (glyph: string): Scene['badges'][number] => ({
      circle: {
        cx: 150,
        cy: 60,
        r: 7.5,
        fill: '#ffffff',
        stroke: '#64748b',
        strokeWidth: 1,
      },
      text: { ...text(150, 64.5, glyph), size: 12, color: '#64748b' },
    })
    const body = stream(
      latin1(
        sceneToPdf(
          scene({ legend: null, badges: [badge('+'), badge('\u2212')] }),
        ),
      ),
    )
    // Two badge circles and two node circles, filled and stroked.
    expect(count(body, /^h B$/gm)).toBe(4)
    expect(body).toContain('1 1 1 rg 0.392 0.455 0.545 RG 1 w\n157.5 60 m\n')
    // `+` is 584 units wide: 584 × 12 / 1000 / 2 = 3.504; the en dash is 556 units.
    expect(body).toContain('BT /F1 12 Tf 1 0 0 -1 146.5 64.5 Tm (+) Tj ET')
    expect(body).toContain('BT /F1 12 Tf 1 0 0 -1 146.66 64.5 Tm (\x96) Tj ET')
    const edge = body.indexOf(' l h f')
    const plus = body.indexOf('(+) Tj')
    expect(edge).toBeLessThan(body.indexOf('157.5 60 m'))
    expect(plus).toBeLessThan(body.indexOf('89 60 m'))
    expect(body).toContain('0.392 0.455 0.545 rg\nBT /F1 12 Tf')
  })

  it('starts a centred line at the AFM-measured offset', () => {
    const body = stream(latin1(sceneToPdf(scene())))
    // A and V are 667 units each: 2 × 667 × 13 / 1000 = 17.342, half is 8.671.
    expect(body).toContain('BT /F1 13 Tf 1 0 0 -1 51.33 64.88 Tm (AV) Tj ET')
  })

  it('escapes (, ) and \\', () => {
    const pdf = latin1(sceneToPdf(scene()))
    expect(pdf).toContain('(f\\(x\\) \\\\ y) Tj')
  })

  it('writes é as its WinAnsi byte and β as ?', () => {
    const bytes = sceneToPdf(scene())
    const pdf = latin1(bytes)
    expect(pdf).toContain('(\xe9 ?) Tj')
    const at = pdf.indexOf('(\xe9 ?) Tj')
    expect(bytes[at + 1]).toBe(0xe9)
    expect(bytes.every((b) => b <= 255)).toBe(true)
  })

  it('maps WinAnsi characters from 128–159', () => {
    const pdf = latin1(
      sceneToPdf(scene({ texts: [text(10, 10, '€ – “x”', 'start')] })),
    )
    expect(pdf).toContain('(\x80 \x96 \x93x\x94) Tj')
  })

  it('puts the graph name in /Title and GraphCreator in /Producer', () => {
    const pdf = latin1(sceneToPdf(scene()))
    expect(pdf).toContain(
      '/Title (Smoking & birth weight) /Producer (GraphCreator)',
    )
    expect(latin1(sceneToPdf(scene({ title: '' })))).toContain('/Title (Graph)')
    expect(latin1(sceneToPdf(scene({ title: 'a(b)' })))).toContain(
      '/Title (a\\(b\\))',
    )
  })

  it('writes a non-ASCII title as UTF-16BE', () => {
    const pdf = latin1(sceneToPdf(scene({ title: 'Größe β' })))
    expect(pdf).toContain('/Title <FEFF0047007200F600DF0065002003B2>')
  })

  it('writes no -0 and at most two decimals for coordinates', () => {
    const body = stream(
      latin1(
        sceneToPdf(
          scene({
            legend: null,
            texts: [],
            circles: [circle(-0.001, 1 / 3, 10)],
          }),
        ),
      ),
    )
    expect(body).not.toMatch(/(^|\s)-0(\s|$)/)
    expect(body).toContain('10 0.33 m')
    for (const n of body.match(/-?\d+\.\d+/g) ?? []) {
      expect(n.split('.')[1].length).toBeLessThanOrEqual(3)
    }
  })
})

describe('toPdf', () => {
  it('draws every name at its own font size (5.7.6)', () => {
    const graph: Graph = {
      name: 'Sizes',
      nodes: [
        { id: 'n1', name: 'Age', role: 'other', pos: { x: 0, y: 0 } },
        {
          id: 'n2',
          name: 'Maternal smoking during pregnancy',
          role: 'other',
          pos: { x: 200, y: 0 },
        },
      ],
      edges: [],
    }
    const short = nodeLabel('Age').fontSize
    const long = nodeLabel('Maternal smoking during pregnancy').fontSize
    expect(long).toBeLessThan(short)
    const body = stream(latin1(toPdf(graph)))
    expect(body).toContain(`BT /F1 ${short} Tf`)
    expect(count(body, new RegExp(`BT /F1 ${long} Tf`, 'g'))).toBe(4)
  })
})
