import { expect, test } from '@playwright/test'

test('app loads with toolbar, canvas and side panel and no console errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  await expect(page).toHaveTitle('GraphCreator')
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' })
  await expect(toolbar).toBeVisible()
  await expect(
    toolbar.getByRole('textbox', { name: 'Graph name' }),
  ).toBeVisible()
  for (const name of [
    'New',
    'Open',
    'Save',
    'dagitty',
    'Add node',
    'Auto-layout',
  ]) {
    await expect(
      toolbar.getByRole('button', { name, exact: true }),
    ).toBeVisible()
  }
  const canvas = page.getByRole('main', { name: 'Canvas' })
  await expect(canvas).toBeVisible()
  await expect(canvas.locator('.react-flow__pane')).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box?.height).toBeGreaterThan(200)
  const panel = page.getByRole('complementary', { name: 'Side panel' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Nothing selected.')
  // No warnings badge for an empty graph.
  await expect(toolbar.getByRole('button', { name: /warning/ })).toHaveCount(0)
  expect(errors).toEqual([])
})
