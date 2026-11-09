/**
 * PDF export (spec 4.11 "PDF, legend and dark theme"): a hand-written vector PDF 1.4 of a
 * picture's scene, with no dependency and no DOM. `sceneToPdf` is built in phase 38.
 */
import type { ImageOptions } from '@/lib/imageExport'
import { imageScene, type Scene } from '@/lib/imageScene'
import type { Graph } from '@/model/graph'

/** The bytes of a one-page PDF drawing `scene`. Stub until phase 38. */
export function sceneToPdf(scene: Scene): Uint8Array {
  void scene
  throw new Error('not implemented')
}

/** The graph as a PDF file. */
export function toPdf(graph: Graph, opts: ImageOptions = {}): Uint8Array {
  return sceneToPdf(imageScene(graph, opts))
}
