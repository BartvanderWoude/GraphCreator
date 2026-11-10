import { adjustmentLesson } from './adjustment'
import { arrowsLesson } from './arrows'
import { collidersLesson } from './colliders'
import { confoundingLesson } from './confounding'
import { dagBasicsLesson } from './dag-basics'
import { filesLesson } from './files'
import { instrumentsLesson } from './instruments'
import { latentLesson } from './latent'
import { mediatorsLesson } from './mediators'
import { reportingLesson } from './reporting'
import { selectionLesson } from './selection'
import { testingLesson } from './testing'
import { tourLesson } from './tour'
import { variablesLesson } from './variables'
import type { Lesson } from './types'

export type {
  Lesson,
  LessonContext,
  LessonPick,
  LessonPointer,
  LessonStep,
  LessonTrack,
} from './types'
export { tourLesson } from './tour'

/** The 14 lessons, in the order of docs/LESSONS.md (spec 5.7.10). */
export const LESSONS: Lesson[] = [
  tourLesson,
  variablesLesson,
  arrowsLesson,
  filesLesson,
  dagBasicsLesson,
  confoundingLesson,
  mediatorsLesson,
  collidersLesson,
  selectionLesson,
  latentLesson,
  adjustmentLesson,
  testingLesson,
  instrumentsLesson,
  reportingLesson,
]

export function findLesson(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id)
}
