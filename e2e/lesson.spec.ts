import type { Page } from '@playwright/test'
import {
  AUTOSAVE_KEY,
  addNodeAt,
  circle,
  connect,
  edges,
  expect,
  nameField,
  nodes,
  pane,
  panel,
  stored,
  test,
  topBar,
} from './fixtures.ts'

const lessonPanel = (page: Page) =>
  page.getByRole('complementary', { name: 'Lesson' })
const nextButton = (page: Page) =>
  lessonPanel(page).getByRole('button', { name: 'Next', exact: true })
const indicator = (page: Page) =>
  page.getByRole('main', { name: 'Canvas' }).getByRole('status')

/** Every text written to the autosave key since the page loaded. */
const autosaveWrites = (page: Page) =>
  page.evaluate(
    () => (globalThis as unknown as { __writes: string[] }).__writes,
  )

/** Opens the welcome slides with Lessons and takes the tour. */
async function startTour(page: Page) {
  await topBar(page).getByRole('button', { name: 'Lessons' }).click()
  const slides = page.getByRole('dialog')
  for (let i = 0; i < 3; i++) {
    await slides.getByRole('button', { name: 'Next' }).click()
  }
  await slides.getByRole('button', { name: 'Take the tour' }).click()
  await expect(lessonPanel(page)).toBeVisible()
}

async function expectStep(page: Page, n: number, title: string) {
  await expect(lessonPanel(page)).toContainText(`LESSON · STEP ${n} OF 5`)
  await expect(lessonPanel(page).getByRole('heading')).toHaveText(title)
}

test.beforeEach(async ({ page }) => {
  // Record every autosave write, to prove the practice graph is never stored.
  await page.addInitScript((key: string) => {
    const w = globalThis as unknown as { __writes: string[] }
    w.__writes = []
    // Storage.prototype, without DOM types in this tsconfig.
    const proto = Object.getPrototypeOf(localStorage) as {
      setItem(k: string, v: string): void
    }
    const setItem = proto.setItem
    proto.setItem = function (k: string, v: string) {
      if (k === key) w.__writes.push(v)
      return setItem.call(this, k, v)
    }
  }, AUTOSAVE_KEY)
  await page.goto('/')
  await expect(pane(page)).toBeVisible()

  // The user's own graph: one node called Age.
  await addNodeAt(page, 200, 200)
  await nameField(page).fill('Age')
  await nameField(page).press('Enter')
  await expect.poll(() => stored(page)).toContain('name: Age')
})

test('the tour enables Next only after each action, and Finish restores the earlier graph', async ({
  page,
}) => {
  const writesBefore = (await autosaveWrites(page)).length
  await startTour(page)
  await expect(nodes(page)).toHaveCount(0)
  await expect(indicator(page)).toHaveText('Practice graph: not saved')

  // Step 1: add a variable.
  await expectStep(page, 1, 'Add a variable')
  await expect(lessonPanel(page).getByRole('status')).toHaveText(
    'Try it: Double-click the canvas, or press N and click.',
  )
  await expect(
    lessonPanel(page).getByRole('button', { name: 'Back' }),
  ).toBeDisabled()
  await expect(nextButton(page)).toBeDisabled()
  await addNodeAt(page, 200, 200)
  await expect(lessonPanel(page).getByRole('status')).toHaveText('Done.')
  await expect(nextButton(page)).toBeEnabled()
  await nextButton(page).click()

  // Step 2: name it.
  await expectStep(page, 2, 'Name it')
  await expect(nextButton(page)).toBeDisabled()
  await nameField(page).fill('Smoking')
  await nameField(page).press('Enter')
  await expect(nextButton(page)).toBeEnabled()
  await nextButton(page).click()

  // Step 3: draw a cause.
  await expectStep(page, 3, 'Draw a cause')
  await expect(nextButton(page)).toBeDisabled()
  await addNodeAt(page, 450, 200)
  await nameField(page).fill('Birth weight')
  await nameField(page).press('Enter')
  await connect(page, 'Smoking', 'Birth weight')
  await expect(edges(page)).toHaveCount(1)
  await expect(nextButton(page)).toBeEnabled()
  await nextButton(page).click()

  // Step 4: give it a role.
  await expectStep(page, 4, 'Give it a role')
  await expect(nextButton(page)).toBeDisabled()
  await circle(page, 'Smoking').click()
  await panel(page).getByRole('combobox', { name: 'Role' }).click()
  await page.getByRole('option', { name: 'Exposure', exact: true }).click()
  await expect(circle(page, 'Smoking')).toHaveAttribute('data-role', 'exposure')
  await expect(nextButton(page)).toBeEnabled()
  await nextButton(page).click()

  // Step 5: done; the last step reads Finish.
  await expectStep(page, 5, 'Done')
  await expect(lessonPanel(page).getByRole('status')).toHaveCount(0)
  const finish = lessonPanel(page).getByRole('button', { name: 'Finish' })
  await expect(finish).toBeEnabled()
  await finish.click()

  await expect(lessonPanel(page)).toHaveCount(0)
  await expect(circle(page, 'Age')).toBeVisible()
  await expect(nodes(page)).toHaveCount(1)
  await expect(edges(page)).toHaveCount(0)
  await expect(indicator(page)).toHaveText('Saved in this browser')

  // The user's graph is written again; the practice graph never was.
  await expect
    .poll(async () => (await autosaveWrites(page)).length)
    .toBeGreaterThan(writesBefore)
  for (const text of await autosaveWrites(page)) {
    expect(text).not.toContain('Smoking')
    expect(text).not.toContain('Birth weight')
  }
  expect(await stored(page)).toContain('name: Age')

  await page.reload()
  await expect(circle(page, 'Age')).toBeVisible()
  await expect(nodes(page)).toHaveCount(1)
})

test('closing the lesson restores the earlier graph and nothing practised is stored', async ({
  page,
}) => {
  await startTour(page)
  await addNodeAt(page, 200, 200)
  await nameField(page).fill('Smoking')
  await nameField(page).press('Enter')
  // Longer than the autosave delay.
  await page.waitForTimeout(1000)
  expect(await stored(page)).not.toContain('Smoking')

  await lessonPanel(page).getByRole('button', { name: 'Close lesson' }).click()
  await expect(lessonPanel(page)).toHaveCount(0)
  await expect(circle(page, 'Age')).toBeVisible()
  await expect(circle(page, 'Smoking')).toHaveCount(0)
  await page.waitForTimeout(1000)
  for (const text of await autosaveWrites(page)) {
    expect(text).not.toContain('Smoking')
  }
  expect(await stored(page)).toContain('name: Age')
})

test('New, Open… and dagitty Import… are disabled during the lesson; Save and Export work', async ({
  page,
}) => {
  const button = (name: string) =>
    topBar(page).getByRole('button', { name, exact: true })
  await startTour(page)
  await expect(button('New')).toBeDisabled()
  await expect(button('Open…')).toBeDisabled()
  await expect(button('Save')).toBeEnabled()

  // The disabled buttons explain why. A disabled button takes no pointer events, so the tooltip
  // trigger is the span around it.
  await button('New').locator('..').hover()
  await expect(
    page.getByRole('tooltip', { name: 'Not available during a lesson.' }),
  ).toBeVisible()

  await button('dagitty').click()
  await expect(page.getByRole('menuitem', { name: 'Import…' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(
    page.getByRole('menuitem', { name: 'Export…' }),
  ).not.toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')

  await lessonPanel(page).getByRole('button', { name: 'Close lesson' }).click()
  await expect(button('New')).toBeEnabled()
  await expect(button('Open…')).toBeEnabled()
})
