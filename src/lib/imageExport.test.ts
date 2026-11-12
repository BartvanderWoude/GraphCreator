import { describe, expect, it } from 'vitest'
import { parseGraphText } from '@/model/fileFormat'
import { emptyGraph, type GNode, type Graph } from '@/model/graph'
import { nodeDiameter, wrapLabel } from '@/model/nodeSize'
import { parseYaml } from '@/model/yaml'
import {
  EXPORT_MARGIN,
  EXPORT_PALETTES,
  imageFileName,
  svgSize,
  toSvg,
  toTikz,
} from './imageExport'
import { imageScene } from './imageScene'

const fixtures: Record<string, string> = import.meta.glob(
  '../model/__fixtures__/smoking.dag.yaml',
  { query: '?raw', import: 'default', eager: true },
)

function smoking(): Graph {
  const result = parseYaml(fixtures['../model/__fixtures__/smoking.dag.yaml'])
  if (!result.ok) throw new Error('smoking.dag.yaml does not parse.')
  return result.value
}

function node(id: string, name: string, x: number, y: number): GNode {
  return { id, name, role: 'other', pos: { x, y } }
}

const count = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].length

/** True when every element in `xml` is closed in the right order (a well-formedness check). */
function balanced(xml: string): boolean {
  const stack: string[] = []
  for (const [tag, close, name, selfClose] of xml.matchAll(
    /<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g,
  )) {
    if (tag.startsWith('<?')) continue
    if (selfClose) continue
    if (close) {
      if (stack.pop() !== name) return false
    } else stack.push(name)
  }
  return stack.length === 0
}

describe('svgSize', () => {
  it('is the bounding box plus the margin on each side', () => {
    const g = smoking()
    // Maternal smoking at (0, 0), Birth weight at (300, 0), SES at (150, -120), Genetic factors at (150, 120).
    expect(svgSize(g)).toEqual({
      width: Math.ceil(300 + nodeDiameter('Birth weight') + 2 * EXPORT_MARGIN),
      height: Math.ceil(
        120 + 120 + nodeDiameter('Genetic factors') + 2 * EXPORT_MARGIN,
      ),
    })
  })

  it('rounds up', () => {
    const g: Graph = {
      nodes: [node('n1', 'A', 0, 0), node('n2', 'B', 10.5, 0.25)],
      edges: [],
    }
    // 10.5 + 64 + 48 = 122.5 and 0.25 + 64 + 48 = 112.25.
    expect(svgSize(g)).toEqual({ width: 123, height: 113 })
  })

  it('is a square of twice the margin for an empty graph', () => {
    expect(svgSize(emptyGraph())).toEqual({ width: 48, height: 48 })
  })
})

describe('toSvg', () => {
  it('draws every node, line of text and edge of smoking.dag.yaml', () => {
    const g = smoking()
    const svg = toSvg(g)
    const { width, height } = svgSize(g)
    const lines = g.nodes.reduce(
      (n, v) => n + wrapLabel(v.name).lines.length,
      0,
    )
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain(
      `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`,
    )
    expect(svg).toContain('<title>Smoking and birth weight</title>')
    expect(svg).toContain(
      `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    )
    expect(count(svg, /<circle /g)).toBe(4)
    expect(count(svg, /<text /g)).toBe(lines)
    expect(lines).toBeGreaterThan(4)
    expect(count(svg, /<line /g)).toBe(4)
    expect(count(svg, /<path /g)).toBe(4)
    expect(svg).toContain('>Maternal</text>')
    expect(svg).toContain(
      'font-family="\'IBM Plex Sans\', system-ui, sans-serif"',
    )
    expect(svg).not.toContain('@font-face')
    expect(balanced(svg)).toBe(true)
  })

  it('draws edges before nodes, in the role colours', () => {
    const svg = toSvg(smoking())
    expect(svg.lastIndexOf('<line ')).toBeLessThan(svg.indexOf('<circle '))
    const r = EXPORT_PALETTES.light.roles
    expect(svg).toContain(
      `fill="${r.exposure.fill}" stroke="${r.exposure.line}"`,
    )
    expect(svg).toContain(`fill="${r.latent.text}">Genetic</text>`)
    expect(svg).toContain(
      `stroke="${EXPORT_PALETTES.light.edge}" stroke-width="1.5"`,
    )
  })

  it('uses the canvas geometry: outline inside the circle, arrowhead tip 2 px before the rim', () => {
    const g: Graph = {
      nodes: [node('n1', 'A', 0, 0), node('n2', 'B', 200, 0)],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', evidence: [] }],
    }
    const svg = toSvg(g)
    // Both circles are 64 px; the drawing starts 24 px left of and above the first one.
    expect(svg).toContain('<circle cx="56" cy="56" r="31"')
    expect(svg).toContain('<circle cx="256" cy="56" r="31"')
    // Line from the source rim (x 88) to 8 px before the tip; tip at 256 - 32 - 2 = 222.
    expect(svg).toContain('<line x1="88" y1="56" x2="214" y2="56"')
    expect(svg).toContain('<path d="M222,56 L213,60.5 L213,51.5 Z"')
    // One line of text, its baseline below the centre.
    expect(svg).toContain('<text x="56" y="60.88" fill="#0f172a">A</text>')
  })

  it('embeds the font only with fontDataUrl', () => {
    const svg = toSvg(smoking(), {
      fontDataUrl: 'data:font/woff2;base64,AAAA',
    })
    expect(svg).toContain('@font-face')
    expect(svg).toContain("url(data:font/woff2;base64,AAAA) format('woff2')")
    expect(balanced(svg)).toBe(true)
  })

  it('escapes names', () => {
    const g: Graph = {
      name: 'A < B & "C"',
      nodes: [node('n1', `<a&'b">`, 0, 0)],
      edges: [],
    }
    const svg = toSvg(g)
    expect(svg).toContain('<title>A &lt; B &amp; &quot;C&quot;</title>')
    expect(svg).toContain('>&lt;a&amp;&apos;b&quot;&gt;</text>')
    expect(svg).not.toContain('<a&')
    expect(balanced(svg)).toBe(true)
  })

  it('gives a valid empty image for an empty graph', () => {
    const svg = toSvg(emptyGraph())
    expect(svg).toContain('width="48" height="48" viewBox="0 0 48 48"')
    expect(svg).toContain('<title>Graph</title>')
    expect(svg).not.toContain('<circle')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(balanced(svg)).toBe(true)
  })
})

describe('toTikz', () => {
  it('draws smoking.dag.yaml with only the colours in use', () => {
    const tikz = toTikz(smoking())
    const lines = tikz.split('\n')
    expect(lines[0]).toBe('% GraphCreator export: Smoking and birth weight')
    expect(lines[1]).toBe(
      '% Needs \\usepackage{tikz} and \\usetikzlibrary{arrows.meta}',
    )
    expect(tikz).toContain('\\begin{tikzpicture}[x=0.75pt, y=-0.75pt]')
    expect(tikz.trimEnd().endsWith('\\end{tikzpicture}')).toBe(true)
    expect(count(tikz, /^\\node\[/gm)).toBe(4)
    expect(count(tikz, /^\\draw\[/gm)).toBe(4)
    // Roles in use: exposure, outcome, other (SES) and latent; no adjusted or selected.
    for (const role of ['Exposure', 'Outcome', 'Latent', 'Other']) {
      for (const part of ['Fill', 'Line', 'Text']) {
        expect(tikz).toContain(`\\definecolor{gc${role}${part}}{HTML}{`)
      }
    }
    expect(tikz).not.toContain('gcAdjusted')
    expect(tikz).not.toContain('gcSelected')
    expect(tikz).toContain('\\definecolor{gcExposureFill}{HTML}{E3F1E8}')
    expect(tikz).toContain('\\definecolor{gcEdge}{HTML}{64748B}')
    expect(count(tikz, /\\definecolor/g)).toBe(13)
  })

  it('places nodes on their centres and joins wrapped lines with \\\\', () => {
    const tikz = toTikz(smoking())
    const d = nodeDiameter('Maternal smoking')
    expect(wrapLabel('Maternal smoking').lines).toEqual(['Maternal', 'smoking'])
    expect(tikz).toContain(
      `\\node[circle, draw=gcExposureLine, fill=gcExposureFill, text=gcExposureText, line width=1.5pt, minimum size=${0.75 * d}pt, inner sep=0pt, align=center, font=\\sffamily\\small] (v1) at (${d / 2},${d / 2}) {Maternal\\\\smoking};`,
    )
    expect(tikz).toContain('(v4) at (')
    // SES → Maternal smoking is the first edge.
    expect(tikz).toContain(
      '\\draw[-{Stealth[length=6.75pt,width=6.75pt]}, line width=1.125pt, draw=gcEdge, shorten >=1.5pt] (v3) -- (v1);',
    )
    expect(tikz).toContain('(v4) -- (v2);')
  })

  it('escapes LaTeX special characters', () => {
    const g: Graph = {
      name: 'Test',
      nodes: [node('n1', 'R&D_1 %', 0, 0), node('n2', '\\a{b}$#^~', 100, 0)],
      edges: [],
    }
    const tikz = toTikz(g)
    // `R&D_1 %` → `R\&D\_1 \%`, here wrapped into the lines `R&D_1` and `%`.
    expect(wrapLabel('R&D_1 %').lines).toEqual(['R&D_1', '%'])
    expect(tikz).toContain('{R\\&D\\_1\\\\\\%};')
    expect(tikz).toContain(
      '{\\textbackslash{}a\\{b\\}\\$\\#\\textasciicircum{}\\textasciitilde{}};',
    )
    // No edges: no edge colour.
    expect(tikz).not.toContain('gcEdge')
  })

  it('keeps a line starting with [ or * from becoming an argument of \\\\', () => {
    const g: Graph = { nodes: [node('n1', 'Weight [kg] *', 0, 0)], edges: [] }
    expect(wrapLabel('Weight [kg] *').lines).toEqual(['Weight', '[kg] *'])
    expect(toTikz(g)).toContain('{Weight\\\\{}[kg] *};')
  })

  it('names an unnamed graph "Graph"', () => {
    expect(toTikz(emptyGraph()).split('\n')[0]).toBe(
      '% GraphCreator export: Graph',
    )
  })
})

describe('theme and legend', () => {
  it('draws the dark theme in the dark background and role colours', () => {
    const svg = toSvg(smoking(), { theme: 'dark' })
    const { width, height } = svgSize(smoking())
    const dark = EXPORT_PALETTES.dark
    expect(svg).toContain(
      `<rect width="${width}" height="${height}" fill="${dark.background}"/>`,
    )
    expect(svg).toContain(
      `fill="${dark.roles.exposure.fill}" stroke="${dark.roles.exposure.line}"`,
    )
    expect(svg).toContain(`fill="${dark.roles.latent.text}">Genetic</text>`)
    expect(svg).toContain(`stroke="${dark.edge}" stroke-width="1.5"`)
    expect(svg).not.toContain(EXPORT_PALETTES.light.roles.exposure.fill)
    // Only the colours change.
    const shapes = (text: string) => text.replace(/#[0-9a-f]{6}/g, '#')
    expect(shapes(svg)).toBe(shapes(toSvg(smoking())))
  })

  it('draws the legend box, a swatch and a label per role in use', () => {
    const g = smoking()
    const svg = toSvg(g, { legend: true })
    const light = EXPORT_PALETTES.light
    const { width, height } = svgSize(g, { legend: true })
    expect(svg).toContain(`width="${width}" height="${height}"`)
    expect(count(svg, /<rect /g)).toBe(2)
    expect(svg).toMatch(
      new RegExp(
        `<rect x="[\\d.]+" y="[\\d.]+" width="96" height="96" rx="4" fill="${light.background}" stroke="${light.border}" stroke-width="1"/>`,
      ),
    )
    // Four nodes and four swatches; the labels are 12 px, weight 400, in the text colour.
    expect(count(svg, /<circle /g)).toBe(8)
    expect(svg).toContain('font-size="12" font-weight="400">')
    for (const label of ['Exposure', 'Outcome', 'Latent', 'Other']) {
      expect(svg).toContain(`fill="${light.foreground}">${label}</text>`)
    }
    expect(svg).not.toContain('>Adjusted</text>')
    expect(svg.indexOf('<rect x=')).toBeGreaterThan(
      svg.lastIndexOf('>Genetic</text>'),
    )
    expect(balanced(svg)).toBe(true)
    // Dark: the box takes the dark background and border.
    const dark = toSvg(g, { theme: 'dark', legend: true })
    expect(dark).toContain(
      `fill="${EXPORT_PALETTES.dark.background}" stroke="${EXPORT_PALETTES.dark.border}" stroke-width="1"/>`,
    )
    expect(dark).toContain(
      `fill="${EXPORT_PALETTES.dark.foreground}">Exposure</text>`,
    )
  })

  it('adds the legend to TikZ only with the option, in the light colours', () => {
    const g = smoking()
    const plain = toTikz(g)
    expect(toTikz(g, { legend: false })).toBe(plain)
    expect(plain).not.toContain('gcBorder')
    const tikz = toTikz(g, { legend: true })
    expect(tikz).toContain('\\definecolor{gcBorder}{HTML}{E2E8F0}')
    expect(tikz).toContain('\\definecolor{gcText}{HTML}{0F172A}')
    expect(tikz.indexOf('gcText}')).toBeLessThan(
      tikz.indexOf('\\begin{tikzpicture}'),
    )
    expect(
      count(
        tikz,
        /^\\draw\[gcBorder, fill=white, rounded corners=3pt\] \([-\d.]+,[-\d.]+\) rectangle \([-\d.]+,[-\d.]+\);$/gm,
      ),
    ).toBe(1)
    expect(
      count(
        tikz,
        /^\\node\[circle, draw=gc\w+Line, fill=gc\w+Fill, line width=1.125pt, minimum size=7.5pt, inner sep=0pt\] at \([-\d.]+,[-\d.]+\) \{\};$/gm,
      ),
    ).toBe(4)
    for (const label of ['Exposure', 'Outcome', 'Latent', 'Other']) {
      expect(tikz).toContain(`text=gcText, font=\\sffamily\\footnotesize] at (`)
      expect(tikz).toContain(`) {${label}};`)
    }
    // Without the legend lines, the picture is the plain one.
    const without = tikz
      .split('\n')
      .filter((line) => !/gcBorder|gcText|minimum size=7.5pt/.test(line))
      .join('\n')
    expect(without).toBe(plain)
  })

  it('puts the TikZ legend where the scene puts it, in canvas coordinates', () => {
    // Two nodes: A (exposure) at (-10, -20) and B (other) at (390, 280); one legend row each.
    const g: Graph = {
      nodes: [
        { id: 'n1', name: 'A', role: 'exposure', pos: { x: -10, y: -20 } },
        node('n2', 'B', 390, 280),
      ],
      edges: [],
    }
    // Top-right corner of the bounding box (-10, -20)–(454, 344): x 358–454, y -20–36.
    const tikz = toTikz(g, { legend: true })
    expect(tikz).toContain(
      '\\draw[gcBorder, fill=white, rounded corners=3pt] (358,-20) rectangle (454,36);',
    )
    expect(tikz).toContain(
      '\\node[circle, draw=gcExposureLine, fill=gcExposureFill, line width=1.125pt, minimum size=7.5pt, inner sep=0pt] at (371,-2) {};',
    )
    expect(tikz).toContain(
      '\\node[anchor=west, inner sep=0pt, text=gcText, font=\\sffamily\\footnotesize] at (384,-2) {Exposure};',
    )
    expect(tikz).toContain('at (384,18) {Other};')
  })
})

describe('sign badges', () => {
  /** SES → Maternal smoking positive, Maternal smoking → Birth weight negative. */
  function signed(): Graph {
    const g = smoking()
    g.edges[0].sign = 'positive'
    g.edges[1].sign = { a: 'negative' }
    g.edges[2].sign = { a: 'negative', b: 'positive' }
    return g
  }

  it('draws a circle and a glyph per signed edge, after the edges and before the nodes', () => {
    const svg = toSvg(signed(), { signs: true })
    const light = EXPORT_PALETTES.light
    expect(count(svg, /<circle /g)).toBe(4 + 3)
    expect(svg).toContain(
      `fill="${light.background}" stroke="${light.edge}" stroke-width="1"/>`,
    )
    expect(svg).toContain(`fill="${light.edge}">+</text>`)
    expect(svg).toContain(`fill="${light.edge}">\u2212</text>`)
    expect(svg).toContain(`fill="${light.edge}">\u00b1</text>`)
    expect(svg).toContain(
      'font-size="12" font-weight="500" text-anchor="middle">',
    )
    const first = svg.indexOf('r="7.5"')
    expect(first).toBeGreaterThan(svg.lastIndexOf('<path '))
    expect(svg.lastIndexOf('r="7.5"')).toBeLessThan(
      svg.indexOf('font-size="13"'),
    )
    expect(balanced(svg)).toBe(true)
    const dark = toSvg(signed(), { signs: true, theme: 'dark' })
    expect(dark).toContain(
      `fill="${EXPORT_PALETTES.dark.background}" stroke="${EXPORT_PALETTES.dark.edge}" stroke-width="1"/>`,
    )
    expect(dark).toContain(`fill="${EXPORT_PALETTES.dark.edge}">+</text>`)
  })

  it('leaves the SVG unchanged without the option or without signs', () => {
    expect(toSvg(signed())).toBe(toSvg(smoking()))
    expect(toSvg(signed(), { signs: false })).toBe(toSvg(smoking()))
    expect(toSvg(smoking(), { signs: true, legend: true })).toBe(
      toSvg(smoking(), { legend: true }),
    )
    expect(svgSize(signed(), { signs: true })).toEqual(svgSize(smoking()))
  })

  it('writes a TikZ badge node per signed edge after the edges', () => {
    const g = signed()
    const tikz = toTikz(g, { signs: true })
    const badge =
      /^\\node\[circle, draw=gcEdge, fill=white, line width=0\.75pt, minimum size=12pt, inner sep=0pt, font=\\sffamily\\scriptsize, text=gcEdge\] at \([-\d.]+,[-\d.]+\) \{(.*)\};$/gm
    expect([...tikz.matchAll(badge)].map((m) => m[1])).toEqual([
      '$+$',
      '$-$',
      '$\\pm$',
    ])
    expect(tikz.indexOf('fill=white, line width=0.75pt')).toBeGreaterThan(
      tikz.lastIndexOf('\\draw['),
    )
    // At the scene's badge, in canvas coordinates: SES (150, -120) and Maternal smoking (0, 0).
    const scene = imageScene(g, { signs: true })
    const ox = 0 - EXPORT_MARGIN
    const oy = -120 - EXPORT_MARGIN
    const round = (n: number) => Math.round(n * 100) / 100
    const { cx, cy } = scene.badges[0].circle
    expect(tikz).toContain(`at (${round(cx + ox)},${round(cy + oy)}) {$+$};`)
    // Without signs, the badge lines are the only difference.
    const without = tikz
      .split('\n')
      .filter((line) => !line.includes('minimum size=12pt'))
      .join('\n')
    expect(without).toBe(toTikz(g))
    expect(toTikz(g, { signs: false })).toBe(toTikz(g))
    expect(toTikz(smoking(), { signs: true, legend: true })).toBe(
      toTikz(smoking(), { legend: true }),
    )
  })
})

const allFixtures: Record<string, string> = import.meta.glob(
  [
    '../model/__fixtures__/*.{yaml,txt}',
    '../model/__fixtures__/analysis/*.{yaml,txt}',
  ],
  { query: '?raw', import: 'default', eager: true },
)

/** Every fixture that parses, by a file-system-safe name (`analysis-collider.dagitty.txt`). */
function validFixtures(): [string, Graph][] {
  const out: [string, Graph][] = []
  for (const [path, text] of Object.entries(allFixtures)) {
    const name = path.replace('../model/__fixtures__/', '')
    const result = parseGraphText(text, name.split('/').pop())
    if (result.ok) out.push([name.replace(/\//g, '-'), result.value])
  }
  return out
}

describe('toSvg snapshots', () => {
  // Stored at the start of phase 37 from the phase 22 writer: the light SVG without a legend
  // must stay byte-identical now that it is drawn from the scene.
  it('finds the valid fixtures', () => {
    expect(validFixtures().length).toBeGreaterThan(10)
  })

  for (const [name, graph] of validFixtures()) {
    it(`draws ${name} as before phase 37`, async () => {
      await expect(toSvg(graph)).toMatchFileSnapshot(
        `./__snapshots__/imageExport/${name}.svg`,
      )
      await expect(
        toSvg(graph, {
          theme: 'light',
          legend: false,
          fontDataUrl: 'data:font/woff2;base64,AAAA',
        }),
      ).toMatchFileSnapshot(`./__snapshots__/imageExport/${name}.font.svg`)
    })
  }
})

describe('imageFileName', () => {
  it('uses the slug of the graph name and the format extension', () => {
    expect(imageFileName('Smoking and birth weight', 'svg')).toBe(
      'smoking-and-birth-weight.svg',
    )
    expect(imageFileName('Smoking and birth weight', 'png')).toBe(
      'smoking-and-birth-weight.png',
    )
    expect(imageFileName('Smoking and birth weight', 'tikz')).toBe(
      'smoking-and-birth-weight.tex',
    )
    expect(imageFileName('Smoking and birth weight', 'pdf')).toBe(
      'smoking-and-birth-weight.pdf',
    )
    expect(imageFileName(undefined, 'svg')).toBe('graph.svg')
  })
})
