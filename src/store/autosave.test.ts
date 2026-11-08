import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import smoking from '@/model/__fixtures__/smoking.dag.yaml?raw'
import { emptyGraph } from '@/model/graph'
import { toYaml } from '@/model/yaml'
import { useGraphStore } from './graphStore'
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

let stop: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  toastMock.mockClear()
  store().replaceGraph(emptyGraph())
})

afterEach(() => {
  stop?.()
  stop = null
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
