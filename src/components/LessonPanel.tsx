import { CircleCheck, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { findLesson } from '@/lessons'
import { stepDone } from '@/lessons/helpers'
import { useGraphStore } from '@/store/graphStore'
import { useLessonEvents } from '@/store/lessonEvents'
import { lessonContext, useLessonStore } from '@/store/lessonStore'
import { useUiStore } from '@/store/uiStore'

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
  // The step's check reads these through lessonContext(); subscribing re-renders on each change.
  useGraphStore((s) => s.graph)
  useGraphStore((s) => s.selection)
  useUiStore((s) => s.sidePanelTab)
  useUiStore((s) => s.analysisOn)
  useLessonEvents((s) => s.events)

  const lesson = active ? findLesson(active.lessonId) : undefined
  const step = active ? lesson?.steps[active.step] : undefined
  if (!active || !lesson || !step) return null

  const index = active.step
  const count = lesson.steps.length
  const last = index === count - 1
  const done = stepDone(step, lessonContext())

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
          <p className="leading-normal">{step.body}</p>
        </div>

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
            <span>{done ? 'Done.' : `Try it: ${step.task}`}</span>
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
