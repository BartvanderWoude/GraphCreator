import { beforeEach, describe, expect, it } from 'vitest'
import { THEME_KEY, readTheme, useThemeStore, writeTheme } from './themeStore'

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

const initial = useThemeStore.getState()

beforeEach(() => {
  useThemeStore.setState(initial, true)
})

describe('readTheme', () => {
  it('is light by default', () => {
    expect(readTheme(memoryStorage())).toBe('light')
    expect(readTheme(null)).toBe('light')
  })

  it('reads a stored dark theme', () => {
    expect(readTheme(memoryStorage({ [THEME_KEY]: 'dark' }))).toBe('dark')
  })

  it('treats anything else, and a failing storage, as light', () => {
    expect(readTheme(memoryStorage({ [THEME_KEY]: 'system' }))).toBe('light')
    expect(readTheme(throwing)).toBe('light')
  })
})

describe('writeTheme', () => {
  it('stores the theme under graphcreator:theme', () => {
    const storage = memoryStorage()
    writeTheme(storage, 'dark')
    expect(storage.data.get('graphcreator:theme')).toBe('dark')
  })

  it('ignores a null or failing storage', () => {
    expect(() => writeTheme(null, 'dark')).not.toThrow()
    expect(() => writeTheme(throwing, 'dark')).not.toThrow()
  })
})

describe('useThemeStore', () => {
  it('starts light without a DOM or storage', () => {
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('setTheme switches the theme', () => {
    useThemeStore.getState().setTheme('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
  })
})
