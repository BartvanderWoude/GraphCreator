import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Download, Locator, Page } from '@playwright/test'
import {
  AUTOSAVE_KEY,
  circle,
  edges,
  expect,
  node,
  pane,
  panel,
  rail,
  test,
  topBar,
} from './fixtures.ts'

/**
 * End-to-end tests of the display options (spec 4.18, 5.11): the six switches of the Display
 * section, what each one changes on the canvas, that they are a stored viewer preference, and
 * that an exported SVG follows them.
 */

/** localStorage key of the display options (spec 4.18, `DISPLAY_STORAGE_KEY`). */
const DISPLAY_KEY = 'graphcreator:display'

/** The switch labels, in `DISPLAY_KEYS` order (spec 4.18 "Copy"). */
const SWITCHES = [
  ['signs', 'Signs'],
  ['signColors', 'Sign colors'],
  ['strength', 'Strength'],
  ['forms', 'Forms'],
  ['types', 'Variable types'],
  ['dashedLatent', 'Dashed latent'],
] as const

type Key = (typeof SWITCHES)[number][0]

/**
 * A graph with one look of every option: a typed exposure with a linear form, an untyped latent
 * cause with a smooth form, and a typed outcome. `Smoking → Weight` is positive and large,
 * `Stress → Weight` negative without strength.
 */
const DISPLAY_GRAPH = `schema: graphcreator/0.1
name: Display options
nodes:
  - name: Smoking
    role: exposure
    var_type: categorical
    levels: ["no", "yes"]
    pos: [0, 0]
  - name: Stress
    role: latent
    form: smooth
    pos: [0, 240]
  - name: Weight
    role: outcome
    var_type: continuous
    form: linear
    pos: [320, 120]
edges:
  - from: Smoking
    to: Weight
    sign: positive
    strength: large
  - from: Stress
    to: Weight
    sign: negative
`

const LOCKED = readFileSync(
  path.join(import.meta.dirname, '../src/model/__fixtures__/locked.dag.yaml'),
  'utf8',
)

/**
 * Opens the app with `yaml` autosaved, as a reload would restore it. The init script runs on
 * every load, so a reload restores the same graph; the display options are left alone.
 */
async function openGraph(page: Page, yaml: string, first: string) {
  await page.addInitScript(([key, text]) => localStorage.setItem(key, text), [
    AUTOSAVE_KEY,
    yaml,
  ] as const)
  await page.goto('/')
  await expect(circle(page, first)).toBeVisible()
}

const displaySwitch = (page: Page, key: Key) =>
  panel(page).locator(`#display-${key}`)

async function switchOn(page: Page, key: Key) {
  await displaySwitch(page, key).click()
  await expect(displaySwitch(page, key)).toBeChecked()
}

/** Edge lines, arrowheads and sign badges; an edge is told apart by its `data-tone`. */
const lines = (page: Page) =>
  page.locator('.react-flow__edge-path.gc-edge-path')
const arrows = (page: Page) => page.locator('.gc-edge-arrow')
const badges = (page: Page) => page.locator('.gc-sign-badge')

const exportDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Export image' })

/** Opens Export…, downloads the SVG with `legend` as chosen, and returns its text. */
async function exportSvg(page: Page, legend = false): Promise<string> {
  await topBar(page)
    .getByRole('button', { name: 'Export…', exact: true })
    .click()
  const dialog = exportDialog(page)
  await expect(
    dialog.getByRole('img', { name: 'Preview of the image' }),
  ).toBeVisible()
  const box = dialog.getByRole('checkbox', { name: 'Legend' })
  if ((await box.isChecked()) !== legend) await box.click()
  const pending = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const d: Download = await pending
  const text = readFileSync(await d.path()).toString('utf8')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  return text
}

test('the Edit tab shows the six switches, all off, until a node is selected', async ({
  page,
}) => {
  await openGraph(page, DISPLAY_GRAPH, 'Smoking')
  const section = panel(page).getByRole('region', { name: 'Display' })
  await expect(section).toBeVisible()
  for (const [key, label] of SWITCHES) {
    const sw = displaySwitch(page, key)
    await expect(sw).toBeVisible()
    await expect(sw).not.toBeChecked()
    await expect(
      panel(page).getByRole('switch', { name: label, exact: true }),
    ).toBeVisible()
  }
  // The rows come in DISPLAY_KEYS order.
  await expect(section.getByRole('switch')).toHaveCount(6)
  const ids = await section
    .getByRole('switch')
    .evaluateAll((els) => els.map((e) => e.id))
  expect(ids).toEqual(SWITCHES.map(([key]) => `display-${key}`))

  // With all off the canvas shows none of the looks.
  await expect(badges(page)).toHaveCount(0)
  await expect(page.locator('.gc-mark')).toHaveCount(0)
  await expect(page.locator('[data-tone]')).toHaveCount(0)
  await expect(page.locator('[data-dashed]')).toHaveCount(0)

  // Selecting a node hides the section; clearing the selection brings it back.
  await circle(page, 'Smoking').click()
  await expect(section).toHaveCount(0)
  // An empty spot right of the graph (the top-left corner lies under the tool rail).
  await pane(page).click({ position: { x: 700, y: 500 } })
  await expect(section).toBeVisible()
})

test('each switch changes the canvas', async ({ page }) => {
  await openGraph(page, DISPLAY_GRAPH, 'Smoking')
  await expect(edges(page)).toHaveCount(2)
  const positive = lines(page).and(page.locator('[data-tone="positive"]'))

  // Signs: a + badge and a − badge.
  await switchOn(page, 'signs')
  await expect(badges(page)).toHaveCount(2)
  await expect(page.getByRole('img', { name: 'Positive effect' })).toHaveText(
    '+',
  )
  await expect(page.getByRole('img', { name: 'Negative effect' })).toHaveText(
    '−',
  )
  await expect(badges(page).first()).not.toHaveAttribute('data-tone')

  // Sign colors: data-tone on lines, arrowheads and badges, in the sign colours.
  await switchOn(page, 'signColors')
  await expect(lines(page).and(page.locator('[data-tone]'))).toHaveCount(2)
  await expect(positive).toHaveCount(1)
  await expect(
    lines(page).and(page.locator('[data-tone="negative"]')),
  ).toHaveCount(1)
  await expect(arrows(page).and(page.locator('[data-tone]'))).toHaveCount(2)
  await expect(
    page.getByRole('img', { name: 'Positive effect' }),
  ).toHaveAttribute('data-tone', 'positive')
  // Light theme: --sign-positive #15803d and --sign-negative #b91c1c (4.18 "Colours").
  await expect(positive).toHaveCSS('stroke', 'rgb(21, 128, 61)')
  await expect(
    lines(page).and(page.locator('[data-tone="negative"]')),
  ).toHaveCSS('stroke', 'rgb(185, 28, 28)')

  // Strength: the large edge is 4.5 px wide with a 15 px arrowhead; the other keeps 1.5 px and 9.
  const markerOf = (l: Locator) =>
    page.locator('.react-flow__edge').filter({ has: l }).locator('marker')
  const negative = lines(page).and(page.locator('[data-tone="negative"]'))
  await expect(positive).toHaveCSS('stroke-width', '1.5px')
  await expect(markerOf(positive)).toHaveAttribute('markerWidth', '9')
  await switchOn(page, 'strength')
  await expect(positive).toHaveCSS('stroke-width', '4.5px')
  await expect(markerOf(positive)).toHaveAttribute('markerWidth', '15')
  await expect(markerOf(positive)).toHaveAttribute('markerHeight', '15')
  await expect(negative).toHaveCSS('stroke-width', '1.5px')
  await expect(markerOf(negative)).toHaveAttribute('markerWidth', '9')

  // Forms: a form mark on Stress and Weight, named after the form.
  await switchOn(page, 'forms')
  await expect(page.locator('.gc-form-mark')).toHaveCount(2)
  await expect(
    node(page, 'Weight').getByRole('img', { name: 'Functional form: Linear' }),
  ).toBeVisible()
  await expect(
    node(page, 'Stress').getByRole('img', { name: 'Functional form: Smooth' }),
  ).toHaveAttribute('title', 'Functional form: Smooth')
  await expect(node(page, 'Smoking').locator('.gc-mark')).toHaveCount(0)

  // Variable types: the letter on each typed node, none on the untyped one.
  await switchOn(page, 'types')
  await expect(page.locator('.gc-type-mark')).toHaveCount(2)
  await expect(
    node(page, 'Smoking').getByRole('img', {
      name: 'Variable type: Categorical',
    }),
  ).toHaveText('C')
  await expect(
    node(page, 'Weight').getByRole('img', {
      name: 'Variable type: Continuous',
    }),
  ).toHaveText('N')
  await expect(node(page, 'Stress').locator('.gc-type-mark')).toHaveCount(0)

  // Dashed latent: the latent circle is dashed, the others are not.
  await switchOn(page, 'dashedLatent')
  await expect(page.locator('.gc-circle[data-dashed]')).toHaveCount(1)
  await expect(circle(page, 'Stress')).toHaveAttribute('data-dashed', '')
  await expect(circle(page, 'Stress')).toHaveCSS('border-top-style', 'dashed')
  await expect(circle(page, 'Smoking')).toHaveCSS('border-top-style', 'solid')

  // Switching an option off takes its look away again.
  await displaySwitch(page, 'signs').click()
  await expect(badges(page)).toHaveCount(0)
  await displaySwitch(page, 'forms').click()
  await expect(page.locator('.gc-form-mark')).toHaveCount(0)
})

test('an untyped node with a form shows its warning dot at the top left', async ({
  page,
}) => {
  await openGraph(page, DISPLAY_GRAPH, 'Smoking')
  const stress = circle(page, 'Stress')
  const dot = node(page, 'Stress').getByRole('img', {
    name: 'No variable type',
  })

  // Without Forms the dot sits at the top right.
  const c = await stress.boundingBox()
  let d = await dot.boundingBox()
  if (!c || !d) throw new Error('No bounding box.')
  expect(d.x + d.width / 2).toBeGreaterThan(c.x + c.width / 2)

  // With Forms the form mark takes the top right and the dot moves to the top left.
  await switchOn(page, 'forms')
  const mark = node(page, 'Stress').getByRole('img', {
    name: 'Functional form: Smooth',
  })
  await expect(mark).toBeVisible()
  d = await dot.boundingBox()
  const m = await mark.boundingBox()
  if (!d || !m) throw new Error('No bounding box.')
  const cx = c.x + c.width / 2
  const cy = c.y + c.height / 2
  expect(d.x + d.width / 2).toBeLessThan(cx)
  expect(d.y + d.height / 2).toBeLessThan(cy)
  expect(m.x + m.width / 2).toBeGreaterThan(cx)
  expect(m.y + m.height / 2).toBeLessThan(cy)
  // The two do not overlap.
  expect(d.x + d.width).toBeLessThan(m.x)
})

test('the switches survive a reload', async ({ page }) => {
  await openGraph(page, DISPLAY_GRAPH, 'Smoking')
  await switchOn(page, 'signs')
  await switchOn(page, 'types')
  await switchOn(page, 'dashedLatent')
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), DISPLAY_KEY))
    .toBe(
      JSON.stringify({
        signs: true,
        signColors: false,
        strength: false,
        forms: false,
        types: true,
        dashedLatent: true,
      }),
    )

  await page.reload()
  await expect(circle(page, 'Smoking')).toBeVisible()
  for (const [key] of SWITCHES) {
    const on = key === 'signs' || key === 'types' || key === 'dashedLatent'
    if (on) await expect(displaySwitch(page, key)).toBeChecked()
    else await expect(displaySwitch(page, key)).not.toBeChecked()
  }
  await expect(badges(page)).toHaveCount(2)
  await expect(page.locator('.gc-type-mark')).toHaveCount(2)
  await expect(circle(page, 'Stress')).toHaveAttribute('data-dashed', '')
  await expect(page.locator('.gc-form-mark')).toHaveCount(0)
})

test('the switches work on a locked graph and leave the graph alone', async ({
  page,
}) => {
  await openGraph(page, LOCKED, 'Maternal smoking')
  await expect(
    rail(page).getByRole('button', { name: 'Lock graph' }),
  ).toHaveAttribute('aria-pressed', 'true')
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    AUTOSAVE_KEY,
  )

  await expect(displaySwitch(page, 'types')).toBeEnabled()
  await switchOn(page, 'types')
  await expect(
    node(page, 'Maternal smoking').getByRole('img', {
      name: 'Variable type: Categorical',
    }),
  ).toHaveText('C')
  await expect(
    node(page, 'Birth weight').getByRole('img', {
      name: 'Variable type: Continuous',
    }),
  ).toHaveText('N')
  await switchOn(page, 'signColors')
  await expect(
    lines(page).and(page.locator('[data-tone="neutral"]')),
  ).toHaveCount(1)

  // The options are no part of the graph: the autosaved file and the undo history are untouched.
  expect(
    await page.evaluate((key) => localStorage.getItem(key), AUTOSAVE_KEY),
  ).toBe(before)
  await expect(rail(page).getByRole('button', { name: 'Undo' })).toBeDisabled()
})

test('an exported SVG follows the switches and lists them in the legend', async ({
  page,
}) => {
  await openGraph(page, DISPLAY_GRAPH, 'Smoking')

  // All off: plain grey edges of 1.5 px, no badges, marks or dashes, and only the role legend.
  const plain = await exportSvg(page, true)
  expect(plain).not.toContain('#15803d')
  expect(plain).not.toContain('#b91c1c')
  expect(plain).not.toContain('stroke-dasharray')
  expect(plain).not.toContain('>+</text>')
  expect(plain).not.toContain('>C</text>')
  expect(plain).not.toContain('stroke-width="4.5"')
  for (const label of [
    'Positive effect',
    'Large effect',
    'Linear',
    'Categorical',
  ]) {
    expect(plain).not.toContain(`>${label}</text>`)
  }

  for (const [key] of SWITCHES) await switchOn(page, key)

  // Every option on, without legend.
  const svg = await exportSvg(page, false)
  expect(svg).toContain('stroke="#15803d" stroke-width="4.5"')
  expect(svg).toContain('stroke="#b91c1c" stroke-width="1.5"')
  expect(svg.match(/>\+<\/text>/g)).toHaveLength(1)
  expect(svg.match(/>−<\/text>/g)).toHaveLength(1)
  expect(svg.match(/stroke-dasharray="5 3"/g)).toHaveLength(1)
  expect(svg.match(/>C<\/text>/g)).toHaveLength(1)
  expect(svg.match(/>N<\/text>/g)).toHaveLength(1)
  expect(svg.match(/stroke-linecap="round"/g)).toHaveLength(2)
  expect(svg).not.toContain('Positive effect')

  // With legend: the rows of the options that are on, in order.
  const withLegend = await exportSvg(page, true)
  const rows = [
    'Positive effect',
    'Negative effect',
    'Large effect',
    'No strength',
    'Linear',
    'Smooth',
    'Categorical',
    'Continuous',
  ]
  const at = rows.map((label) => withLegend.indexOf(`>${label}</text>`))
  for (const i of at) expect(i).toBeGreaterThan(0)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
  // Sign colors on an unsigned edge would add `No sign`; every edge here is signed.
  expect(withLegend).not.toContain('>No sign</text>')
  // The Latent role's swatch is dashed.
  expect(withLegend).toContain('stroke-dasharray="2 1.5"')

  // Switching options off again drops their rows.
  await displaySwitch(page, 'strength').click()
  await displaySwitch(page, 'types').click()
  const fewer = await exportSvg(page, true)
  expect(fewer).toContain('>Positive effect</text>')
  expect(fewer).toContain('>Linear</text>')
  expect(fewer).not.toContain('>Large effect</text>')
  expect(fewer).not.toContain('>Categorical</text>')
  expect(fewer).not.toContain('stroke-width="4.5"')
})
