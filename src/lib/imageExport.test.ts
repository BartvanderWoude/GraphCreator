import { describe, expect, it } from 'vitest'
import { parseGraphText } from '@/model/fileFormat'
import {
  DISPLAY_DEFAULTS,
  glyphPathData,
  type DisplayOptions,
} from '@/lib/display'
import { emptyGraph, type GNode, type Graph } from '@/model/graph'
import { lineHeight, NODE_DIAMETER, nodeLabel } from '@/model/nodeSize'
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
      width: Math.ceil(300 + NODE_DIAMETER + 2 * EXPORT_MARGIN),
      height: Math.ceil(120 + 120 + NODE_DIAMETER + 2 * EXPORT_MARGIN),
    })
  })

  it('rounds up', () => {
    const g: Graph = {
      nodes: [node('n1', 'A', 0, 0), node('n2', 'B', 10.5, 0.25)],
      edges: [],
    }
    // 10.5 + 96 + 48 = 154.5 and 0.25 + 96 + 48 = 144.25.
    expect(svgSize(g)).toEqual({ width: 155, height: 145 })
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
      (n, v) => n + nodeLabel(v.name).lines.length,
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
    // Both circles are 96 px; the drawing starts 24 px left of and above the first one.
    expect(svg).toContain('<circle cx="72" cy="72" r="47"')
    expect(svg).toContain('<circle cx="272" cy="72" r="47"')
    // Line from the source rim (x 120) to 8 px before the tip; tip at 272 - 48 - 2 = 222.
    expect(svg).toContain('<line x1="120" y1="72" x2="214" y2="72"')
    expect(svg).toContain('<path d="M222,72 L213,76.5 L213,67.5 Z"')
    // One line of text at the name's own size, its baseline 0.375 em below the centre.
    const size = nodeLabel('A').fontSize
    expect(svg).toContain(`font-size="${size}" font-weight="500"`)
    expect(svg).toContain(
      `<text x="72" y="${72 + 0.375 * size}" fill="#0f172a">A</text>`,
    )
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
    const d = NODE_DIAMETER
    const label = nodeLabel('Maternal smoking')
    expect(label.lines).toEqual(['Maternal', 'smoking'])
    // The name's own size in points, with the 1.25 × line pitch (5.7.6).
    const size = 0.75 * label.fontSize
    const pitch = Math.round(0.75 * lineHeight(label.fontSize) * 100) / 100
    expect(tikz).toContain(
      `\\node[circle, draw=gcExposureLine, fill=gcExposureFill, text=gcExposureText, line width=1.5pt, minimum size=${0.75 * d}pt, inner sep=0pt, align=center, font=\\sffamily\\fontsize{${size}}{${pitch}}\\selectfont] (v1) at (${d / 2},${d / 2}) {Maternal\\\\smoking};`,
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
    // `R&D_1 %` → `R\&D\_1 \%`, on one line.
    expect(nodeLabel('R&D_1 %').lines).toEqual(['R&D_1 %'])
    expect(tikz).toContain('{R\\&D\\_1 \\%};')
    expect(tikz).toContain(
      '{\\textbackslash{}a\\{b\\}\\$\\#\\textasciicircum{}\\textasciitilde{}};',
    )
    // No edges: no edge colour.
    expect(tikz).not.toContain('gcEdge')
  })

  it('keeps a line starting with [ or * from becoming an argument of \\\\', () => {
    const g: Graph = { nodes: [node('n1', 'Weight [kg] *', 0, 0)], edges: [] }
    expect(nodeLabel('Weight [kg] *').lines).toEqual(['Weight', '[kg] *'])
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
    // Top-right corner of the bounding box (-10, -20)–(486, 376): x 390–486, y -20–36.
    const tikz = toTikz(g, { legend: true })
    expect(tikz).toContain(
      '\\draw[gcBorder, fill=white, rounded corners=3pt] (390,-20) rectangle (486,36);',
    )
    expect(tikz).toContain(
      '\\node[circle, draw=gcExposureLine, fill=gcExposureFill, line width=1.125pt, minimum size=7.5pt, inner sep=0pt] at (403,-2) {};',
    )
    expect(tikz).toContain(
      '\\node[anchor=west, inner sep=0pt, text=gcText, font=\\sffamily\\footnotesize] at (416,-2) {Exposure};',
    )
    expect(tikz).toContain('at (416,18) {Other};')
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
    // Before the node circles, whose radius is half the diameter minus the outline.
    expect(svg.lastIndexOf('r="7.5"')).toBeLessThan(
      svg.indexOf(`r="${NODE_DIAMETER / 2 - 1}"`),
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

describe('display options', () => {
  const simulation: Record<string, string> = import.meta.glob(
    '../model/__fixtures__/simulation.dag.yaml',
    { query: '?raw', import: 'default', eager: true },
  )

  /**
   * simulation.dag.yaml (signs, strengths, types and forms) plus a latent, continuous, smooth
   * Frailty → SSI negative, Diabetes → Frailty unsigned and a discrete Visits → SSI small.
   */
  function display(): Graph {
    const result = parseYaml(
      simulation['../model/__fixtures__/simulation.dag.yaml'],
    )
    if (!result.ok) throw new Error('simulation.dag.yaml does not parse.')
    const g = result.value
    const id = (name: string) => g.nodes.find((n) => n.name === name)!.id
    g.nodes.push(
      {
        id: 'frailty',
        name: 'Frailty',
        role: 'latent',
        varType: 'continuous',
        form: 'smooth',
        pos: { x: 300, y: 260 },
      },
      {
        id: 'visits',
        name: 'Visits',
        role: 'other',
        varType: 'discrete',
        pos: { x: 560, y: 160 },
      },
    )
    g.edges.push(
      {
        id: 'x1',
        source: 'frailty',
        target: id('SSI'),
        sign: 'negative',
        evidence: [],
      },
      { id: 'x2', source: id('Diabetes'), target: 'frailty', evidence: [] },
      {
        id: 'x3',
        source: 'visits',
        target: id('SSI'),
        strength: 'small',
        evidence: [],
      },
    )
    return g
  }

  const ALL: DisplayOptions = {
    signs: true,
    signColors: true,
    strength: true,
    forms: true,
    types: true,
    dashedLatent: true,
  }
  const light = EXPORT_PALETTES.light

  it('leaves every writer unchanged with every display key false', () => {
    for (const g of [smoking(), display()]) {
      for (const legend of [false, true]) {
        for (const theme of ['light', 'dark'] as const) {
          expect(toSvg(g, { ...DISPLAY_DEFAULTS, legend, theme })).toBe(
            toSvg(g, { legend, theme }),
          )
        }
        expect(toTikz(g, { ...DISPLAY_DEFAULTS, legend })).toBe(
          toTikz(g, { legend }),
        )
      }
    }
    expect(toSvg(display())).not.toContain('stroke-dasharray')
  })

  it('draws the edges in their tones and widths in SVG', () => {
    const svg = toSvg(display(), { signColors: true, strength: true })
    expect(svg).toContain(`stroke="${light.positive}" stroke-width="3"/>`)
    expect(svg).toContain(`fill="${light.positive}"/>`)
    expect(svg).toContain(`stroke="${light.negative}" stroke-width="1.5"/>`)
    expect(svg).toContain(`stroke="${light.foreground}" stroke-width="4.5"/>`)
    expect(svg).not.toContain(`stroke="${light.edge}"`)
  })

  it('dashes latent circles in SVG', () => {
    const svg = toSvg(display(), { dashedLatent: true, legend: true })
    expect(
      count(svg, /<circle [^>]* stroke-width="2" stroke-dasharray="5 3"\/>/g),
    ).toBe(1)
    expect(svg).toContain(
      `fill="${light.roles.latent.fill}" stroke="${light.roles.latent.line}" stroke-width="1.5" stroke-dasharray="2 1.5"/>`,
    )
    expect(balanced(svg)).toBe(true)
  })

  it('draws the marks after the names and before the legend in SVG', () => {
    const g = display()
    const svg = toSvg(g, { forms: true, types: true, legend: true })
    const scene = imageScene(g, { forms: true, types: true })
    // Diabetes C; Wound class C, threshold; SSI C, linear; Frailty N, smooth; Visits D.
    expect(scene.marks).toHaveLength(8)
    const glyphs = scene.marks.filter((m) => m.path)
    expect(glyphs).toHaveLength(3)
    for (const { path } of glyphs) {
      expect(svg).toContain(
        `<path d="${glyphPathData(path!.segments)}" fill="none" stroke="${light.edge}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
    }
    expect(
      count(
        svg,
        /<g font-family="[^"]+" font-size="11" font-weight="500" text-anchor="middle">\n<text [^>]+>[CND]<\/text>\n<\/g>/g,
      ),
    ).toBe(5)
    expect(
      count(
        svg,
        new RegExp(
          `<circle [^>]* r="9.5" fill="${light.background}" stroke="${light.edge}" stroke-width="1"/>`,
          'g',
        ),
      ),
    ).toBe(8)
    const first = svg.indexOf('r="9.5"')
    expect(first).toBeGreaterThan(svg.lastIndexOf('>Visits</text>'))
    expect(svg.lastIndexOf('r="9.5"')).toBeLessThan(svg.indexOf('<rect x='))
    expect(balanced(svg)).toBe(true)
  })

  it('draws the legend rows in SVG: line samples, badges, marks and labels', () => {
    const svg = toSvg(display(), { ...ALL, legend: true })
    for (const label of [
      'Positive effect',
      'Negative effect',
      'Mixed effects',
      'No sign',
      'Small effect or No strength',
      'Medium effect',
      'Large effect',
      'Linear',
      'Smooth',
      'Threshold',
      'Categorical',
      'Continuous',
      'Discrete',
    ]) {
      expect(svg).toContain(`fill="${light.foreground}">${label}</text>`)
    }
    // Legend badges at 16/20 of the size: radius 5.9, glyph 9.6 px.
    expect(count(svg, /r="5.9"/g)).toBe(3)
    expect(svg).toContain('font-size="9.6" font-weight="500"')
    expect(count(svg, /r="7.5" fill="#ffffff" stroke="#64748b"/g)).toBe(6)
    expect(svg).toContain('font-size="8.8" font-weight="500"')
    expect(balanced(svg)).toBe(true)
  })

  it('draws the TikZ edges in their tones and widths, and defines only the tones in use', () => {
    const g = display()
    const tikz = toTikz(g, { signColors: true, strength: true })
    expect(tikz).toContain(
      '\\draw[-{Stealth[length=9pt,width=9pt]}, line width=2.25pt, draw=gcPositive, shorten >=1.5pt] (v1) -- (v3);',
    )
    expect(tikz).toContain(
      '\\draw[-{Stealth[length=11.25pt,width=11.25pt]}, line width=3.375pt, draw=gcNeutral, shorten >=1.5pt] (v2) -- (v3);',
    )
    expect(tikz).toContain(
      '\\draw[-{Stealth[length=6.75pt,width=6.75pt]}, line width=1.125pt, draw=gcNegative, shorten >=1.5pt] (v4) -- (v3);',
    )
    const defined = (text: string) =>
      [...text.matchAll(/^\\definecolor\{(gc\w+)\}\{HTML\}\{(\w+)\}$/gm)]
        .map((m) => `${m[1]}=${m[2]}`)
        .filter((c) => /Positive|Negative|Neutral/.test(c))
    expect(defined(tikz)).toEqual([
      'gcPositive=15803D',
      'gcNegative=B91C1C',
      'gcNeutral=0F172A',
    ])
    // Only positive edges: only gcPositive.
    const positive = display()
    positive.edges = positive.edges.filter((e) => e.sign === 'positive')
    expect(defined(toTikz(positive, { signColors: true }))).toEqual([
      'gcPositive=15803D',
    ])
    expect(defined(toTikz(g, { signs: true, strength: true }))).toEqual([])
    // The definitions follow gcEdge and come before the legend's.
    const withLegend = toTikz(g, { signColors: true, legend: true })
    expect(withLegend.indexOf('{gcEdge}')).toBeLessThan(
      withLegend.indexOf('{gcPositive}'),
    )
    expect(withLegend.indexOf('{gcNeutral}')).toBeLessThan(
      withLegend.indexOf('{gcBorder}'),
    )
  })

  it('draws TikZ badges in their edge colour, dashed latent nodes and marks', () => {
    const g = display()
    const tikz = toTikz(g, { signs: true, signColors: true })
    expect(tikz).toContain(
      '\\node[circle, draw=gcPositive, fill=white, line width=0.75pt, minimum size=12pt, inner sep=0pt, font=\\sffamily\\scriptsize, text=gcPositive] at (',
    )
    expect(count(tikz, /draw=gcNeutral, fill=white/g)).toBe(2)
    const dashed = toTikz(g, { dashedLatent: true })
    expect(
      count(
        dashed,
        /^\\node\[circle, draw=gcLatentLine, [^\n]*line width=1\.5pt, dashed, minimum size=72pt/gm,
      ),
    ).toBe(1)
    expect(count(dashed, /dashed/g)).toBe(1)
    // Marks, in canvas coordinates: Diabetes at (0, 0) has its type mark at 48 − 48/√2.
    const marks = toTikz(g, { forms: true, types: true })
    expect(marks).toContain(
      '\\node[circle, draw=gcEdge, fill=white, line width=0.75pt, minimum size=15pt, inner sep=0pt, font=\\sffamily\\scriptsize, text=gcEdge] at (14.06,14.06) {C};',
    )
    expect(marks).toContain(
      '\\node[circle, draw=gcEdge, fill=white, line width=0.75pt, minimum size=15pt, inner sep=0pt] at (381.94,94.06) {};\n\\draw[gcEdge, line width=1.125pt, line cap=round, line join=round] (377.77,98.23) -- (386.11,89.89);',
    )
    expect(marks).toMatch(
      /\\draw\[gcEdge, line width=1\.125pt, line cap=round, line join=round\] \([\d.]+,[\d.]+\) \.\. controls \([\d.]+,[\d.]+\) and \([\d.]+,[\d.]+\) \.\. \([\d.]+,[\d.]+\);/,
    )
    expect(count(marks, /minimum size=15pt/g)).toBe(8)
    // A graph without edges still defines gcEdge for its marks.
    const lone = { nodes: [g.nodes[1]], edges: [] }
    expect(toTikz(lone, { forms: true })).toContain(
      '\\definecolor{gcEdge}{HTML}{64748B}',
    )
    expect(toTikz(lone)).not.toContain('gcEdge')
  })

  it('draws the TikZ legend rows at the scene positions', () => {
    const tikz = toTikz(display(), { ...ALL, legend: true })
    expect(tikz).toContain(
      ', dash pattern=on 1.5pt off 1.125pt, minimum size=7.5pt, inner sep=0pt] at (',
    )
    expect(
      count(
        tikz,
        /^\\draw\[-\{Stealth\[length=[\d.]+pt,width=[\d.]+pt\]\}, line width=[\d.]+pt, draw=gc\w+\] \([\d.]+,[\d.]+\) -- \([\d.]+,[\d.]+\);$/gm,
      ),
    ).toBe(7)
    expect(tikz).toContain('minimum size=9.6pt')
    // Six 16 px legend marks and four 16 px badges on the edges.
    expect(count(tikz, /minimum size=12pt, inner sep=0pt/g)).toBe(10)
    for (const label of ['No sign', 'Small effect or No strength', 'Discrete'])
      expect(tikz).toContain(`) {${label}};`)
    expect(tikz).toMatch(/at \(712,158\) \{Small effect or No strength\};/)
  })
  // Stored in phase 70: every display option on, in both themes, with and without the legend.
  for (const theme of ['light', 'dark'] as const) {
    for (const legend of [false, true]) {
      const name = `display-all.${theme}${legend ? '.legend' : ''}`
      it(`draws ${name} as stored`, async () => {
        await expect(
          toSvg(display(), { ...ALL, theme, legend }),
        ).toMatchFileSnapshot(`./__snapshots__/imageExport/${name}.svg`)
      })
    }
  }
  for (const legend of [false, true]) {
    const name = `display-all${legend ? '.legend' : ''}`
    it(`writes the TikZ of ${name} as stored`, async () => {
      await expect(toTikz(display(), { ...ALL, legend })).toMatchFileSnapshot(
        `./__snapshots__/imageExport/${name}.tex`,
      )
    })
  }
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
