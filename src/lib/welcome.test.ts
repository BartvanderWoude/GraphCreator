import { describe, expect, it } from 'vitest'
import {
  hasBeenWelcomed,
  markWelcomed,
  safeLocalStorage,
  WELCOMED_KEY,
} from './welcome'

/** In-memory stand-in for localStorage. */
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> & {
  data: Map<string, string>
} {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

/** A storage whose every access throws, like a blocked localStorage. */
const throwingStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('welcome flag', () => {
  it('uses the key graphcreator:welcomed', () => {
    expect(WELCOMED_KEY).toBe('graphcreator:welcomed')
  })

  it('is unwelcomed by default', () => {
    expect(hasBeenWelcomed(fakeStorage())).toBe(false)
  })

  it('markWelcomed writes "1", after which hasBeenWelcomed is true', () => {
    const storage = fakeStorage()
    markWelcomed(storage)
    expect(storage.data.get(WELCOMED_KEY)).toBe('1')
    expect(hasBeenWelcomed(storage)).toBe(true)
  })

  it('ignores other values under the key', () => {
    const storage = fakeStorage()
    storage.setItem(WELCOMED_KEY, 'yes')
    expect(hasBeenWelcomed(storage)).toBe(false)
  })

  it('gives false and no exception for a null storage', () => {
    expect(hasBeenWelcomed(null)).toBe(false)
    expect(() => markWelcomed(null)).not.toThrow()
  })

  it('gives false and no exception for a storage that throws', () => {
    expect(hasBeenWelcomed(throwingStorage)).toBe(false)
    expect(() => markWelcomed(throwingStorage)).not.toThrow()
  })

  it('safeLocalStorage returns null instead of throwing when there is no window', () => {
    // Vitest runs in Node, where `window` is not defined.
    expect(safeLocalStorage()).toBeNull()
  })
})
