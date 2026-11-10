import type { Page } from '@playwright/test'
import { expect, panel, rail, test, topBar } from './fixtures.ts'

/** Collects console errors and uncaught exceptions of `page`. */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

test('app loads with top bar, tool rail, canvas and side panel and no console errors', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('/')

  await expect(page).toHaveTitle('GraphCreator')
  const toolbar = topBar(page)
  await expect(toolbar).toBeVisible()
  await expect(
    toolbar.getByRole('textbox', { name: 'Graph name' }),
  ).toBeVisible()
  for (const name of [
    'New',
    'Open…',
    'Save',
    'Save as…',
    'Help',
    'Dark mode',
  ]) {
    await expect(
      toolbar.getByRole('button', { name, exact: true }),
    ).toBeVisible()
  }

  const tools = rail(page)
  await expect(tools).toBeVisible()
  await expect(tools).toHaveAttribute('aria-orientation', 'vertical')
  for (const [name, key] of [
    ['Select', 'V'],
    ['Add node', 'N'],
    ['Connect', 'C'],
    ['Auto-layout', 'L'],
    ['Fit view', 'F'],
    ['Zoom in', '+'],
    ['Zoom out', '-'],
  ]) {
    const button = tools.getByRole('button', { name, exact: true })
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('aria-keyshortcuts', key)
  }
  // The Select tool is active.
  await expect(
    tools.getByRole('button', { name: 'Select', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')

  const canvas = page.getByRole('main', { name: 'Canvas' })
  await expect(canvas).toBeVisible()
  await expect(canvas.locator('.react-flow__pane')).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box?.height).toBeGreaterThan(200)
  // No React Flow controls, minimap or dot grid (spec 5.1).
  await expect(canvas.locator('.react-flow__controls')).toHaveCount(0)
  await expect(canvas.locator('.react-flow__minimap')).toHaveCount(0)
  await expect(canvas.locator('.react-flow__background')).toHaveCount(0)
  await expect(canvas.getByRole('status')).toHaveText('Saved in this browser')

  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).toContainText('Nothing selected.')
  // No lesson panel and no welcome slides for a returning visitor.
  await expect(page.getByRole('complementary', { name: 'Lesson' })).toHaveCount(
    0,
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // No warnings badge for an empty graph.
  await expect(toolbar.getByRole('button', { name: /warning/ })).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  expect(errors).toEqual([])
})

test.describe('theme', () => {
  // The system asks for dark; the app still starts light (spec 5.7.2).
  test.use({ colorScheme: 'dark' })

  test('starts light and the toggle switches to dark and back', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    const html = page.locator('html')
    const flow = page.locator('.react-flow')
    const toggle = page
      .getByRole('toolbar', { name: 'Toolbar' })
      .getByRole('button', { name: 'Dark mode' })
    await expect(html).not.toHaveClass(/\bdark\b/)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await toggle.click()
    await expect(html).toHaveClass(/\bdark\b/)
    await expect(flow).toHaveClass(/\bdark\b/)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // The canvas uses the dark --canvas token (#111A18).
    await expect(flow).toHaveCSS('background-color', 'rgb(17, 26, 24)')
    await page
      .locator('.react-flow__pane')
      .dblclick({ position: { x: 200, y: 200 } })
    await expect(page.locator('.react-flow__node')).toHaveCount(1)

    // The choice survives a reload.
    await page.reload()
    await expect(html).toHaveClass(/\bdark\b/)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await toggle.click()
    await expect(html).not.toHaveClass(/\bdark\b/)
    await expect(flow).not.toHaveClass(/\bdark\b/)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(errors).toEqual([])
  })
})

test('the light canvas uses the --canvas token', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.react-flow')).toHaveCSS(
    'background-color',
    'rgb(243, 248, 247)',
  )
})

test('the saved indicator says when browser storage is blocked', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // As in a browser that blocks site data: reading `window.localStorage` throws.
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError: access to localStorage is denied.')
      },
    })
  })
  const errors = collectErrors(page)
  await page.goto('/')
  // Without storage the visit cannot be remembered, so the welcome slides show; close them.
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('main', { name: 'Canvas' }).getByRole('status'),
  ).toHaveText('Not saved: browser storage is blocked')
  // The app still works; it only does not save.
  await page
    .locator('.react-flow__pane')
    .dblclick({ position: { x: 200, y: 200 } })
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  expect(errors).toEqual([])
})
