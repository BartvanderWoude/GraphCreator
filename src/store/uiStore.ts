import { create } from 'zustand'

/** Canvas tool (spec 5.2). */
export type Tool = 'select' | 'add' | 'connect'
/** Autosave status shown by the saved indicator. `paused`: a lesson is running. */
export type AutosaveStatus = 'on' | 'blocked' | 'paused'

/** Index of the last welcome slide (four slides, spec 5.7.9). */
const LAST_WELCOME_SLIDE = 3

/** Editor state that is not part of the graph (spec 4.7). Never autosaved. */
export interface UiState {
  /** Default 'select'. */
  tool: Tool
  /** Node id picked first in connect mode; null otherwise. */
  connectFrom: string | null
  /** WelcomeDialog visibility; default false. */
  welcomeOpen: boolean
  /** 0..3; default 0. */
  welcomeSlide: number
  /** Default 'on'; set by autosave.ts (phase 16). */
  autosave: AutosaveStatus
  /** Also clears `connectFrom`. */
  setTool(tool: Tool): void
  pickConnectSource(nodeId: string | null): void
  /** `welcomeOpen = true`, `welcomeSlide = 0`. */
  openWelcome(): void
  closeWelcome(): void
  /** Clamped to 0..3. */
  setWelcomeSlide(index: number): void
  setAutosave(status: AutosaveStatus): void
}

export const useUiStore = create<UiState>()((set) => ({
  tool: 'select',
  connectFrom: null,
  welcomeOpen: false,
  welcomeSlide: 0,
  autosave: 'on',

  setTool(tool) {
    set({ tool, connectFrom: null })
  },

  pickConnectSource(nodeId) {
    set({ connectFrom: nodeId })
  },

  openWelcome() {
    set({ welcomeOpen: true, welcomeSlide: 0 })
  },

  closeWelcome() {
    set({ welcomeOpen: false })
  },

  setWelcomeSlide(index) {
    set({
      welcomeSlide: Math.min(LAST_WELCOME_SLIDE, Math.max(0, index)),
    })
  },

  setAutosave(status) {
    set({ autosave: status })
  },
}))
