import { test as base, expect, type Locator, type Page } from '@playwright/test'

export { expect }

/** localStorage keys of the app (spec 5.5, 5.7.9). */
export const AUTOSAVE_KEY = 'graphcreator:current'
export const WELCOMED_KEY = 'graphcreator:welcomed'

/**
 * Playwright's `test` for a returning visitor: the welcome slides were closed before, so they do
 * not cover the app. `e2e/welcome.spec.ts` uses the plain `test` for a first visit.
 */
export const test = base.extend({
  // The callback is not named `use`, which oxlint would take for React's `use` hook.
  page: async ({ page }, provide) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, '1'),
      WELCOMED_KEY,
    )
    await provide(page)
  },
})

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The circle of the node called `name`: its accessible name is "<name>, <Role label>" and it
 * carries `data-role` (spec 5.2).
 */
export function circle(page: Page, name: string): Locator {
  return node(page, name).getByRole('img', { name: circleName(name) })
}

/** The accessible name of a circle: "<name>, <Role label>". */
function circleName(name: string): RegExp {
  return new RegExp(`^${escapeRegExp(name)}, \\w+$`)
}

/** The React Flow node wrapper of the node called `name`. */
export function node(page: Page, name: string): Locator {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('img', { name: circleName(name) }) })
}

export const nodes = (page: Page) => page.locator('.react-flow__node')
export const edges = (page: Page) => page.locator('.react-flow__edge')
export const pane = (page: Page) => page.locator('.react-flow__pane')

export const topBar = (page: Page) =>
  page.getByRole('toolbar', { name: 'Toolbar' })
export const rail = (page: Page) =>
  page.getByRole('toolbar', { name: 'Canvas tools' })
export const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Side panel' })
export const nameField = (page: Page) =>
  panel(page).getByRole('textbox', { name: 'Name', exact: true })

/** The autosaved YAML text, or null. */
export const stored = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), AUTOSAVE_KEY)

export async function centre(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element has no bounding box.')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Diameter of a node's circle on screen, in px. */
export async function diameter(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element has no bounding box.')
  return box.width
}

/** Double-clicks the empty canvas at a point relative to its top-left corner. */
export async function addNodeAt(page: Page, x: number, y: number) {
  await pane(page).dblclick({ position: { x, y } })
}

/**
 * Connects two nodes by dragging (spec 5.2): presses on the rim of `from`, on the side facing
 * `to`, and releases over the middle of `to`.
 */
export async function connect(page: Page, from: string, to: string) {
  const s = node(page, from)
  const box = await s.boundingBox()
  if (!box) throw new Error(`Node "${from}" has no bounding box.`)
  const sc = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const t = await centre(node(page, to))
  const length = Math.hypot(t.x - sc.x, t.y - sc.y)
  // The rim is the 7 px ring just outside the outline.
  const out = box.width / 2 + 3.5
  const start = {
    x: sc.x + ((t.x - sc.x) / length) * out,
    y: sc.y + ((t.y - sc.y) / length) * out,
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(t.x, t.y, { steps: 10 })
  await page.mouse.up()
}

/** Clicks the middle of the straight edge between the centres of two nodes. */
export async function clickEdgeBetween(page: Page, from: string, to: string) {
  const s = await centre(node(page, from))
  const t = await centre(node(page, to))
  await page.mouse.click((s.x + t.x) / 2, (s.y + t.y) / 2)
}

/** Clicks an empty spot of the canvas, which clears the selection (and the picked source). */
export async function clickEmptyCanvas(page: Page) {
  await pane(page).click({ position: { x: 20, y: 20 } })
}

/** The React Flow viewport transform (`translate(xpx, ypx) scale(zoom)`): pan and zoom. */
export async function viewport(page: Page) {
  const style =
    (await page.locator('.react-flow__viewport').getAttribute('style')) ?? ''
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(
    style,
  )
  if (!m) throw new Error(`Unexpected viewport style: ${style}`)
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) }
}
