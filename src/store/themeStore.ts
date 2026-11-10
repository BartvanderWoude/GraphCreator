import { create } from 'zustand'
import { safeLocalStorage } from '@/lib/welcome'

/** The two themes (spec 5.7.2). Light is the default, whatever the system setting. */
export type Theme = 'light' | 'dark'

/** localStorage key holding the chosen theme. `index.html` reads it too, before the app loads. */
export const THEME_KEY = 'graphcreator:theme'

/** The stored theme: 'dark' only when that was chosen; anything else, or no storage, is light. */
export function readTheme(storage: Pick<Storage, 'getItem'> | null): Theme {
  if (storage === null) return 'light'
  try {
    return storage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Stores the theme. A null or failing storage only means the choice is not remembered. */
export function writeTheme(
  storage: Pick<Storage, 'setItem'> | null,
  theme: Theme,
): void {
  if (storage === null) return
  try {
    storage.setItem(THEME_KEY, theme)
  } catch {
    // Storage full or blocked: the theme resets to light on the next visit.
  }
}

/**
 * Puts `theme` on the page: the `dark` class on `<html>` (which switches the CSS tokens in
 * `src/index.css`) and the matching `color-scheme`. With `instant`, colour transitions are
 * switched off for a moment, so the whole page changes at once. Does nothing without a DOM.
 */
export function applyTheme(theme: Theme, instant = false): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  let pause: HTMLStyleElement | null = null
  if (instant) {
    pause = document.createElement('style')
    pause.textContent = '*,*::before,*::after{transition:none!important}'
    document.head.appendChild(pause)
  }
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  if (pause !== null) {
    // Force a style recalculation before transitions come back.
    void window.getComputedStyle(root).colorScheme
    // A timer, not requestAnimationFrame: frames don't run in a background tab.
    const style = pause
    setTimeout(() => style.remove(), 1)
  }
}

interface ThemeState {
  theme: Theme
  /** Switches the theme, stores it and applies it to the page. */
  setTheme(theme: Theme): void
}

/** The current theme (spec 5.7.2), read from localStorage when the app starts. */
export const useThemeStore = create<ThemeState>()((set) => ({
  theme: readTheme(safeLocalStorage()),
  setTheme(theme) {
    writeTheme(safeLocalStorage(), theme)
    applyTheme(theme, true)
    set({ theme })
  },
}))
