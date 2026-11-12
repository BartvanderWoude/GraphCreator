import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANALYSIS_DEFAULTS,
  ANALYSIS_KEY,
  ANALYSIS_KEYS,
  DAGITTY_DETAILS_KEY,
  readAnalysisOn,
  readDagittyDetails,
  readSimulationOpen,
  SIMULATION_OPEN_KEY,
  useUiStore,
  writeAnalysisOn,
  writeDagittyDetails,
  writeSimulationOpen,
} from './uiStore'

const ui = () => useUiStore.getState()
const initial = useUiStore.getState()

beforeEach(() => {
  useUiStore.setState(initial, true)
})

describe('uiStore', () => {
  it('has the defaults of spec 4.7', () => {
    expect(ui()).toMatchObject({
      tool: 'select',
      connectFrom: null,
      welcomeOpen: false,
      welcomeSlide: 0,
      autosave: 'on',
    })
  })

  it('setTool sets the tool and clears connectFrom', () => {
    ui().setTool('connect')
    ui().pickConnectSource('n1')
    expect(ui().connectFrom).toBe('n1')
    ui().setTool('connect')
    expect(ui()).toMatchObject({ tool: 'connect', connectFrom: null })
    ui().pickConnectSource('n2')
    ui().setTool('select')
    expect(ui()).toMatchObject({ tool: 'select', connectFrom: null })
  })

  it('pickConnectSource sets and clears the picked source', () => {
    ui().pickConnectSource('n3')
    expect(ui().connectFrom).toBe('n3')
    ui().pickConnectSource(null)
    expect(ui().connectFrom).toBeNull()
  })

  it('openWelcome opens at slide 0 and closeWelcome closes', () => {
    ui().setWelcomeSlide(2)
    ui().openWelcome()
    expect(ui()).toMatchObject({ welcomeOpen: true, welcomeSlide: 0 })
    ui().setWelcomeSlide(3)
    ui().closeWelcome()
    expect(ui().welcomeOpen).toBe(false)
    ui().openWelcome()
    expect(ui().welcomeSlide).toBe(0)
  })

  it('setWelcomeSlide clamps to 0..3', () => {
    ui().setWelcomeSlide(2)
    expect(ui().welcomeSlide).toBe(2)
    ui().setWelcomeSlide(7)
    expect(ui().welcomeSlide).toBe(3)
    ui().setWelcomeSlide(-1)
    expect(ui().welcomeSlide).toBe(0)
  })

  it('setAutosave sets the status', () => {
    ui().setAutosave('paused')
    expect(ui().autosave).toBe('paused')
    ui().setAutosave('blocked')
    expect(ui().autosave).toBe('blocked')
  })

  it('openLessons and closeLessons set lessonsOpen, which is false at first', () => {
    expect(ui().lessonsOpen).toBe(false)
    ui().openLessons()
    expect(ui().lessonsOpen).toBe(true)
    ui().openLessons()
    expect(ui().lessonsOpen).toBe(true)
    ui().closeLessons()
    expect(ui().lessonsOpen).toBe(false)
  })
})

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

describe('uiStore analysis state', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has the defaults of spec 4.14', () => {
    expect(ANALYSIS_KEYS).toEqual([
      'report',
      'adjustment',
      'paths',
      'instruments',
      'independencies',
    ])
    expect(ANALYSIS_DEFAULTS).toEqual({
      report: true,
      adjustment: true,
      paths: false,
      instruments: false,
      independencies: false,
    })
    expect(ui()).toMatchObject({
      sidePanelTab: 'edit',
      analysisOn: ANALYSIS_DEFAULTS,
      hoverNodeIds: [],
    })
  })

  it('setSidePanelTab switches the tab', () => {
    ui().setSidePanelTab('analysis')
    expect(ui().sidePanelTab).toBe('analysis')
    ui().setSidePanelTab('edit')
    expect(ui().sidePanelTab).toBe('edit')
  })

  it('setHoverNodeIds sets and clears the hovered nodes', () => {
    ui().setHoverNodeIds(['n1', 'n2'])
    expect(ui().hoverNodeIds).toEqual(['n1', 'n2'])
    ui().setHoverNodeIds([])
    expect(ui().hoverNodeIds).toEqual([])
  })

  it('setAnalysisOn sets one switch and writes all of them', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    ui().setAnalysisOn('paths', true)
    expect(ui().analysisOn).toEqual({ ...ANALYSIS_DEFAULTS, paths: true })
    ui().setAnalysisOn('report', false)
    const expected = { ...ANALYSIS_DEFAULTS, paths: true, report: false }
    expect(ui().analysisOn).toEqual(expected)
    expect(JSON.parse(storage.data.get(ANALYSIS_KEY) ?? 'null')).toEqual(
      expected,
    )
  })

  it('setAnalysisOn works without storage', () => {
    ui().setAnalysisOn('instruments', true)
    expect(ui().analysisOn.instruments).toBe(true)
  })
})

describe('readAnalysisOn and writeAnalysisOn', () => {
  it('give the defaults for null, throwing, empty or malformed storage', () => {
    expect(readAnalysisOn(null)).toEqual(ANALYSIS_DEFAULTS)
    expect(readAnalysisOn(throwing)).toEqual(ANALYSIS_DEFAULTS)
    expect(readAnalysisOn(memoryStorage())).toEqual(ANALYSIS_DEFAULTS)
    for (const bad of ['{', 'null', '[true]', '"on"', '42']) {
      expect(readAnalysisOn(memoryStorage({ [ANALYSIS_KEY]: bad }))).toEqual(
        ANALYSIS_DEFAULTS,
      )
    }
  })

  it('keeps known boolean keys from partial JSON', () => {
    const stored = JSON.stringify({
      paths: true,
      report: false,
      instruments: 'yes',
      colour: true,
    })
    expect(readAnalysisOn(memoryStorage({ [ANALYSIS_KEY]: stored }))).toEqual({
      ...ANALYSIS_DEFAULTS,
      paths: true,
      report: false,
    })
  })

  it('returns a fresh object, not the defaults themselves', () => {
    const on = readAnalysisOn(null)
    on.paths = true
    expect(ANALYSIS_DEFAULTS.paths).toBe(false)
  })

  it('round-trips through writeAnalysisOn and ignores null or throwing storage', () => {
    const storage = memoryStorage()
    const on = { ...ANALYSIS_DEFAULTS, independencies: true }
    writeAnalysisOn(storage, on)
    expect(readAnalysisOn(storage)).toEqual(on)
    expect(() => writeAnalysisOn(null, on)).not.toThrow()
    expect(() => writeAnalysisOn(throwing, on)).not.toThrow()
  })
})

describe('dagitty details choice', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is off by default and for null, throwing or unknown storage', () => {
    expect(ui().dagittyDetails).toBe(false)
    expect(readDagittyDetails(null)).toBe(false)
    expect(readDagittyDetails(throwing)).toBe(false)
    expect(readDagittyDetails(memoryStorage())).toBe(false)
    expect(
      readDagittyDetails(memoryStorage({ [DAGITTY_DETAILS_KEY]: 'yes' })),
    ).toBe(false)
    expect(
      readDagittyDetails(memoryStorage({ [DAGITTY_DETAILS_KEY]: '1' })),
    ).toBe(true)
  })

  it('setDagittyDetails writes 1 and 0', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    ui().setDagittyDetails(true)
    expect(ui().dagittyDetails).toBe(true)
    expect(storage.data.get(DAGITTY_DETAILS_KEY)).toBe('1')
    ui().setDagittyDetails(false)
    expect(ui().dagittyDetails).toBe(false)
    expect(storage.data.get(DAGITTY_DETAILS_KEY)).toBe('0')
  })

  it('writeDagittyDetails ignores null or throwing storage', () => {
    expect(() => writeDagittyDetails(null, true)).not.toThrow()
    expect(() => writeDagittyDetails(throwing, true)).not.toThrow()
  })
})

describe('Simulation section state (phase 49)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is closed by default and for null, throwing or unknown storage', () => {
    expect(SIMULATION_OPEN_KEY).toBe('graphcreator:simulation-open')
    expect(ui().simulationOpen).toBe(false)
    expect(readSimulationOpen(null)).toBe(false)
    expect(readSimulationOpen(throwing)).toBe(false)
    expect(readSimulationOpen(memoryStorage())).toBe(false)
    expect(
      readSimulationOpen(memoryStorage({ [SIMULATION_OPEN_KEY]: 'true' })),
    ).toBe(false)
    expect(
      readSimulationOpen(memoryStorage({ [SIMULATION_OPEN_KEY]: '0' })),
    ).toBe(false)
    expect(
      readSimulationOpen(memoryStorage({ [SIMULATION_OPEN_KEY]: '1' })),
    ).toBe(true)
  })

  it('setSimulationOpen writes 1 and 0', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    ui().setSimulationOpen(true)
    expect(ui().simulationOpen).toBe(true)
    expect(storage.data.get(SIMULATION_OPEN_KEY)).toBe('1')
    expect(readSimulationOpen(storage)).toBe(true)
    ui().setSimulationOpen(false)
    expect(ui().simulationOpen).toBe(false)
    expect(storage.data.get(SIMULATION_OPEN_KEY)).toBe('0')
  })

  it('writeSimulationOpen ignores null or throwing storage', () => {
    expect(() => writeSimulationOpen(null, true)).not.toThrow()
    expect(() => writeSimulationOpen(throwing, true)).not.toThrow()
  })
})
