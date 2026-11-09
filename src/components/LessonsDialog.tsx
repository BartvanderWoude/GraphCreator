import { CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LESSONS, type Lesson, type LessonTrack } from '@/lessons'
import { useLessonStore } from '@/store/lessonStore'
import { useUiStore } from '@/store/uiStore'

/** The two groups of the dialog, in order (spec 5.7.11). */
const TRACKS: { track: LessonTrack; heading: string }[] = [
  { track: 'app', heading: 'Using GraphCreator' },
  { track: 'causal', heading: 'Causal thinking' },
]

/** Closes the dialog and starts the lesson; a running lesson is exited first (spec 4.8). */
function startLesson(id: string) {
  useUiStore.getState().closeLessons()
  useLessonStore.getState().start(id)
}

function LessonRow({
  lesson,
  number,
  finished,
}: {
  lesson: Lesson
  number: number
  finished: boolean
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-5 shrink-0 text-right font-mono text-[13px] text-muted-foreground">
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{lesson.title}</span>
        <span className="text-[13px] leading-[1.4] text-muted-foreground">
          {lesson.summary}
        </span>
      </div>
      {finished && (
        <CircleCheck
          role="img"
          aria-label="Finished"
          className="size-4 shrink-0 text-primary"
          strokeWidth={1.75}
        />
      )}
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 rounded-md"
        aria-label={`Start ${lesson.title}`}
        onClick={() => startLesson(lesson.id)}
      >
        Start
      </Button>
    </li>
  )
}

/**
 * The Lessons dialog (spec 5.7.11), opened from Help → Lessons…: the lessons of `LESSONS` in two
 * groups by track, numbered 1–14 in course order, with a check on the finished ones and a Start
 * button each. Open while `uiStore.lessonsOpen` is true.
 */
export function LessonsDialog() {
  const open = useUiStore((s) => s.lessonsOpen)
  const closeLessons = useUiStore((s) => s.closeLessons)
  const done = useLessonStore((s) => s.done)
  const finished = LESSONS.filter((lesson) => done.has(lesson.id)).length

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeLessons()
      }}
    >
      <DialogContent className="flex max-h-[80vh] flex-col gap-4 p-6 shadow-[0_8px_24px_rgb(15_23_42/0.14)] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-lg leading-[1.3] font-semibold">
            Lessons
          </DialogTitle>
          <DialogDescription>
            Short interactive lessons on a practice graph. Your own graph is set
            aside and comes back when you finish.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          {TRACKS.map(({ track, heading }) => (
            <section key={track} className="not-first:mt-4">
              <h3 className="text-xs font-semibold tracking-[0.06em] text-accent-foreground uppercase">
                {heading}
              </h3>
              <ul aria-label={heading} className="divide-y">
                {LESSONS.map((lesson, i) =>
                  lesson.track === track ? (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      number={i + 1}
                      finished={done.has(lesson.id)}
                    />
                  ) : null,
                )}
              </ul>
            </section>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {finished} of {LESSONS.length} finished.
        </p>
      </DialogContent>
    </Dialog>
  )
}
