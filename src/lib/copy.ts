import type { Role, VarType } from '@/model/schema'

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
  ],
}
