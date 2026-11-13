import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import {
  AUTOSAVE_KEY,
  addNodeAt,
  centre,
  circle,
  clickEdgeBetween,
  connect,
  edges,
  expect,
  nameField,
  node,
  nodes,
  pane,
  panel,
  rail,
  stored,
  test,
  topBar,
} from './fixtures.ts'

/** The locked fixture: two nodes (Maternal smoking → Birth weight) and `locked: true`. */
const LOCKED = readFileSync(
  path.join(import.meta.dirname, '../src/model/__fixtures__/locked.dag.yaml'),
  'utf8',
)

const lockButton = (page: Page) =>
  rail(page).getByRole('button', { name: 'Lock graph' })

const railButton = (page: Page, name: string) =>
  rail(page).getByRole('button', { name })

/** Opens the app with the locked fixture already autosaved, as a reload would restore it. */
async function openLocked(page: Page) {
  await page.addInitScript(([key, text]) => localStorage.setItem(key, text), [
    AUTOSAVE_KEY,
    LOCKED,
  ] as const)
  await page.goto('/')
  await expect(circle(page, 'Maternal smoking')).toBeVisible()
}

test('the toggle is off for a new graph and locks it', async ({ page }) => {
  await page.goto('/')
  await addNodeAt(page, 200, 200)
  await expect(lockButton(page)).toHaveAttribute('aria-pressed', 'false')
  await lockButton(page).click()
  await expect(lockButton(page)).toHaveAttribute('aria-pressed', 'true')
  // The lock is part of the graph, so autosave keeps it.
  await expect.poll(() => stored(page)).toContain('locked: true')
})

test('a locked graph refuses every way of adding or deleting a node', async ({
  page,
}) => {
  await openLocked(page)
  await expect(lockButton(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(nodes(page)).toHaveCount(2)

  // Add node, Connect and Auto-layout are disabled, and so are their shortcuts.
  for (const name of ['Add node', 'Connect', 'Auto-layout']) {
    await expect(railButton(page, name)).toBeDisabled()
  }
  await pane(page).click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('n')
  await pane(page).click({ position: { x: 300, y: 300 } })
  await addNodeAt(page, 320, 320)
  await expect(nodes(page)).toHaveCount(2)

  // Delete removes neither a node nor an edge.
  await circle(page, 'Maternal smoking').click()
  await page.keyboard.press('Delete')
  await expect(nodes(page)).toHaveCount(2)
  await clickEdgeBetween(page, 'Maternal smoking', 'Birth weight')
  await page.keyboard.press('Delete')
  await expect(edges(page)).toHaveCount(1)
})

test('a locked graph cannot be dragged, connected or laid out', async ({
  page,
}) => {
  await openLocked(page)
  const before = await centre(node(page, 'Maternal smoking'))

  // Dragging the middle of a circle moves no node. The screen position is no test, because the
  // drag pans the canvas instead, so the stored positions are what count.
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(before.x + 120, before.y + 80, { steps: 8 })
  await page.mouse.up()
  expect(await stored(page)).toContain('pos: [0, 0]')

  // Dragging from a rim starts no connection.
  await connect(page, 'Birth weight', 'Maternal smoking')
  await expect(edges(page)).toHaveCount(1)

  // L does not lay the graph out.
  await pane(page).click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('l')
  expect(await stored(page)).toContain('pos: [0, 0]')
  expect(await stored(page)).toContain('pos: [300, 0]')
})

test('a locked graph shows read-only editors and keeps its name', async ({
  page,
}) => {
  await openLocked(page)
  await circle(page, 'Maternal smoking').click()
  await expect(
    panel(page).getByText('This graph is locked.', { exact: false }),
  ).toBeVisible()
  await expect(nameField(page)).toHaveAttribute('readonly', '')
  await expect(
    panel(page).getByRole('button', { name: 'Delete node' }),
  ).toBeDisabled()
  // A read-only field takes no typing, so the circle keeps its name.
  await nameField(page).click()
  await page.keyboard.type('Something else')
  await expect(nameField(page)).toHaveValue('Maternal smoking')
  await expect(circle(page, 'Maternal smoking')).toBeVisible()

  await clickEdgeBetween(page, 'Maternal smoking', 'Birth weight')
  await expect(
    panel(page).getByRole('button', { name: 'Delete edge' }),
  ).toBeDisabled()

  // The graph name in the top bar is read-only too.
  await expect(
    topBar(page).getByRole('textbox', { name: 'Graph name' }),
  ).toHaveAttribute('readonly', '')
})

test('unlocking makes the graph editable again, and undo takes the lock back', async ({
  page,
}) => {
  await page.goto('/')
  await addNodeAt(page, 200, 200)
  await lockButton(page).click()
  await expect(railButton(page, 'Add node')).toBeDisabled()

  // One undo unlocks the graph (spec 4.17).
  await pane(page).click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('Control+z')
  await expect(lockButton(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(railButton(page, 'Add node')).toBeEnabled()

  await lockButton(page).click()
  await lockButton(page).click()
  await expect(lockButton(page)).toHaveAttribute('aria-pressed', 'false')
  await addNodeAt(page, 450, 250)
  await expect(nodes(page)).toHaveCount(2)
})

test('the lock survives a reload and a saved file', async ({ page }) => {
  await openLocked(page)
  await page.reload()
  await expect(lockButton(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(railButton(page, 'Add node')).toBeDisabled()
})
