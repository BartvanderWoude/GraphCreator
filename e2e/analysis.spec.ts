import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import {
  circle,
  edges,
  expect,
  node,
  nodes,
  pane,
  panel,
  stored,
  test,
  topBar,
} from './fixtures.ts'

const FIXTURES = path.join(import.meta.dirname, '../src/model/__fixtures__')
const SMOKING = readFileSync(path.join(FIXTURES, 'smoking.dag.yaml'), 'utf8')

const tab = (page: Page, name: 'Edit' | 'Analysis') =>
  panel(page).getByRole('tab', { name, exact: true })
const section = (page: Page, title: string) =>
  panel(page).getByRole('region', { name: title, exact: true })
const toggle = (page: Page, title: string) =>
  panel(page).getByRole('switch', { name: `Show ${title.toLowerCase()}` })
const setRow = (page: Page, text: string) =>
  section(page, 'Adjustment sets')
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${text}`) })
/** The edges whose line (and arrowhead) carry `data-path="<kind>"`. */
const pathEdges = (page: Page, kind: 'causal' | 'biasing') =>
  edges(page).filter({ has: page.locator(`path[data-path="${kind}"]`) })

const NOT_SUFFICIENT =
  'Your adjusted set (empty) is not sufficient, as implied by this DAG.'
const SES_SUFFICIENT =
  'Your adjusted set (SES) is sufficient, as implied by this DAG.'

/** Clicks Open…, pastes `text` and presses Open (the graph is empty, so nothing asks first). */
async function pasteAndOpen(page: Page, text: string) {
  await topBar(page).getByRole('button', { name: 'Open…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Open a graph' })
  await dialog.getByRole('textbox', { name: 'Graph code' }).fill(text)
  await dialog.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

async function openAnalysis(page: Page) {
  await tab(page, 'Analysis').click()
  await expect(tab(page, 'Analysis')).toHaveAttribute('aria-selected', 'true')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
})

test.describe('with the smoking graph', () => {
  test.beforeEach(async ({ page }) => {
    await pasteAndOpen(page, SMOKING)
    await expect(nodes(page)).toHaveCount(4)
    await openAnalysis(page)
  })

  test('the report and the set SES; Use this set adjusts SES and Ctrl+Z undoes it', async ({
    page,
  }) => {
    const report = section(page, 'Report')
    await expect(report).toContainText(
      'Total effect of Maternal smoking on Birth weight.',
    )
    await expect(report).toContainText(NOT_SUFFICIENT)
    await expect(report).toContainText('Latent: Genetic factors.')

    const row = setRow(page, 'SES')
    await expect(
      section(page, 'Adjustment sets').getByRole('listitem'),
    ).toHaveCount(1)
    await row.getByRole('button', { name: 'Use this set' }).click()

    await expect(circle(page, 'SES')).toHaveAttribute('data-role', 'adjusted')
    await expect(report).toContainText(SES_SUFFICIENT)
    await expect(row).toContainText('In use')
    await expect(row.getByRole('button', { name: 'Use this set' })).toHaveCount(
      0,
    )

    await page.keyboard.press('Control+z')
    await expect(circle(page, 'SES')).toHaveAttribute('data-role', 'other')
    await expect(report).toContainText(NOT_SUFFICIENT)
    await expect(
      row.getByRole('button', { name: 'Use this set' }),
    ).toBeVisible()
  })

  test('Paths marks the causal and the biasing path; adjusting SES closes the biasing one', async ({
    page,
  }) => {
    await expect(pathEdges(page, 'causal')).toHaveCount(0)
    await expect(pathEdges(page, 'biasing')).toHaveCount(0)

    await toggle(page, 'Paths').click()
    const list = section(page, 'Paths').getByRole('listitem')
    await expect(list).toHaveCount(2)
    await expect(list.filter({ hasText: 'causal · open' })).toContainText(
      'Maternal smoking → Birth weight',
    )
    await expect(list.filter({ hasText: 'biasing · open' })).toContainText(
      'Maternal smoking ← SES → Birth weight',
    )
    // The direct edge is causal; both edges out of SES are biasing (5.7.7).
    await expect(pathEdges(page, 'causal')).toHaveCount(1)
    await expect(pathEdges(page, 'biasing')).toHaveCount(2)

    await setRow(page, 'SES')
      .getByRole('button', { name: 'Use this set' })
      .click()
    await expect(list.filter({ hasText: 'biasing · closed' })).toHaveCount(1)
    await expect(pathEdges(page, 'biasing')).toHaveCount(0)
    await expect(pathEdges(page, 'causal')).toHaveCount(1)
  })

  test('hovering a set row puts the rim on its circle', async ({ page }) => {
    const ses = node(page, 'SES').locator('.gc-node')
    await expect(ses).not.toHaveClass(/gc-rim-on/)
    await setRow(page, 'SES').hover()
    await expect(ses).toHaveClass(/gc-rim-on/)
    await expect(
      node(page, 'Birth weight').locator('.gc-node'),
    ).not.toHaveClass(/gc-rim-on/)
    await panel(page).getByRole('heading', { name: 'Report' }).hover()
    await expect(ses).not.toHaveClass(/gc-rim-on/)
  })

  test('switching Report off hides it, and the switches survive a reload', async ({
    page,
  }) => {
    const report = section(page, 'Report')
    await expect(toggle(page, 'Report')).toBeChecked()
    await expect(toggle(page, 'Independencies')).not.toBeChecked()

    await toggle(page, 'Report').click()
    await toggle(page, 'Independencies').click()
    await expect(report).not.toContainText('Total effect')
    // SES, smoking and birth weight are all adjacent and Genetic factors is latent.
    await expect(section(page, 'Independencies')).toContainText(
      'This DAG implies no testable independencies.',
    )

    // Autosave writes at most every 500 ms; wait for the graph before reloading.
    await expect.poll(() => stored(page)).toContain('Maternal smoking')
    await page.reload()
    await expect(nodes(page)).toHaveCount(4)
    await openAnalysis(page)
    await expect(toggle(page, 'Report')).not.toBeChecked()
    await expect(toggle(page, 'Independencies')).toBeChecked()
    await expect(section(page, 'Report')).not.toContainText('Total effect')
  })

  test('clicking a node switches to Edit', async ({ page }) => {
    await circle(page, 'SES').click()
    await expect(tab(page, 'Edit')).toHaveAttribute('aria-selected', 'true')
    await expect(
      panel(page).getByRole('textbox', { name: 'Name', exact: true }),
    ).toHaveValue('SES')
  })
})

test('two exposures: Instruments asks for one exposure and one outcome', async ({
  page,
}) => {
  await pasteAndOpen(
    page,
    'dag {\n  A [exposure]\n  B [exposure]\n  Y [outcome]\n  A -> Y\n  B -> Y\n}',
  )
  await expect(nodes(page)).toHaveCount(3)
  await openAnalysis(page)
  await toggle(page, 'Instruments').click()
  await expect(section(page, 'Instruments')).toContainText(
    'Instruments need exactly one exposure and one outcome.',
  )
  await expect(section(page, 'Report')).toContainText(
    'Total effect of A and B on Y.',
  )
})

test('without an exposure the tab shows the empty-state line and only the headers', async ({
  page,
}) => {
  await openAnalysis(page)
  await expect(panel(page)).toContainText(
    'Mark at least one exposure and one outcome to see the analysis.',
  )
  // Report is on by default, but shows only its header (5.8 "Empty state").
  await expect(toggle(page, 'Report')).toBeChecked()
  await expect(section(page, 'Report')).not.toContainText('Total effect')
  await expect(section(page, 'Adjustment sets')).not.toContainText(
    'Minimal sufficient',
  )
})
