import type { Page } from '@playwright/test'
import {
  addNodeAt,
  centre,
  circle,
  clickEdgeBetween,
  connect,
  edges,
  expect,
  nameField,
  node,
  nodes,
  pane,
  panel,
  stored,
  test,
  topBar,
  viewport,
} from './fixtures.ts'

// Copy in Save as… and Share write to the clipboard.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

/** The 14 lesson titles in course order (docs/LESSONS.md). */
const TITLES = [
  'Drawing your first DAG',
  'Describing your variables',
  'Documenting your arrows',
  'Saving, sharing and exporting',
  'What a DAG says',
  'Confounding',
  'Mediators',
  'Colliders',
  'Selection bias',
  'Unmeasured variables',
  'Adjustment sets',
  'Testing your DAG',
  'Instrumental variables',
  'Reporting your DAG',
]

/** Step counts of the 14 lessons, in the same order. */
const STEPS = [5, 7, 6, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6]

const lessonPanel = (page: Page) =>
  page.getByRole('complementary', { name: 'Lesson' })
const lessonsDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Lessons' })
const button = (page: Page, name: string) =>
  topBar(page).getByRole('button', { name, exact: true })
const nextButton = (page: Page) =>
  lessonPanel(page).getByRole('button', { name: 'Next', exact: true })
/** A step with a task has the callout; a pick step also has the feedback (phase 42). */
const callout = (page: Page) => lessonPanel(page).getByRole('status').first()
const feedback = (page: Page) => lessonPanel(page).getByRole('status').nth(1)
const showAnswer = (page: Page) =>
  lessonPanel(page).getByRole('button', { name: 'Show answer' })
const pointer = (page: Page, name: string) =>
  node(page, name).locator('[data-lesson-pointer]')
const analysisTab = (page: Page) =>
  panel(page).getByRole('tab', { name: 'Analysis', exact: true })

/** Opens Help → Lessons…. */
async function openLessons(page: Page) {
  await topBar(page).getByRole('button', { name: 'Help' }).click()
  await page.getByRole('menuitem', { name: 'Lessons…' }).click()
  await expect(lessonsDialog(page)).toBeVisible()
}

/** Starts lesson `title` from the Lessons dialog. */
async function startLesson(page: Page, title: string) {
  await openLessons(page)
  await lessonsDialog(page)
    .getByRole('button', { name: `Start ${title}`, exact: true })
    .click()
  await expect(lessonsDialog(page)).toHaveCount(0)
  await expect(lessonPanel(page)).toBeVisible()
  await viewSettled(page)
}

/** Waits until the view stops moving: starting and ending a lesson fit the view (phase 48). */
async function viewSettled(page: Page) {
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await viewport(page))
        const same = now === last
        last = now
        return same
      },
      { intervals: [100] },
    )
    .toBe(true)
}

async function expectStep(page: Page, n: number, of: number, title: string) {
  await expect(lessonPanel(page)).toContainText(`LESSON · STEP ${n} OF ${of}`)
  await expect(lessonPanel(page).getByRole('heading')).toHaveText(title)
}

/** Next is disabled until the step is done; then it shows "Done." and moves on. */
async function expectDoneAndNext(page: Page) {
  await expect(callout(page)).toHaveText('Done.')
  await expect(nextButton(page)).toBeEnabled()
  await nextButton(page).click()
}

/** Selects the named node and picks `role` in the side panel. */
async function setRole(page: Page, name: string, role: string) {
  await circle(page, name).click()
  await panel(page).getByRole('combobox', { name: 'Role' }).click()
  await page.getByRole('option', { name: role, exact: true }).click()
}

/** Runs `action` and waits for the download it starts. */
async function download(page: Page, action: () => Promise<void>) {
  const pending = page.waitForEvent('download')
  await action()
  return (await pending).suggestedFilename()
}

/** The user's own graph, one node called Age, is the same as before the lesson. */
async function expectUserGraph(page: Page) {
  await expect(lessonPanel(page)).toHaveCount(0)
  await viewSettled(page)
  await expect(nodes(page)).toHaveCount(1)
  await expect(circle(page, 'Age')).toBeVisible()
  await expect(edges(page)).toHaveCount(0)
  await expect.poll(() => stored(page)).toContain('name: Age')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(pane(page)).toBeVisible()

  // The user's own graph: one node called Age.
  await addNodeAt(page, 200, 200)
  await nameField(page).fill('Age')
  await nameField(page).press('Enter')
  await expect.poll(() => stored(page)).toContain('name: Age')
})

test('Help → Lessons… lists the two groups and the finished count', async ({
  page,
}) => {
  await openLessons(page)
  const dialog = lessonsDialog(page)
  await expect(dialog).toContainText(
    'Short interactive lessons on a practice graph. Your own graph is set aside and comes back when you finish.',
  )
  const app = dialog.getByRole('list', { name: 'Using GraphCreator' })
  const causal = dialog.getByRole('list', { name: 'Causal thinking' })
  await expect(app.getByRole('listitem')).toHaveCount(4)
  await expect(causal.getByRole('listitem')).toHaveCount(10)
  for (const [i, title] of TITLES.entries()) {
    const group = i < 4 ? app : causal
    await expect(
      group.getByRole('button', { name: `Start ${title}`, exact: true }),
    ).toBeVisible()
  }
  await expect(dialog.getByRole('img', { name: 'Finished' })).toHaveCount(0)
  await expect(dialog).toContainText('0 of 14 finished.')

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('lesson 6 runs from start to finish, and stays finished after a reload', async ({
  page,
}) => {
  await startLesson(page, 'Confounding')
  await expect(nodes(page)).toHaveCount(3)

  // Step 1: the pointer label shows above SES.
  await expectStep(page, 1, 6, 'A common cause')
  await expect(pointer(page, 'SES')).toHaveText('Common cause')
  await expect(pointer(page, 'SES')).toBeInViewport()
  const label = (await pointer(page, 'SES').boundingBox())!
  const ses = (await circle(page, 'SES').boundingBox())!
  expect(label.y + label.height).toBeLessThan(ses.y)
  expect(label.x + label.width / 2).toBeCloseTo(ses.x + ses.width / 2, 0)
  await expect(page.locator('[data-lesson-pointer]')).toHaveCount(1)
  await nextButton(page).click()

  // Step 2: the Analysis tab and Paths.
  await expectStep(page, 2, 6, 'A back-door path')
  await expect(page.locator('[data-lesson-pointer]')).toHaveCount(0)
  await expect(nextButton(page)).toBeDisabled()
  await analysisTab(page).click()
  await expect(nextButton(page)).toBeDisabled()
  await panel(page).getByRole('switch', { name: 'Show paths' }).click()
  await expectDoneAndNext(page)

  // Step 3: wrong picks show their hints; after two, Show answer.
  await expectStep(page, 3, 6, 'Find the confounder')
  await expect(callout(page)).toHaveText('Try it: Click the confounder.')
  await expect(feedback(page)).toHaveText('')
  await circle(page, 'Birth weight').click()
  await expect(feedback(page)).toHaveText(
    'That is the outcome. A confounder causes both the exposure and the outcome.',
  )
  await expect(showAnswer(page)).toHaveCount(0)
  await expect(nextButton(page)).toBeDisabled()
  await circle(page, 'Maternal smoking').click()
  await expect(feedback(page)).toHaveText(
    'That is the exposure. A confounder causes both the exposure and the outcome.',
  )
  await showAnswer(page).click()
  await expect(nameField(page)).toHaveValue('SES')
  await expect(feedback(page)).toHaveText(
    'SES: it causes both Maternal smoking and Birth weight, so the back-door path runs through it.',
  )
  await expect(showAnswer(page)).toHaveCount(0)
  await expectDoneAndNext(page)

  // Step 4: adjust for SES.
  await expectStep(page, 4, 6, 'Adjusting closes the path')
  await expect(pointer(page, 'SES')).toHaveText('Adjust here')
  await expect(nextButton(page)).toBeDisabled()
  await setRole(page, 'SES', 'Adjusted')
  await expect(circle(page, 'SES')).toHaveAttribute('data-role', 'adjusted')
  await expectDoneAndNext(page)

  // Step 5: read the Report.
  await expectStep(page, 5, 6, 'Check the result')
  await expect(nextButton(page)).toBeDisabled()
  await analysisTab(page).click()
  await expect(
    panel(page).getByRole('region', { name: 'Report', exact: true }),
  ).toContainText(
    'Your adjusted set (SES) is sufficient, as implied by this DAG.',
  )
  await expectDoneAndNext(page)

  // Step 6: Finish restores the user's graph.
  await expectStep(page, 6, 6, 'Done')
  await lessonPanel(page).getByRole('button', { name: 'Finish' }).click()
  await expectUserGraph(page)

  await page.reload()
  await expect(circle(page, 'Age')).toBeVisible()
  await openLessons(page)
  const row = lessonsDialog(page)
    .getByRole('listitem')
    .filter({ hasText: 'Confounding' })
  await expect(row.getByRole('img', { name: 'Finished' })).toBeVisible()
  await expect(
    lessonsDialog(page).getByRole('img', { name: 'Finished' }),
  ).toHaveCount(1)
  await expect(lessonsDialog(page)).toContainText('1 of 14 finished.')
})

test('lesson 3: drawing Birth weight → SES is refused, which completes step 5', async ({
  page,
}) => {
  await startLesson(page, 'Documenting your arrows')

  await expectStep(page, 1, 6, 'What an arrow claims')
  await expect(pointer(page, 'SES')).toHaveText('From here')
  await expect(pointer(page, 'Maternal smoking')).toHaveText('To here')
  await clickEdgeBetween(page, 'SES', 'Maternal smoking')
  await expectDoneAndNext(page)

  await expectStep(page, 2, 6, 'Evidence')
  const evidence = panel(page).getByRole('group', { name: 'Evidence' })
  await evidence.getByRole('button', { name: 'Add evidence' }).click()
  await evidence
    .getByRole('textbox', { name: 'Evidence 1', exact: true })
    .fill('PMID:123')
  await page.keyboard.press('Tab')
  await expectDoneAndNext(page)

  await expectStep(page, 3, 6, 'Notes')
  const note = panel(page).getByRole('textbox', { name: 'Note' })
  await note.fill('Well established')
  await page.keyboard.press('Tab')
  await expectDoneAndNext(page)

  await expectStep(page, 4, 6, 'Missing arrows are claims too')
  await nextButton(page).click()

  await expectStep(page, 5, 6, 'No cycles')
  await expect(pointer(page, 'Birth weight')).toHaveText('Start here')
  await expect(nextButton(page)).toBeDisabled()
  await connect(page, 'Birth weight', 'SES')
  await expect(
    page.getByText(
      /^Birth weight → SES → .*Birth weight would form a cycle\.$/,
    ),
  ).toBeVisible()
  await expect(edges(page)).toHaveCount(4)
  await expectDoneAndNext(page)

  await expectStep(page, 6, 6, 'Done')
  await lessonPanel(page).getByRole('button', { name: 'Finish' }).click()
  await expectUserGraph(page)
})

test('lesson 4: Save, Save as… dagitty, Export PDF, Share and Ctrl+Z complete their steps', async ({
  page,
}) => {
  await startLesson(page, 'Saving, sharing and exporting')
  await expect(nodes(page)).toHaveCount(4)

  await expectStep(page, 1, 7, 'Your work stays here')
  await nextButton(page).click()

  // Step 2: Save, then Download.
  await expectStep(page, 2, 7, 'Save a GraphCreator file')
  await expect(nextButton(page)).toBeDisabled()
  await button(page, 'Save').click()
  const save = page.getByRole('dialog', { name: 'Save as GraphCreator' })
  expect(
    await download(page, () =>
      save.getByRole('button', { name: 'Download' }).click(),
    ),
  ).toBe('smoking-and-birth-weight.dag.yaml')
  await page.keyboard.press('Escape')
  await expect(save).toHaveCount(0)
  await expectDoneAndNext(page)

  // Step 3: Save as… → dagitty… → Copy.
  await expectStep(page, 3, 7, 'Files for other tools')
  await expect(nextButton(page)).toBeDisabled()
  await button(page, 'Save as…').click()
  await page.getByRole('menuitem', { name: 'dagitty…' }).click()
  const dagitty = page.getByRole('dialog', { name: 'Save as dagitty' })
  await dagitty.getByRole('button', { name: 'Copy' }).click()
  await expect(
    page.getByText('Copied dagitty code to the clipboard.'),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dagitty).toHaveCount(0)
  await expectDoneAndNext(page)

  // Step 4: Export as PDF.
  await expectStep(page, 4, 7, 'Export a picture')
  await expect(nextButton(page)).toBeDisabled()
  await button(page, 'Export…').click()
  const exportDialog = page.getByRole('dialog', { name: 'Export image' })
  await exportDialog.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: 'PDF', exact: true }).click()
  expect(
    await download(page, () =>
      exportDialog.getByRole('button', { name: 'Download' }).click(),
    ),
  ).toBe('smoking-and-birth-weight.pdf')
  await page.keyboard.press('Escape')
  await expect(exportDialog).toHaveCount(0)
  await expectDoneAndNext(page)

  // Step 5: Share.
  await expectStep(page, 5, 7, 'Share a link')
  await expect(nextButton(page)).toBeDisabled()
  await button(page, 'Share').click()
  await expect(
    page.getByText(
      'Link copied. The graph is stored in the link itself, not on a server.',
    ),
  ).toBeVisible()
  await expectDoneAndNext(page)

  // Step 6: move a circle, then Ctrl+Z.
  await expectStep(page, 6, 7, 'Undo')
  await expect(callout(page)).toHaveText(
    'Try it: Move a circle, then press Ctrl+Z.',
  )
  await expect(nextButton(page)).toBeDisabled()
  const before = await centre(circle(page, 'SES'))
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(before.x + 60, before.y - 40, { steps: 10 })
  await page.mouse.up()
  await expect
    .poll(async () => (await centre(circle(page, 'SES'))).x)
    .toBeGreaterThan(before.x + 40)
  await expect(nextButton(page)).toBeDisabled()
  await page.keyboard.press('Control+z')
  await expect
    .poll(async () => (await centre(circle(page, 'SES'))).x)
    .toBeCloseTo(before.x, 0)
  await expectDoneAndNext(page)

  await expectStep(page, 7, 7, 'Done')
  await lessonPanel(page).getByRole('button', { name: 'Finish' }).click()
  await expectUserGraph(page)
})

test('every lesson starts from the dialog and closes again, leaving the user graph unchanged', async ({
  page,
}) => {
  test.setTimeout(90_000)
  for (const [i, title] of TITLES.entries()) {
    await startLesson(page, title)
    await expect(lessonPanel(page)).toContainText(
      `LESSON · STEP 1 OF ${STEPS[i]}`,
    )
    if (i > 0) {
      // Every practice graph but the tour's empty one is in view.
      await expect(nodes(page).first()).toBeInViewport()
    }
    await lessonPanel(page)
      .getByRole('button', { name: 'Close lesson' })
      .click()
    await expectUserGraph(page)
  }
  await openLessons(page)
  await expect(lessonsDialog(page)).toContainText('0 of 14 finished.')
})
