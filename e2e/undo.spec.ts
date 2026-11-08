import {
  addNodeAt,
  centre,
  circle,
  clickEmptyCanvas,
  expect,
  nameField,
  node,
  nodes,
  pane,
  panel,
  rail,
  stored,
  test,
} from './fixtures.ts'
import type { Page } from '@playwright/test'

const undoButton = (page: Page) =>
  rail(page).getByRole('button', { name: 'Undo', exact: true })
const redoButton = (page: Page) =>
  rail(page).getByRole('button', { name: 'Redo', exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
})

test('Ctrl+Z removes an added node; Ctrl+Shift+Z and Ctrl+Y bring it back', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await expect(circle(page, 'Node 1')).toBeVisible()
  // Move focus out of the name field, where Ctrl+Z is the browser's text undo.
  await clickEmptyCanvas(page)

  await page.keyboard.press('Control+z')
  await expect(nodes(page)).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z')
  await expect(circle(page, 'Node 1')).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(nodes(page)).toHaveCount(0)
  await page.keyboard.press('Control+y')
  await expect(circle(page, 'Node 1')).toBeVisible()

  // With a dialog open the keys do nothing.
  await page.getByRole('button', { name: 'Open…' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).focus()
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(circle(page, 'Node 1')).toBeVisible()
})

test('the rail Undo and Redo buttons do the same and are disabled at the ends', async ({
  page,
}) => {
  await expect(undoButton(page)).toBeDisabled()
  await expect(redoButton(page)).toBeDisabled()
  await expect(undoButton(page)).toHaveAttribute(
    'aria-keyshortcuts',
    'Control+Z Meta+Z',
  )
  await expect(redoButton(page)).toHaveAttribute(
    'aria-keyshortcuts',
    'Control+Shift+Z Meta+Shift+Z Control+Y',
  )
  // The cheat sheet mentions undo.
  await expect(panel(page)).toContainText('UndoPress Ctrl+Z')

  await addNodeAt(page, 200, 200)
  await addNodeAt(page, 400, 200)
  await expect(nodes(page)).toHaveCount(2)
  await expect(undoButton(page)).toBeEnabled()
  await expect(redoButton(page)).toBeDisabled()

  // The tooltip names the key.
  await undoButton(page).hover()
  await expect(
    page.getByRole('tooltip', { name: /^Undo\s*Ctrl\+Z$/ }),
  ).toBeVisible()

  await undoButton(page).click()
  await expect(nodes(page)).toHaveCount(1)
  await expect(redoButton(page)).toBeEnabled()
  await undoButton(page).click()
  await expect(nodes(page)).toHaveCount(0)
  await expect(undoButton(page)).toBeDisabled()

  await redoButton(page).click()
  await expect(circle(page, 'Node 1')).toBeVisible()
  await redoButton(page).click()
  await expect(circle(page, 'Node 2')).toBeVisible()
  await expect(redoButton(page)).toBeDisabled()
  await expect(undoButton(page)).toBeEnabled()
})

test('undoing a rename while the node stays selected shows the old name in the side panel', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await page.keyboard.type('Age')
  await page.keyboard.press('Enter')
  await expect(circle(page, 'Age')).toBeVisible()

  // Clicking the circle keeps it selected and moves focus out of the name field.
  await circle(page, 'Age').click()
  await expect(nameField(page)).not.toBeFocused()
  await page.keyboard.press('Control+z')
  await expect(circle(page, 'Node 1')).toBeVisible()
  await expect(nameField(page)).toHaveValue('Node 1')

  await redoButton(page).click()
  await expect(circle(page, 'Age')).toBeVisible()
  await expect(nameField(page)).toHaveValue('Age')
})

test('a box-selected two-node drag is undone in one step', async ({ page }) => {
  await addNodeAt(page, 150, 150)
  await addNodeAt(page, 350, 150)
  await expect(nodes(page)).toHaveCount(2)
  await clickEmptyCanvas(page)
  const a0 = await centre(node(page, 'Node 1'))
  const b0 = await centre(node(page, 'Node 2'))

  // Shift-drag a selection box around both circles.
  const box = await pane(page).boundingBox()
  await page.keyboard.down('Shift')
  await page.mouse.move(box!.x + 60, box!.y + 60)
  await page.mouse.down()
  await page.mouse.move(box!.x + 450, box!.y + 250, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2)

  // Drag one of them; both move.
  await page.mouse.move(a0.x, a0.y)
  await page.mouse.down()
  await page.mouse.move(a0.x + 100, a0.y + 120, { steps: 10 })
  await page.mouse.up()
  const a1 = await centre(node(page, 'Node 1'))
  const b1 = await centre(node(page, 'Node 2'))
  expect(a1.y - a0.y).toBeGreaterThan(80)
  expect(b1.y - b0.y).toBeGreaterThan(80)

  // One undo puts both back.
  await page.keyboard.press('Control+z')
  await expect
    .poll(async () => (await centre(node(page, 'Node 1'))).y)
    .toBeCloseTo(a0.y, 0)
  const a2 = await centre(node(page, 'Node 1'))
  const b2 = await centre(node(page, 'Node 2'))
  expect(a2.x).toBeCloseTo(a0.x, 0)
  expect(b2.x).toBeCloseTo(b0.x, 0)
  expect(b2.y).toBeCloseTo(b0.y, 0)
  await expect(nodes(page)).toHaveCount(2)

  // The next undo removes the second node.
  await page.keyboard.press('Control+z')
  await expect(nodes(page)).toHaveCount(1)
})

test('Ctrl+Z while typing in the name field does not change the graph', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await expect(nameField(page)).toBeFocused()
  await page.keyboard.type('Age')
  await page.keyboard.press('Control+z')
  // The browser undid the typing; the graph still has its node, with its old name.
  await expect(nodes(page)).toHaveCount(1)
  await expect(circle(page, 'Node 1')).toBeVisible()
  await expect(nameField(page)).toBeFocused()
  await expect(undoButton(page)).toBeEnabled()
  await expect(redoButton(page)).toBeDisabled()
})

test('after a reload Undo is disabled', async ({ page }) => {
  await addNodeAt(page, 200, 200)
  await expect(undoButton(page)).toBeEnabled()
  await expect.poll(() => stored(page)).toContain('Node 1')
  await page.reload()
  await expect(circle(page, 'Node 1')).toBeVisible()
  await expect(undoButton(page)).toBeDisabled()
  await expect(redoButton(page)).toBeDisabled()
})

test('the undone state is what autosave stores', async ({ page }) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 400, 200)
  await expect.poll(() => stored(page)).toContain('Node 2')
  await clickEmptyCanvas(page)

  await page.keyboard.press('Control+z')
  await expect(nodes(page)).toHaveCount(1)
  await expect.poll(() => stored(page)).not.toContain('Node 2')
  expect(await stored(page)).toContain('Node 1')

  await page.reload()
  await expect(circle(page, 'Node 1')).toBeVisible()
  await expect(nodes(page)).toHaveCount(1)
})
