import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Download, Page } from '@playwright/test'
import {
  addNodeAt,
  circle,
  clickEdgeBetween,
  clickEmptyCanvas,
  connect,
  edges,
  expect,
  nameField,
  nodes,
  pane,
  panel,
  rail,
  stored,
  test,
  topBar,
} from './fixtures.ts'

/** Simulation details in the editors, on the canvas, in files and in share links (spec 4.16, 5.9). */

const SIMULATION = path.join(
  import.meta.dirname,
  '../src/model/__fixtures__/simulation.dag.yaml',
)
const SIMULATION_TEXT = readFileSync(SIMULATION, 'utf8')

/**
 * A graph for the sign shapes (spec 4.16): A → B is `single`, A → C `child-levels` (C is
 * categorical with three levels) and C → D `none` (both categorical with three levels).
 */
const SIGNS_YAML = `schema: graphcreator/0.1
name: Signs
nodes:
  - name: A
    var_type: continuous
    pos: [200, 150]
  - name: B
    var_type: continuous
    pos: [520, 150]
  - name: C
    var_type: categorical
    levels: [x, y, z]
    pos: [200, 390]
  - name: D
    var_type: categorical
    levels: [p, q, r]
    pos: [520, 390]
edges:
  - from: A
    to: B
  - from: A
    to: C
  - from: C
    to: D
`

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const button = (page: Page, name: string) =>
  topBar(page).getByRole('button', { name, exact: true })
const openDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Open a graph' })

/**
 * The Simulation section's trigger. A closed section with details is named "Simulation set"
 * (spec phase 49), so the name is matched from its start; the info tip is "About simulation".
 */
const trigger = (page: Page) =>
  panel(page).getByRole('button', { name: /^Simulation/ })

/** Opens the Simulation section when it is closed. */
async function openSection(page: Page) {
  const t = trigger(page)
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click()
  await expect(t).toHaveAttribute('aria-expanded', 'true')
}

/**
 * Waits until the animated fit after Open (spec 5.4) has finished, so clicks at measured points
 * land where they were measured: two reads of the viewport transform 100 ms apart agree.
 */
async function settled(page: Page) {
  let last: string | null = null
  await expect
    .poll(
      async () => {
        const style = await page
          .locator('.react-flow__viewport')
          .getAttribute('style')
        const same = style === last
        last = style
        return same
      },
      { intervals: [100] },
    )
    .toBe(true)
}

/**
 * Opens `simulation.dag.yaml` through Open… → Open file…. Over a graph with nodes, `replace`
 * confirms the "Start a new graph?" question.
 */
async function openSimulation(page: Page, replace = false) {
  await button(page, 'Open…').click()
  const chooser = page.waitForEvent('filechooser')
  await openDialog(page).getByRole('button', { name: 'Open file…' }).click()
  await (await chooser).setFiles(SIMULATION)
  if (replace) {
    await page
      .getByRole('dialog', { name: 'Start a new graph?' })
      .getByRole('button', { name: 'Open' })
      .click()
  }
  await expect(nodes(page)).toHaveCount(3)
  await expect(edges(page)).toHaveCount(3)
  await settled(page)
}

/** Clicks Open…, pastes `text` and presses Open. */
async function pasteAndOpen(page: Page, text: string) {
  await button(page, 'Open…').click()
  await openDialog(page).getByRole('textbox', { name: 'Graph code' }).fill(text)
  await openDialog(page)
    .getByRole('button', { name: 'Open', exact: true })
    .click()
  await expect(openDialog(page)).toHaveCount(0)
  await settled(page)
}

/** Clicks Save, downloads from the "Save as GraphCreator" dialog and closes it; returns the text. */
async function saveText(page: Page): Promise<string> {
  await button(page, 'Save').click()
  const dialog = page.getByRole('dialog', { name: 'Save as GraphCreator' })
  const pending = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const d: Download = await pending
  const text = readFileSync(await d.path(), 'utf8')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  return text
}

/** Picks `option` in the side panel select named `name`. */
async function choose(page: Page, name: string, option: string) {
  await panel(page).getByRole('combobox', { name }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

/** Selects the edge between two nodes and waits for its editor. */
async function selectEdge(page: Page, from: string, to: string) {
  await clickEdgeBetween(page, from, to)
  await expect(
    panel(page).getByRole('heading', { name: `${from} → ${to}` }),
  ).toBeVisible()
}

const share = (page: Page, level: string) =>
  panel(page).getByRole('spinbutton', {
    name: `Share of ${level}`,
    exact: true,
  })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
})

test('the Simulation section is closed by default, marks set details and stays open after a reload', async ({
  page,
}) => {
  // A node without details: closed, named "Simulation" alone.
  await addNodeAt(page, 200, 200)
  await expect(nameField(page)).toHaveValue('Node 1')
  await expect(
    panel(page).getByRole('button', { name: 'Simulation', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false')
  await expect(
    panel(page).getByRole('button', { name: 'About simulation' }),
  ).toBeVisible()

  // A node with shares: the closed trigger shows "set".
  await openSimulation(page, true)
  await circle(page, 'Diabetes').click()
  await expect(trigger(page)).toHaveAccessibleName('Simulation set')
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(panel(page).getByRole('group', { name: 'Shares' })).toHaveCount(
    0,
  )

  await trigger(page).click()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger(page)).toHaveAccessibleName('Simulation')
  await expect(share(page, 'yes')).toHaveValue('12')
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('graphcreator:simulation-open')),
    )
    .toBe('1')

  // The open state is kept across a reload and shared by the edge editor.
  await expect.poll(() => stored(page)).toBe(SIMULATION_TEXT)
  await page.reload()
  await expect(nodes(page)).toHaveCount(3)
  await circle(page, 'Diabetes').click()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(share(page, 'no')).toHaveValue('88')
  await selectEdge(page, 'Diabetes', 'SSI')
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(
    panel(page).getByRole('combobox', { name: 'Strength' }),
  ).toHaveText('Medium')
})

test('Add shares gives equal shares, a share edit updates the total, and the file has them', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await choose(page, 'Type', 'Categorical')
  await openSection(page)
  // Fewer than two levels: nothing to share yet.
  await expect(panel(page)).toContainText(
    'Add causes or levels to describe how to simulate this variable.',
  )

  const levels = panel(page).getByRole('group', { name: 'Levels' })
  await levels.getByRole('button', { name: 'Add level' }).click()
  for (const [i, level] of ['low', 'mid', 'high'].entries()) {
    const input = levels.getByRole('textbox', {
      name: `Level ${i + 1}`,
      exact: true,
    })
    await input.fill(level)
    await input.press('Enter')
  }
  await expect.poll(() => stored(page)).toContain('levels: [low, mid, high]')

  const shares = panel(page).getByRole('group', { name: 'Shares' })
  await expect(shares).toContainText('No shares yet.')
  await shares.getByRole('button', { name: 'Add shares' }).click()
  await expect(share(page, 'low')).toHaveValue('33.33')
  await expect(share(page, 'mid')).toHaveValue('33.33')
  await expect(share(page, 'high')).toHaveValue('33.34')
  await expect(shares).toContainText('Total 100%')
  await expect
    .poll(() => stored(page))
    .toContain('shares: [0.3333, 0.3333, 0.3334]')

  // One share up: the total is off and warns.
  await share(page, 'low').fill('50')
  await share(page, 'low').press('Enter')
  await expect(shares).toContainText(
    'Total 116.7%: shares should add up to 100%.',
  )
  const badge = topBar(page).getByRole('button', { name: /warning/ })
  await expect(badge).toHaveText('1 warning')

  // Escape reverts a draft; a value over 100 is clamped.
  await share(page, 'mid').fill('7')
  await share(page, 'mid').press('Escape')
  await expect(share(page, 'mid')).toHaveValue('33.33')
  await share(page, 'mid').fill('16.66')
  await share(page, 'mid').press('Enter')
  await expect(shares).toContainText('Total 100%')
  await expect(shares).not.toContainText('should add up')
  await expect(badge).toHaveCount(0)

  const text = await saveText(page)
  expect(text).toContain(
    '    levels: [low, mid, high]\n    shares: [0.5, 0.1666, 0.3334]\n',
  )

  await shares.getByRole('button', { name: 'Remove shares' }).click()
  await expect(shares).toContainText('No shares yet.')
  await expect.poll(() => stored(page)).not.toContain('shares:')
})

test('adding, moving and removing a level keeps the shares and signs on their levels', async ({
  page,
}) => {
  await openSimulation(page)
  await circle(page, 'Wound class').click()
  await openSection(page)
  await expect(share(page, 'clean')).toHaveValue('60')

  const levels = panel(page).getByRole('group', { name: 'Levels' })
  // Add a level: it gets a share of 0.
  await levels.getByRole('button', { name: 'Add level' }).click()
  const level4 = levels.getByRole('textbox', { name: 'Level 4', exact: true })
  await level4.fill('dirty')
  await level4.press('Enter')
  await expect(share(page, 'dirty')).toHaveValue('0')
  await expect
    .poll(() => stored(page))
    .toContain(
      'levels: [clean, clean-contaminated, contaminated, dirty]\n    shares: [0.6, 0.3, 0.1, 0]\n',
    )

  // Move "clean" down: its share moves with it.
  await levels
    .getByRole('button', { name: 'Move level 1 down', exact: true })
    .click()
  await expect
    .poll(() => stored(page))
    .toContain(
      'levels: [clean-contaminated, clean, contaminated, dirty]\n    shares: [0.3, 0.6, 0.1, 0]\n',
    )
  await expect(share(page, 'clean')).toHaveValue('60')
  await expect(share(page, 'clean-contaminated')).toHaveValue('30')

  // Remove "contaminated": its share and its sign-map keys go.
  await levels
    .getByRole('button', { name: 'Remove level 3', exact: true })
    .click()
  await expect
    .poll(() => stored(page))
    .toContain(
      'levels: [clean-contaminated, clean, dirty]\n    shares: [0.3, 0.6, 0]\n',
    )
  await expect(share(page, 'contaminated')).toHaveCount(0)
  const text = await stored(page)
  expect(text).toContain(
    '  - from: Diabetes\n    to: Wound class\n    sign: {clean: negative}\n',
  )
  expect(text).toContain(
    '  - from: Wound class\n    to: SSI\n    sign: {clean-contaminated: positive}\n',
  )
})

test('Form shows only for a node with causes', async ({ page }) => {
  await addNodeAt(page, 150, 200)
  await addNodeAt(page, 500, 200)
  await openSection(page)
  const form = panel(page).getByRole('combobox', { name: 'Functional form' })
  await expect(form).toHaveCount(0)
  await expect(panel(page)).toContainText(
    'Add causes or levels to describe how to simulate this variable.',
  )

  await connect(page, 'Node 1', 'Node 2')
  await expect(edges(page)).toHaveCount(1)
  await circle(page, 'Node 2').click()
  await expect(nameField(page)).toHaveValue('Node 2')
  await expect(form).toHaveText('—')
  await choose(page, 'Functional form', 'Smooth')
  await expect(form).toHaveText('Smooth')
  await expect.poll(() => stored(page)).toContain('    form: smooth\n')

  // The root node has no Form field.
  await circle(page, 'Node 1').click()
  await expect(nameField(page)).toHaveValue('Node 1')
  await expect(form).toHaveCount(0)
})

test('a single sign shows +, per-level signs show ±, and two nominal ends have no sign', async ({
  page,
}) => {
  await pasteAndOpen(page, SIGNS_YAML)
  await expect(nodes(page)).toHaveCount(4)

  // A → B: one sign.
  await selectEdge(page, 'A', 'B')
  await openSection(page)
  const single = panel(page).getByRole('radiogroup', { name: 'Sign' })
  await expect(single.getByRole('radio', { name: 'No sign' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await single.getByRole('radio', { name: 'Positive' }).click()
  await expect(single.getByRole('radio', { name: 'Positive' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  const positive = page.getByRole('img', { name: 'Positive effect' })
  await expect(positive).toHaveText('+')
  await expect(positive).toHaveAttribute('title', 'Sign: positive')
  await choose(page, 'Strength', 'Large')
  await expect
    .poll(() => stored(page))
    .toContain(
      '  - from: A\n    to: B\n    sign: positive\n    strength: large\n',
    )

  // A → C: one sign per level of C.
  await selectEdge(page, 'A', 'C')
  const perLevel = panel(page).getByRole('group', { name: 'Sign' })
  await expect(perLevel).toContainText('Effect on each level of C:')
  await perLevel
    .getByRole('radiogroup', { name: 'Sign for x' })
    .getByRole('radio', { name: 'Positive' })
    .click()
  await expect(page.getByRole('img', { name: 'Positive effect' })).toHaveCount(
    2,
  )
  await perLevel
    .getByRole('radiogroup', { name: 'Sign for z' })
    .getByRole('radio', { name: 'Negative' })
    .click()
  await expect(
    page.getByRole('img', { name: 'Mixed effects per level' }),
  ).toHaveText('±')
  await expect
    .poll(() => stored(page))
    .toContain('  - from: A\n    to: C\n    sign: {x: positive, z: negative}\n')

  // C → D: both ends nominal.
  await selectEdge(page, 'C', 'D')
  await expect(panel(page)).toContainText(
    'A sign is not available, because both variables are categorical with more than two levels.',
  )
  await expect(panel(page).getByRole('radiogroup')).toHaveCount(0)
  await expect(
    panel(page).getByRole('combobox', { name: 'Strength' }),
  ).toBeVisible()
})

test('a sign that no longer fits shows Clear sign, and its warning selects the edge', async ({
  page,
}) => {
  await pasteAndOpen(
    page,
    SIGNS_YAML.replace(
      '  - from: A\n    to: C\n',
      '  - from: A\n    to: C\n    sign: {x: positive, z: negative}\n',
    ),
  )
  await expect(
    page.getByRole('img', { name: 'Mixed effects per level' }),
  ).toBeVisible()

  // C becomes ordinal: A → C is now a single-sign edge with a map.
  await circle(page, 'C').click()
  await choose(page, 'Type', 'Ordinal')
  const warning =
    'The edge from "A" to "C" has a sign per level, but neither "A" nor "C" is categorical with more than two levels. Give one sign instead.'
  await clickEmptyCanvas(page)
  await topBar(page).getByRole('button', { name: '1 warning' }).click()
  const dialog = page.getByRole('dialog', { name: 'Warnings' })
  await expect(dialog).toContainText('Click an item to select its edge.')
  await dialog.getByRole('button', { name: warning }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    panel(page).getByRole('heading', { name: 'A → C' }),
  ).toBeVisible()

  await openSection(page)
  await expect(panel(page)).toContainText(
    'This sign does not fit the variable types any more.',
  )
  await expect(panel(page).getByRole('radiogroup')).toHaveCount(0)
  await panel(page).getByRole('button', { name: 'Clear sign' }).click()
  await expect(
    panel(page).getByRole('radiogroup', { name: 'Sign' }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: /effect/ })).toHaveCount(0)
  await expect(
    topBar(page).getByRole('button', { name: /warning/ }),
  ).toHaveCount(0)
  await expect.poll(() => stored(page)).not.toContain('sign:')
})

test('opening simulation.dag.yaml and saving it gives the same text', async ({
  page,
}) => {
  await openSimulation(page)
  // No warnings, and the canvas shows the signs.
  await expect(
    topBar(page).getByRole('button', { name: /warning/ }),
  ).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Positive effect' })).toHaveCount(
    2,
  )
  await expect(
    page.getByRole('img', { name: 'Mixed effects per level' }),
  ).toHaveCount(1)
  expect(await saveText(page)).toBe(SIMULATION_TEXT)
})

test('a share link keeps the simulation details', async ({ page, browser }) => {
  await openSimulation(page)
  await button(page, 'Share').click()
  await expect(
    page.getByText(
      'Link copied. The graph is stored in the link itself, not on a server.',
    ),
  ).toBeVisible()
  const link = await page.evaluate(() =>
    (
      navigator as unknown as { clipboard: { readText(): Promise<string> } }
    ).clipboard.readText(),
  )

  const context = await browser.newContext()
  try {
    const fresh = await context.newPage()
    await fresh.goto(link)
    await expect(pane(fresh)).toBeVisible()
    await expect(nodes(fresh)).toHaveCount(3)
    await expect(
      fresh.getByRole('img', { name: 'Mixed effects per level' }),
    ).toHaveCount(1)
    await expect.poll(() => stored(fresh)).toBe(SIMULATION_TEXT)
  } finally {
    await context.close()
  }
})

test('undo reverts a share edit and a sign edit', async ({ page }) => {
  const undo = rail(page).getByRole('button', { name: 'Undo', exact: true })
  await openSimulation(page)
  await circle(page, 'Diabetes').click()
  await openSection(page)
  await share(page, 'yes').fill('20')
  await share(page, 'yes').press('Enter')
  await expect.poll(() => stored(page)).toContain('shares: [0.88, 0.2]')

  await selectEdge(page, 'Diabetes', 'SSI')
  await panel(page)
    .getByRole('radiogroup', { name: 'Sign' })
    .getByRole('radio', { name: 'Negative' })
    .click()
  await expect(page.getByRole('img', { name: 'Negative effect' })).toHaveText(
    '−',
  )

  await undo.click()
  await expect(page.getByRole('img', { name: 'Negative effect' })).toHaveCount(
    0,
  )
  await expect(
    panel(page)
      .getByRole('radiogroup', { name: 'Sign' })
      .getByRole('radio', { name: 'Positive' }),
  ).toHaveAttribute('aria-checked', 'true')

  await undo.click()
  await expect.poll(() => stored(page)).toBe(SIMULATION_TEXT)
  await circle(page, 'Diabetes').click()
  await expect(share(page, 'yes')).toHaveValue('12')
})
