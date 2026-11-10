import type { Page } from '@playwright/test'
import {
  addNodeAt,
  centre,
  circle,
  clickEdgeBetween,
  connect,
  expect,
  nameField,
  node,
  nodes,
  pane,
  panel,
  stored,
  test,
  topBar,
} from './fixtures.ts'

/** Picks `option` in the side panel select labelled `label` (Role or Type). */
async function choose(page: Page, label: string, option: string) {
  await panel(page).getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

/** spec 5.7.8: `ROLE_DESCRIPTIONS`, keyed by the role's label. */
const ROLE_DESCRIPTIONS = {
  Exposure: 'The cause whose effect you want to estimate.',
  Outcome: 'The effect you want to estimate.',
  Latent: 'A variable you did not or cannot measure.',
  Adjusted:
    'A variable you control for in the analysis, by stratifying or adding it to the model.',
  Selected:
    'A variable the study population was selected on, such as hospital admission.',
  Other: 'Any other variable in the model.',
}

/** spec 5.7.8: `FIELD_TIPS`. */
const FIELD_TIPS = {
  role: "Role: the part this variable plays in your causal question. The circle's color shows the role on the canvas.",
  varType:
    'Variable type: how the variable is measured. Categorical and ordinal variables have levels; continuous and discrete variables can have a unit.',
  levels:
    'Levels: the values a categorical or ordinal variable can take. For ordinal variables, list them from lowest to highest.',
  unit: 'Unit: the unit a continuous or discrete variable is measured in, such as g or years.',
  evidence:
    'Evidence: references that support this arrow, such as PMID:123 or doi:10.1000/xyz. One reference per line.',
  note: 'Note: why you drew this arrow, or what is uncertain about it.',
}

/**
 * Focuses or hovers the side panel's "About <field>" info button, checks that its tooltip shows
 * `text`, then closes it again. Match the open tooltip by name: a closing one lingers while it
 * fades out.
 */
async function expectTip(
  page: Page,
  field: string,
  text: string,
  how: 'focus' | 'hover',
) {
  const button = panel(page).getByRole('button', {
    name: `About ${field}`,
    exact: true,
  })
  await (how === 'focus' ? button.focus() : button.hover())
  await expect(
    page.getByRole('tooltip', { name: text, exact: true }),
  ).toBeVisible()
  await expect(button).toHaveAccessibleDescription(text)
  // Blurring or moving the pointer away closes it, so it covers no field afterwards. The pointer
  // moves down in steps, away from the tooltip above, so it leaves Radix's hover grace area.
  if (how === 'focus') {
    await button.blur()
  } else {
    const { x, y } = await centre(button)
    await page.mouse.move(x, y + 120, { steps: 10 })
  }
  await expect(page.getByRole('tooltip')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
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
  await expect(circle(page, 'Node 1')).toBeVisible()
  await expect(circle(page, 'Node 2')).toBeVisible()

  // Escape reverts; a valid name commits.
  await nameField(page).press('Escape')
  await expect(nameField(page)).toHaveValue('Node 2')
  await expect(panel(page).getByRole('alert')).toHaveCount(0)
  await nameField(page).fill('  Birth weight ')
  await nameField(page).press('Enter')
  await expect(nameField(page)).toHaveValue('Birth weight')
  await expect(circle(page, 'Birth weight')).toBeVisible()
})

test('role sets the data-role and accessible name of the circle', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  const c = circle(page, 'Node 1')
  await expect(c).toHaveAttribute('data-role', 'other')
  await choose(page, 'Role', 'Exposure')
  await expect(c).toHaveAttribute('data-role', 'exposure')
  await expect(c).toHaveAccessibleName('Node 1, Exposure')
  await choose(page, 'Role', 'Latent')
  await expect(c).toHaveAttribute('data-role', 'latent')
  await expect(c).toHaveAccessibleName('Node 1, Latent')
  await expect(panel(page).getByRole('combobox', { name: 'Role' })).toHaveText(
    'Latent',
  )
  await choose(page, 'Role', 'Other')
  await expect(c).toHaveAttribute('data-role', 'other')
})

test('role and type options show labels; role options carry their description', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  await panel(page).getByRole('combobox', { name: 'Role' }).click()
  for (const [label, description] of Object.entries(ROLE_DESCRIPTIONS)) {
    const option = page.getByRole('option', { name: label, exact: true })
    await expect(option).toBeVisible()
    await expect(option).toHaveAccessibleDescription(description)
  }
  await page.keyboard.press('Escape')

  await panel(page).getByRole('combobox', { name: 'Type' }).click()
  await expect(page.getByRole('option')).toHaveText([
    '—',
    'Categorical',
    'Ordinal',
    'Continuous',
    'Discrete',
  ])
  await page.keyboard.press('Escape')
})

test('the side panel shows the cheat sheet when nothing is selected', async ({
  page,
}) => {
  await expect(panel(page).getByRole('heading')).toHaveText('Nothing selected.')
  for (const [action, how] of [
    ['Add a node', 'Double-click the canvas or press N'],
    ['Connect', 'Drag from the rim of a circle, or press C'],
    ['Delete', 'Select, then press Delete'],
    ['Select several', 'Shift-click'],
  ]) {
    await expect(
      panel(page).getByRole('term').filter({ hasText: action }),
    ).toBeVisible()
    await expect(panel(page)).toContainText(action + how)
  }
})

test('info tooltips open on keyboard focus and on hover', async ({ page }) => {
  await addNodeAt(page, 200, 200)
  await expectTip(page, 'role', FIELD_TIPS.role, 'focus')
  await expectTip(page, 'variable type', FIELD_TIPS.varType, 'focus')

  await choose(page, 'Type', 'Ordinal')
  await expectTip(page, 'levels', FIELD_TIPS.levels, 'focus')

  await choose(page, 'Type', 'Continuous')
  await expectTip(page, 'unit', FIELD_TIPS.unit, 'hover')
})

test('variable type shows levels or unit, and levels can be edited', async ({
  page,
}) => {
  await addNodeAt(page, 200, 200)
  const levels = panel(page).getByRole('group', { name: 'Levels' })
  const unit = panel(page).getByRole('textbox', { name: 'Unit' })

  await choose(page, 'Type', 'Ordinal')
  await expect(levels).toBeVisible()
  await expect(panel(page)).toContainText('Order matters: lowest first.')
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

  await choose(page, 'Type', 'Continuous')
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
  const badge = topBar(page).getByRole('button', { name: /warning/ })
  await expect(badge).toHaveText('2 warnings')
  const dot = node(page, 'Node 2').getByRole('img', {
    name: 'No variable type',
  })
  await expect(dot).toBeVisible()
  await expect(dot).toHaveAttribute('title', 'No variable type')

  await choose(page, 'Type', 'Continuous')
  await expect(badge).toHaveText('1 warning')
  await expect(dot).toHaveCount(0)
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
  await clickEdgeBetween(page, 'Node 1', 'Node 2')
  await expect(
    panel(page).getByRole('heading', { name: 'Node 1 → Node 2' }),
  ).toBeVisible()

  await expectTip(page, 'evidence', FIELD_TIPS.evidence, 'focus')
  await expectTip(page, 'note', FIELD_TIPS.note, 'focus')

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
  await expect(nodes(page)).toHaveCount(2)
})
