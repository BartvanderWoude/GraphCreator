import { expect, test, type Locator, type Page } from '@playwright/test'

function node(page: Page, name: string) {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByText(name, { exact: true }) })
}

const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Side panel' })

const nameField = (page: Page) =>
  panel(page).getByRole('textbox', { name: 'Name', exact: true })

async function addNodeAt(page: Page, x: number, y: number) {
  await page.locator('.react-flow__pane').dblclick({ position: { x, y } })
}

async function centre(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element has no bounding box.')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function connect(page: Page, from: string, to: string) {
  const s = await centre(node(page, from).locator('.react-flow__handle.source'))
  const t = await centre(node(page, to).locator('.react-flow__handle.target'))
  await page.mouse.move(s.x, s.y)
  await page.mouse.down()
  await page.mouse.move(t.x, t.y, { steps: 10 })
  await page.mouse.up()
}

/** Picks `option` in the side panel select labelled `label` (Role or Type). */
async function choose(page: Page, label: string, option: string) {
  await panel(page).getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

const stored = (page: Page) =>
  page.evaluate(() => localStorage.getItem('graphcreator:current'))

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__pane')).toBeVisible()
})

test('rename commits on Enter and refuses a duplicate name', async ({
  page,
}) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await expect(nameField(page)).toHaveValue('Node 2')

  await nameField(page).fill('Node 1')
  await nameField(page).press('Enter')
  await expect(panel(page).getByRole('alert')).toHaveText(
    'There is already a node called "Node 1".',
  )
  await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.react-flow__node')).toHaveText([
    /Node 1/,
    /Node 2/,
  ])

  // Escape reverts; a valid name commits.
  await nameField(page).press('Escape')
  await expect(nameField(page)).toHaveValue('Node 2')
  await expect(panel(page).getByRole('alert')).toHaveCount(0)
  await nameField(page).fill('  Birth weight ')
  await nameField(page).press('Enter')
  await expect(nameField(page)).toHaveValue('Birth weight')
  await expect(node(page, 'Birth weight')).toBeVisible()
})

test('role changes the node badge', async ({ page }) => {
  await addNodeAt(page, 200, 200)
  await choose(page, 'Role', 'exposure')
  await expect(node(page, 'Node 1').getByLabel('Role: exposure')).toHaveText(
    'E',
  )
  await choose(page, 'Role', 'latent')
  await expect(node(page, 'Node 1').getByLabel('Role: latent')).toHaveText('L')
  await choose(page, 'Role', 'other')
  await expect(node(page, 'Node 1').getByLabel(/Role:/)).toHaveCount(0)
})

test('variable type shows levels or unit, and levels can be edited', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  const levels = panel(page).getByRole('group', { name: 'Levels' })
  const unit = panel(page).getByRole('textbox', { name: 'Unit' })

  await choose(page, 'Type', 'ordinal')
  await expect(levels).toBeVisible()
  await expect(panel(page)).toContainText('Order matters: lowest first')
  await expect(unit).toHaveCount(0)

  await levels.getByRole('button', { name: 'Add level' }).click()
  const level1 = levels.getByRole('textbox', { name: 'Level 1', exact: true })
  await expect(level1).toBeFocused()
  await level1.fill('high')
  await level1.press('Enter')
  const level2 = levels.getByRole('textbox', { name: 'Level 2', exact: true })
  await expect(level2).toBeFocused()
  await level2.fill('low')
  await level2.press('Enter')
  // Enter in the last (non-empty) input added an empty Level 3; it is not saved.
  await expect(
    levels.getByRole('textbox', { name: 'Level 3', exact: true }),
  ).toBeFocused()
  await levels
    .getByRole('button', { name: 'Move level 2 up', exact: true })
    .click()
  await expect(level1).toHaveValue('low')
  await expect(level2).toHaveValue('high')
  await expect.poll(() => stored(page)).toContain('levels: [low, high]')

  await choose(page, 'Type', 'continuous')
  await expect(levels).toHaveCount(0)
  await expect(unit).toBeVisible()
  await unit.fill('g')
  await unit.press('Enter')
  await expect.poll(() => stored(page)).toContain('unit: g')
  await expect.poll(() => stored(page)).not.toContain('levels:')
})

test('description is saved on blur', async ({ page }) => {
  await addNodeAt(page, 200, 200)
  const description = panel(page).getByRole('textbox', {
    name: 'Description',
  })
  await description.fill('Self-reported')
  await nameField(page).focus()
  await expect.poll(() => stored(page)).toContain('description: Self-reported')
})

test('warning badge count drops when a node gets a type', async ({ page }) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  const badge = page
    .getByRole('toolbar', { name: 'Toolbar' })
    .getByRole('button', { name: /warning/ })
  await expect(badge).toHaveText('⚠ 2')
  await expect(
    node(page, 'Node 2').getByTitle('No variable type'),
  ).toBeVisible()

  await choose(page, 'Type', 'continuous')
  await expect(badge).toHaveText('⚠ 1')
  await expect(node(page, 'Node 2').getByTitle('No variable type')).toHaveCount(
    0,
  )
})

test('issues dialog lists warnings and selects the clicked node', async ({
  page,
}) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await expect(nameField(page)).toHaveValue('Node 2')

  await page.getByRole('button', { name: '2 warnings' }).click()
  const dialog = page.getByRole('dialog', { name: 'Warnings' })
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole('button', { name: 'Node "Node 1" has no variable type.' })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(nameField(page)).toHaveValue('Node 1')
})

test('edge evidence and note can be added', async ({ page }) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await connect(page, 'Node 1', 'Node 2')
  const s = await centre(
    node(page, 'Node 1').locator('.react-flow__handle.source'),
  )
  const t = await centre(
    node(page, 'Node 2').locator('.react-flow__handle.target'),
  )
  await page.mouse.click((s.x + t.x) / 2, (s.y + t.y) / 2)
  await expect(
    panel(page).getByRole('heading', { name: 'Node 1 → Node 2' }),
  ).toBeVisible()

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
  const note = panel(page).getByRole('textbox', { name: 'Note' })
  await note.fill('Well established')
  await item1.focus()
  await expect
    .poll(() => stored(page))
    .toContain('evidence: ["PMID:123", "doi:10.1000/xyz"]')
  await expect.poll(() => stored(page)).toContain('note: Well established')

  await evidence
    .getByRole('button', { name: 'Remove evidence 1', exact: true })
    .click()
  await expect
    .poll(() => stored(page))
    .toContain('evidence: ["doi:10.1000/xyz"]')

  await panel(page).getByRole('button', { name: 'Delete edge' }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
})
