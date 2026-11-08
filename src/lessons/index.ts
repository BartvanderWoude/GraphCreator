import { tourLesson } from './tour'
import type { Lesson } from './types'

export type { Lesson, LessonStep } from './types'
export { tourLesson } from './tour'

/** Every lesson, in menu order (spec 5.7.10). */
export const LESSONS: Lesson[] = [tourLesson]

export function findLesson(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id)
}
