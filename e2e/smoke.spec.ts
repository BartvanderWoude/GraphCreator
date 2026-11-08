import { expect, test } from '@playwright/test'

test('app shell renders without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  await expect(page).toHaveTitle('GraphCreator')
  await expect(page.getByRole('toolbar', { name: 'Toolbar' })).toBeVisible()
  await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible()
  await expect(
    page.getByRole('complementary', { name: 'Side panel' }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
