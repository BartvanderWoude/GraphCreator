import {
  addNodeAt,
  centre,
  circle,
  clickEdgeBetween,
  clickEmptyCanvas,
  connect,
  diameter,
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
  viewport,
} from './fixtures.ts'

const tool = (page: Parameters<typeof rail>[0], name: string) =>
  rail(page).getByRole('button', { name, exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
})

test('double-click adds a "Node 1" circle centred on the pointer, selects it and focuses its name', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await expect(circle(page, 'Node 1')).toBeVisible()
  await expect(circle(page, 'Node 1')).toHaveAccessibleName('Node 1, Other')
  await expect(circle(page, 'Node 1')).toHaveAttribute('data-role', 'other')
  // A new node is untyped: the warning dot shows.
  await expect(
    node(page, 'Node 1').getByRole('img', { name: 'No variable type' }),
  ).toBeVisible()

  const paneBox = await pane(page).boundingBox()
  const c = await centre(node(page, 'Node 1'))
  expect(c.x - paneBox!.x).toBeCloseTo(200, -1)
  expect(c.y - paneBox!.y).toBeCloseTo(200, -1)
  expect(await diameter(node(page, 'Node 1'))).toBeCloseTo(96, 0)

  await expect(nameField(page)).toHaveValue('Node 1')
  await expect(nameField(page)).toBeFocused()
  // The name text is selected, so typing replaces it.
  await page.keyboard.type('Age')
  await page.keyboard.press('Enter')
  await expect(circle(page, 'Age')).toBeVisible()
})

test('double-clicking a node focuses its name for renaming', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await page.keyboard.type('Age')
  await page.keyboard.press('Enter')
  await clickEmptyCanvas(page)
  await expect(nameField(page)).toHaveCount(0)

  await node(page, 'Age').dblclick()
  await expect(nameField(page)).toHaveValue('Age')
  await expect(nameField(page)).toBeFocused()
  // No second node was added, and the selected text is replaced by typing.
  await expect(nodes(page)).toHaveCount(1)
  await page.keyboard.type('Maternal age')
  await page.keyboard.press('Enter')
  await expect(circle(page, 'Maternal age')).toBeVisible()
  await expect(circle(page, 'Age')).toHaveCount(0)
})

test('the add tool (N, then a click) adds a node and returns to Select', async ({
  page,
}) => {
  await page.keyboard.press('n')
  await expect(tool(page, 'Add node')).toHaveAttribute('aria-pressed', 'true')
  await pane(page).click({ position: { x: 300, y: 250 } })
  await expect(circle(page, 'Node 1')).toBeVisible()
  const paneBox = await pane(page).boundingBox()
  const c = await centre(node(page, 'Node 1'))
  expect(c.x - paneBox!.x).toBeCloseTo(300, -1)
  expect(c.y - paneBox!.y).toBeCloseTo(250, -1)
  await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true')

  // A plain click on the canvas with the Select tool adds nothing.
  await clickEmptyCanvas(page)
  await expect(nodes(page)).toHaveCount(1)
})

test('the rail Add node button picks the add tool; pressed again it adds a node at the centre', async ({
  page,
}) => {
  await tool(page, 'Add node').click()
  await expect(tool(page, 'Add node')).toHaveAttribute('aria-pressed', 'true')
  await expect(nodes(page)).toHaveCount(0)
  await tool(page, 'Add node').click()
  await expect(circle(page, 'Node 1')).toBeVisible()
  await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true')
  const paneCentre = await centre(pane(page))
  const c = await centre(node(page, 'Node 1'))
  expect(Math.abs(c.x - paneCentre.x)).toBeLessThan(3)
  expect(Math.abs(c.y - paneCentre.y)).toBeLessThan(3)
})

test('dragging from the rim connects two nodes; closing a cycle is refused with a toast', async ({
  page,
}) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await expect(nodes(page)).toHaveCount(2)

  await connect(page, 'Node 1', 'Node 2')
  await expect(edges(page)).toHaveCount(1)
  await expect(page.locator('.react-flow__edge-floating')).toHaveCount(1)

  await connect(page, 'Node 2', 'Node 1')
  await expect(
    page.getByText('Node 2 → Node 1 → Node 2 would form a cycle.'),
  ).toBeVisible()
  await expect(edges(page)).toHaveCount(1)
})

test('dragging the middle of a circle moves it instead of connecting', async ({
  page,
}) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  const before = await centre(node(page, 'Node 1'))
  const target = await centre(node(page, 'Node 2'))
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(target.x - 150, target.y + 100, { steps: 10 })
  await page.mouse.up()
  await expect(edges(page)).toHaveCount(0)
  const after = await centre(node(page, 'Node 1'))
  expect(after.x - before.x).toBeGreaterThan(100)
})

test('connect mode (C, then two clicks) adds an edge and stays active', async ({
  page,
}) => {
  await addNodeAt(page, 150, 150)
  await addNodeAt(page, 450, 150)
  await addNodeAt(page, 450, 350)
  await clickEmptyCanvas(page)

  await page.keyboard.press('c')
  await expect(tool(page, 'Connect')).toHaveAttribute('aria-pressed', 'true')
  await circle(page, 'Node 1').click()
  // The picked source keeps its rim.
  await expect(node(page, 'Node 1').locator('.gc-node')).toHaveClass(
    /gc-rim-on/,
  )
  await circle(page, 'Node 2').click()
  await expect(edges(page)).toHaveCount(1)
  await expect(node(page, 'Node 1').locator('.gc-node')).not.toHaveClass(
    /gc-rim-on/,
  )

  // The tool stays active for the next edge.
  await expect(tool(page, 'Connect')).toHaveAttribute('aria-pressed', 'true')
  await circle(page, 'Node 1').click()
  await circle(page, 'Node 3').click()
  await expect(edges(page)).toHaveCount(2)

  // An invalid pair shows the same toast as dragging.
  await circle(page, 'Node 2').click()
  await circle(page, 'Node 1').click()
  await expect(
    page.getByText('Node 2 → Node 1 → Node 2 would form a cycle.'),
  ).toBeVisible()
  await expect(edges(page)).toHaveCount(2)

  // Clicking the empty canvas and Escape clear the picked source; Escape returns to Select.
  await circle(page, 'Node 2').click()
  await clickEmptyCanvas(page)
  await expect(node(page, 'Node 2').locator('.gc-node')).not.toHaveClass(
    /gc-rim-on/,
  )
  await circle(page, 'Node 2').click()
  await expect(node(page, 'Node 2').locator('.gc-node')).toHaveClass(
    /gc-rim-on/,
  )
  await page.keyboard.press('Escape')
  await expect(node(page, 'Node 2').locator('.gc-node')).not.toHaveClass(
    /gc-rim-on/,
  )
  await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true')
})

test('clicking an edge opens its editor', async ({ page }) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await connect(page, 'Node 1', 'Node 2')
  await clickEdgeBetween(page, 'Node 1', 'Node 2')
  await expect(
    panel(page).getByRole('heading', { name: 'Node 1 → Node 2' }),
  ).toBeVisible()
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1)
})

test('an edge with evidence shows a chip with the count, which selects the edge', async ({
  page,
}) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await connect(page, 'Node 1', 'Node 2')
  await clickEdgeBetween(page, 'Node 1', 'Node 2')
  const chip = page.getByRole('button', { name: /evidence item/ })
  await expect(chip).toHaveCount(0)

  const evidence = panel(page).getByRole('group', { name: 'Evidence' })
  await evidence.getByRole('button', { name: 'Add evidence' }).click()
  const item1 = evidence.getByRole('textbox', {
    name: 'Evidence 1',
    exact: true,
  })
  await item1.fill('PMID:123')
  await item1.press('Enter')
  await evidence
    .getByRole('textbox', { name: 'Evidence 2', exact: true })
    .fill('doi:10.1000/xyz')
  await item1.focus()
  await expect(
    page.getByRole('button', { name: '2 evidence items', exact: true }),
  ).toHaveText('2')

  await clickEmptyCanvas(page)
  await expect(panel(page)).toContainText('Nothing selected.')
  await page.getByRole('button', { name: '2 evidence items' }).click()
  await expect(
    panel(page).getByRole('heading', { name: 'Node 1 → Node 2' }),
  ).toBeVisible()
})

test('renaming to a long name keeps the circle the same size and place', async ({
  page,
}) => {
  await addNodeAt(page, 300, 250)
  const before = await centre(node(page, 'Node 1'))
  expect(await diameter(node(page, 'Node 1'))).toBeCloseTo(96, 0)
  await nameField(page).fill('Maternal smoking during pregnancy')
  await nameField(page).press('Enter')
  const renamed = node(page, 'Maternal smoking during pregnancy')
  await expect(renamed).toBeVisible()
  // Every circle is the same size (spec 5.7.6), so nothing moves.
  await expect.poll(() => diameter(renamed)).toBeCloseTo(96, 0)
  const after = await centre(renamed)
  expect(Math.abs(after.x - before.x)).toBeLessThan(2)
  expect(Math.abs(after.y - before.y)).toBeLessThan(2)
  // The name is wrapped inside the circle, one span per line, in a smaller font (5.7.6).
  await expect(renamed.locator('.gc-line')).toHaveText([
    'Maternal',
    'smoking',
    'during',
    'pregnancy',
  ])
  await expect(renamed.locator('.gc-circle')).toHaveCSS('font-size', '11.5px')
})

test('Delete removes a node and its edges', async ({ page }) => {
  await addNodeAt(page, 150, 150)
  await addNodeAt(page, 500, 150)
  await addNodeAt(page, 500, 350)
  await connect(page, 'Node 1', 'Node 2')
  await connect(page, 'Node 1', 'Node 3')
  await expect(edges(page)).toHaveCount(2)

  await circle(page, 'Node 1').click()
  await page.keyboard.press('Delete')
  await expect(node(page, 'Node 1')).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(2)
  await expect(edges(page)).toHaveCount(0)
  await expect(panel(page)).toContainText('Nothing selected.')
})

test('Backspace and tool keys in a text field do not reach the canvas', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await page.keyboard.press('Backspace')
  await expect(nodes(page)).toHaveCount(1)
  await page.keyboard.press('c')
  await expect(nameField(page)).toHaveValue('c')
  await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true')
})

test('V, N and C pick the tool; the rail shows the active one', async ({
  page,
}) => {
  for (const [key, name] of [
    ['n', 'Add node'],
    ['c', 'Connect'],
    ['v', 'Select'],
  ]) {
    await page.keyboard.press(key)
    await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'true')
  }
})

test('L lays the graph out, F fits the view, + and − zoom', async ({
  page,
}) => {
  await topBar(page).getByRole('button', { name: 'Open…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Open a graph' })
  // Positions put the effect left of its cause.
  await dialog
    .getByRole('textbox', { name: 'Graph code' })
    .fill('dag {\nA [pos="3,0"]\nB [pos="0,0"]\nA -> B\n}')
  await dialog.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(nodes(page)).toHaveCount(2)
  await expect(dialog).toHaveCount(0)
  expect((await centre(node(page, 'A'))).x).toBeGreaterThan(
    (await centre(node(page, 'B'))).x,
  )

  await page.keyboard.press('l')
  await expect
    .poll(
      async () =>
        (await centre(node(page, 'B'))).x - (await centre(node(page, 'A'))).x,
    )
    .toBeGreaterThan(0)

  const fitted = await viewport(page)
  await page.keyboard.press('+')
  await expect
    .poll(async () => (await viewport(page)).zoom)
    .toBeGreaterThan(fitted.zoom)
  const zoomedIn = await viewport(page)
  await page.keyboard.press('-')
  await expect
    .poll(async () => (await viewport(page)).zoom)
    .toBeLessThan(zoomedIn.zoom)

  // Pan the view away, then F brings the graph back into view.
  const p = await centre(pane(page))
  await page.mouse.move(p.x + 200, p.y + 150)
  await page.mouse.down()
  await page.mouse.move(p.x + 600, p.y + 400, { steps: 10 })
  await page.mouse.up()
  const panned = await viewport(page)
  await page.keyboard.press('f')
  await expect
    .poll(async () => {
      const v = await viewport(page)
      return Math.hypot(v.x - panned.x, v.y - panned.y)
    })
    .toBeGreaterThan(100)
  await expect(node(page, 'A')).toBeInViewport()
  await expect(node(page, 'B')).toBeInViewport()
})

test('dragging a node moves it and the move is kept', async ({ page }) => {
  await addNodeAt(page, 200, 200)
  await expect.poll(() => stored(page)).toContain('Node 1')
  const savedBefore = await stored(page)

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
  await expect.poll(() => stored(page)).not.toBe(savedBefore)
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
  await expect.poll(() => stored(page)).toContain('to: Node 2')

  await page.reload()
  await expect(circle(page, 'Node 1')).toBeVisible()
  await expect(circle(page, 'Node 2')).toBeVisible()
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
  await expect(nodes(page)).toHaveCount(0)
})
