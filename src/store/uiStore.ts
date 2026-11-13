import { create } from 'zustand'
import { safeLocalStorage } from '@/lib/welcome'

/** Canvas tool (spec 5.2). */
export type Tool = 'select' | 'add' | 'connect'
/** Autosave status shown by the saved indicator. `paused`: a lesson is running. */
export type AutosaveStatus = 'on' | 'blocked' | 'paused'

/** A section of the Analysis tab (spec 5.8); also the section order. */
export type AnalysisKey =
  'report' | 'adjustment' | 'paths' | 'instruments' | 'independencies'

/** The Analysis tab's sections, in display order. */
export const ANALYSIS_KEYS: readonly AnalysisKey[] = [
  'report',
  'adjustment',
  'paths',
  'instruments',
  'independencies',
]

/** localStorage key holding the Analysis section switches (a viewer preference). */
export const ANALYSIS_KEY = 'graphcreator:analysis'

/** Report and Adjustment sets on, the rest off. */
export const ANALYSIS_DEFAULTS: Record<AnalysisKey, boolean> = {
  report: true,
  adjustment: true,
  paths: false,
  instruments: false,
  independencies: false,
}

/** The side panel's two tabs (spec 5.8). */
export type SidePanelTab = 'edit' | 'analysis'

/**
 * The stored section switches: each key's stored boolean, else its default. Null or failing
 * storage and malformed JSON give the defaults.
 */
export function readAnalysisOn(
  storage: Pick<Storage, 'getItem'> | null,
): Record<AnalysisKey, boolean> {
  const on = { ...ANALYSIS_DEFAULTS }
  if (storage === null) return on
  try {
    const text = storage.getItem(ANALYSIS_KEY)
    if (text === null) return on
    const stored: unknown = JSON.parse(text)
    if (
      typeof stored !== 'object' ||
      stored === null ||
      Array.isArray(stored)
    ) {
      return on
    }
    const record = stored as Record<string, unknown>
    for (const key of ANALYSIS_KEYS) {
      const value = record[key]
      if (typeof value === 'boolean') on[key] = value
    }
    return on
  } catch {
    return { ...ANALYSIS_DEFAULTS }
  }
}

/** Stores the section switches. A null or failing storage only means they are not remembered. */
export function writeAnalysisOn(
  storage: Pick<Storage, 'setItem'> | null,
  on: Record<AnalysisKey, boolean>,
): void {
  if (storage === null) return
  try {
    storage.setItem(ANALYSIS_KEY, JSON.stringify(on))
  } catch {
    // Storage full or blocked: the switches reset to the defaults on the next visit.
  }
}

/** localStorage key holding the "Include GraphCreator details" checkbox of Save as dagitty. */
export const DAGITTY_DETAILS_KEY = 'graphcreator:dagitty-details'

/** The stored dagitty-details choice: true only for `'1'`. Null or failing storage gives false. */
export function readDagittyDetails(
  storage: Pick<Storage, 'getItem'> | null,
): boolean {
  if (storage === null) return false
  try {
    return storage.getItem(DAGITTY_DETAILS_KEY) === '1'
  } catch {
    return false
  }
}

/** Stores the dagitty-details choice as `'1'` or `'0'`; null or failing storage is ignored. */
export function writeDagittyDetails(
  storage: Pick<Storage, 'setItem'> | null,
  on: boolean,
): void {
  if (storage === null) return
  try {
    storage.setItem(DAGITTY_DETAILS_KEY, on ? '1' : '0')
  } catch {
    // Storage full or blocked: the checkbox is off again on the next visit.
  }
}

/** localStorage key holding whether the editors' Simulation section is open (spec 5.9). */
export const SIMULATION_OPEN_KEY = 'graphcreator:simulation-open'

/** The stored Simulation section state: true only for `'1'`. Null or failing storage gives false. */
export function readSimulationOpen(
  storage: Pick<Storage, 'getItem'> | null,
): boolean {
  if (storage === null) return false
  try {
    return storage.getItem(SIMULATION_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Stores the Simulation section state as `'1'` or `'0'`; null or failing storage is ignored. */
export function writeSimulationOpen(
  storage: Pick<Storage, 'setItem'> | null,
  open: boolean,
): void {
  if (storage === null) return
  try {
    storage.setItem(SIMULATION_OPEN_KEY, open ? '1' : '0')
  } catch {
    // Storage full or blocked: the section is closed again on the next visit.
  }
}

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
  /** Side panel tab; default 'edit'. Not remembered across reloads. */
  sidePanelTab: SidePanelTab
  /** Analysis section switches; initial value from `readAnalysisOn(safeLocalStorage())`. */
  analysisOn: Record<AnalysisKey, boolean>
  /** Nodes a hovered or focused Analysis item points at; default []. */
  hoverNodeIds: string[]
  setSidePanelTab(tab: SidePanelTab): void
  /** Also writes all switches with `writeAnalysisOn`. */
  setAnalysisOn(key: AnalysisKey, on: boolean): void
  setHoverNodeIds(ids: string[]): void
  /** Save as dagitty's "Include GraphCreator details"; initial value from `readDagittyDetails`. */
  dagittyDetails: boolean
  /** Also writes it with `writeDagittyDetails`. */
  setDagittyDetails(on: boolean): void
  /** The editors' Simulation section is open (spec 5.9); initial value from `readSimulationOpen`. */
  simulationOpen: boolean
  /** Also writes it with `writeSimulationOpen`. */
  setSimulationOpen(open: boolean): void
  /** Lessons dialog visibility (spec 5.7.11); default false. */
  lessonsOpen: boolean
  openLessons(): void
  closeLessons(): void
  /**
   * The name being typed in the node editor, shown on the circle while it differs from the
   * stored name (spec 4.17, 5.3). Null when no name is being edited.
   */
  namePreview: { id: string; name: string } | null
  setNamePreview(preview: { id: string; name: string } | null): void
}

export const useUiStore = create<UiState>()((set, get) => ({
  tool: 'select',
  connectFrom: null,
  welcomeOpen: false,
  welcomeSlide: 0,
  autosave: 'on',
  sidePanelTab: 'edit',
  analysisOn: readAnalysisOn(safeLocalStorage()),
  hoverNodeIds: [],
  dagittyDetails: readDagittyDetails(safeLocalStorage()),
  simulationOpen: readSimulationOpen(safeLocalStorage()),
  lessonsOpen: false,
  namePreview: null,

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

  setSidePanelTab(tab) {
    set({ sidePanelTab: tab })
  },

  setAnalysisOn(key, on) {
    const analysisOn = { ...get().analysisOn, [key]: on }
    writeAnalysisOn(safeLocalStorage(), analysisOn)
    set({ analysisOn })
  },

  setHoverNodeIds(ids) {
    set({ hoverNodeIds: ids })
  },

  setDagittyDetails(on) {
    writeDagittyDetails(safeLocalStorage(), on)
    set({ dagittyDetails: on })
  },

  setSimulationOpen(open) {
    writeSimulationOpen(safeLocalStorage(), open)
    set({ simulationOpen: open })
  },

  openLessons() {
    set({ lessonsOpen: true })
  },

  closeLessons() {
    set({ lessonsOpen: false })
  },

  setNamePreview(preview) {
    set({ namePreview: preview })
  },
}))
