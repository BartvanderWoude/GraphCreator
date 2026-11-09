import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Download, Page } from '@playwright/test'
import { expect, nodes, pane, test, topBar } from './fixtures.ts'

const FIXTURES = path.join(import.meta.dirname, '../src/model/__fixtures__')
const fixture = (name: string) => path.join(FIXTURES, name)

const SLUG = 'smoking-and-birth-weight'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const button = (page: Page, name: string) =>
  topBar(page).getByRole('button', { name, exact: true })

const exportDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Export image' })

/** Clicks Open…, then Open file… in the dialog, and picks `file` in the file chooser. */
async function openFile(page: Page, file: string) {
  await button(page, 'Open…').click()
  const chooser = page.waitForEvent('filechooser')
  await page
    .getByRole('dialog', { name: 'Open a graph' })
    .getByRole('button', { name: 'Open file…' })
    .click()
  await (await chooser).setFiles(file)
  await expect(nodes(page)).toHaveCount(4)
}

/** Runs `action` and returns the download it starts, with its bytes. */
async function download(page: Page, action: () => Promise<void>) {
  const pending = page.waitForEvent('download')
  await action()
  const d: Download = await pending
  return { name: d.suggestedFilename(), bytes: readFileSync(await d.path()) }
}

/** The clipboard's text (the e2e tsconfig has no DOM types, so the page code is a string). */
const readClipboard = (page: Page) =>
  page.evaluate('navigator.clipboard.readText()') as Promise<string>

/** Picks `option` in the dialog's select named `name`. */
async function choose(page: Page, name: string, option: string) {
  await exportDialog(page).getByRole('combobox', { name }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
})

test('with no nodes there is nothing to export', async ({ page }) => {
  await button(page, 'Export…').click()
  const dialog = exportDialog(page)
  await expect(dialog).toContainText(
    'The image shows names, roles (by color) and arrows, with an optional legend. Types, levels and evidence are not included.',
  )
  await expect(dialog.getByRole('combobox', { name: 'Format' })).toHaveText(
    'SVG',
  )
  await expect(dialog).toContainText(
    'There is nothing to export yet. Add a node first.',
  )
  await expect(dialog.getByRole('img')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Download' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Copy' })).toBeDisabled()
})

test('SVG shows a preview, copies and downloads', async ({ page }) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await button(page, 'Export…').click()
  const dialog = exportDialog(page)
  const preview = dialog.getByRole('img', { name: 'Preview of the image' })
  await expect(preview).toBeVisible()
  // The image has loaded, at the size from svgSize.
  await expect(preview).toHaveJSProperty('naturalWidth', 420)

  await dialog.getByRole('button', { name: 'Copy' }).click()
  await expect(
    page.getByText('Copied SVG code to the clipboard.'),
  ).toBeVisible()
  const copied = await readClipboard(page)
  expect(copied.startsWith('<svg')).toBe(true)

  const file = await download(page, () =>
    dialog.getByRole('button', { name: 'Download' }).click(),
  )
  expect(file.name).toBe(`${SLUG}.svg`)
  const text = file.bytes.toString('utf8')
  expect(text.startsWith('<svg')).toBe(true)
  expect(text).toBe(copied)
  expect(text).toContain('<title>Smoking and birth weight</title>')
  expect(text).toContain('@font-face')
})

test('PNG shows its pixel size and downloads a PNG file', async ({ page }) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await button(page, 'Export…').click()
  const dialog = exportDialog(page)
  await choose(page, 'Format', 'PNG')
  await expect(
    dialog.getByRole('img', { name: 'Preview of the image' }),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Copy' })).toHaveCount(0)
  const scale = dialog.getByRole('combobox', { name: 'Scale' })
  await expect(scale).toHaveText('2×')

  // The SVG of smoking.dag.yaml is 420 × 366 px (spec 4.11: bounds plus 2 × 24 px margin).
  await expect(dialog).toContainText('840 × 732 pixels')
  await choose(page, 'Scale', '3×')
  await expect(dialog).toContainText('1260 × 1098 pixels')
  await choose(page, 'Scale', '2×')

  const file = await download(page, () =>
    dialog.getByRole('button', { name: 'Download' }).click(),
  )
  expect(file.name).toBe(`${SLUG}.png`)
  expect([...file.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  // Width and height from the IHDR chunk.
  expect(file.bytes.readUInt32BE(16)).toBe(840)
  expect(file.bytes.readUInt32BE(20)).toBe(732)
})

test('TikZ shows the code, copies and downloads it', async ({ page }) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await button(page, 'Export…').click()
  const dialog = exportDialog(page)
  await choose(page, 'Format', 'TikZ')
  await expect(dialog.getByRole('img')).toHaveCount(0)
  const code = dialog.getByRole('textbox', { name: 'TikZ code' })
  await expect(code).toHaveValue(
    /^% GraphCreator export: Smoking and birth weight\n/,
  )
  const text = await code.inputValue()
  expect(text).toContain('\\begin{tikzpicture}')

  await dialog.getByRole('button', { name: 'Copy' }).click()
  await expect(
    page.getByText('Copied TikZ code to the clipboard.'),
  ).toBeVisible()
  expect(await readClipboard(page)).toBe(text)

  const file = await download(page, () =>
    dialog.getByRole('button', { name: 'Download' }).click(),
  )
  expect(file.name).toBe(`${SLUG}.tex`)
  expect(file.bytes.toString('utf8')).toBe(text)
})
