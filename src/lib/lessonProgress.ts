/**
 * Finished lessons, kept in this browser (spec 4.8 "Progress", phase 41). Every storage access is
 * guarded: a blocked storage only means the checkmarks are not remembered.
 */

/** localStorage key holding the ids of the finished lessons as a JSON array. */
export const LESSONS_DONE_KEY = 'graphcreator:lessons-done'

/**
 * The stored ids of finished lessons. Null or throwing storage, bad JSON or a non-array give an
 * empty set; items that are not strings are skipped.
 */
export function readLessonsDone(
  storage: Pick<Storage, 'getItem'> | null,
): Set<string> {
  const done = new Set<string>()
  if (storage === null) return done
  try {
    const text = storage.getItem(LESSONS_DONE_KEY)
    if (text === null) return done
    const stored: unknown = JSON.parse(text)
    if (!Array.isArray(stored)) return done
    for (const item of stored) if (typeof item === 'string') done.add(item)
    return done
  } catch {
    return new Set()
  }
}

/** Stores the ids, sorted, as a JSON array. A null or throwing storage is ignored. */
export function writeLessonsDone(
  storage: Pick<Storage, 'setItem'> | null,
  done: ReadonlySet<string>,
): void {
  if (storage === null) return
  try {
    storage.setItem(LESSONS_DONE_KEY, JSON.stringify([...done].sort()))
  } catch {
    // Storage full or blocked: the checkmarks are gone on the next visit.
  }
}
