import { beforeEach, describe, expect, it } from 'vitest'
import { tourLesson } from '@/lessons'
import { emptyGraph, type Graph } from '@/model/graph'
import { useGraphStore } from './graphStore'
import { isStepDone, useLessonStore } from './lessonStore'

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
