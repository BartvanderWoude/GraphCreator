/**
 * First-visit flag for the welcome slides (spec 5.7.9). Every storage access is guarded: a
 * blocked storage only means the slides show again on the next visit.
 */

/** localStorage key that is set to '1' once the welcome slides have been closed. */
export const WELCOMED_KEY = 'graphcreator:welcomed'

/** `window.localStorage`, or null when there is none or the browser blocks access to it. */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

/** Whether the welcome slides were closed before. False when storage is null or throws. */
export function hasBeenWelcomed(
  storage: Pick<Storage, 'getItem'> | null,
): boolean {
  if (storage === null) return false
  try {
    return storage.getItem(WELCOMED_KEY) === '1'
  } catch {
    return false
  }
}

/** Records that the welcome slides were closed. Ignores a null or failing storage. */
export function markWelcomed(storage: Pick<Storage, 'setItem'> | null): void {
  if (storage === null) return
  try {
    storage.setItem(WELCOMED_KEY, '1')
  } catch {
    // Storage full or blocked: the slides show again on the next visit.
  }
}
