import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Download, Page } from '@playwright/test'
import {
  addNodeAt,
  centre,
  circle,
  connect,
  edges,
  expect,
  node,
  nodes,
  pane,
  rail,
  test,
  topBar,
} from './fixtures.ts'

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

const toolbar = topBar
const button = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name, exact: true })

const openDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Open a graph' })

/** Clicks Open…, then Open file… in the dialog, and picks `file` in the file chooser. */
async function openFile(page: Page, file: string) {
  await button(page, 'Open…').click()
  const chooser = page.waitForEvent('filechooser')
  await openDialog(page).getByRole('button', { name: 'Open file…' }).click()
  await (await chooser).setFiles(file)
}

/** Clicks Open…, pastes `text` and presses Open. */
async function pasteAndOpen(page: Page, text: string) {
  await button(page, 'Open…').click()
  await openDialog(page).getByRole('textbox', { name: 'Graph code' }).fill(text)
  await openDialog(page)
    .getByRole('button', { name: 'Open', exact: true })
    .click()
}

/** Runs `action` and returns the download it starts, with its text. */
async function download(page: Page, action: () => Promise<void>) {
  const pending = page.waitForEvent('download')
  await action()
  const d: Download = await pending
  const file = await d.path()
  return { name: d.suggestedFilename(), file, text: readFileSync(file, 'utf8') }
}

/** Clicks Save, downloads from the "Save as GraphCreator" dialog it opens, and closes it. */
async function saveFile(page: Page) {
  await button(page, 'Save').click()
  const dialog = page.getByRole('dialog', { name: 'Save as GraphCreator' })
  const file = await download(page, () =>
    dialog.getByRole('button', { name: 'Download' }).click(),
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  return file
}

/** Opens Save's "Save as…" menu and picks `item`. */
async function saveAs(page: Page, item: 'GraphCreator…' | 'dagitty…') {
  await button(page, 'Save as…').click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
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

  // Save opens the GraphCreator dialog with the file's text.
  await button(page, 'Save').click()
  await expect(
    page
      .getByRole('dialog', { name: 'Save as GraphCreator' })
      .getByRole('textbox', { name: 'GraphCreator code' }),
  ).toHaveValue(fixtureText('smoking.dag.yaml'))
  await page.keyboard.press('Escape')

  const saved = await saveFile(page)
  expect(saved.name).toBe('smoking-and-birth-weight.dag.yaml')
  expect(saved.text).toBe(fixtureText('smoking.dag.yaml'))
})

test('a graph made in the app survives Save, New and Open', async ({
  page,
}) => {
  const name = toolbar(page).getByRole('textbox', { name: 'Graph name' })
  await name.fill('My DAG!')
  await name.press('Enter')
  await addNodeAt(page, 150, 200)
  await page.keyboard.type('Age')
  await page.keyboard.press('Enter')
  await addNodeAt(page, 500, 200)
  await page.keyboard.type('BMI')
  await page.keyboard.press('Enter')
  await connect(page, 'Age', 'BMI')
  await expect(edges(page)).toHaveCount(1)

  const first = await saveFile(page)
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
  const second = await saveFile(page)
  expect(second.text).toBe(first.text)
})

test('Open of an invalid file lists the errors and keeps the graph', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await expect(nodes(page)).toHaveCount(1)

  await openFile(page, fixture('cycle.dag.yaml'))
  const alert = openDialog(page).getByRole('alert')
  await expect(alert).toContainText('Could not open cycle.dag.yaml:')
  await expect(alert).toContainText('The graph has a cycle: A → B → C → A.')
  await openDialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(openDialog(page)).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(1)
  await expect(circle(page, 'Node 1')).toBeVisible()
})

test('Open file… recognises a dagitty file', async ({ page }) => {
  await openFile(page, fixture('confounding.dagitty.txt'))
  await expect(openDialog(page)).toHaveCount(0)
  for (const n of ['A', 'B', 'D', 'E', 'Z']) {
    await expect(circle(page, n)).toBeVisible()
  }
  await expect(nodes(page)).toHaveCount(5)
  await expect(edges(page)).toHaveCount(7)
  await expect(circle(page, 'E')).toHaveAttribute('data-role', 'exposure')
  await expect(circle(page, 'D')).toHaveAttribute('data-role', 'outcome')
  await expect(circle(page, 'A')).toHaveAttribute('data-role', 'other')
  await expect(page.getByText('Opened with 5 warnings')).toBeVisible()
})

test('the Open dialog names the formats it reads', async ({ page }) => {
  await button(page, 'Open…').click()
  await expect(openDialog(page)).toContainText(
    'Paste GraphCreator, dagitty, GML, DOT or networkx JSON code, or open a file. Opening replaces the current graph.',
  )
})

test('pasted GraphCreator code opens', async ({ page }) => {
  await pasteAndOpen(page, fixtureText('smoking.dag.yaml'))
  await expect(openDialog(page)).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(4)
  await expect(
    toolbar(page).getByRole('textbox', { name: 'Graph name' }),
  ).toHaveValue('Smoking and birth weight')
})

test('pasted dagitty code over an existing graph asks first', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await pasteAndOpen(page, 'dag {\n  X -> Y\n}')
  const confirm = page.getByRole('dialog', { name: 'Start a new graph?' })
  await confirm.getByRole('button', { name: 'Open' }).click()
  await expect(nodes(page)).toHaveCount(2)
  await expect(circle(page, 'X')).toBeVisible()
  await expect(node(page, 'Node 1')).toHaveCount(0)
})

test('pasted dagitty with bidirected edges shows the error and changes nothing', async ({
  page,
}) => {
  await pasteAndOpen(page, fixtureText('bidirected.dagitty.txt'))
  const alert = openDialog(page).getByRole('alert')
  await expect(alert).toContainText('Could not open:')
  await expect(alert).toContainText(
    'bidirected edges (<->) are not supported yet. GraphCreator v1 supports directed edges only.',
  )
  await expect(alert).toContainText(/Line \d+:/)
  await openDialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(nodes(page)).toHaveCount(0)
})

test('Save as… GraphCreator shows the YAML and downloads it', async ({
  page,
}) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await expect(nodes(page)).toHaveCount(4)

  await saveAs(page, 'GraphCreator…')
  const dialog = page.getByRole('dialog', { name: 'Save as GraphCreator' })
  await expect(
    dialog.getByRole('textbox', { name: 'GraphCreator code' }),
  ).toHaveValue(fixtureText('smoking.dag.yaml'))
  const file = await download(page, () =>
    dialog.getByRole('button', { name: 'Download' }).click(),
  )
  expect(file.name).toBe('smoking-and-birth-weight.dag.yaml')
  expect(file.text).toBe(fixtureText('smoking.dag.yaml'))
})

test('Save as… dagitty shows toDagitty text and downloads it', async ({
  page,
}) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await expect(nodes(page)).toHaveCount(4)

  await saveAs(page, 'dagitty…')
  const dialog = page.getByRole('dialog', { name: 'Save as dagitty' })
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
  // Positions put the effect left of its cause.
  await pasteAndOpen(page, 'dag {\nA [pos="3,0"]\nB [pos="0,0"]\nA -> B\n}')
  await expect(nodes(page)).toHaveCount(2)
  expect((await centre(node(page, 'A'))).x).toBeGreaterThan(
    (await centre(node(page, 'B'))).x,
  )

  await rail(page).getByRole('button', { name: 'Auto-layout' }).click()
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

test('the Save as… notes say which formats keep the simulation details', async ({
  page,
}) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await expect(nodes(page)).toHaveCount(4)
  const notes: [string, string][] = [
    [
      'GraphCreator',
      'The GraphCreator file keeps everything: roles, variable types, levels, descriptions, units, evidence, positions and simulation details.',
    ],
    [
      'dagitty',
      'Variable types, levels, descriptions, units and evidence are not included in dagitty files. Simulation details are not included either. Save as GraphCreator to keep them.',
    ],
    [
      'GML',
      'The GML file keeps roles, variable types, levels, descriptions, units, evidence and positions, but not simulation details. Node labels are names safe for R and Python, such as Maternal_smoking; DoWhy and networkx use them as variable names.',
    ],
    [
      'DOT',
      'The DOT file keeps roles, variable types, levels, descriptions, units, evidence and positions as attributes, and the role colors for Graphviz, but not simulation details. Node ids are names safe for R and Python, such as Maternal_smoking.',
    ],
    [
      'networkx JSON',
      'The networkx JSON keeps everything except simulation details. Read it in Python with networkx.node_link_graph(data, edges="edges"). Node ids are names safe for R and Python, such as Maternal_smoking.',
    ],
  ]
  for (const [label, note] of notes) {
    await button(page, 'Save as…').click()
    await page.getByRole('menuitem', { name: `${label}…`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Save as ${label}` })
    await expect(dialog).toContainText(note)
    if (label === 'dagitty') {
      await dialog
        .getByRole('checkbox', { name: 'Include GraphCreator details' })
        .click()
      await expect(dialog).toContainText(
        'Variable types, levels, descriptions, units and evidence are added as gc.* attributes. dagitty keeps them but does not use them. Simulation details are not included.',
      )
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
})

test('a locked file opens locked and saves its lock back', async ({ page }) => {
  await openFile(page, fixture('locked.dag.yaml'))
  await expect(circle(page, 'Maternal smoking')).toBeVisible()
  const lock = rail(page).getByRole('button', { name: 'Lock graph' })
  await expect(lock).toHaveAttribute('aria-pressed', 'true')
  await expect(
    rail(page).getByRole('button', { name: 'Add node' }),
  ).toBeDisabled()

  const saved = await saveFile(page)
  expect(saved.text).toBe(fixtureText('locked.dag.yaml'))

  // Unlocking and saving again drops the key.
  await lock.click()
  const unlocked = await saveFile(page)
  expect(unlocked.text).not.toContain('locked')
})
