import { MAX_SETS, PATH_LIMIT, type PathKind } from '@/model/analysis/types'
import type { Role, VarType } from '@/model/schema'
import type { AnalysisKey } from '@/store/uiStore'

/** Interface texts (spec 5.7.8). The store keeps the keys; the UI shows these labels. */

export const ROLE_LABELS: Record<Role, string> = {
  exposure: 'Exposure',
  outcome: 'Outcome',
  latent: 'Latent',
  adjusted: 'Adjusted',
  selected: 'Selected',
  other: 'Other',
}

/** One-line description of each role, shown in the role picker. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  exposure: 'The cause whose effect you want to estimate.',
  outcome: 'The effect you want to estimate.',
  latent: 'A variable you did not or cannot measure.',
  adjusted:
    'A variable you control for in the analysis, by stratifying or adding it to the model.',
  selected:
    'A variable the study population was selected on, such as hospital admission.',
  other: 'Any other variable in the model.',
}

export const VAR_TYPE_LABELS: Record<VarType, string> = {
  categorical: 'Categorical',
  ordinal: 'Ordinal',
  continuous: 'Continuous',
  discrete: 'Discrete',
}

/** Texts of the info tooltips next to field labels. */
export const FIELD_TIPS = {
  role: "Role: the part this variable plays in your causal question. The circle's color shows the role on the canvas.",
  varType:
    'Variable type: how the variable is measured. Categorical and ordinal variables have levels; continuous and discrete variables can have a unit.',
  levels:
    'Levels: the values a categorical or ordinal variable can take. For ordinal variables, list them from lowest to highest.',
  unit: 'Unit: the unit a continuous or discrete variable is measured in, such as g or years.',
  evidence:
    'Evidence: references that support this arrow, such as PMID:123 or doi:10.1000/xyz. One reference per line.',
  note: 'Note: why you drew this arrow, or what is uncertain about it.',
} as const satisfies Record<string, string>

export type FieldTip = keyof typeof FIELD_TIPS

/** Cheat sheet shown in the side panel when nothing is selected. */
export const PANEL_HELP: {
  title: string
  rows: readonly { action: string; how: string }[]
} = {
  title: 'Nothing selected.',
  rows: [
    { action: 'Add a node', how: 'Double-click the canvas or press N' },
    { action: 'Connect', how: 'Drag from the rim of a circle, or press C' },
    { action: 'Delete', how: 'Select, then press Delete' },
    { action: 'Select several', how: 'Shift-click' },
    { action: 'Undo', how: 'Press Ctrl+Z' },
  ],
}

/** Section titles of the Analysis tab (spec 5.8). */
export const ANALYSIS_TITLES: Record<AnalysisKey, string> = {
  report: 'Report',
  adjustment: 'Adjustment sets',
  paths: 'Paths',
  instruments: 'Instruments',
  independencies: 'Independencies',
}

/** Names in a sentence: "A", "A and B", "A, B and C"; '' for none. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** A set of names: joined by ", ", or "(empty set)". */
function setText(names: string[]): string {
  return names.length === 0 ? '(empty set)' : names.join(', ')
}

/**
 * The fixed texts of the Analysis tab (spec 5.8). Templates take node names (not ids), already
 * in graph order.
 */
export const ANALYSIS_TEXT = {
  /** Shown at the top when there is no exposure or no outcome. */
  noExposureOrOutcome:
    'Mark at least one exposure and one outcome to see the analysis.',
  /** `aria-label` of a section's switch. */
  switchLabel: (title: string) => `Show ${title.toLowerCase()}`,
  /** The count next to a section title. */
  count: (n: number) => `(${n})`,
  /** A set of names, or "(empty set)". */
  set: setText,
  /** Link button that expands a long list. */
  showAll: (n: number) => `Show all ${n}`,

  // Report
  totalEffect: (xs: string[], ys: string[]) =>
    `Total effect of ${joinNames(xs)} on ${joinNames(ys)}.`,
  noAdjustmentNeeded: 'No adjustment is needed, as implied by this DAG.',
  zSufficient: (zs: string[]) =>
    `Your adjusted set (${zs.join(', ')}) is sufficient, as implied by this DAG.`,
  zNotSufficient: (zs: string[]) =>
    `Your adjusted set (${zs.length === 0 ? 'empty' : zs.join(', ')}) is not sufficient, as implied by this DAG.`,
  zForbidden: (names: string[]) =>
    `${joinNames(names)} lie on or after a causal path from the exposure; adjusting for them can block or bias the effect.`,
  selectionBias: (names: string[]) =>
    `Selecting on ${joinNames(names)} biases the effect, and no adjustment set can remove that bias.`,
  noSufficientSet: 'No set of observed variables is sufficient.',
  selected: (names: string[]) =>
    `Always conditioned on (selected): ${joinNames(names)}.`,
  latent: (names: string[]) =>
    names.length === 0 ? 'Latent: none.' : `Latent: ${joinNames(names)}.`,
  unmeasuredQuestion: 'Are there unmeasured common causes you should add?',

  // Adjustment sets
  setsIntro: 'Minimal sufficient adjustment sets, as implied by this DAG:',
  useThisSet: 'Use this set',
  inUse: 'In use',
  setsTruncated: `Showing the first ${MAX_SETS} sets.`,

  // Paths
  pathTag: (kind: PathKind, open: boolean) =>
    `${kind} · ${open ? 'open' : 'closed'}`,
  pathsTruncated: `There are more than ${PATH_LIMIT} paths, too many to list or highlight.`,
  noPaths: 'No paths connect the exposure and the outcome.',

  // Instruments
  instrument: (name: string, given: string[]) =>
    given.length === 0 ? name : `${name} | ${given.join(', ')}`,
  instrumentsNeedSingle:
    'Instruments need exactly one exposure and one outcome.',
  noInstruments: 'No instruments, as implied by this DAG.',

  // Independencies
  independenciesIntro:
    'Independencies implied by this DAG, which you can test in your data:',
  independence: (a: string, b: string, given: string[]) =>
    given.length === 0 ? `${a} ⫫ ${b}` : `${a} ⫫ ${b} | ${given.join(', ')}`,
  noIndependencies: 'This DAG implies no testable independencies.',
} as const
