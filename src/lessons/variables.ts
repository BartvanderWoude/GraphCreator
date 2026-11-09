import type { VarType } from '@/model/schema'
import { nodeNamed, practiceGraph, roleIs } from './helpers'
import type { Lesson, LessonContext } from './types'

/** The running example with no roles and no types (docs/LESSONS.md, lesson 2). */
const PRACTICE = `schema: graphcreator/0.1
name: Smoking and birth weight
nodes:
  - { name: Maternal smoking, pos: [0, 0] }
  - { name: Birth weight, pos: [300, 0] }
  - { name: SES, pos: [150, -140] }
  - { name: Genetic factors, pos: [150, 140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
  - { from: Genetic factors, to: Birth weight }
`

/** `type(N) = t`: node N has variable type t. */
function typeIs(ctx: LessonContext, name: string, type: VarType): boolean {
  return nodeNamed(ctx.graph, name)?.varType === type
}

/** `unit(N) = u`: N's unit, trimmed, equals u ignoring case. */
function unitIs(ctx: LessonContext, name: string, unit: string): boolean {
  const value = nodeNamed(ctx.graph, name)?.unit
  return value?.trim().toLowerCase() === unit.toLowerCase()
}

/** `levels(N) = [a, b, c]`: N's levels, trimmed, equal the list in order, ignoring case. */
function levelsAre(
  ctx: LessonContext,
  name: string,
  levels: string[],
): boolean {
  const value = nodeNamed(ctx.graph, name)?.levels
  return (
    value !== undefined &&
    value.length === levels.length &&
    value.every((l, i) => l.trim().toLowerCase() === levels[i].toLowerCase())
  )
}

/** `description(N)`: N has a description that is not blank. */
function hasDescription(ctx: LessonContext, name: string): boolean {
  return Boolean(nodeNamed(ctx.graph, name)?.description?.trim())
}

/** Lesson 2 (docs/LESSONS.md). */
export const variablesLesson: Lesson = {
  id: 'variables',
  title: 'Describing your variables',
  summary: 'Roles, variable types, levels, units and descriptions.',
  track: 'app',
  sample: () => practiceGraph(PRACTICE),
  steps: [
    {
      title: 'The exposure',
      body: 'Every circle is a variable in your causal question. Its role says what part it plays, and its color shows the role. The exposure is the cause whose effect you want to estimate.',
      keyIdea: 'Start every DAG by marking the exposure and the outcome.',
      task: 'Select Maternal smoking and set its role to Exposure.',
      check: (ctx) => roleIs(ctx, 'Maternal smoking', 'exposure'),
      pointer: [{ node: 'Maternal smoking', label: 'The cause' }],
    },
    {
      title: 'The outcome',
      body: "The outcome is the effect you want to estimate. Here it is the baby's birth weight.",
      task: 'Set the role of Birth weight to Outcome.',
      check: (ctx) => roleIs(ctx, 'Birth weight', 'outcome'),
      pointer: [{ node: 'Birth weight', label: 'The effect' }],
    },
    {
      title: 'Unmeasured variables',
      body: 'Some causes matter even though no study measured them. Mark them Latent, so the analysis never relies on them.',
      keyIdea:
        'Leaving an unmeasured cause out of the DAG hides an assumption; drawing it as latent shows it.',
      task: 'Set the role of Genetic factors to Latent.',
      check: (ctx) => roleIs(ctx, 'Genetic factors', 'latent'),
      pointer: [{ node: 'Genetic factors', label: 'Not measured' }],
    },
    {
      title: 'Variable types',
      body: 'The type says how a variable is measured, and the small warning dot marks variables without one. Birth weight is measured in grams, so it is continuous.',
      task: 'Set the type of Birth weight to Continuous and its unit to g.',
      check: (ctx) =>
        typeIs(ctx, 'Birth weight', 'continuous') &&
        unitIs(ctx, 'Birth weight', 'g'),
    },
    {
      title: 'Levels',
      body: 'Categorical and ordinal variables take a fixed set of values, called levels. For an ordinal variable, list the levels from lowest to highest.',
      task: 'Make SES ordinal with the levels low, mid and high.',
      check: (ctx) =>
        typeIs(ctx, 'SES', 'ordinal') &&
        levelsAre(ctx, 'SES', ['low', 'mid', 'high']),
      pointer: [{ node: 'SES', label: 'Ordinal' }],
    },
    {
      title: 'Descriptions',
      body: 'A description says exactly what was measured and how. Readers of your paper need it to judge the DAG.',
      task: 'Give Maternal smoking a description, such as Self-reported during pregnancy.',
      check: (ctx) => hasDescription(ctx, 'Maternal smoking'),
    },
    {
      title: 'Done',
      body: 'Roles, types, levels, units and descriptions are all kept in the GraphCreator file. Your own graph comes back when you finish.',
    },
  ],
}
