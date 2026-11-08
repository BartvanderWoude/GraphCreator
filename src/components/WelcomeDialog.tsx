import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { BookOpenIcon, LockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { markWelcomed, safeLocalStorage } from '@/lib/welcome'
import { cn } from '@/lib/utils'
import type { Role } from '@/model/schema'
import { useLessonStore } from '@/store/lessonStore'
import { useUiStore } from '@/store/uiStore'

/** A circle in a slide picture, in SVG user units. */
interface Dot {
  x: number
  y: number
  r: number
}

/**
 * A straight arrow from the rim of `from` to 2 units before the rim of `to`, with a closed
 * arrowhead, like the canvas edges (spec 5.2).
 */
function Arrow({
  from,
  to,
  className,
}: {
  from: Dot
  to: Dot
  className: string
}) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  const ux = dx / length
  const uy = dy / length
  const head = 9
  const sx = from.x + from.r * ux
  const sy = from.y + from.r * uy
  const tx = to.x - (to.r + 2) * ux
  const ty = to.y - (to.r + 2) * uy
  const bx = tx - head * ux
  const by = ty - head * uy
  const half = head / 2
  return (
    <g className={className}>
      <line x1={sx} y1={sy} x2={bx} y2={by} strokeWidth={2} />
      <polygon
        points={`${tx},${ty} ${bx - half * uy},${by + half * ux} ${bx + half * uy},${by - half * ux}`}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </g>
  )
}

/** A circle in the role's fill and outline (spec 5.7.2). */
function RoleCircle({ dot, role }: { dot: Dot; role: Role }) {
  return (
    <circle
      cx={dot.x}
      cy={dot.y}
      r={dot.r}
      strokeWidth={2}
      style={{
        fill: `var(--role-${role}-fill)`,
        stroke: `var(--role-${role}-line)`,
      }}
    />
  )
}

/** Slide 1: two circles joined by a teal arrow. */
function TwoCirclesPicture() {
  const left = { x: 52, y: 48, r: 30 }
  const right = { x: 188, y: 48, r: 30 }
  return (
    <svg viewBox="0 0 240 96" className="h-24" aria-hidden="true">
      <RoleCircle dot={left} role="other" />
      <RoleCircle dot={right} role="other" />
      <Arrow from={left} to={right} className="fill-primary stroke-primary" />
    </svg>
  )
}

/** Slide 2: four role-coloured circles (exposure, outcome, adjusted, latent) in a small DAG. */
function RolesPicture() {
  const adjusted = { x: 120, y: 26, r: 20 }
  const latent = { x: 220, y: 26, r: 20 }
  const exposure = { x: 60, y: 86, r: 20 }
  const outcome = { x: 180, y: 86, r: 20 }
  const edge = 'fill-edge stroke-edge'
  return (
    <svg viewBox="0 0 260 112" className="h-28" aria-hidden="true">
      <Arrow from={adjusted} to={exposure} className={edge} />
      <Arrow from={adjusted} to={outcome} className={edge} />
      <Arrow from={exposure} to={outcome} className={edge} />
      <Arrow from={latent} to={outcome} className={edge} />
      <RoleCircle dot={exposure} role="exposure" />
      <RoleCircle dot={outcome} role="outcome" />
      <RoleCircle dot={adjusted} role="adjusted" />
      <RoleCircle dot={latent} role="latent" />
    </svg>
  )
}

/** Slides 3 and 4: a Lucide icon on a teal tint. */
function IconPicture({ icon: Icon }: { icon: typeof LockIcon }) {
  return (
    <div className="flex size-20 items-center justify-center rounded-full bg-accent text-accent-foreground">
      <Icon className="size-10" strokeWidth={1.75} aria-hidden="true" />
    </div>
  )
}

interface Slide {
  picture: ReactNode
  title: string
  body?: string
}

/** The four slides of spec 5.7.9. The fourth one's buttons are rendered by `WelcomeDialog`. */
const SLIDES: readonly Slide[] = [
  {
    picture: <TwoCirclesPicture />,
    title: 'Welcome to GraphCreator',
    body: 'Draw causal DAGs and document every variable and every arrow.',
  },
  {
    picture: <RolesPicture />,
    title: 'Circles are variables, arrows are causes',
    body: "A circle's color shows its role: exposure, outcome, adjusted, latent.",
  },
  {
    picture: <IconPicture icon={LockIcon} />,
    title: 'Your graph stays here',
    body: 'Nothing is uploaded. Your work is kept in this browser, and Save downloads a file.',
  },
  {
    picture: <IconPicture icon={BookOpenIcon} />,
    title: 'How would you like to start?',
  },
]

const LAST_SLIDE = SLIDES.length - 1

/** Four dots; the current one is a 16 px teal pill (spec 5.7.9). */
function SlideDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-2 rounded-full transition-all duration-240',
              i === current ? 'w-4 bg-primary' : 'w-2 bg-input',
            )}
          />
        ))}
      </div>
      <span className="sr-only">
        Slide {current + 1} of {SLIDES.length}
      </span>
    </div>
  )
}

/**
 * The welcome slides (spec 5.7.9). Open while `useUiStore().welcomeOpen` is true, showing slide
 * `welcomeSlide`. Every way of closing (Escape, Skip, "Get started", "Take the tour") records the
 * visit with `markWelcomed`; "Take the tour" also starts the tour lesson. Arrow keys and Next move
 * between slides.
 */
export function WelcomeDialog() {
  const open = useUiStore((s) => s.welcomeOpen)
  const slideIndex = useUiStore((s) => s.welcomeSlide)
  const setSlide = useUiStore((s) => s.setWelcomeSlide)
  const primaryRef = useRef<HTMLButtonElement>(null)

  const slide = SLIDES[slideIndex] ?? SLIDES[0]
  const isLast = slideIndex === LAST_SLIDE

  // Keep keyboard focus on the slide's main button (Next, or "Take the tour" on the last slide).
  useEffect(() => {
    if (open) primaryRef.current?.focus()
  }, [open, slideIndex])

  const close = () => {
    markWelcomed(safeLocalStorage())
    useUiStore.getState().closeWelcome()
  }

  const takeTour = () => {
    close()
    useLessonStore.getState().start('tour')
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setSlide(slideIndex + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSlide(slideIndex - 1)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-6 p-6 shadow-[0_8px_24px_rgb(15_23_42/0.14)] sm:max-w-[480px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          primaryRef.current?.focus()
        }}
        onKeyDown={onKeyDown}
        {...(slide.body === undefined ? { 'aria-describedby': undefined } : {})}
      >
        <div
          key={slideIndex}
          className="flex animate-in flex-col items-center gap-6 duration-240 ease-out fade-in-0"
        >
          <div className="flex h-32 w-full items-center justify-center rounded-lg bg-canvas">
            {slide.picture}
          </div>
          {/* Same height on every slide, so the dialog does not jump. */}
          <div className="flex min-h-34 w-full flex-col items-center gap-6">
            <DialogHeader className="items-center gap-2 text-center">
              <DialogTitle className="text-[28px] leading-[1.2] font-semibold">
                {slide.title}
              </DialogTitle>
              {slide.body !== undefined && (
                <DialogDescription className="text-sm leading-normal">
                  {slide.body}
                </DialogDescription>
              )}
            </DialogHeader>
            {isLast && (
              <div className="flex w-full flex-col gap-2">
                <Button ref={primaryRef} className="w-full" onClick={takeTour}>
                  Take the tour
                </Button>
                <Button variant="outline" className="w-full" onClick={close}>
                  Get started
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex h-8 items-center justify-between">
          <SlideDots current={slideIndex} />
          {!isLast && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={close}>
                Skip
              </Button>
              <Button ref={primaryRef} onClick={() => setSlide(slideIndex + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
