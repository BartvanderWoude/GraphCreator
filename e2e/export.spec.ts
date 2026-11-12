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

/**
 * Clicks Open…, then Open file… in the dialog, and picks `file` in the file chooser; over a graph
 * with nodes it confirms the replacement. `count` is the number of nodes the file has.
 */
async function openFile(page: Page, file: string, count = 4) {
  const replace = (await nodes(page).count()) > 0
  await button(page, 'Open…').click()
  const chooser = page.waitForEvent('filechooser')
  await page
    .getByRole('dialog', { name: 'Open a graph' })
    .getByRole('button', { name: 'Open file…' })
    .click()
  await (await chooser).setFiles(file)
  if (replace) {
    await page
      .getByRole('dialog', { name: 'Start a new graph?' })
      .getByRole('button', { name: 'Open' })
      .click()
  }
  await expect(nodes(page)).toHaveCount(count)
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

test('PDF shows the preview and the size in points, and downloads a PDF file', async ({
  page,
}) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await button(page, 'Export…').click()
  const dialog = exportDialog(page)
  await choose(page, 'Format', 'PDF')
  await expect(
    dialog.getByRole('img', { name: 'Preview of the image' }),
  ).toBeVisible()
  // 420 × 366 px × 0.75 (spec 4.11).
  await expect(dialog).toContainText('315 × 275 points')
  await expect(dialog.getByRole('button', { name: 'Copy' })).toHaveCount(0)
  const file = await download(page, () =>
    dialog.getByRole('button', { name: 'Download' }).click(),
  )
  expect(file.name).toBe(`${SLUG}.pdf`)
  expect(file.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(file.bytes.toString('latin1')).toContain(
    '/Title (Smoking and birth weight)',
  )
})

test('Theme and Legend change the image, and are kept when the dialog reopens', async ({
  page,
}) => {
  await openFile(page, fixture('smoking.dag.yaml'))
  await button(page, 'Export…').click()
  const dialog = exportDialog(page)
  const legend = dialog.getByRole('checkbox', { name: 'Legend' })
  await expect(legend).not.toBeChecked()
  await expect(dialog.getByRole('combobox', { name: 'Theme' })).toHaveText(
    'Light',
  )

  await choose(page, 'Theme', 'Dark')
  await legend.click()
  await expect(legend).toBeChecked()
  const svg = (
    await download(page, () =>
      dialog.getByRole('button', { name: 'Download' }).click(),
    )
  ).bytes.toString('utf8')
  // The dark background (spec 4.11) and the legend's labels for the roles in use.
  expect(svg).toContain('fill="#0e1513"')
  for (const label of ['Exposure', 'Outcome', 'Latent', 'Other']) {
    expect(svg).toContain(`>${label}</text>`)
  }
  expect(svg).not.toContain('>Adjusted</text>')

  // TikZ has no theme, but draws the legend.
  await choose(page, 'Format', 'TikZ')
  await expect(dialog.getByRole('combobox', { name: 'Theme' })).toHaveCount(0)
  await expect(dialog.getByRole('textbox', { name: 'TikZ code' })).toHaveValue(
    /\{Exposure\};/,
  )

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await button(page, 'Export…').click()
  await choose(page, 'Format', 'SVG')
  await expect(dialog.getByRole('combobox', { name: 'Theme' })).toHaveText(
    'Dark',
  )
  await expect(dialog.getByRole('checkbox', { name: 'Legend' })).toBeChecked()
})

test('Signs shows only when an edge has a sign, and adds the badges to the image', async ({
  page,
}) => {
  // smoking.dag.yaml has no signs: no checkbox.
  await openFile(page, fixture('smoking.dag.yaml'))
  await button(page, 'Export…').click()
  const dialog = exportDialog(page)
  await expect(dialog.getByRole('checkbox', { name: 'Legend' })).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: 'Signs' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // simulation.dag.yaml has two positive edges and one mixed one.
  await openFile(page, fixture('simulation.dag.yaml'), 3)
  await button(page, 'Export…').click()
  const signs = dialog.getByRole('checkbox', { name: 'Signs' })
  await expect(signs).toBeChecked()
  const preview = dialog.getByRole('img', { name: 'Preview of the image' })
  await expect(preview).toBeVisible()
  const svg = async () =>
    (
      await download(page, () =>
        dialog.getByRole('button', { name: 'Download' }).click(),
      )
    ).bytes.toString('utf8')
  const withSigns = await svg()
  expect(withSigns.match(/>\+<\/text>/g)).toHaveLength(2)
  expect(withSigns.match(/>±<\/text>/g)).toHaveLength(1)

  await signs.click()
  await expect(signs).not.toBeChecked()
  const without = await svg()
  expect(without).not.toContain('>+</text>')
  expect(without).not.toContain('>±</text>')
  expect(without.length).toBeLessThan(withSigns.length)

  // TikZ follows the same choice, and the choice is kept when the dialog reopens.
  await choose(page, 'Format', 'TikZ')
  const code = dialog.getByRole('textbox', { name: 'TikZ code' })
  await expect(code).not.toHaveValue(/\{\$\\pm\$\}/)
  await signs.click()
  await expect(code).toHaveValue(/\{\$\\pm\$\}/)
  await page.keyboard.press('Escape')
  await button(page, 'Export…').click()
  await expect(signs).toBeChecked()
})
