import { describe, expect, it } from 'vitest'
import { ROLE_LABELS } from '@/lib/copy'
import { emptyGraph, type GNode, type Graph } from '@/model/graph'
import { NODE_DIAMETER, nodeLabel } from '@/model/nodeSize'
import { EXPORT_PALETTES } from '@/model/palette'
import type { Role } from '@/model/schema'
import { parseYaml } from '@/model/yaml'
import { svgSize } from './imageExport'
import { EXPORT_MARGIN, imageScene, LEGEND, type Scene } from './imageScene'

const fixtures: Record<string, string> = import.meta.glob(
  '../model/__fixtures__/smoking.dag.yaml',
  { query: '?raw', import: 'default', eager: true },
)

function smoking(): Graph {
  const result = parseYaml(fixtures['../model/__fixtures__/smoking.dag.yaml'])
  if (!result.ok) throw new Error('smoking.dag.yaml does not parse.')
  return result.value
}

function node(id: string, x: number, y: number, role: Role = 'other'): GNode {
  return { id, name: id, role, pos: { x, y } }
}

function graph(nodes: GNode[], edges: [string, string][] = []): Graph {
  return {
    nodes,
    edges: edges.map(([source, target], i) => ({
      id: `e${i}`,
      source,
      target,
      evidence: [],
    })),
  }
}

/**
 * Four 64 px nodes on the corners of a 464 × 364 bounding box; `omit` leaves one corner empty.
 * One role (other), so the legend is 96 × 36.
 */
function corners(...omit: string[]): Graph {
  const all = [
    node('TL', 0, 0),
    node('TR', 400, 0),
    node('BL', 0, 300),
    node('BR', 400, 300),
  ]
  return graph(all.filter((n) => !omit.includes(n.id)))
}

/** The scene with every colour replaced, to compare the rest. */
function shapes(scene: Scene): string {
  return JSON.stringify(scene, (_key, value: unknown) =>
    typeof value === 'string' && value.startsWith('#') ? '#' : value,
  )
}

describe('imageScene', () => {
  it('has one circle and its name lines per node and one edge per edge', () => {
    const g = smoking()
    const scene = imageScene(g)
    expect(scene.title).toBe('Smoking and birth weight')
    expect(scene.circles).toHaveLength(4)
    expect(scene.nodeIds).toEqual(g.nodes.map((n) => n.id))
    expect(scene.edges).toHaveLength(4)
    const lines = g.nodes.flatMap((n) => nodeLabel(n.name).lines)
    expect(scene.texts.map((t) => t.text)).toEqual(lines)
    expect(scene.texts.every((t) => t.size === 13 && t.weight === 500)).toBe(
      true,
    )
    // Image coordinates: Maternal smoking at (0, 0), SES at (150, -120) set the origin.
    const d = NODE_DIAMETER
    expect(scene.circles[0]).toMatchObject({
      cx: EXPORT_MARGIN + d / 2,
      cy: EXPORT_MARGIN + 120 + d / 2,
      r: d / 2 - 1,
      strokeWidth: 2,
    })
    // The line stops 8 px before the arrowhead's tip (1 px inside the 9 px head).
    for (const e of scene.edges) {
      const [tx, ty] = e.head[0]
      expect(Math.hypot(tx - e.x2, ty - e.y2)).toBeCloseTo(8)
      expect(e.width).toBe(1.5)
    }
    expect(scene.legend).toBeNull()
  })

  it('has the size of svgSize, with and without the legend', () => {
    for (const g of [smoking(), corners(), corners('TR'), emptyGraph()]) {
      for (const legend of [false, true]) {
        const scene = imageScene(g, { legend })
        expect({ width: scene.width, height: scene.height }).toEqual(
          svgSize(g, { legend }),
        )
      }
    }
  })

  it('lists only the roles in use, in ROLES order', () => {
    const g = graph([
      node('a', 0, 0, 'other'),
      node('b', 200, 0, 'latent'),
      node('c', 400, 0, 'exposure'),
      node('d', 600, 0, 'latent'),
    ])
    const legend = imageScene(g, { legend: true }).legend!
    expect(legend.items.map((i) => i.role)).toEqual([
      'exposure',
      'latent',
      'other',
    ])
    expect(legend.items.map((i) => i.label)).toEqual([
      ROLE_LABELS.exposure,
      ROLE_LABELS.latent,
      ROLE_LABELS.other,
    ])
    expect(legend.width).toBe(LEGEND.width)
    expect(legend.height).toBe(2 * LEGEND.padding + 3 * LEGEND.row)
  })

  it('draws each legend row as a swatch and a label', () => {
    const g = graph([node('a', 0, 0, 'exposure'), node('b', 400, 300)])
    const legend = imageScene(g, { legend: true }).legend!
    const light = EXPORT_PALETTES.light
    expect(legend.background).toBe(light.background)
    expect(legend.border).toBe(light.border)
    const [first, second] = legend.items
    // Row middles are padding + row / 2 apart from the box's top, one row apart.
    const middle = legend.y + LEGEND.padding + LEGEND.row / 2
    expect(first.swatch).toEqual({
      cx: legend.x + LEGEND.padding + LEGEND.swatch / 2,
      cy: middle,
      r: LEGEND.swatch / 2 - 0.75,
      fill: light.roles.exposure.fill,
      stroke: light.roles.exposure.line,
      strokeWidth: 1.5,
    })
    expect(first.text).toEqual({
      x: legend.x + LEGEND.padding + LEGEND.swatch + LEGEND.gap,
      y: middle + 4.5,
      text: 'Exposure',
      size: LEGEND.font,
      weight: 400,
      color: light.foreground,
      anchor: 'start',
    })
    expect(second.swatch.cy).toBe(middle + LEGEND.row)
  })

  it('takes the first free corner: top right, top left, bottom right, bottom left', () => {
    const at = (g: Graph) => {
      const l = imageScene(g, { legend: true }).legend!
      return [l.corner, l.x, l.y]
    }
    // Bounding box 496 × 396 at the margin; the legend is 96 × 36.
    const right = EXPORT_MARGIN + 496 - LEGEND.width
    const bottom = EXPORT_MARGIN + 396 - 36
    expect(at(corners('TR'))).toEqual(['top-right', right, EXPORT_MARGIN])
    expect(at(corners('TL'))).toEqual([
      'top-left',
      EXPORT_MARGIN,
      EXPORT_MARGIN,
    ])
    expect(at(corners('BR'))).toEqual(['bottom-right', right, bottom])
    expect(at(corners('BL'))).toEqual(['bottom-left', EXPORT_MARGIN, bottom])
    // The image keeps its size when the legend sits in a corner.
    expect(imageScene(corners('BL'), { legend: true })).toMatchObject({
      width: 544,
      height: 444,
    })
  })

  it('keeps 8 px from circles: a circle just closer blocks the corner', () => {
    // A node whose square ends 8 px left of the top-right box leaves the corner free; 1 px
    // further right it blocks it.
    const free = graph([
      node('a', 0, 0),
      node('b', 400, 300),
      node('c', 296, 0),
    ])
    expect(imageScene(free, { legend: true }).legend!.corner).toBe('top-right')
    const blocked = graph([
      node('a', 0, 0),
      node('b', 400, 300),
      node('c', 297, 0),
    ])
    expect(imageScene(blocked, { legend: true }).legend!.corner).not.toBe(
      'top-right',
    )
  })

  it('treats a corner crossed by an edge as taken', () => {
    // Six roles make the box 136 px tall, so it reaches y = 160. S sits 8 px left of it and T
    // 14 px below it, both clear of it, but the edge between them runs through it.
    const nodes = [
      node('S', 396, 0, 'exposure'),
      node('T', 500, 150, 'outcome'),
      node('L', 0, 400, 'latent'),
      node('A', 100, 400, 'adjusted'),
      node('B', 200, 400, 'selected'),
      node('R', 300, 400),
    ]
    expect(imageScene(graph(nodes), { legend: true }).legend!.corner).toBe(
      'top-right',
    )
    expect(
      imageScene(graph(nodes, [['S', 'T']]), { legend: true }).legend!.corner,
    ).toBe('top-left')
  })

  it('puts the legend beside the graph when no corner is free, widening the image by 112 px', () => {
    const g = corners()
    const plain = imageScene(g)
    const scene = imageScene(g, { legend: true })
    expect(LEGEND.beside + LEGEND.width).toBe(112)
    expect(scene.width).toBe(plain.width + 112)
    expect(scene.height).toBe(plain.height)
    expect(scene.legend).toMatchObject({
      corner: 'beside',
      x: EXPORT_MARGIN + 496 + LEGEND.beside,
      y: EXPORT_MARGIN,
    })
    // Nothing else moves.
    expect({ ...scene, width: 0, legend: null }).toEqual({
      ...plain,
      width: 0,
    })
  })

  it('puts a one-node graph’s legend beside it, since the box covers the node', () => {
    const scene = imageScene(graph([node('A', 10, 20)]), { legend: true })
    expect(scene.legend!.corner).toBe('beside')
    expect(scene.width).toBe(NODE_DIAMETER + 2 * EXPORT_MARGIN + 112)
  })

  it('grows the height when a legend beside the graph is taller than it', () => {
    const roles: Role[] = [
      'exposure',
      'outcome',
      'latent',
      'adjusted',
      'selected',
      'other',
    ]
    const g = graph(roles.map((role, i) => node(role, i * 100, 0, role)))
    const scene = imageScene(g, { legend: true })
    expect(scene.legend!.corner).toBe('beside')
    expect(scene.legend!.height).toBe(2 * LEGEND.padding + 6 * LEGEND.row)
    expect(scene.height).toBe(136 + 2 * EXPORT_MARGIN)
  })

  it('swaps only the colours in the dark theme', () => {
    for (const g of [smoking(), corners('TR'), corners()]) {
      const light = imageScene(g, { legend: true })
      const dark = imageScene(g, { theme: 'dark', legend: true })
      expect(shapes(dark)).toEqual(shapes(light))
      expect(dark).not.toEqual(light)
    }
    const dark = imageScene(smoking(), { theme: 'dark', legend: true })
    const palette = EXPORT_PALETTES.dark
    expect(dark.background).toBe(palette.background)
    expect(dark.edges[0].color).toBe(palette.edge)
    expect(dark.circles[0]).toMatchObject({
      fill: palette.roles.exposure.fill,
      stroke: palette.roles.exposure.line,
    })
    expect(dark.texts[0].color).toBe(palette.roles.exposure.text)
    expect(dark.legend).toMatchObject({
      background: palette.background,
      border: palette.border,
    })
    expect(dark.legend!.items[0].text.color).toBe(palette.foreground)
  })

  it('has no legend without the option, or without nodes', () => {
    expect(imageScene(smoking()).legend).toBeNull()
    expect(imageScene(smoking(), { legend: false }).legend).toBeNull()
    const empty = imageScene(emptyGraph(), { legend: true })
    expect(empty).toMatchObject({
      title: 'Graph',
      width: 48,
      height: 48,
      legend: null,
      circles: [],
    })
  })

  describe('sign badges', () => {
    /** A → B positive, C → B negative, A → C mixed per level, D → B unsigned. */
    function signed(): Graph {
      const g = graph(
        [
          node('A', 0, 0),
          node('B', 300, 0),
          node('C', 0, 200),
          node('D', 300, 200),
        ],
        [
          ['A', 'B'],
          ['C', 'B'],
          ['A', 'C'],
          ['D', 'B'],
        ],
      )
      g.edges[0].sign = 'positive'
      g.edges[1].sign = 'negative'
      g.edges[2].sign = { x: 'positive', y: 'negative' }
      return g
    }

    it('has none without the option', () => {
      expect(imageScene(signed()).badges).toEqual([])
      expect(imageScene(signed(), { signs: false }).badges).toEqual([])
      expect(imageScene(smoking(), { signs: true }).badges).toEqual([])
    })

    it('puts one badge per signed edge halfway between its start and its tip', () => {
      const scene = imageScene(signed(), { signs: true })
      expect(scene.badges.map((b) => b.text.text)).toEqual([
        '+',
        '\u2212',
        '\u00b1',
      ])
      scene.badges.forEach((badge, i) => {
        const e = scene.edges[i]
        const x = (e.x1 + e.head[0][0]) / 2
        const y = (e.y1 + e.head[0][1]) / 2
        const light = EXPORT_PALETTES.light
        expect(badge.circle).toEqual({
          cx: x,
          cy: y,
          r: 7.5,
          fill: light.background,
          stroke: light.edge,
          strokeWidth: 1,
        })
        expect(badge.text).toEqual({
          x,
          y: y + 4.5,
          text: badge.text.text,
          size: 12,
          weight: 500,
          color: light.edge,
          anchor: 'middle',
        })
      })
      // A → B starts at A's rim and ends 2 px before B's rim, halfway along at the circles' height.
      expect(scene.badges[0].circle).toMatchObject({ cx: 221, cy: 72 })
    })

    it('uses the dark palette in the dark theme', () => {
      const dark = imageScene(signed(), { signs: true, theme: 'dark' })
      const light = imageScene(signed(), { signs: true })
      expect(shapes(dark)).toEqual(shapes(light))
      const palette = EXPORT_PALETTES.dark
      for (const badge of dark.badges) {
        expect(badge.circle.fill).toBe(palette.background)
        expect(badge.circle.stroke).toBe(palette.edge)
        expect(badge.text.color).toBe(palette.edge)
      }
    })

    it('changes nothing else, and nothing at all for a graph without signs', () => {
      const plain = imageScene(signed(), { legend: true })
      const scene = imageScene(signed(), { legend: true, signs: true })
      expect({ ...scene, badges: [] }).toEqual(plain)
      expect(imageScene(smoking(), { legend: true, signs: true })).toEqual(
        imageScene(smoking(), { legend: true }),
      )
    })

    it('skips an empty sign map', () => {
      const g = signed()
      g.edges[0].sign = {}
      expect(
        imageScene(g, { signs: true }).badges.map((b) => b.text.text),
      ).toEqual(['\u2212', '\u00b1'])
    })
  })
})
