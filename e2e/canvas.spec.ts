import { expect, test, type Page } from '@playwright/test'

/** The React Flow node box showing exactly `name`. */
function node(page: Page, name: string) {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByText(name, { exact: true }) })
}

const edges = (page: Page) => page.locator('.react-flow__edge')

/** Double-clicks the empty canvas at a point relative to its top-left corner. */
async function addNodeAt(page: Page, x: number, y: number) {
  await page.locator('.react-flow__pane').dblclick({ position: { x, y } })
}

async function centre(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element has no bounding box.')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Drags from the source handle of `from` onto the target handle of `to`. */
async function connect(page: Page, from: string, to: string) {
  const s = await centre(node(page, from).locator('.react-flow__handle.source'))
  const t = await centre(node(page, to).locator('.react-flow__handle.target'))
  await page.mouse.move(s.x, s.y)
  await page.mouse.down()
  await page.mouse.move(t.x, t.y, { steps: 10 })
  await page.mouse.up()
}

/** Clicks the middle of the (straight, horizontal) edge between two nodes at the same height. */
async function clickEdgeBetween(page: Page, from: string, to: string) {
  const s = await centre(node(page, from).locator('.react-flow__handle.source'))
  const t = await centre(node(page, to).locator('.react-flow__handle.target'))
  await page.mouse.click((s.x + t.x) / 2, (s.y + t.y) / 2)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__pane')).toBeVisible()
})

test('double-click adds "Node 1", selects it and focuses its name', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await expect(node(page, 'Node 1')).toBeVisible()
  const name = page
    .getByRole('complementary', { name: 'Side panel' })
    .getByRole('textbox', { name: 'Name', exact: true })
  await expect(name).toHaveValue('Node 1')
  await expect(name).toBeFocused()
  // The name text is selected, so typing replaces it.
  await page.keyboard.type('Age')
  await page.keyboard.press('Enter')
  await expect(node(page, 'Age')).toBeVisible()
})

test('toolbar Add node adds a node', async ({ page }) => {
  await page.getByRole('button', { name: 'Add node' }).click()
  await expect(node(page, 'Node 1')).toBeVisible()
})

test('connecting two nodes adds an edge; closing a cycle is refused with a toast', async ({
  page,
}) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await expect(page.locator('.react-flow__node')).toHaveCount(2)

  await connect(page, 'Node 1', 'Node 2')
  await expect(edges(page)).toHaveCount(1)

  await connect(page, 'Node 2', 'Node 1')
  await expect(
    page.getByText('Node 2 → Node 1 → Node 2 would form a cycle.'),
  ).toBeVisible()
  await expect(edges(page)).toHaveCount(1)
})

test('clicking an edge opens its editor', async ({ page }) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await connect(page, 'Node 1', 'Node 2')
  await clickEdgeBetween(page, 'Node 1', 'Node 2')
  await expect(
    page
      .getByRole('complementary', { name: 'Side panel' })
      .getByRole('heading', { name: 'Node 1 → Node 2' }),
  ).toBeVisible()
})

test('Delete removes a node and its edges', async ({ page }) => {
  await addNodeAt(page, 150, 150)
  await addNodeAt(page, 500, 150)
  await addNodeAt(page, 500, 350)
  await connect(page, 'Node 1', 'Node 2')
  await connect(page, 'Node 1', 'Node 3')
  await expect(edges(page)).toHaveCount(2)

  await node(page, 'Node 1').click()
  await page.keyboard.press('Delete')
  await expect(node(page, 'Node 1')).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(edges(page)).toHaveCount(0)
  await expect(
    page.getByRole('complementary', { name: 'Side panel' }),
  ).toContainText('Nothing selected.')
})

test('Backspace in a text field does not delete the node', async ({ page }) => {
  await addNodeAt(page, 200, 200)
  await page.keyboard.press('Backspace')
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
})

test('dragging a node moves it and the move is kept', async ({ page }) => {
  const stored = () =>
    page.evaluate(() => localStorage.getItem('graphcreator:current'))
  await addNodeAt(page, 200, 200)
  await expect.poll(stored).toContain('Node 1')
  const savedBefore = await stored()

  const box = node(page, 'Node 1')
  const before = await centre(box)
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(before.x + 120, before.y + 80, { steps: 10 })
  await page.mouse.up()
  const after = await centre(box)
  // React Flow's drag threshold swallows the first few pixels.
  expect(after.x - before.x).toBeGreaterThan(90)
  expect(after.y - before.y).toBeGreaterThan(50)

  // The move was committed to the store (and autosaved), so it survives a reload.
  await expect.poll(stored).not.toBe(savedBefore)
  await page.reload()
  const reloaded = await centre(box)
  expect(reloaded.x).toBeCloseTo(after.x, 0)
  expect(reloaded.y).toBeCloseTo(after.y, 0)
})

test('reload restores the graph from autosave', async ({ page }) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await connect(page, 'Node 1', 'Node 2')
  await expect(edges(page)).toHaveCount(1)
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('graphcreator:current')),
    )
    .toContain('to: Node 2')

  await page.reload()
  await expect(node(page, 'Node 1')).toBeVisible()
  await expect(node(page, 'Node 2')).toBeVisible()
  await expect(edges(page)).toHaveCount(1)
})

test('corrupt autosave text starts empty with a toast', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem('graphcreator:current', 'schema: nonsense\n'),
  )
  await page.reload()
  await expect(
    page.getByText('Could not restore the previous graph.'),
  ).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
})
