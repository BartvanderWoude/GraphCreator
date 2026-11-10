import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import smoking from '@/model/__fixtures__/smoking.dag.yaml?raw'
import { emptyGraph } from '@/model/graph'
import { toYaml } from '@/model/yaml'
import { useGraphStore } from './graphStore'
import { useLessonStore } from './lessonStore'
import { useUiStore } from './uiStore'
import { AUTOSAVE_KEY, RESTORE_FAILED_MESSAGE, startAutosave } from './autosave'

const toastMock = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: toastMock }))

/** In-memory stand-in for localStorage that records every write. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
  }
}

const store = () => useGraphStore.getState()
const lesson = () => useLessonStore.getState()
const status = () => useUiStore.getState().autosave

let stop: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  toastMock.mockClear()
  store().replaceGraph(emptyGraph())
  useUiStore.getState().setAutosave('on')
})

afterEach(() => {
  stop?.()
  stop = null
  lesson().exit()
  vi.useRealTimers()
})

describe('startAutosave: restore', () => {
  it('restores a stored graph on start', () => {
    const storage = fakeStorage({ [AUTOSAVE_KEY]: smoking })
    stop = startAutosave(storage)
    expect(store().graph.name).toBe('Smoking and birth weight')
    expect(store().graph.nodes.map((n) => n.name)).toEqual([
      'Maternal smoking',
      'Birth weight',
      'SES',
      'Genetic factors',
    ])
    expect(toYaml(store().graph)).toBe(smoking)
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('does not write just because it restored', () => {
    const storage = fakeStorage({ [AUTOSAVE_KEY]: smoking })
    stop = startAutosave(storage)
    vi.advanceTimersByTime(2000)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('keeps the empty graph when nothing is stored', () => {
    const cases: Record<string, string>[] = [{}, { [AUTOSAVE_KEY]: '' }]
    for (const initial of cases) {
      const storage = fakeStorage(initial)
      stop = startAutosave(storage)
      expect(store().graph).toEqual(emptyGraph())
      stop()
    }
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('falls back to an empty graph with a toast when the text is corrupt', () => {
    for (const bad of ['schema: graphcreator/9.9\n', 'nodes: [', 'schema: x']) {
      toastMock.mockClear()
      store().replaceGraph(emptyGraph())
      const storage = fakeStorage({ [AUTOSAVE_KEY]: bad })
      stop = startAutosave(storage)
      expect(store().graph).toEqual(emptyGraph())
      expect(toastMock).toHaveBeenCalledExactlyOnceWith(RESTORE_FAILED_MESSAGE)
      // The bad text stays until the user changes something.
      vi.advanceTimersByTime(2000)
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(storage.data.get(AUTOSAVE_KEY)).toBe(bad)
      stop()
    }
  })

  it('treats a getItem that throws as "nothing stored"', () => {
    const storage = fakeStorage()
    storage.getItem.mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => (stop = startAutosave(storage))).not.toThrow()
    expect(store().graph).toEqual(emptyGraph())
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('does nothing with null storage', () => {
    stop = startAutosave(null)
    store().addNodeAt({ x: 0, y: 0 })
    vi.advanceTimersByTime(2000)
    expect(toastMock).not.toHaveBeenCalled()
  })
})

describe('startAutosave: writing', () => {
  it('writes the toYaml text 500 ms after a change', () => {
    const storage = fakeStorage()
    stop = startAutosave(storage)
    store().addNodeAt({ x: 10, y: 20 })
    vi.advanceTimersByTime(499)
    expect(storage.setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      AUTOSAVE_KEY,
      toYaml(store().graph),
    )
  })

  it('coalesces a burst of changes into one write of the latest graph', () => {
    const storage = fakeStorage()
    stop = startAutosave(storage)
    const id = store().addNodeAt({ x: 0, y: 0 })
    vi.advanceTimersByTime(300)
    store().renameNode(id, 'Age')
    vi.advanceTimersByTime(300)
    store().updateNode(id, { varType: 'continuous' })
    vi.advanceTimersByTime(499)
    expect(storage.setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.data.get(AUTOSAVE_KEY)).toBe(toYaml(store().graph))
    expect(storage.data.get(AUTOSAVE_KEY)).toContain('var_type: continuous')
  })

  it('ignores store changes that leave the graph alone', () => {
    const storage = fakeStorage()
    stop = startAutosave(storage)
    const id = store().addNodeAt({ x: 0, y: 0 })
    vi.advanceTimersByTime(500)
    storage.setItem.mockClear()
    store().select(null)
    store().select({ kind: 'node', id })
    store().clearFocusName()
    vi.advanceTimersByTime(2000)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('swallows a setItem that throws and keeps trying on later changes', () => {
    const storage = fakeStorage()
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })
    stop = startAutosave(storage)
    store().addNodeAt({ x: 0, y: 0 })
    expect(() => vi.advanceTimersByTime(500)).not.toThrow()
    expect(storage.data.has(AUTOSAVE_KEY)).toBe(false)
    store().addNodeAt({ x: 200, y: 0 })
    vi.advanceTimersByTime(500)
    expect(storage.data.get(AUTOSAVE_KEY)).toBe(toYaml(store().graph))
  })

  it('stops writing and cancels a pending write after unsubscribing', () => {
    const storage = fakeStorage()
    const unsubscribe = startAutosave(storage)
    store().addNodeAt({ x: 0, y: 0 })
    vi.advanceTimersByTime(200)
    unsubscribe()
    vi.advanceTimersByTime(1000)
    store().addNodeAt({ x: 200, y: 0 })
    vi.advanceTimersByTime(1000)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})

describe('startAutosave: lessons and status', () => {
  /** A user graph with one node named "Age", written to storage. */
  function userGraphStored(storage: ReturnType<typeof fakeStorage>) {
    const id = store().addNodeAt({ x: 0, y: 0 })
    store().renameNode(id, 'Age')
    vi.advanceTimersByTime(500)
    expect(storage.data.get(AUTOSAVE_KEY)).toContain('name: Age')
    storage.setItem.mockClear()
  }

  it('never writes while a lesson is active', () => {
    const storage = fakeStorage()
    stop = startAutosave(storage)
    userGraphStored(storage)

    lesson().start('tour')
    const id = store().addNodeAt({ x: 0, y: 0 })
    store().renameNode(id, 'Smoking')
    vi.advanceTimersByTime(5000)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.data.get(AUTOSAVE_KEY)).toContain('name: Age')
    expect(storage.data.get(AUTOSAVE_KEY)).not.toContain('Smoking')
  })

  it('flushes a pending write of the user graph when a lesson starts', () => {
    const storage = fakeStorage()
    stop = startAutosave(storage)
    const id = store().addNodeAt({ x: 0, y: 0 })
    store().renameNode(id, 'Age')
    vi.advanceTimersByTime(100)
    expect(storage.setItem).not.toHaveBeenCalled()

    lesson().start('tour')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.data.get(AUTOSAVE_KEY)).toContain('name: Age')
    // The practice graph (empty) replaced it in the store, but is not written.
    expect(store().graph.nodes).toHaveLength(0)
    vi.advanceTimersByTime(5000)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('writes the user graph again after the lesson ends', () => {
    const storage = fakeStorage()
    stop = startAutosave(storage)
    userGraphStored(storage)
    const userYaml = toYaml(store().graph)

    lesson().start('tour')
    store().addNodeAt({ x: 0, y: 0 })
    // Something else overwrote the stored text in the meantime.
    storage.data.set(AUTOSAVE_KEY, 'stale')
    lesson().exit()
    expect(toYaml(store().graph)).toBe(userYaml)
    vi.advanceTimersByTime(500)
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      AUTOSAVE_KEY,
      userYaml,
    )
  })

  it('does not write when a lesson starts with nothing pending', () => {
    const storage = fakeStorage()
    stop = startAutosave(storage)
    userGraphStored(storage)
    lesson().start('tour')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('is on with storage and paused during a lesson', () => {
    stop = startAutosave(fakeStorage())
    expect(status()).toBe('on')
    lesson().start('tour')
    expect(status()).toBe('paused')
    lesson().exit()
    expect(status()).toBe('on')
  })

  it('is blocked without storage, and paused during a lesson', () => {
    stop = startAutosave(null)
    expect(status()).toBe('blocked')
    lesson().start('tour')
    expect(status()).toBe('paused')
    lesson().exit()
    expect(status()).toBe('blocked')
  })

  it('is blocked after a write throws and on again after a write succeeds', () => {
    const storage = fakeStorage()
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })
    stop = startAutosave(storage)
    store().addNodeAt({ x: 0, y: 0 })
    vi.advanceTimersByTime(500)
    expect(status()).toBe('blocked')
    store().addNodeAt({ x: 200, y: 0 })
    vi.advanceTimersByTime(500)
    expect(status()).toBe('on')
  })

  it('takes a lesson that is already running into account at start', () => {
    lesson().start('tour')
    const storage = fakeStorage()
    stop = startAutosave(storage)
    expect(status()).toBe('paused')
    store().addNodeAt({ x: 0, y: 0 })
    vi.advanceTimersByTime(500)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
