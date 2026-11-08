import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './uiStore'

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
})
