// A first visit: the plain Playwright `test`, without the "welcomed" flag that fixtures.ts sets.
import { expect, test, type Page } from '@playwright/test'
import { WELCOMED_KEY, pane, topBar } from './fixtures.ts'

const SLIDE_TITLES = [
  'Welcome to GraphCreator',
  'Circles are variables, arrows are causes',
  'Your graph stays here',
  'How would you like to start?',
]

const slides = (page: Page) => page.getByRole('dialog')

const welcomed = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), WELCOMED_KEY)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
})

test('a first visit shows slide 1, and Next and the arrow keys move between slides', async ({
  page,
}) => {
  const dialog = page.getByRole('dialog', { name: SLIDE_TITLES[0] })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(
    'Draw causal DAGs and document every variable and every arrow.',
  )
  await expect(dialog).toContainText('Slide 1 of 4')
  await expect(dialog.getByRole('button', { name: 'Skip' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(slides(page)).toHaveAccessibleName(SLIDE_TITLES[1])
  await page.keyboard.press('ArrowRight')
  await expect(slides(page)).toHaveAccessibleName(SLIDE_TITLES[2])
  await expect(slides(page)).toContainText('Nothing is uploaded.')
  await page.keyboard.press('ArrowLeft')
  await expect(slides(page)).toHaveAccessibleName(SLIDE_TITLES[1])
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(slides(page)).toHaveAccessibleName(SLIDE_TITLES[3])
  await expect(slides(page).getByRole('button', { name: 'Skip' })).toHaveCount(
    0,
  )
  await expect(
    slides(page).getByRole('button', { name: 'Take the tour' }),
  ).toBeVisible()
  await expect(
    slides(page).getByRole('button', { name: 'Get started' }),
  ).toBeVisible()
  // Tool shortcuts are off while the slides are open. (The modal dialog hides the rest of the
  // page from the accessibility tree, so the rail button is found by its label.)
  await page.keyboard.press('n')
  await expect(page.locator('button[aria-label="Add node"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.locator('button[aria-label="Select"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('"Get started" closes the slides and they stay closed after a reload', async ({
  page,
}) => {
  await expect(slides(page)).toBeVisible()
  expect(await welcomed(page)).toBeNull()
  for (let i = 0; i < 3; i++) {
    await slides(page).getByRole('button', { name: 'Next' }).click()
  }
  await slides(page).getByRole('button', { name: 'Get started' }).click()
  await expect(slides(page)).toHaveCount(0)
  expect(await welcomed(page)).toBe('1')
  await expect(page.getByRole('complementary', { name: 'Lesson' })).toHaveCount(
    0,
  )

  await page.reload()
  await expect(pane(page)).toBeVisible()
  await expect(slides(page)).toHaveCount(0)
})

test('Skip and Escape close the slides too', async ({ page }) => {
  await slides(page).getByRole('button', { name: 'Skip' }).click()
  await expect(slides(page)).toHaveCount(0)
  expect(await welcomed(page)).toBe('1')

  await topBar(page).getByRole('button', { name: 'Help' }).click()
  await page.getByRole('menuitem', { name: 'Welcome' }).click()
  await expect(slides(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(slides(page)).toHaveCount(0)
})

test('Help → Welcome reopens the slides at slide 1', async ({ page }) => {
  await slides(page).getByRole('button', { name: 'Next' }).click()
  await expect(slides(page)).toHaveAccessibleName(SLIDE_TITLES[1])
  await slides(page).getByRole('button', { name: 'Skip' }).click()
  await expect(slides(page)).toHaveCount(0)

  await topBar(page).getByRole('button', { name: 'Help' }).click()
  await page.getByRole('menuitem', { name: 'Welcome' }).click()
  await expect(slides(page)).toHaveAccessibleName(SLIDE_TITLES[0])
})

test('"Take the tour" closes the slides and opens the lesson panel', async ({
  page,
}) => {
  for (let i = 0; i < 3; i++) {
    await slides(page).getByRole('button', { name: 'Next' }).click()
  }
  await slides(page).getByRole('button', { name: 'Take the tour' }).click()
  await expect(slides(page)).toHaveCount(0)
  expect(await welcomed(page)).toBe('1')
  const lesson = page.getByRole('complementary', { name: 'Lesson' })
  await expect(lesson).toBeVisible()
  await expect(lesson).toContainText('LESSON · STEP 1 OF 5')
  await expect(lesson.getByRole('heading')).toHaveText('Add a variable')
})
