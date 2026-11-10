import path from 'node:path'
import type { Page } from '@playwright/test'
import {
  addNodeAt,
  circle,
  edges,
  expect,
  nodes,
  pane,
  stored,
  test,
  topBar,
} from './fixtures.ts'

const SMOKING = path.join(
  import.meta.dirname,
  '../src/model/__fixtures__/smoking.dag.yaml',
)

const COPIED =
  'Link copied. The graph is stored in the link itself, not on a server.'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const button = (page: Page, name: string) =>
  topBar(page).getByRole('button', { name, exact: true })

const sharedDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Open the shared graph?' })

/** Opens `smoking.dag.yaml` through Open… → Open file…. */
async function openSmoking(page: Page) {
  await button(page, 'Open…').click()
  const chooser = page.waitForEvent('filechooser')
  await page
    .getByRole('dialog', { name: 'Open a graph' })
    .getByRole('button', { name: 'Open file…' })
    .click()
  await (await chooser).setFiles(SMOKING)
  await expect(nodes(page)).toHaveCount(4)
}

/** Clicks Share and returns the link it copied. */
async function share(page: Page): Promise<string> {
  await button(page, 'Share').click()
  await expect(page.getByText(COPIED)).toBeVisible()
  // The e2e tsconfig has no DOM types, so the browser's clipboard is typed here.
  return page.evaluate(() =>
    (
      navigator as unknown as { clipboard: { readText(): Promise<string> } }
    ).clipboard.readText(),
  )
}

/** Opens smoking.dag.yaml and returns its share link. */
async function smokingLink(page: Page): Promise<string> {
  await openSmoking(page)
  return share(page)
}

/** Replaces the stored graph with a single "Node 1" and waits until it is autosaved. */
async function storeOtherGraph(page: Page) {
  await button(page, 'New').click()
  await page
    .getByRole('dialog', { name: 'Start a new graph?' })
    .getByRole('button', { name: 'New graph' })
    .click()
  await addNodeAt(page, 200, 200)
  await page.keyboard.press('Escape')
  await expect(nodes(page)).toHaveCount(1)
  await expect.poll(() => stored(page)).toContain('Node 1')
  await expect.poll(() => stored(page)).not.toContain('Maternal smoking')
}

/** Loads `url` as a new document (a hash-only change would not reload the app). */
async function load(page: Page, url: string) {
  await page.goto('about:blank')
  await page.goto(url)
  await expect(pane(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()
})

test('Share copies a link to this page and toasts', async ({ page }) => {
  const link = await smokingLink(page)
  expect(link.startsWith(page.url() + '#g=')).toBe(true)
  expect(link.slice(page.url().length + 3)).toMatch(/^[A-Za-z0-9_-]+$/)
})

test('a share link opens in a fresh browser without the welcome slides', async ({
  page,
  browser,
}) => {
  const link = await smokingLink(page)

  // A first visit: empty storage and no "welcomed" flag.
  const context = await browser.newContext()
  try {
    const fresh = await context.newPage()
    await fresh.goto(link)
    await expect(pane(fresh)).toBeVisible()
    // Genetic factors has no type: one warning.
    await expect(
      fresh.getByText('Opened the shared graph with 1 warning.'),
    ).toBeVisible()
    await expect(nodes(fresh)).toHaveCount(4)
    await expect(edges(fresh)).toHaveCount(4)
    await expect(circle(fresh, 'Maternal smoking')).toBeVisible()
    // The view is fitted: SES sits at y = -120, above the unfitted view.
    await expect(circle(fresh, 'SES')).toBeInViewport({ ratio: 0.99 })
    await expect(
      topBar(fresh).getByRole('textbox', { name: 'Graph name' }),
    ).toHaveValue('Smoking and birth weight')
    await expect(fresh.getByRole('dialog')).toHaveCount(0)
    expect(fresh.url()).not.toContain('#')
    await expect.poll(() => stored(fresh)).toContain('Maternal smoking')

    // The fragment is gone, so a reload restores the autosaved graph and asks nothing.
    await fresh.reload()
    await expect(pane(fresh)).toBeVisible()
    await expect(nodes(fresh)).toHaveCount(4)
    await expect(sharedDialog(fresh)).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('over a different stored graph, Keep my graph keeps it and a reload does not ask again', async ({
  page,
}) => {
  const link = await smokingLink(page)
  await storeOtherGraph(page)

  await load(page, link)
  await expect(sharedDialog(page)).toBeVisible()
  await expect(sharedDialog(page)).toContainText(
    'This replaces the graph saved in this browser. Save it first if you want to keep it.',
  )
  expect(page.url()).not.toContain('#')
  await sharedDialog(page)
    .getByRole('button', { name: 'Keep my graph' })
    .click()
  await expect(sharedDialog(page)).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(1)
  await expect(circle(page, 'Node 1')).toBeVisible()
  expect(await stored(page)).toContain('Node 1')

  await page.reload()
  await expect(pane(page)).toBeVisible()
  await expect(nodes(page)).toHaveCount(1)
  await expect(sharedDialog(page)).toHaveCount(0)
})

test('Escape in the dialog keeps the stored graph', async ({ page }) => {
  const link = await smokingLink(page)
  await storeOtherGraph(page)

  await load(page, link)
  await expect(sharedDialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sharedDialog(page)).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(1)
  expect(await stored(page)).toContain('Node 1')
})

test('over a different stored graph, Open shared graph replaces it', async ({
  page,
}) => {
  const link = await smokingLink(page)
  await storeOtherGraph(page)

  await load(page, link)
  await sharedDialog(page)
    .getByRole('button', { name: 'Open shared graph' })
    .click()
  await expect(sharedDialog(page)).toHaveCount(0)
  await expect(
    page.getByText('Opened the shared graph with 1 warning.'),
  ).toBeVisible()
  await expect(nodes(page)).toHaveCount(4)
  await expect(circle(page, 'Node 1')).toHaveCount(0)
  await expect(circle(page, 'SES')).toBeInViewport({ ratio: 0.99 })
  await expect.poll(() => stored(page)).toContain('Maternal smoking')

  await page.reload()
  await expect(pane(page)).toBeVisible()
  await expect(nodes(page)).toHaveCount(4)
  await expect(sharedDialog(page)).toHaveCount(0)
})

test('a link to the graph already stored opens without asking', async ({
  page,
}) => {
  const link = await smokingLink(page)
  await expect.poll(() => stored(page)).toContain('Maternal smoking')

  await load(page, link)
  await expect(
    page.getByText('Opened the shared graph with 1 warning.'),
  ).toBeVisible()
  await expect(sharedDialog(page)).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(4)
})

test('a damaged link shows the error toast and keeps the stored graph', async ({
  page,
}) => {
  const link = await smokingLink(page)
  await storeOtherGraph(page)

  await load(page, link.slice(0, -12))
  await expect(page.getByText('Could not open the shared graph.')).toBeVisible()
  await expect(
    page.getByText('This share link is damaged or incomplete.'),
  ).toBeVisible()
  await expect(sharedDialog(page)).toHaveCount(0)
  expect(page.url()).not.toContain('#')
  await expect(nodes(page)).toHaveCount(1)
  expect(await stored(page)).toContain('Node 1')
})

test('Share works on the practice graph during a lesson', async ({ page }) => {
  await topBar(page).getByRole('button', { name: 'Help' }).click()
  await page.getByRole('menuitem', { name: 'Welcome' }).click()
  const slides = page.getByRole('dialog')
  for (let i = 0; i < 3; i++) {
    await slides.getByRole('button', { name: 'Next' }).click()
  }
  await slides.getByRole('button', { name: 'Take the tour' }).click()
  await expect(
    page.getByRole('complementary', { name: 'Lesson' }),
  ).toBeVisible()
  await addNodeAt(page, 200, 200)
  await page.keyboard.press('Escape')

  const link = await share(page)
  expect(link.startsWith(page.url() + '#g=')).toBe(true)
})
