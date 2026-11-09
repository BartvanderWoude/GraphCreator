import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Download, Page } from '@playwright/test'
import {
  circle,
  edges,
  expect,
  nodes,
  pane,
  stored,
  test,
  topBar,
} from './fixtures.ts'

/**
 * The exchange formats in the app (spec 4.15, 5.4): each Save as… item shows the writer's text
 * (the committed samples of `formats.reference.test.ts`), the dagitty details checkbox, and Open
 * reading GML, DOT and networkx JSON.
 */

const FIXTURES = path.join(import.meta.dirname, '../src/model/__fixtures__')
const sample = (file: string) =>
  readFileSync(path.join(FIXTURES, 'formats', 'samples', file), 'utf8')
const SMOKING = path.join(FIXTURES, 'smoking.dag.yaml')
const SLUG = 'smoking-and-birth-weight'

const button = (page: Page, name: string) =>
  topBar(page).getByRole('button', { name, exact: true })
const openDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Open a graph' })

async function openFile(page: Page, file: string) {
  await button(page, 'Open…').click()
  const chooser = page.waitForEvent('filechooser')
  await openDialog(page).getByRole('button', { name: 'Open file…' }).click()
  await (await chooser).setFiles(file)
  await expect(nodes(page)).toHaveCount(4)
}

async function pasteAndOpen(page: Page, text: string) {
  await button(page, 'Open…').click()
  await openDialog(page).getByRole('textbox', { name: 'Graph code' }).fill(text)
  await openDialog(page)
    .getByRole('button', { name: 'Open', exact: true })
    .click()
}

async function saveAs(page: Page, item: string) {
  await button(page, 'Save as…').click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

async function download(page: Page, action: () => Promise<void>) {
  const pending = page.waitForEvent('download')
  await action()
  const d: Download = await pending
  return {
    name: d.suggestedFilename(),
    text: readFileSync(await d.path(), 'utf8'),
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
})

const FORMATS = [
  { label: 'GML', ext: '.gml' },
  { label: 'DOT', ext: '.dot' },
  { label: 'networkx JSON', ext: '.json' },
  { label: 'bnlearn', ext: '.bnlearn.txt' },
  { label: 'Tetrad', ext: '.tetrad.txt' },
  { label: 'Mermaid', ext: '.mmd' },
]

test('each Save as… format shows its code and downloads it', async ({
  page,
}) => {
  await openFile(page, SMOKING)
  for (const { label, ext } of FORMATS) {
    await saveAs(page, `${label}…`)
    const dialog = page.getByRole('dialog', { name: `Save as ${label}` })
    const code = dialog.getByRole('textbox', { name: `${label} code` })
    await expect(code).toHaveValue(sample(`smoking${ext}`))
    const file = await download(page, () =>
      dialog.getByRole('button', { name: 'Download' }).click(),
    )
    expect(file.name).toBe(`${SLUG}${ext}`)
    expect(file.text).toBe(sample(`smoking${ext}`))
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
})

test('Include GraphCreator details adds the gc.* attributes and is kept after a reload', async ({
  page,
}) => {
  await openFile(page, SMOKING)
  await saveAs(page, 'dagitty…')
  const dialog = page.getByRole('dialog', { name: 'Save as dagitty' })
  const code = dialog.getByRole('textbox', { name: 'dagitty code' })
  const details = dialog.getByRole('checkbox', {
    name: 'Include GraphCreator details',
  })
  await expect(details).not.toBeChecked()
  await expect(code).toHaveValue(sample('smoking.plain.dagitty.txt'))

  await details.click()
  await expect(code).toHaveValue(sample('smoking.details.dagitty.txt'))
  await expect(dialog).toContainText(
    'are added as gc.* attributes. dagitty keeps them but does not use them.',
  )

  await expect.poll(() => stored(page)).toContain('Maternal smoking')
  await page.reload()
  await expect(nodes(page)).toHaveCount(4)
  await saveAs(page, 'dagitty…')
  await expect(details).toBeChecked()
  await expect(code).toHaveValue(/gc\.var_type="ordinal"/)
})

for (const { label, ext } of FORMATS.slice(0, 3)) {
  test(`pasted ${label} recreates the graph with its metadata`, async ({
    page,
  }) => {
    await pasteAndOpen(page, sample(`smoking${ext}`))
    await expect(openDialog(page)).toHaveCount(0)
    await expect(nodes(page)).toHaveCount(4)
    await expect(edges(page)).toHaveCount(4)
    await expect(circle(page, 'Maternal smoking')).toHaveAttribute(
      'data-role',
      'exposure',
    )
    // Types, levels and evidence came along (spec 4.15).
    await expect
      .poll(() => stored(page))
      .toContain('var_type: ordinal\n    levels: [low, mid, high]')
    expect(await stored(page)).toContain(
      'evidence: ["PMID:123", "doi:10.1000/xyz"]',
    )
  })
}

test('a pasted DoWhy-style DOT string opens', async ({ page }) => {
  await pasteAndOpen(page, 'digraph { A -> B; B -> C; A -> C }')
  await expect(nodes(page)).toHaveCount(3)
  await expect(edges(page)).toHaveCount(3)
  await expect(circle(page, 'B')).toBeVisible()
})

test('an undirected GML graph shows the error and changes nothing', async ({
  page,
}) => {
  await pasteAndOpen(page, 'graph [\n  directed 0\n  node [ id 0 ]\n]')
  const alert = openDialog(page).getByRole('alert')
  await expect(alert).toContainText('Could not open:')
  await expect(alert).toContainText('This GML graph is not directed.')
  await openDialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(nodes(page)).toHaveCount(0)
})
