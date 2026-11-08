import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  expect,
  test,
  type Download,
  type Locator,
  type Page,
} from '@playwright/test'

const FIXTURES = path.join(import.meta.dirname, '../src/model/__fixtures__')
const fixture = (name: string) => path.join(FIXTURES, name)
const fixtureText = (name: string) => readFileSync(fixture(name), 'utf8')

/** spec 4.2: `toDagitty` of the 4.1 example graph (`smoking.dag.yaml`). */
const SMOKING_DAGITTY = `dag {
Maternal_smoking [exposure,label="Maternal smoking",pos="0.000,0.000"]
Birth_weight [outcome,label="Birth weight",pos="3.000,0.000"]
SES [pos="1.500,-1.200"]
Genetic_factors [latent,label="Genetic factors",pos="1.500,1.200"]
SES -> Maternal_smoking
Maternal_smoking -> Birth_weight
SES -> Birth_weight
Genetic_factors -> Birth_weight
}
`

const nodes = (page: Page) => page.locator('.react-flow__node')
const edges = (page: Page) => page.locator('.react-flow__edge')
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Toolbar' })
const button = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name, exact: true })

function node(page: Page, name: string) {
  return nodes(page).filter({ has: page.getByText(name, { exact: true }) })
}

async function centre(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element has no bounding box.')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Clicks Open and picks `file` in the file chooser. */
async function openFile(page: Page, file: string) {
  const chooser = page.waitForEvent('filechooser')
  await button(page, 'Open').click()
  await (await chooser).setFiles(file)
}

/** Runs `action` and returns the download it starts, with its text. */
async function download(page: Page, action: () => Promise<void>) {
  const pending = page.waitForEvent('download')
  await action()
  const d: Download = await pending
  const file = await d.path()
  return { name: d.suggestedFilename(), file, text: readFileSync(file, 'utf8') }
}

async function dagittyMenu(page: Page, item: 'Import…' | 'Export…') {
  await button(page, 'dagitty').click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__pane')).toBeVisible()
})

test('Open loads a YAML file and Save writes the same text back', async ({
  page,
}) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await expect(nodes(page)).toHaveCount(4)
  await expect(edges(page)).toHaveCount(4)
  await expect(
    toolbar(page).getByRole('textbox', { name: 'Graph name' }),
  ).toHaveValue('Smoking and birth weight')
  // Genetic factors has no type: one warning, offered in a toast.
  await expect(page.getByText('Opened with 1 warning')).toBeVisible()
  await page.getByRole('button', { name: 'Show' }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Warnings' })
      .getByText('Node "Genetic factors" has no variable type.'),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  const saved = await download(page, () => button(page, 'Save').click())
  expect(saved.name).toBe('smoking-and-birth-weight.dag.yaml')
  expect(saved.text).toBe(fixtureText('smoking.dag.yaml'))
})

test('a graph made in the app survives Save, New and Open', async ({
  page,
}) => {
  const name = toolbar(page).getByRole('textbox', { name: 'Graph name' })
  await name.fill('My DAG!')
  await name.press('Enter')
  await page
    .locator('.react-flow__pane')
    .dblclick({ position: { x: 150, y: 200 } })
  await page.keyboard.type('Age')
  await page.keyboard.press('Enter')
  await page
    .locator('.react-flow__pane')
    .dblclick({ position: { x: 500, y: 200 } })
  await page.keyboard.type('BMI')
  await page.keyboard.press('Enter')
  const s = await centre(
    node(page, 'Age').locator('.react-flow__handle.source'),
  )
  const t = await centre(
    node(page, 'BMI').locator('.react-flow__handle.target'),
  )
  await page.mouse.move(s.x, s.y)
  await page.mouse.down()
  await page.mouse.move(t.x, t.y, { steps: 10 })
  await page.mouse.up()
  await expect(edges(page)).toHaveCount(1)

  const first = await download(page, () => button(page, 'Save').click())
  expect(first.name).toBe('my-dag.dag.yaml')
  expect(first.text).toContain('name: My DAG!')
  expect(first.text).toContain('- from: Age\n    to: BMI\n')

  // New asks first; Cancel keeps the graph.
  await button(page, 'New').click()
  const confirm = page.getByRole('dialog', { name: 'Start a new graph?' })
  await expect(confirm).toContainText(
    'Unsaved changes to the current graph will be lost.',
  )
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(nodes(page)).toHaveCount(2)
  await button(page, 'New').click()
  await confirm.getByRole('button', { name: 'New graph' }).click()
  await expect(nodes(page)).toHaveCount(0)
  await expect(name).toHaveValue('')

  await openFile(page, first.file)
  await expect(nodes(page)).toHaveCount(2)
  await expect(edges(page)).toHaveCount(1)
  const second = await download(page, () => button(page, 'Save').click())
  expect(second.text).toBe(first.text)
})

test('Open of an invalid file lists the errors and keeps the graph', async ({
  page,
}) => {
  await page
    .locator('.react-flow__pane')
    .dblclick({ position: { x: 200, y: 200 } })
  await expect(nodes(page)).toHaveCount(1)

  await openFile(page, fixture('cycle.dag.yaml'))
  const dialog = page.getByRole('dialog', {
    name: 'Could not open cycle.dag.yaml',
  })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('The graph has a cycle: A → B → C → A.')
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await expect(dialog).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(1)
  await expect(node(page, 'Node 1')).toBeVisible()
})

test('dagitty import from a file creates its nodes and edges', async ({
  page,
}) => {
  await dagittyMenu(page, 'Import…')
  const dialog = page.getByRole('dialog', { name: 'Import from dagitty' })
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Choose file…' }).click()
  await (await chooser).setFiles(fixture('confounding.dagitty.txt'))
  await expect(
    dialog.getByRole('textbox', { name: 'dagitty code' }),
  ).toHaveValue(fixtureText('confounding.dagitty.txt'))
  await dialog.getByRole('button', { name: 'Import' }).click()

  await expect(dialog).toHaveCount(0)
  for (const n of ['A', 'B', 'D', 'E', 'Z']) {
    await expect(node(page, n)).toBeVisible()
  }
  await expect(nodes(page)).toHaveCount(5)
  await expect(edges(page)).toHaveCount(7)
  await expect(node(page, 'E').getByLabel('Role: exposure')).toBeVisible()
  await expect(node(page, 'D').getByLabel('Role: outcome')).toBeVisible()
  await expect(page.getByText('Imported with 5 warnings')).toBeVisible()
})

test('dagitty import over an existing graph asks first', async ({ page }) => {
  await page
    .locator('.react-flow__pane')
    .dblclick({ position: { x: 200, y: 200 } })
  await dagittyMenu(page, 'Import…')
  const dialog = page.getByRole('dialog', { name: 'Import from dagitty' })
  await dialog
    .getByRole('textbox', { name: 'dagitty code' })
    .fill('dag {\n  X -> Y\n}')
  await dialog.getByRole('button', { name: 'Import' }).click()
  const confirm = page.getByRole('dialog', { name: 'Start a new graph?' })
  await confirm.getByRole('button', { name: 'Import' }).click()
  await expect(nodes(page)).toHaveCount(2)
  await expect(node(page, 'X')).toBeVisible()
  await expect(node(page, 'Node 1')).toHaveCount(0)
})

test('dagitty import of bidirected edges shows the error and changes nothing', async ({
  page,
}) => {
  await dagittyMenu(page, 'Import…')
  const dialog = page.getByRole('dialog', { name: 'Import from dagitty' })
  await dialog
    .getByRole('textbox', { name: 'dagitty code' })
    .fill(fixtureText('bidirected.dagitty.txt'))
  await dialog.getByRole('button', { name: 'Import' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'bidirected edges (<->) are not supported yet. GraphCreator v1 supports directed edges only.',
  )
  await expect(dialog.getByRole('alert')).toContainText(/Line \d+:/)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(nodes(page)).toHaveCount(0)
})

test('dagitty export shows toDagitty text and downloads it', async ({
  page,
}) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await expect(nodes(page)).toHaveCount(4)

  await dagittyMenu(page, 'Export…')
  const dialog = page.getByRole('dialog', { name: 'Export to dagitty' })
  await expect(dialog).toContainText(
    'Variable types, levels, descriptions, units and evidence are not included in dagitty files.',
  )
  await expect(
    dialog.getByRole('textbox', { name: 'dagitty code' }),
  ).toHaveValue(SMOKING_DAGITTY)

  const file = await download(page, () =>
    dialog.getByRole('button', { name: 'Download' }).click(),
  )
  expect(file.name).toBe('smoking-and-birth-weight.dagitty.txt')
  expect(file.text).toBe(SMOKING_DAGITTY)
})

test('Auto-layout puts causes left of their effects', async ({ page }) => {
  await dagittyMenu(page, 'Import…')
  const dialog = page.getByRole('dialog', { name: 'Import from dagitty' })
  // Positions put the effect left of its cause.
  await dialog
    .getByRole('textbox', { name: 'dagitty code' })
    .fill('dag {\nA [pos="3,0"]\nB [pos="0,0"]\nA -> B\n}')
  await dialog.getByRole('button', { name: 'Import' }).click()
  await expect(nodes(page)).toHaveCount(2)
  expect((await centre(node(page, 'A'))).x).toBeGreaterThan(
    (await centre(node(page, 'B'))).x,
  )

  await button(page, 'Auto-layout').click()
  await expect
    .poll(
      async () =>
        (await centre(node(page, 'B'))).x - (await centre(node(page, 'A'))).x,
    )
    .toBeGreaterThan(0)
})

test('autosave keeps an opened graph across a reload', async ({ page }) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await expect(nodes(page)).toHaveCount(4)
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('graphcreator:current')),
    )
    .toBe(fixtureText('smoking.dag.yaml'))
  await page.reload()
  await expect(nodes(page)).toHaveCount(4)
  await expect(
    toolbar(page).getByRole('textbox', { name: 'Graph name' }),
  ).toHaveValue('Smoking and birth weight')
})
