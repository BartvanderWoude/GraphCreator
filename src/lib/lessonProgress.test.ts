import { describe, expect, it } from 'vitest'
import {
  LESSONS_DONE_KEY,
  readLessonsDone,
  writeLessonsDone,
} from './lessonProgress'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('lessonProgress', () => {
  it('uses the spec key', () => {
    expect(LESSONS_DONE_KEY).toBe('graphcreator:lessons-done')
  })

  it('round-trips the ids, written sorted', () => {
    const storage = memoryStorage()
    writeLessonsDone(storage, new Set(['tour', 'confounding', 'adjustment']))
    expect(storage.data.get(LESSONS_DONE_KEY)).toBe(
      '["adjustment","confounding","tour"]',
    )
    expect(readLessonsDone(storage)).toEqual(
      new Set(['adjustment', 'confounding', 'tour']),
    )
  })

  it('reads an empty set from empty, null or throwing storage', () => {
    expect(readLessonsDone(memoryStorage())).toEqual(new Set())
    expect(readLessonsDone(null)).toEqual(new Set())
    expect(readLessonsDone(throwing)).toEqual(new Set())
  })

  it('reads an empty set from bad JSON or a non-array', () => {
    for (const text of ['[tour', '{"tour": true}', '"tour"', '3', 'null']) {
      expect(
        readLessonsDone(memoryStorage({ [LESSONS_DONE_KEY]: text })),
      ).toEqual(new Set())
    }
  })

  it('skips items that are not strings', () => {
    const storage = memoryStorage({
      [LESSONS_DONE_KEY]: '["tour", 3, null, {"id": "x"}, ["y"], "latent"]',
    })
    expect(readLessonsDone(storage)).toEqual(new Set(['tour', 'latent']))
  })

  it('writing ignores null or throwing storage', () => {
    expect(() => writeLessonsDone(null, new Set(['tour']))).not.toThrow()
    expect(() => writeLessonsDone(throwing, new Set(['tour']))).not.toThrow()
  })
})
