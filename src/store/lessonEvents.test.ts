import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearEvents,
  lessonEvent,
  startRecording,
  stopRecording,
  useLessonEvents,
} from './lessonEvents'

const log = () => useLessonEvents.getState()

beforeEach(() => {
  stopRecording()
})

describe('lessonEvents', () => {
  it('does not record at first', () => {
    expect(log()).toEqual({ recording: false, events: [] })
    lessonEvent({ kind: 'undo' })
    expect(log().events).toEqual([])
  })

  it('records in order while recording', () => {
    startRecording()
    expect(log()).toEqual({ recording: true, events: [] })
    lessonEvent({ kind: 'code-opened', format: 'yaml' })
    lessonEvent({ kind: 'undo' })
    expect(log().events).toEqual([
      { kind: 'code-opened', format: 'yaml' },
      { kind: 'undo' },
    ])
  })

  it('startRecording starts with an empty log', () => {
    startRecording()
    lessonEvent({ kind: 'undo' })
    startRecording()
    expect(log().events).toEqual([])
  })

  it('clearEvents empties the log but keeps recording', () => {
    startRecording()
    lessonEvent({ kind: 'link-copied' })
    clearEvents()
    expect(log()).toEqual({ recording: true, events: [] })
    lessonEvent({ kind: 'edge-refused', format: 'cycle' })
    expect(log().events).toEqual([{ kind: 'edge-refused', format: 'cycle' }])
  })

  it('records nothing after stopRecording, which also empties the log', () => {
    startRecording()
    lessonEvent({ kind: 'undo' })
    stopRecording()
    expect(log()).toEqual({ recording: false, events: [] })
    lessonEvent({ kind: 'export-downloaded', format: 'pdf' })
    expect(log().events).toEqual([])
  })

  it('replaces the events array instead of mutating it', () => {
    startRecording()
    const before = log().events
    lessonEvent({ kind: 'undo' })
    expect(before).toEqual([])
    expect(log().events).not.toBe(before)
  })
})
