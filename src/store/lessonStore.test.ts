import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { LESSONS, tourLesson, type Lesson } from '@/lessons'
import { hasEvent } from '@/lessons/helpers'
import { LESSONS_DONE_KEY } from '@/lib/lessonProgress'
import { emptyGraph, type Graph } from '@/model/graph'
import { useGraphStore } from './graphStore'
import { lessonEvent, useLessonEvents } from './lessonEvents'
import { isStepDone, lessonContext, useLessonStore } from './lessonStore'
import { useUiStore } from './uiStore'

const lessons = () => useLessonStore.getState()
const graphStore = () => useGraphStore.getState()

function userGraph(): Graph {
  return {
    name: 'My study',
    nodes: [
      { id: 'n1', name: 'SES', role: 'adjusted', pos: { x: 0, y: 0 } },
      { id: 'n2', name: 'Weight', role: 'outcome', pos: { x: 200, y: 0 } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', evidence: ['PMID:1'] }],
  }
}

/** Does what the tour asks for at each step, on the practice graph. */
function completeStep(step: number): void {
  const s = graphStore()
  switch (step) {
    case 0:
      s.addNodeAt({ x: 0, y: 0 })
      break
    case 1:
      s.renameNode(s.graph.nodes[0].id, 'Smoking')
      break
    case 2: {
      const id = s.addNodeAt({ x: 200, y: 0 })
      graphStore().connect(graphStore().graph.nodes[0].id, id)
      break
    }
    case 3:
      s.updateNode(s.graph.nodes[0].id, { role: 'exposure' })
      break
  }
}

let mine: Graph

beforeEach(() => {
  // Leave any lesson from an earlier test, then load a fresh user graph.
  lessons().exit()
  mine = userGraph()
  graphStore().replaceGraph(mine)
})

describe('lessonStore', () => {
  it('has no active lesson at first, and isStepDone is then true', () => {
    expect(lessons().active).toBeNull()
    expect(isStepDone()).toBe(true)
  })

  it("start('tour') sets the user's graph aside and loads an empty graph", () => {
    graphStore().select({ kind: 'node', id: 'n1' })
    lessons().start('tour')
    expect(lessons().active).toEqual({ lessonId: 'tour', step: 0 })
    expect(graphStore().graph).toEqual(emptyGraph())
    expect(graphStore().selection).toBeNull()
  })

  it('sets active before it loads the practice graph', () => {
    let activeWhenLoaded: unknown = 'not loaded'
    const unsubscribe = useGraphStore.subscribe((state, prev) => {
      if (state.graph !== prev.graph) activeWhenLoaded = lessons().active
    })
    lessons().start('tour')
    unsubscribe()
    expect(activeWhenLoaded).toEqual({ lessonId: 'tour', step: 0 })
  })

  it('next does nothing until the step is done', () => {
    lessons().start('tour')
    expect(isStepDone()).toBe(false)
    lessons().next()
    expect(lessons().active?.step).toBe(0)
    completeStep(0)
    expect(isStepDone()).toBe(true)
    lessons().next()
    expect(lessons().active?.step).toBe(1)
    lessons().next()
    expect(lessons().active?.step).toBe(1)
  })

  it('back goes one step back and stops at 0', () => {
    lessons().start('tour')
    completeStep(0)
    lessons().next()
    expect(lessons().active?.step).toBe(1)
    lessons().back()
    expect(lessons().active?.step).toBe(0)
    lessons().back()
    expect(lessons().active?.step).toBe(0)
  })

  it("exit restores the user's graph exactly", () => {
    lessons().start('tour')
    completeStep(0)
    lessons().exit()
    expect(lessons().active).toBeNull()
    expect(graphStore().graph).toBe(mine)
    expect(graphStore().graph).toEqual(userGraph())
  })

  it("finishing the tour restores the user's graph", () => {
    lessons().start('tour')
    const steps = tourLesson.steps.length
    for (let step = 0; step < steps - 1; step++) {
      completeStep(step)
      lessons().next()
      expect(lessons().active?.step).toBe(step + 1)
    }
    expect(isStepDone()).toBe(true)
    lessons().next()
    expect(lessons().active).toBeNull()
    expect(graphStore().graph).toBe(mine)
  })

  it('starting an unknown lesson throws and changes nothing', () => {
    expect(() => lessons().start('nope')).toThrow('Unknown lesson "nope".')
    expect(lessons().active).toBeNull()
    expect(graphStore().graph).toBe(mine)
  })

  it('starting while a lesson runs exits the old one first', () => {
    lessons().start('tour')
    completeStep(0)
    completeStep(1)
    lessons().next()
    lessons().start('tour')
    // A fresh run, and the practice graph was not set aside in place of the user's.
    expect(lessons().active).toEqual({ lessonId: 'tour', step: 0 })
    expect(graphStore().graph).toEqual(emptyGraph())
    lessons().exit()
    expect(graphStore().graph).toBe(mine)
  })

  it('exit without a lesson changes nothing', () => {
    lessons().exit()
    expect(graphStore().graph).toBe(mine)
    lessons().next()
    lessons().back()
    expect(lessons().active).toBeNull()
  })
})

/** A lesson with a pick step, an event step and a reading step, for the phase 41 engine. */
const pickLesson: Lesson = {
  id: 'test-picks',
  title: 'Test picks',
  summary: 'Only for tests.',
  track: 'causal',
  sample: () => ({
    nodes: [
      { id: 'a', name: 'A', role: 'exposure', pos: { x: 0, y: 0 } },
      { id: 'b', name: 'B', role: 'other', pos: { x: 100, y: 0 } },
      { id: 'c', name: 'C', role: 'other', pos: { x: 200, y: 0 } },
      { id: 'd', name: 'D', role: 'outcome', pos: { x: 300, y: 0 } },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'd', evidence: [] }],
  }),
  steps: [
    {
      title: 'Pick',
      pick: { answers: ['B', 'C'], hints: { A: 'Not A.' }, reveal: 'B or C.' },
    },
    { title: 'Undo', check: (ctx) => hasEvent(ctx, 'undo') },
    { title: 'Done' },
  ],
}

const events = () => useLessonEvents.getState()
const selectNode = (id: string) => graphStore().select({ kind: 'node', id })

describe('lessonStore engine (phase 41)', () => {
  beforeAll(() => {
    LESSONS.push(pickLesson)
  })
  afterAll(() => {
    LESSONS.splice(LESSONS.indexOf(pickLesson), 1)
  })
  beforeEach(() => {
    useLessonStore.setState({ done: new Set() })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records events from start, clears them on next and back, and stops on exit', () => {
    lessonEvent({ kind: 'undo' })
    expect(events()).toEqual({ recording: false, events: [] })
    lessons().start('test-picks')
    expect(events()).toEqual({ recording: true, events: [] })
    selectNode('b')
    lessonEvent({ kind: 'link-copied' })
    expect(events().events).toHaveLength(1)
    lessons().next()
    expect(lessons().active?.step).toBe(1)
    expect(events()).toEqual({ recording: true, events: [] })
    lessonEvent({ kind: 'link-copied' })
    lessons().back()
    expect(lessons().active?.step).toBe(0)
    expect(events()).toEqual({ recording: true, events: [] })
    lessonEvent({ kind: 'link-copied' })
    lessons().start('test-picks')
    expect(events()).toEqual({ recording: true, events: [] })
    lessonEvent({ kind: 'link-copied' })
    lessons().exit()
    expect(events()).toEqual({ recording: false, events: [] })
  })

  it('lessonContext reads the stores at call time', () => {
    lessons().start('test-picks')
    selectNode('c')
    useUiStore.getState().setSidePanelTab('analysis')
    lessonEvent({ kind: 'undo' })
    const ctx = lessonContext()
    expect(ctx.graph).toBe(graphStore().graph)
    expect(ctx.selection).toEqual({ kind: 'node', id: 'c' })
    expect(ctx.sidePanelTab).toBe('analysis')
    expect(ctx.analysisOn).toBe(useUiStore.getState().analysisOn)
    expect(ctx.events).toEqual([{ kind: 'undo' }])
    useUiStore.getState().setSidePanelTab('edit')
  })

  it('isStepDone uses the pick and the events', () => {
    lessons().start('test-picks')
    expect(isStepDone()).toBe(false)
    selectNode('a')
    expect(isStepDone()).toBe(false)
    selectNode('c')
    expect(isStepDone()).toBe(true)
    lessons().next()
    expect(isStepDone()).toBe(false)
    graphStore().moveNode('a', { x: 10, y: 10 })
    expect(isStepDone()).toBe(false)
    graphStore().undo()
    expect(isStepDone()).toBe(true)
    lessons().next()
    expect(lessons().active?.step).toBe(2)
    expect(isStepDone()).toBe(true)
  })

  it('records a wrong node selection in a pick step once', () => {
    lessons().start('test-picks')
    expect(lessons().wrongPicks).toEqual([])
    selectNode('a')
    expect(lessons().wrongPicks).toEqual(['A'])
    selectNode('a')
    expect(lessons().wrongPicks).toEqual(['A'])
    graphStore().select({ kind: 'edge', id: 'e1' })
    graphStore().select(null)
    expect(lessons().wrongPicks).toEqual(['A'])
    selectNode('d')
    expect(lessons().wrongPicks).toEqual(['A', 'D'])
    selectNode('a')
    expect(lessons().wrongPicks).toEqual(['A', 'D', 'A'])
  })

  it('does not record the answer, or any selection once the step is done', () => {
    lessons().start('test-picks')
    selectNode('b')
    expect(lessons().wrongPicks).toEqual([])
    selectNode('a')
    expect(lessons().wrongPicks).toEqual([])
    selectNode('c')
    expect(lessons().wrongPicks).toEqual([])
  })

  it('records no picks in a step without a pick, or after the lesson', () => {
    lessons().start('test-picks')
    selectNode('b')
    lessons().next()
    expect(lessons().wrongPicks).toEqual([])
    selectNode('a')
    expect(lessons().wrongPicks).toEqual([])
    lessons().exit()
    graphStore().replaceGraph(pickLesson.sample())
    selectNode('a')
    expect(lessons().wrongPicks).toEqual([])
  })

  it('next and back reset wrongPicks and revealed', () => {
    lessons().start('test-picks')
    selectNode('a')
    lessons().revealAnswer()
    expect(lessons().revealed).toBe(true)
    lessons().next()
    expect(lessons()).toMatchObject({ wrongPicks: [], revealed: false })
    useLessonStore.setState({ wrongPicks: ['X'], revealed: true })
    lessons().back()
    expect(lessons()).toMatchObject({ wrongPicks: [], revealed: false })
  })

  it('start resets wrongPicks and revealed', () => {
    lessons().start('test-picks')
    selectNode('a')
    lessons().revealAnswer()
    lessons().start('test-picks')
    expect(lessons()).toMatchObject({ wrongPicks: [], revealed: false })
  })

  it('revealAnswer selects the first answer and sets revealed', () => {
    lessons().start('test-picks')
    selectNode('a')
    selectNode('d')
    lessons().revealAnswer()
    expect(graphStore().selection).toEqual({ kind: 'node', id: 'b' })
    expect(lessons().revealed).toBe(true)
    expect(lessons().wrongPicks).toEqual(['A', 'D'])
    expect(isStepDone()).toBe(true)
  })

  it('revealAnswer does nothing in a step without a pick', () => {
    lessons().start('tour')
    lessons().revealAnswer()
    expect(lessons().revealed).toBe(false)
    expect(graphStore().selection).toBeNull()
  })

  it('finishing adds the id to done and writes it; closing does not', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
      },
    })
    useLessonStore.setState({ done: new Set(['tour']) })

    lessons().start('test-picks')
    selectNode('b')
    lessons().next()
    lessons().exit()
    expect(lessons().done).toEqual(new Set(['tour']))
    expect(data.has(LESSONS_DONE_KEY)).toBe(false)

    lessons().start('test-picks')
    selectNode('b')
    lessons().next()
    graphStore().moveNode('a', { x: 10, y: 10 })
    graphStore().undo()
    lessons().next()
    expect(lessons().done).toEqual(new Set(['tour']))
    lessons().next()
    expect(lessons().active).toBeNull()
    expect(graphStore().graph).toBe(mine)
    expect(lessons().done).toEqual(new Set(['test-picks', 'tour']))
    expect(data.get(LESSONS_DONE_KEY)).toBe('["test-picks","tour"]')
  })
})
