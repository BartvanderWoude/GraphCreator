/** Edge geometry between circle nodes (spec 5.2 "Edges", phase 11). Pure, no DOM. */

/** A circle in flow coordinates: centre and radius in px. */
export interface Circle {
  cx: number
  cy: number
  r: number
}

/**
 * End points of a straight edge from `source` to `target`. The edge starts on the source's rim,
 * where the line between the two centres crosses it, and ends `gap` px before the target's rim
 * (the arrowhead's tip goes there). Returns null when the centres coincide, since the line has
 * no direction then.
 */
export function edgeEndpoints(
  source: Circle,
  target: Circle,
  gap = 2,
): { sx: number; sy: number; tx: number; ty: number } | null {
  const dx = target.cx - source.cx
  const dy = target.cy - source.cy
  const length = Math.hypot(dx, dy)
  if (length === 0) return null
  const ux = dx / length
  const uy = dy / length
  return {
    sx: source.cx + source.r * ux,
    sy: source.cy + source.r * uy,
    tx: target.cx - (target.r + gap) * ux,
    ty: target.cy - (target.r + gap) * uy,
  }
}
