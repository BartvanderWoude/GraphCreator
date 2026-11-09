/**
 * The picture of a graph as shapes in image coordinates (spec 4.11 "PDF, legend and dark
 * theme"): what SVG, PNG, PDF and TikZ draw, with the legend placed once. The types are fixed in
 * phase 31; `imageScene` is built in phase 37.
 */
import type { ImageOptions } from '@/lib/imageExport'
import type { Graph } from '@/model/graph'
import type { Role } from '@/model/schema'

/** Legend box sizes in px. */
export const LEGEND = {
  width: 96,
  padding: 8,
  row: 20,
  swatch: 10,
  gap: 8,
  beside: 16,
  font: 12,
} as const

export type LegendCorner =
  'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'beside'

export interface SceneCircle {
  cx: number
  cy: number
  r: number
  fill: string
  stroke: string
  strokeWidth: number
}

/** A line of text; `y` is its baseline. */
export interface SceneText {
  x: number
  y: number
  text: string
  size: number
  weight: 400 | 500
  color: string
  anchor: 'middle' | 'start'
}

/** An edge line and its arrowhead triangle (tip first). */
export interface SceneEdge {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width: number
  head: [[number, number], [number, number], [number, number]]
}

export interface SceneLegend {
  x: number
  y: number
  width: number
  height: number
  corner: LegendCorner
  background: string
  border: string
  items: { role: Role; label: string; swatch: SceneCircle; text: SceneText }[]
}

/** Everything a picture shows. The image's top-left is 0,0 and y grows downward. */
export interface Scene {
  title: string
  width: number
  height: number
  background: string
  /** In drawing order. */
  edges: SceneEdge[]
  circles: SceneCircle[]
  /** The wrapped name lines. */
  texts: SceneText[]
  /** `circles[i]` belongs to graph node `nodeIds[i]`. */
  nodeIds: string[]
  legend: SceneLegend | null
}

/** The scene for `graph` (4.11). Stub until phase 37. */
export function imageScene(graph: Graph, opts: ImageOptions = {}): Scene {
  void graph
  void opts
  throw new Error('not implemented')
}
