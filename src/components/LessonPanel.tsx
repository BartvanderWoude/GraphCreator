import { useEffect, useRef } from 'react'
import { useReactFlow, type Viewport } from '@xyflow/react'
import { CircleCheck, Lightbulb, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { findLesson } from '@/lessons'
import { stepDone } from '@/lessons/helpers'
import { useGraphStore } from '@/store/graphStore'
import { useLessonEvents } from '@/store/lessonEvents'
import { lessonContext, useLessonStore } from '@/store/lessonStore'
import { useUiStore } from '@/store/uiStore'

/** Whether to show ⌘ for Ctrl: on a Mac, as the tool rail does (spec 5.1, 5.7.10). */
function isMac(): boolean {
  try {
    return /Mac|iPhone|iPad/.test(navigator.userAgent)
  } catch {
    return false
  }
}

/** A body or task as shown: every `Ctrl` becomes `⌘` on a Mac. */
function forPlatform(text: string): string {
  return isMac() ? text.replaceAll('Ctrl', '⌘') : text
}

/** Fits and view changes animate for 300 ms, or not at all with reduced motion (5.7.5). */
function fitDuration(): number {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : 300
  } catch {
    return 300
  }
}

/**
 * Fits the practice graph into view, at 100 % at most, whenever a lesson starts, and puts the
 * user's own view back when the lesson ends (phase 48). Practice graphs reach above and left of
 * the origin, so without the fit their circles and pointers could start off screen.
 */
function useLessonViewport(lessonId: string | undefined) {
  const flow = useReactFlow()
  const saved = useRef<Viewport | null>(null)
  useEffect(() => {
    if (lessonId === undefined) {
      const view = saved.current
      saved.current = null
      if (view) {
        requestAnimationFrame(
          () => void flow.setViewport(view, { duration: fitDuration() }),
        )
      }
      return
    }
    saved.current ??= flow.getViewport()
    // An empty practice graph (the tour) has nothing to fit.
    if (useGraphStore.getState().graph.nodes.length === 0) return
    // Two frames: React Flow learns the canvas's new width (the panel just took 300 px of it) from
    // a ResizeObserver, which reports after the first frame's callbacks.
    requestAnimationFrame(() =>
      requestAnimationFrame(
        () => void flow.fitView({ maxZoom: 1, duration: fitDuration() }),
      ),
    )
  }, [lessonId, flow])
}

/**
 * The docked lesson panel (spec 5.7.10), between the tool rail and the canvas. Renders nothing
 * while no lesson runs. The step's "done" state follows the lesson context (graph, selection, side
 * panel tab, Analysis switches and events) as the user works.
 */
export function LessonPanel() {
  const active = useLessonStore((s) => s.active)
  const next = useLessonStore((s) => s.next)
  const back = useLessonStore((s) => s.back)
  const exit = useLessonStore((s) => s.exit)
  const wrongPicks = useLessonStore((s) => s.wrongPicks)
  const revealAnswer = useLessonStore((s) => s.revealAnswer)
  // The step's check reads these through lessonContext(); subscribing re-renders on each change.
  useGraphStore((s) => s.graph)
  useGraphStore((s) => s.selection)
  useUiStore((s) => s.sidePanelTab)
  useUiStore((s) => s.analysisOn)
  useLessonEvents((s) => s.events)
  useLessonViewport(active?.lessonId)

  const lesson = active ? findLesson(active.lessonId) : undefined
  const step = active ? lesson?.steps[active.step] : undefined
  if (!active || !lesson || !step) return null

  const index = active.step
  const count = lesson.steps.length
  const last = index === count - 1
  const done = stepDone(step, lessonContext())
  const { pick } = step
  const lastWrong = wrongPicks.at(-1)
  // Pick feedback (spec 5.7.10): the reveal once answered, else the hint for the last wrong pick.
  const feedback = !pick
    ? undefined
    : done
      ? pick.reveal
      : lastWrong !== undefined
        ? (pick.hints[lastWrong] ?? 'Not quite. Try again.')
        : undefined
  const canReveal = pick !== undefined && !done && wrongPicks.length >= 2

  return (
    <aside
      aria-label="Lesson"
      className="flex w-75 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-background p-5 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.06em] text-accent-foreground uppercase">
          LESSON · STEP {index + 1} OF {count}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close lesson"
          onClick={exit}
        >
          <X strokeWidth={1.75} aria-hidden />
        </Button>
      </div>

      <div
        key={`${lesson.id}:${index}`}
        className="flex animate-in flex-col gap-4 duration-240 ease-out fade-in-0"
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-lg leading-[1.3] font-semibold">{step.title}</h2>
          {step.body && (
            <p className="leading-normal">{forPlatform(step.body)}</p>
          )}
        </div>

        {step.keyIdea && (
          <div className="flex flex-col gap-2 rounded-lg border p-3 leading-normal">
            <div className="flex items-center gap-2">
              <Lightbulb
                className="size-4 shrink-0 text-primary"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-xs font-semibold tracking-[0.06em] text-accent-foreground uppercase">
                Key idea
              </p>
            </div>
            <p>{step.keyIdea}</p>
          </div>
        )}

        {step.task && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg bg-accent px-3 py-2.5 leading-normal text-accent-foreground"
          >
            <CircleCheck
              className={cn(
                'mt-0.5 size-4 shrink-0 transition-opacity duration-120',
                !done && 'opacity-50',
              )}
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{done ? 'Done.' : `Try it: ${forPlatform(step.task)}`}</span>
          </div>
        )}

        {pick && (
          <div className="flex flex-col items-start gap-1 has-[[role=status]:empty]:-mt-4">
            {/* Kept mounted for the whole step so screen readers announce each new text. */}
            <p role="status" className="leading-normal">
              {feedback}
            </p>
            {canReveal && (
              <Button
                variant="link"
                className="h-auto px-0 py-0.5"
                onClick={revealAnswer}
              >
                Show answer
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1" aria-hidden>
        {lesson.steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-240',
              i <= index ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={back} disabled={index === 0}>
          Back
        </Button>
        <Button onClick={next} disabled={!done}>
          {last ? 'Finish' : 'Next'}
        </Button>
      </div>
    </aside>
  )
}
