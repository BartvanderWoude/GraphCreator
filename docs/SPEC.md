# GraphCreator spec

**Status:** spec agreed 2026-11-08; v1 implemented (waves 1–5, phases 1–9 done). The "Calm teal" redesign (5.7), agreed on 2026-11-08, is implemented (waves 6–8, phases 10–16 done). The light/dark toggle (wave 9, phase 17) is implemented. The top bar rework and double-click renaming (wave 10, phase 18) are implemented, as are the own theme store that replaced `next-themes` and Save opening the GraphCreator dialog (wave 11, phases 19–20). Undo/redo, image export and share links (wave 12, phases 21–23, agreed 2026-11-08; 4.10–4.12) are implemented. Causal analysis (4.13–4.14, 5.8; waves 13–15, phases 24–30) was agreed on 2026-11-09; it is implemented (waves 13–15, phases 24–30: contracts, the four analyses, canvas marking, the Analysis tab, integration and end-to-end tests). Import and export (dagitty details in 4.2, PDF, legend and dark theme in 4.11, the exchange formats in 4.15, the dialogs in 5.4; waves 16–18, phases 31–40) was agreed on 2026-11-09; waves 16–17 (phases 31–39: contracts, the six formats, dagitty details, the image scene with legend and theme, the PDF writer and the dialogs) are done, and so is wave 18 (phase 40: the real-tool reference and end-to-end tests); import and export is implemented. Lessons (the engine additions in 4.8 and 5.7.10, the Help menu and Lessons dialog in 5.7.11, the canvas pointer in 5.7.12, and the 14 lessons in [LESSONS.md](LESSONS.md); waves 19–21, phases 41–48) were agreed on 2026-11-09; they are implemented (waves 19–21, phases 41–48: the engine, the panel additions, the canvas pointer, the Help menu and Lessons dialog, the 13 lessons, and the end-to-end tests). Sections 4.5–5.3 and 5.7 describe the app as it is now; 5.6 records the v1 look. This document is the brief for the implementation sessions: phases are grouped into waves (section 8); a wave can be built by parallel sub agents, one commit per phase. Deferred features are in [IDEAS.md](IDEAS.md). [research.md](research.md) is background reading only; where it disagrees with this spec, this spec wins.

## 1. Purpose

Epidemiologists draw causal DAGs (directed acyclic graphs) to reason about confounding and to report their assumptions. DAGitty is the standard tool, but it treats a DAG as a picture: nodes carry roles and positions, nothing more. GraphCreator is its own browser-based DAG editor in which the DAG is a **documented model**. Every variable can carry a type (categorical, ordinal, continuous, discrete), ordered levels, a description and a unit, and every edge can carry evidence and a note. Its native format is a versioned YAML file. It is compatible with DAGitty through import and export of the dagitty text format, but it is not a DAGitty clone.

v1 delivers: drawing, typed variables and metadata, the YAML format, dagitty import/export and auto-layout. Causal analysis follows in waves 13–15 (4.13–4.14, 5.8). Simulation-code export and everything else listed in [IDEAS.md](IDEAS.md) come later.

Constraints that hold for the whole project:

- **Licence: MIT.** No GPL code is bundled. In particular, DAGitty's `jslib` is not used; any algorithm is written here.
- **No backend.** The app is static files. Graphs live in the browser (localStorage) and in files the user downloads and opens. Nothing about a graph is ever sent to a server.
- **Graph logic is pure TypeScript.** Everything under `src/model/` has no React, Zustand or DOM imports and is unit-tested with Vitest.

## 2. Overview

```
src/
  model/                 pure TS, no React
    schema.ts            Zod schema of the YAML file + constants (single source of truth for the file format)
    graph.ts             in-memory Graph types and pure operations (add/rename/update/remove, edge checks)
    cycle.ts             findCycle, reachability
    validate.ts          whole-graph validation: errors and warnings
    yaml.ts              parseYaml / toYaml
    dagitty.ts           parseDagitty / toDagitty / toDagittyIds
    layout.ts            autoLayout (dagre)
    nodeSize.ts          wrapLabel / nodeDiameter: circle size from the name (5.7.6, phase 10)
    result.ts            Result / Issue types
    analysis/            causal analysis: d-separation, adjustment sets, paths, independencies, instruments (4.13, phases 24–28)
    __fixtures__/        .dag.yaml and .dagitty.txt fixture files for tests; analysis/ holds the analysis gallery and reference.json (phase 24)
  store/
    graphStore.ts        Zustand store wrapping the model operations (4.6), with undo history (4.10, phase 21)
    uiStore.ts           canvas tool, connect source, welcome dialog, autosave status (4.7, phase 10)
    lessonStore.ts       active lesson and the set-aside user graph (4.8, phase 10); picks and progress (phase 41)
    lessonEvents.ts      app events recorded while a lesson runs (4.8, phase 41)
    autosave.ts          localStorage autosave (5.5)
  lessons/               lesson types, helpers, the tour and the 13 other lessons (5.7.10, LESSONS.md; phases 10, 41–47)
    lessonTestKit.ts     test-only helpers shared by the lesson tests: LESSONS.md parsing, scripted runs, analysis by name (phase 48)
  components/
    Canvas.tsx, SidePanel.tsx, NodeEditor.tsx, EdgeEditor.tsx, ListEditor.tsx,
    OpenDialog.tsx, CodeDialog.tsx, IssuesDialog.tsx                     (phase 18; were DagittyImportDialog/DagittyExportDialog)
    TopBar.tsx, ToolRail.tsx, useToolShortcuts.ts, SavedIndicator.tsx    (phase 12)
    InfoTip.tsx, RolePicker.tsx                                          (phase 13)
    WelcomeDialog.tsx                                                     (phase 14)
    LessonPanel.tsx                                                       (phase 15)
    canvas/CircleNode.tsx, canvas/FloatingEdge.tsx, canvas/canvas.css     (phase 11)
    ExportDialog.tsx                                                      (phase 22)
    SharedGraphDialog.tsx                                                 (phase 23)
    AnalysisPanel.tsx, useAnalysis.ts                                     (phases 24, 29)
    LessonsDialog.tsx                                                     (phase 44)
    (Toolbar.tsx, DagNode.tsx: v1 parts, deleted in phase 16)
    ui/                  shadcn/ui generated components
  lib/download.ts        downloadText / downloadBlob helpers for Save and Export
  lib/imageExport.ts     SVG, PNG and TikZ from the graph (4.11, phase 22)
  lib/shareLink.ts       share links: the graph compressed into the URL fragment (4.12, phase 23)
  lib/copy.ts            tooltip and role texts (5.7.8, phase 10)
  lib/geometry.ts        edge end points between circles (phase 11)
  lib/welcome.ts         first-visit flag for the welcome slides (phase 14)
  lib/lessonProgress.ts  finished lessons in localStorage (5.7.11, phase 41)
  App.tsx                layout: top bar; tool rail, optional lesson panel, canvas, side panel (5.1)
e2e/                     Playwright tests
scripts/dagitty-reference.R   dev-time only: writes the analysis reference answers with dagitty-R (phase 24)
```

Data flow: the UI calls store actions; store actions call pure functions in `src/model/` and replace `graph` with the returned value. React Flow's node and edge arrays are derived from `graph` on render; React Flow never owns the graph.

Stack: Vite 8, React 19, TypeScript (versions from the scaffold), `@xyflow/react` 12 (canvas), `zustand` 5 (state), `zod` 4 (schema), `yaml` (YAML 1.2 parse/stringify), `@dagrejs/dagre` (layout), Tailwind CSS v4 with shadcn/ui (components, `sonner` for toasts), Vitest (unit tests), Playwright (end-to-end tests), Prettier (formatting), oxlint (lint, from the scaffold).

## 3. Data model

### 3.1 Constants (`src/model/schema.ts`)

```ts
export const SCHEMA_ID = 'graphcreator/0.1'
export const KNOWN_SCHEMAS = ['graphcreator/0.1'] as const
export const ROLES = ['exposure', 'outcome', 'latent', 'adjusted', 'selected', 'other'] as const
export const VAR_TYPES = ['categorical', 'ordinal', 'continuous', 'discrete'] as const
export const LEVELED_TYPES = ['categorical', 'ordinal'] as const   // may have levels
export const NUMERIC_TYPES = ['continuous', 'discrete'] as const   // may have a unit
export type Role = (typeof ROLES)[number]
export type VarType = (typeof VAR_TYPES)[number]
```

### 3.2 In-memory graph (`src/model/graph.ts`)

The in-memory model gives every node and edge an internal `id` (stable across renames, never written to files). Files refer to nodes by name.

```ts
export interface GNode {
  id: string              // internal, e.g. 'n1'; created by newId()
  name: string            // any text; trimmed, non-empty, unique (case-sensitive)
  role: Role              // default 'other'
  varType?: VarType       // undefined = untyped (allowed, warned)
  levels?: string[]       // only when varType is categorical/ordinal; order is meaningful
  description?: string
  unit?: string           // only when varType is continuous/discrete
  pos: { x: number; y: number }   // canvas px, top-left of the node box (React Flow convention)
}
export interface GEdge {
  id: string              // internal, e.g. 'e1'
  source: string          // GNode.id
  target: string          // GNode.id
  evidence: string[]      // free text, e.g. 'PMID:123', 'doi:10.1/x'; may be empty
  note?: string
}
export interface Graph {
  name?: string           // graph title
  nodes: GNode[]          // order is preserved and used by exports
  edges: GEdge[]
}
```

Rules:

- **Names** are compared after `trim()` and are case-sensitive (`Age` and `age` are different nodes). Empty names are invalid.
- **Edges** are directed only. A self-edge (`source === target`), a duplicate edge (same source and target) and any edge that closes a directed cycle are invalid.
- **Roles:** exactly one per node. Any number of nodes may be exposure or outcome; no warning.
- **Types** are optional. `levels` may exist only for categorical/ordinal; `unit` only for continuous/discrete.
- Optional string fields are stored as `undefined`, never as `''` (editors convert an emptied field to `undefined`).

### 3.3 Results and issues (`src/model/result.ts`)

```ts
export interface Issue { message: string; line?: number; path?: string; nodeId?: string }  // nodeId: added in phase 3
export type Result<T> =
  | { ok: true; value: T; warnings: Issue[] }
  | { ok: false; errors: Issue[] }
```

Every parser and every operation that can fail returns a `Result`. `nodeId` is set on issues about one node (the `validateGraph` warnings), so the UI can select that node. Messages are complete sentences shown to the user verbatim (e.g. `Node name "Age" is used more than once.`).

## 4. Formats and interfaces

### 4.1 YAML file (native format)

Saved as `<slug>.dag.yaml`, where `<slug>` is the graph name lower-cased with runs of characters outside `[a-z0-9]` replaced by `-` and leading/trailing `-` trimmed (empty → `graph`). Open accepts `.yaml` and `.yml`.

```yaml
schema: graphcreator/0.1
name: Smoking and birth weight
nodes:
  - name: Maternal smoking
    role: exposure
    var_type: categorical
    levels: [never, former, current]
    description: Self-reported during pregnancy
    pos: [0, 0]
  - name: Birth weight
    role: outcome
    var_type: continuous
    unit: g
    pos: [300, 0]
  - name: SES
    var_type: ordinal
    levels: [low, mid, high]
    pos: [150, -120]
  - name: Genetic factors
    role: latent
    pos: [150, 120]
edges:
  - from: SES
    to: Maternal smoking
    evidence: ["PMID:123", "doi:10.1000/xyz"]
    note: Well established
  - from: Maternal smoking
    to: Birth weight
  - from: SES
    to: Birth weight
  - from: Genetic factors
    to: Birth weight
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `schema` | string | yes | Must be in `KNOWN_SCHEMAS`. Missing → error `This file has no "schema" line, so it is not a GraphCreator file.` Unknown → error `This file uses format "<value>", which this version of GraphCreator cannot read.` |
| `name` | string | no | Graph title. |
| `nodes` | list | no (default `[]`) | |
| `nodes[].name` | string | yes | Trimmed; non-empty; unique. |
| `nodes[].role` | enum `ROLES` | no (default `other`) | Not written when `other`. |
| `nodes[].var_type` | enum `VAR_TYPES` | no | Not written when untyped. |
| `nodes[].levels` | list of strings | no | Only for categorical/ordinal, else error. Written in flow style. |
| `nodes[].description` | string | no | |
| `nodes[].unit` | string | no | Only for continuous/discrete, else error. |
| `nodes[].pos` | `[x, y]` numbers | no | Written in flow style, rounded to integers. |
| `edges` | list | no (default `[]`) | |
| `edges[].from`, `edges[].to` | string | yes | Must name existing nodes (after trim). |
| `edges[].evidence` | list of strings | no | Not written when empty. Flow style. |
| `edges[].note` | string | no | |

Unknown keys at any level are errors (Zod `.strict()`), so typos are caught: `Unknown field "nodse" at top level.`

`src/model/schema.ts` exports `GraphFileSchema` (Zod) and `type GraphFile = z.infer<typeof GraphFileSchema>`. No hand-written type duplicates the file shape.

#### `parseYaml(text: string): Result<Graph>` (`src/model/yaml.ts`)

1. Parse with `yaml`'s `parseDocument`. Syntax errors → issues with `line` (1-based); stop.
2. Check `schema` (rules above); stop on failure.
3. Validate with `GraphFileSchema.safeParse`. Map each Zod issue to an `Issue` whose `path` is the dotted path (`nodes.2.var_type`) and whose message names the node where possible (`Node "SES": var_type must be one of categorical, ordinal, continuous, discrete.`); stop on failure.
4. Semantic checks, **all collected, not stopping at the first**: empty or duplicate names; `from`/`to` naming no node; self-edges; duplicate edges; `levels` on a non-leveled type or untyped node; `unit` on a categorical/ordinal or untyped node; a directed cycle (message lists the path, see 5.3).
5. If any errors: return `{ ok: false, errors }`; nothing is loaded.
6. Build the `Graph` with fresh internal ids. If any node lacks `pos`, run `autoLayout` on the whole graph and add the warning `Some nodes had no position, so the graph was laid out automatically.`
7. Add `validateGraph` warnings (4.4) and return.

Details fixed in phase 4:
- Step 4's semantic errors come from `validateGraph` (4.4 wording and order). The exception is an edge naming a missing node, which gets `The edge from "Age" to "Smokng" refers to "Smokng", but there is no node with that name.` with `path` (`edges.0.to`) and `line`, placed before the cycle error.
- Syntax errors: `The file is not valid YAML: <parser message>.` with `line`; duplicate keys count as syntax errors. An empty file or a file that is not a map gets the missing-schema error.
- Zod messages start with `Node "SES": ` (or `Node 2: ` when the name is unknown) or `Edge from "A" to "B": `; e.g. `Unknown field "nodse" at top level.`, `Node "SES": unknown field "colour".`, `Node 2: name is missing.`, `Node "A": item 2 of levels must be text.`, `pos must be a list of two numbers, like [0, 0].` Each has a dotted `path` and, when found, a `line`.
- Empty or whitespace-only `description`, `unit`, `note` and graph `name` are read as absent (rule 3.2) before the levels/unit checks.

#### `toYaml(graph: Graph): string`

Writes keys in the order of the table (`schema`, `name`, `nodes`, `edges`; node keys `name, role, var_type, levels, description, unit, pos`; edge keys `from, to, evidence, note`), omits undefined, default and empty fields as stated, uses flow style for `levels`, `pos` and `evidence`, and ends with a newline. For a canonical file, `toYaml(parseYaml(text).value) === text`. Evidence items are always double-quoted (as in the example); `levels` use plain style. `nodes:` and `edges:` are always written (`[]` when empty); `levels` are written whenever defined. Edges with missing endpoints are skipped, `-0` is written as `0`, long lines are not folded. Fixtures in `src/model/__fixtures__` are excluded from Prettier (`.prettierignore`), which would otherwise rewrite their quoting.

### 4.2 dagitty text format (exchange format)

#### `parseDagitty(text: string): Result<Graph>` (`src/model/dagitty.ts`)

An own, MIT-licensed tokenizer and recursive-descent parser for this subset:

```
file      := [ graphType [ name ] '{' ] stmt* [ '}' ]      // header optional, as in dagitty
graphType := 'dag'                                         // anything else is rejected
stmt      := ( vertexStmt | edgeStmt | graphAttr ) [ ';' ]  // newlines also separate statements
vertexStmt:= id [ '[' attrs ']' ]
edgeStmt  := operand ( edgeOp operand )+ [ '[' attrs ']' ]
operand   := id | '{' id* '}'
edgeOp    := '->' | '<-'
graphAttr := 'bb' '=' string                               // ignored silently
attrs     := attr ( ',' attr )*
attr      := key [ '=' value ]
id        := bareword [0-9A-Za-z_.]+ | quoted string "..." with \" escapes
```

Semantics:

- A node is created the first time its id appears (in a vertex or edge statement). Repeated vertex statements merge their attributes.
- Role attributes: `exposure`, `outcome`, `latent`, `adjusted`, `selected`. No role → `other`. **More than one role on a node is an error**: `Node "x" has more than one role (exposure, adjusted); GraphCreator allows one role per node.`
- `pos="x,y"` → `pos = { x: x * 100, y: y * 100 }` (`DAGITTY_SCALE = 100`), rounded to 0.001 px. dagitty's y grows downward like screen coordinates (confirmed in phase 5 from dagitty's GUI coordinate mapping and its example models), so there is no flip.
- `label="..."` → the node's name; without a label the name is the id.
- Any other vertex attribute, and any edge attribute, is ignored with one warning per key: `Ignored dagitty attribute "beta" (not used by GraphCreator).`
- `a -> b -> c` adds `a→b` and `b→c`. `a <- b` adds `b→a`. `{a b} -> c` adds `a→c` and `b→c`; groups work on either side.
- Duplicate edges are merged silently (dagitty does the same). Self-edges and cycles are errors.
- **Rejected with an error naming the line**: `<->`, `--`, `@-`/`-@`/`o-` style edges, graph types `pdag`, `mag`, `pag`, `graph`, `digraph`, and any token the grammar does not allow. Example: `Line 3: bidirected edges (<->) are not supported yet. GraphCreator v1 supports directed edges only.`
- If any node lacks `pos`, `autoLayout` the whole graph and add the same warning as for YAML.
- Imported nodes have no type, so `validateGraph` warnings for untyped nodes follow.
- On name collisions after applying labels (two ids with the same label), error: `Two dagitty nodes have the label "Age".`

Details fixed in phase 5:
- Further messages, following the `<->` template: `Line N: undirected edges (--) are not supported yet. GraphCreator v1 supports directed edges only.`; `Line N: edges with circle marks (@->) are not supported yet. GraphCreator v1 supports directed edges only.` (the operator as written); `Line N: graph type "pdag" is not supported. GraphCreator v1 supports dag graphs only.`; `Line N: "%" is not valid dagitty syntax.`; `Line N: "x" is not valid here.`; `Line N: the text ends too early.`; `Line N: a quoted name or value is not closed (missing ").`; `Line N: a group { … } must be part of an edge, as in { a b } -> c.`; `Line N: pos="…" is not a valid position; dagitty positions look like pos="1.5,-0.3".`; `Line N: label needs a value, as in label="Age".`
- Syntax errors stop at the first one; meaning-level errors (two roles, label collisions, self-edges, cycles, empty names) are all collected. Self-edge, cycle and empty-name messages come from `validateGraph`; its duplicate-name message is replaced by the label-collision error. The two-roles error and ignored-attribute warnings carry `line`.
- The parser unescapes `\"` and `\\` and keeps other backslashes; `toDagitty` escapes `\` as well as `"`.
- The graph name in `dag Name {` is ignored. A graph-type word is a header only when `{` (or a name and `{`) follows, so `dag -> graph` is an edge. A newline or `;` separates statements; one statement may span lines. Negative attribute values and an empty `[]` are accepted. Without spaces, `o->b` is read as a circle-mark edge (so a node named `o` needs spaces, which `toDagitty` writes anyway).

#### `toDagitty(graph: Graph, opts?: { details?: boolean }): string`

Plain dagitty; no GraphCreator metadata (types, levels, description, unit, evidence, note are not written). From phase 32, `details: true` adds them as `gc.*` attributes ("GraphCreator details in dagitty" below); the default (`false`) gives exactly the output described here.

```
dag {
Maternal_smoking [exposure,label="Maternal smoking",pos="0.000,0.000"]
Birth_weight [outcome,label="Birth weight",pos="3.000,0.000"]
SES [pos="1.500,-1.200"]
Genetic_factors [latent,label="Genetic factors",pos="1.500,1.200"]
SES -> Maternal_smoking
Maternal_smoking -> Birth_weight
SES -> Birth_weight
Genetic_factors -> Birth_weight
}
```

- One vertex line per node in `graph.nodes` order: `id [attrs]`, attrs in the order role (omitted for `other`), `label="..."` (only when the name differs from the id; `"` escaped as `\"`), `pos="x,y"` (px ÷ 100, 3 decimals).
- One edge line per edge in `graph.edges` order (edges with missing endpoints are skipped). The output ends with a newline and never writes `-0.000`.
- The graph name is not written.

#### `toDagittyIds(nodes: GNode[]): Map<string, string>`

Maps node id → dagitty id: replace whitespace runs with `_`, then every character outside `[0-9A-Za-z_.]` with `_`; empty result → `node`. Assign in node order; on collision append `_2`, `_3`, … (the first keeps the plain id). Each Unicode code point becomes one `_`. Exported ids always match dagitty's bareword pattern, so no quoting is needed on export. `graph` and `node` count as taken from the start (so they become `graph_2` and `node_2`, and an empty name `node_2`), because dagitty refuses them as variable names; phase 40 found this with dagitty-R. The exchange formats (4.15) use the same ids.

Round trip: `parseDagitty(toDagitty(g))` gives the same names (via `label`), roles, edges and positions (within 0.1 px) as `g`; metadata is lost by design. With `details: true` the metadata survives too: `toYaml(parseDagitty(toDagitty(g, { details: true })).value)` equals `toYaml(g)` without its name (dagitty files do not carry the graph name), up to positions within 0.1 px.

#### GraphCreator details in dagitty (phase 32)

dagitty allows any `key=value` attribute on nodes and edges, and dagitty-R (0.3.4, checked on 2026-11-09) keeps unknown ones and writes them back unchanged, so the GraphCreator metadata can travel inside a dagitty file. The attribute names carry the prefix `gc.` (a valid dagitty bareword), so they cannot clash with dagitty's own attributes.

```
dag {
Maternal_smoking [exposure,label="Maternal smoking",pos="0.000,0.000",gc.var_type="categorical",gc.levels="never;former;current",gc.description="Self-reported during pregnancy"]
Birth_weight [outcome,label="Birth weight",pos="3.000,0.000",gc.var_type="continuous",gc.unit="g"]
SES [pos="1.500,-1.200",gc.var_type="ordinal",gc.levels="low;mid;high"]
Genetic_factors [latent,label="Genetic factors",pos="1.500,1.200"]
SES -> Maternal_smoking [gc.evidence="PMID:123;doi:10.1000/xyz",gc.note="Well established"]
Maternal_smoking -> Birth_weight
SES -> Birth_weight
Genetic_factors -> Birth_weight
}
```

- **Node attributes**, after role, `label` and `pos`, in this order and only when set: `gc.var_type`, `gc.levels`, `gc.description`, `gc.unit`. **Edge attributes**, in `[…]` after the edge, only when set: `gc.evidence`, `gc.note`. An edge without either has no `[…]`.
- **Lists** (`levels`, `evidence`) are one string with the items separated by `;`. Inside an item, `\` is written `\\` and `;` is written `\;` (`encodeList`, 4.15). The result is then escaped as any dagitty string (`\` → `\\`, `"` → `\"`). An empty list is not written.
- **Reading:** `parseDagitty` always reads the six `gc.*` keys, with or without the option, and gives no warning for them. `gc.var_type` must be one of `VAR_TYPES` (else the error `Line N: gc.var_type must be one of categorical, ordinal, continuous, discrete.`); `levels` and `unit` follow the rules of 3.2, checked by `validateGraph` as for YAML. An empty `gc.*` value counts as absent. Any other `gc.*` key gets the usual ignored-attribute warning. `gc.evidence` and `gc.note` on an edge written as a chain or group (`a -> b -> c [gc.note="x"]`) apply to every edge of the statement.
- The plain `toDagitty` example above stays the default output (phase 39 adds the checkbox, 5.4).

Details fixed in phase 32:
- An invalid `gc.var_type` is a syntax-level error: it stops at the first one, like an invalid `pos`, and carries `line`.
- A detail key without a value (`[gc.var_type]`), an empty value and a list that decodes to no items all count as absent. An empty value never clears a value set earlier.
- Repeated vertex statements and merged duplicate edges merge their `gc.*` attributes; a later non-empty value wins.
- Node detail keys on an edge, and edge detail keys on a node, get the usual ignored-attribute warning.
- Unquoted values (`gc.var_type=continuous`) are accepted. A description or note containing a newline is written inside its quoted string, which the parser accepts across lines.

#### `detectFormat(text, fileName?)` and `parseGraphText(text, fileName?)` (`src/model/fileFormat.ts`, phase 18)

Open (5.4) takes either format. `detectFormat` returns `'yaml'` when the file name ends in `.yaml`/`.yml`, or when a line starts with one of the file's top-level keys (`schema:`, `name:`, `nodes:`, `edges:`); otherwise `'dagitty'` (dagitty's `dag { … }` header is optional, so it cannot be required). `parseGraphText` calls `parseYaml` or `parseDagitty` accordingly and returns its `Result<Graph>` unchanged. Phase 31 adds GML, DOT and networkx JSON (4.15 "Detection").

### 4.3 Graph operations (`src/model/graph.ts`, `src/model/cycle.ts`)

All pure; they return new objects and never mutate their input.

```ts
export function newId(prefix: 'n' | 'e', existing: Iterable<string>): string  // smallest unused 'n1', 'n2', …
export function emptyGraph(): Graph
export function defaultNodeName(graph: Graph): string                          // smallest unused 'Node 1', 'Node 2', …
export function addNode(graph: Graph, init: { pos: { x: number; y: number }; name?: string }): { graph: Graph; node: GNode }
export function renameNode(graph: Graph, nodeId: string, newName: string): Result<Graph>
export function updateNode(graph: Graph, nodeId: string, patch: Partial<Omit<GNode, 'id' | 'name'>>): Graph
export function removeNodes(graph: Graph, nodeIds: string[]): Graph           // also removes incident edges
export function moveNode(graph: Graph, nodeId: string, pos: { x: number; y: number }): Graph
export type EdgeCheck =
  | { ok: true }
  | { ok: false; reason: 'self' | 'duplicate' | 'cycle'; message: string; cycle?: string[] }
export function canAddEdge(graph: Graph, source: string, target: string): EdgeCheck
export function addEdge(graph: Graph, source: string, target: string): Result<Graph>
export function updateEdge(graph: Graph, edgeId: string, patch: Partial<Pick<GEdge, 'evidence' | 'note'>>): Graph
export function removeEdges(graph: Graph, edgeIds: string[]): Graph
export function findCycle(graph: Graph): string[] | null   // node ids, first id repeated at the end; null if acyclic
export function findPath(graph: Graph, from: string, to: string): string[] | null  // directed path of node ids
```

- `renameNode` trims; errors `A node needs a name.` and `There is already a node called "Age".` Renaming to the same name is ok. Edges reference ids, so they follow automatically.
- `updateNode` clears fields not allowed for the node's resulting type: continuous/discrete or untyped drops `levels`; categorical/ordinal or untyped drops `unit`. Pass `varType: undefined` to make a node untyped. Empty or whitespace-only `description` and `unit` become `undefined`; `updateEdge` does the same for `note`.
- `addNode` trims a given name; a missing or blank name gets `defaultNodeName`. It does not check uniqueness (callers pass fresh names).
- `canAddEdge` throws an `Error` on unknown node ids (a programming error, not a user error).
- `canAddEdge(s, t)` messages: self `A node cannot point to itself.`; duplicate `This edge already exists.`; cycle when `findPath(t, s)` exists: `A → B → C → A would form a cycle.` (names of s, then the path from t back to s, then s again).

### 4.4 Validation (`src/model/validate.ts`)

```ts
export function validateGraph(graph: Graph): { errors: Issue[]; warnings: Issue[] }
```

- Errors: everything listed in `parseYaml` step 4, applied to an in-memory graph (used by tests and by autosave loading). All are collected, in this order:
  - `A node has no name.` (per empty name)
  - `Node name "Age" is used more than once.` (once per duplicated name)
  - `Node "SES" has levels, but only categorical and ordinal variables can have levels.`
  - `Node "SES" has a unit, but only continuous and discrete variables can have a unit.`
  - `Node "A" points to itself.` (per self-edge)
  - `The edge from "A" to "B" appears more than once.` (per repeat)
  - `An edge refers to a node that does not exist.` (once, for any dangling in-memory edge; `parseYaml` reports missing names more specifically)
  - `The graph has a cycle: A → B → C → A.` (one cycle, ignoring self-edges)
- Warnings (non-blocking, shown in the UI):
  - `Node "SES" has no variable type.` (one per untyped node)
  - `Node "SES" is categorical but has fewer than two levels.` (categorical/ordinal with 0–1 levels; says `ordinal` for ordinal nodes)
  - `Node "SES" has duplicate levels ("low").` (all duplicated levels, comma-separated)

### 4.5 Layout (`src/model/layout.ts`)

```ts
export function autoLayout(graph: Graph): Graph
```

v1 (until phase 16): uses `@dagrejs/dagre` with `rankdir: 'LR'`, `nodesep: 50`, `ranksep: 100`, every node `NODE_WIDTH × NODE_HEIGHT`. dagre returns centres; convert to top-left (`x - NODE_WIDTH / 2`, `y - NODE_HEIGHT / 2`) and round to integers. Deterministic for the same input.

**Redesign (phase 10):** nodes become circles whose size depends on the name (5.7.6). `autoLayout` gives each node a `d × d` box with `d = nodeDiameter(node.name)` and converts dagre's centre to the top-left of that box (`x - d / 2`, `y - d / 2`), rounded. `GNode.pos` keeps meaning "top-left of the node's box", so files and dagitty positions are unchanged. `NODE_WIDTH` and `NODE_HEIGHT` were removed in phase 16 together with their last users.

### 4.6 Store API (`src/store/graphStore.ts`, phase 3)

```ts
export interface GraphState {
  graph: Graph
  selection: { kind: 'node' | 'edge'; id: string } | null
  focusNameOf: string | null                 // node whose name field should be focused next
  addNodeAt(pos: Position): string            // adds a node with defaultNodeName, selects it, sets focusNameOf; returns its id
  renameNode(nodeId: string, name: string): Result<Graph>  // applies on success, returns the model result
  updateNode(nodeId: string, patch: Partial<Omit<GNode, 'id' | 'name'>>): void
  moveNode(nodeId: string, pos: Position): void
  connect(source: string, target: string): EdgeCheck      // adds the edge when ok
  updateEdge(edgeId: string, patch: Partial<Pick<GEdge, 'evidence' | 'note'>>): void
  removeSelection(nodeIds: string[], edgeIds: string[]): void  // clears selection if it was removed
  select(selection: GraphState['selection']): void
  focusName(nodeId: string): void            // selects the node and sets focusNameOf (phase 18: double-click to rename)
  clearFocusName(): void
  replaceGraph(graph: Graph): void            // also clears selection and focusNameOf
  setGraphName(name: string): void            // blank → undefined
  layout(): void                              // graph = autoLayout(graph)
}
export const useGraphStore: UseBoundStore<StoreApi<GraphState>>  // zustand `create<GraphState>()(…)`
```

Initial state: `emptyGraph()`, no selection. Every action delegates to the pure functions of section 4 and replaces `graph`; none mutates. Autosave is not part of the store; phase 9 subscribes to it.

Details fixed in phase 3: `setGraphName` with a blank name removes the `name` key; any other name is stored as given (not trimmed). `removeSelection` clears `selection` when the selected node or edge no longer exists afterwards (including an edge removed with its node) and leaves `focusNameOf` alone. `connect` leaves `graph` unchanged when the check fails. `autoLayout` ignores edges whose endpoints don't exist.

**Redesign (phase 10):** `renameNode` keeps the circle's centre in place. On success it shifts `pos` by `(nodeDiameter(oldName) - nodeDiameter(newName)) / 2` on both axes, rounded, so a circle that grows does so around its centre. All other actions are unchanged.

### 4.7 UI store (`src/store/uiStore.ts`, phase 10)

State that belongs to the editor, not to the graph. Never autosaved.

```ts
export type Tool = 'select' | 'add' | 'connect'
export type AutosaveStatus = 'on' | 'blocked' | 'paused'   // paused: a lesson is running
export interface UiState {
  tool: Tool                      // default 'select'
  connectFrom: string | null      // node id picked first in connect mode; null otherwise
  welcomeOpen: boolean            // WelcomeDialog visibility; default false
  welcomeSlide: number            // 0..3; default 0
  autosave: AutosaveStatus        // default 'on'; set by autosave.ts (phase 16)
  setTool(tool: Tool): void       // also clears connectFrom
  pickConnectSource(nodeId: string | null): void
  openWelcome(): void             // welcomeOpen = true, welcomeSlide = 0
  closeWelcome(): void
  setWelcomeSlide(index: number): void   // clamped to 0..3
  setAutosave(status: AutosaveStatus): void
}
export const useUiStore: UseBoundStore<StoreApi<UiState>>
```

### 4.8 Lesson store (`src/store/lessonStore.ts`, phase 10)

```ts
export interface LessonState {
  active: { lessonId: string; step: number } | null
  start(lessonId: string): void   // sets active first, then sets the user's graph aside and loads lesson.sample() via replaceGraph; step 0
  next(): void                    // step + 1 when the current step is done (isStepDone) and not the last
  back(): void                    // step - 1, at least 0
  exit(): void                    // restores the set-aside graph via replaceGraph, then active = null
}
export const useLessonStore: UseBoundStore<StoreApi<LessonState>>
export function isStepDone(): boolean   // current step's isDone(useGraphStore.getState().graph); true when no lesson  (phase 41: stepDone on lessonContext(), below)
```

The set-aside graph is held in module scope next to the store (not in the store's state), so autosave never sees it. `start` while a lesson is active first exits the old one. `start` with an unknown id throws `Unknown lesson "<id>".` before anything changes, so a running lesson keeps running. `next` on the last step calls `exit`, but like every step only once `isStepDone()` is true. Lessons are looked up in `LESSONS` (5.7.10).

#### Lesson engine additions (phase 41)

Steps can now check more than the graph, ask the user to pick a node, and point at nodes (5.7.10). The store and a small event log provide what they need.

```ts
// src/store/lessonEvents.ts (phase 41): no imports from the other stores, so any module can record events
export type LessonEventKind =
  | 'code-opened' | 'code-copied' | 'code-downloaded'   // CodeDialog; format: the ExportFormat ('yaml', 'dagitty', 'gml', …)
  | 'export-copied' | 'export-downloaded'               // ExportDialog; format: 'svg' | 'png' | 'pdf' | 'tikz'
  | 'link-copied'                                       // Share, after the clipboard write succeeded
  | 'undo'                                              // graphStore.undo, when it changed the graph
  | 'edge-refused'                                      // Canvas refused a connection; format: the EdgeCheck reason ('self' | 'duplicate' | 'cycle')
export interface LessonEvent { kind: LessonEventKind; format?: string }
export const useLessonEvents: UseBoundStore<StoreApi<{ recording: boolean; events: LessonEvent[] }>>
export function lessonEvent(event: LessonEvent): void      // appends while recording; a no-op otherwise
export function startRecording(): void                      // recording = true, events = []
export function clearEvents(): void                         // events = []
export function stopRecording(): void                       // recording = false, events = []

// src/lessons/types.ts: the context a step's check sees (type-only imports)
export interface LessonContext {
  graph: Graph
  selection: Selection                       // graphStore (4.6)
  sidePanelTab: SidePanelTab                 // uiStore (4.14)
  analysisOn: Record<AnalysisKey, boolean>   // uiStore (4.14)
  events: readonly LessonEvent[]             // recorded since the current step began
}

// src/store/lessonStore.ts additions
export interface LessonState {
  // … active, start, next, back, exit as above
  wrongPicks: string[]      // names of the wrongly picked nodes in the current step, oldest first
  revealed: boolean         // Show answer was used in the current step
  done: ReadonlySet<string> // ids of finished lessons; initial value readLessonsDone(safeLocalStorage())
  revealAnswer(): void      // selects the node named pick.answers[0] with graphStore.select, sets revealed
}
export function lessonContext(): LessonContext   // built from the stores at call time
export function isStepDone(): boolean            // stepDone(current step, lessonContext()); true when no lesson
```

- `start` calls `startRecording()`; `next` and `back` call `clearEvents()` after changing the step; `exit` calls `stopRecording()`. `start`, `next` and `back` also reset `wrongPicks` to `[]` and `revealed` to false.
- **Picks.** While a lesson runs, the store subscribes to `useGraphStore`'s `selection`. When the current step has a `pick`, the selection changes to a node, and that node's name is not in `pick.answers`, the name is appended to `wrongPicks`. Selecting an edge or nothing is ignored, and so is any selection once the step is done. Picking the same wrong node twice in a row counts once, because the selection does not change.
- **Progress.** `next` on the last step, when it is done, adds the lesson's id to `done`, writes it with `writeLessonsDone(safeLocalStorage(), done)`, and then exits. Closing a lesson (`exit`) does not mark it done. The tour counts like any other lesson.

```ts
// src/lib/lessonProgress.ts (phase 41)
export const LESSONS_DONE_KEY = 'graphcreator:lessons-done'
export function readLessonsDone(storage: Pick<Storage, 'getItem'> | null): Set<string>   // a JSON array of ids; null, throwing storage, bad JSON or a non-array give an empty set; non-string items are skipped
export function writeLessonsDone(storage: Pick<Storage, 'setItem'> | null, done: ReadonlySet<string>): void   // the ids sorted, as a JSON array; null or throwing storage is ignored
```

Additions to `UiState` (4.7): `lessonsOpen: boolean` (default false), `openLessons()` and `closeLessons()` for the Lessons dialog (5.7.11).

### 4.9 Theme store (`src/store/themeStore.ts`, phase 19)

```ts
type Theme = 'light' | 'dark'
const THEME_KEY = 'graphcreator:theme'
readTheme(storage: Pick<Storage, 'getItem'> | null): Theme   // 'dark' only when stored as 'dark'; null or throwing storage → 'light'
writeTheme(storage: Pick<Storage, 'setItem'> | null, theme: Theme): void   // ignores null or throwing storage
applyTheme(theme: Theme, instant = false): void   // toggles the `dark` class and sets `color-scheme` on <html>; `instant` pauses CSS transitions for one frame; no-op without a DOM
useThemeStore: { theme: Theme; setTheme(theme: Theme): void }   // initial theme from readTheme(safeLocalStorage()); setTheme writes, applies (instant) and sets
```

`index.html` has a small inline script that adds the `dark` class and `color-scheme: dark` when `localStorage['graphcreator:theme']` is `'dark'`, so a dark choice shows before the app's JavaScript runs. Values written by `next-themes` (`'light'`/`'dark'` under the same key) keep working.

### 4.10 Undo history (`src/store/graphStore.ts`, phase 21)

Additions to `GraphState` (4.6):

```ts
past: Graph[]                 // older graphs, most recent last; at most HISTORY_LIMIT
future: Graph[]               // graphs undone, most recent last; at most HISTORY_LIMIT
revision: number              // starts at 0; +1 on every undo and redo
moveNodes(moves: { id: string; pos: Position }[]): void   // one history step for any number of moves
undo(): void                  // no-op when past is empty
redo(): void                  // no-op when future is empty
export const HISTORY_LIMIT = 100
```

- **Recording:** every action that changes `graph` (`addNodeAt`, a successful `renameNode`, `updateNode`, `moveNode`, `moveNodes`, a valid `connect`, `updateEdge`, `removeSelection`, `setGraphName`, `layout`) pushes the previous graph onto `past` and clears `future`. When `past` would exceed `HISTORY_LIMIT` the oldest entry is dropped. An action that leaves the graph as it was pushes nothing and does not replace `graph`: a failed rename or connect, `updateNode`/`updateEdge` whose patch equals the current values (arrays compared item by item), `moveNode(s)` to the same positions, `removeSelection` of nothing, `setGraphName` with the current name. Snapshots are the immutable graph objects themselves; nothing is copied.
- **`replaceGraph`** clears `past` and `future` (and leaves `revision` alone). New, Open, the autosave restore, lesson start and exit, and opening a share link all go through it, so none of them can be undone and the history never crosses into or out of a lesson's practice graph.
- **`undo`** moves the current graph onto `future` and the last of `past` into `graph`; **`redo`** does the reverse. Both keep `selection` only when the selected node or edge exists in the new graph (otherwise `null`), set `focusNameOf` to `null` and increment `revision`.
- **Side panel:** `SidePanel` keys `NodeEditor` and `EdgeEditor` with `` `${id}:${revision}` `` so that their local field state (read on mount, 5.3) shows the restored values after an undo or redo.
- **Canvas drag stop** commits all dragged nodes with one `moveNodes` call, so a multi-node drag is one undo step. `moveNode` stays for single moves.
- History is editor state: it is not autosaved, not part of the file, and a reload starts with an empty history.

Details fixed in phase 21: no-op detection compares the new graph with the current one structurally (arrays item by item, a missing key equal to `undefined`), so patches the model normalises away, a rename to the same name (which returns `ok: true` with the unchanged graph), `moveNodes([])`, unknown ids and a layout that moves nothing all record nothing. `future` is capped at `HISTORY_LIMIT` too. A kept selection keeps its object. The shortcut handler checks text fields and open dialogs before modifier keys; ⌘+Y is not a redo key and Alt with any of these keys is ignored. A disabled rail button shows no tooltip.

### 4.11 Image export (`src/lib/imageExport.ts`, phase 22)

```ts
export type ImageFormat = 'svg' | 'png' | 'tikz'
export const EXPORT_PALETTE: { background: string; edge: string; roles: Record<Role, { fill: string; line: string; text: string }> }
export const EXPORT_MARGIN = 24
export function toSvg(graph: Graph, opts?: { fontDataUrl?: string }): string
export function svgSize(graph: Graph): { width: number; height: number }   // bounds + 2 × margin, rounded up; 2 × margin square for an empty graph
export function svgToPng(svg: string, scale: 1 | 2 | 3): Promise<Blob>    // the only function that uses the DOM
export function toTikz(graph: Graph): string
export function imageFileName(graphName: string | undefined, format: ImageFormat): string   // `${fileSlug(name)}.svg|.png|.tex`
```

The picture is built from the graph data with the canvas geometry, not by capturing the DOM, so no dependency is needed and the result does not depend on zoom, selection or theme.

- **Palette:** always the light theme. `EXPORT_PALETTE` holds the `:root` values of `--role-<role>-fill|line|text` and `--edge` from `src/index.css` as hex literals; `background` is `#ffffff`. A unit test checks the literals against `index.css` with the same parsing as `theme.test.ts`.
- **Geometry:** a node with diameter `d = nodeDiameter(name)` is a circle centred on `pos + d/2`. Its 2 px outline is drawn inside the circle (radius `d/2 − 1`) so the outer size matches the canvas. The name is `wrapLabel(name).lines`, centred, 13 px, weight 500, 16 px line pitch, in the role's text colour. An edge runs from `edgeEndpoints(source, target, 2)` with a 1.5 px stroke in the edge colour and a closed 9 × 9 arrowhead whose tip is the end point (as `FloatingEdge`). Edges are drawn before nodes. Nothing else: no selection, untyped dot, evidence chip or shadow. The drawing's top-left is the nodes' bounding box minus `EXPORT_MARGIN`.
- **SVG:** a standalone document with `xmlns`, `width`, `height` and `viewBox` from `svgSize`, a `<title>` with the graph name (or `Graph`), a white background `<rect>`, then the edges and nodes. Text uses `font-family: 'IBM Plex Sans', system-ui, sans-serif`. With `fontDataUrl`, a `<style>` adds an `@font-face` for IBM Plex Sans 500 from that data URL. `ExportDialog` passes the `?inline` import of `@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2`, so downloaded SVGs and PNGs look like the canvas on machines without the font. Names are XML-escaped.
- **PNG:** `svgToPng` loads the SVG (with the embedded font) into an `Image` from a Blob URL, draws it on a canvas of `width × scale` by `height × scale`, and resolves `canvas.toBlob(…, 'image/png')`. It rejects with `Could not create the PNG image.` when loading or encoding fails.
- **TikZ:** a `tikzpicture` fragment for a LaTeX document. It starts with the comment lines `% GraphCreator export: <name>` and `% Needs \usepackage{tikz} and \usetikzlibrary{arrows.meta}`. The picture uses `x=0.75pt, y=-0.75pt`, so canvas pixels (96 per inch) are used directly and y grows downward as on the canvas. Each role in use gets `\definecolor{gc<Role>Fill|Line|Text}{HTML}{…}` from the palette, and the edge colour `gcEdge`. Each node is `\node[circle, draw=…, fill=…, text=…, line width=1.5pt, minimum size=<0.75·d>pt, inner sep=0pt, align=center, font=\sffamily\small] (v<i>) at (<cx>,<cy>) {<lines joined by \\>};` with `v1, v2, …` in graph order. Each edge is `\draw[-{Stealth[length=6.75pt,width=6.75pt]}, line width=1.125pt, draw=gcEdge, shorten >=1.5pt] (v<i>) -- (v<j>);`, so TikZ finds the rims itself. Names are LaTeX-escaped (`\ { } $ & # ^ _ ~ %`).
- **`src/lib/download.ts`** gains `downloadBlob(filename: string, blob: Blob): void`; `downloadText` uses it.

Details fixed in phase 22: each wrapped line is its own `<text>` inside one `<g>` carrying the font attributes, with its baseline 4.875 px below the middle of its 16 px line (from IBM Plex Sans's ascent and descent, matching the CSS layout; no `dominant-baseline`). Numbers have at most two decimals; an edge between coincident centres is skipped. In TikZ the `\definecolor` lines come before `\begin{tikzpicture}`, colours are upper-case hex, `\`, `^` and `~` become `\textbackslash{}`, `\textasciicircum{}` and `\textasciitilde{}`, and a wrapped line starting with `[` or `*` gets a leading `{}` so `\\` does not read it as an argument. TikZ centres the 1.5 pt stroke on the circle, so circles are about 0.75 pt wider than on the canvas. SVG Copy copies the downloaded text, embedded font included (about 32 kB). Format and Scale keep their choice while the page is open. Format and Scale also have visible labels. Failed SVG and TikZ downloads toast `Could not download the file: …` as `CodeDialog` does.

#### PDF, legend and dark theme (phases 31, 37, 38)

Changes to the interface above (phase 31 fixes the signatures; the old calls keep working because every option is optional):

```ts
// src/lib/imageExport.ts
export type ImageFormat = 'svg' | 'png' | 'pdf' | 'tikz'
export type ImageTheme = 'light' | 'dark'
export interface ImageOptions { theme?: ImageTheme; legend?: boolean }      // defaults: 'light', false
export function toSvg(graph: Graph, opts?: ImageOptions & { fontDataUrl?: string }): string
export function svgSize(graph: Graph, opts?: ImageOptions): { width: number; height: number }
export function toTikz(graph: Graph, opts?: { legend?: boolean }): string   // always the light palette
export function imageFileName(graphName: string | undefined, format: ImageFormat): string   // adds `.pdf`

// src/model/palette.ts (moved here from imageExport.ts, so src/model writers can use it)
export interface ExportPalette {
  background: string; foreground: string; border: string; edge: string
  roles: Record<Role, { fill: string; line: string; text: string }>
}
export const EXPORT_PALETTES: Record<ImageTheme, ExportPalette>   // ImageTheme is defined here and re-exported by imageExport.ts

// src/lib/imageScene.ts
export const LEGEND = { width: 96, padding: 8, row: 20, swatch: 10, gap: 8, beside: 16, font: 12 } as const
export type LegendCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'beside'
export interface SceneCircle { cx: number; cy: number; r: number; fill: string; stroke: string; strokeWidth: number }
export interface SceneText { x: number; y: number; text: string; size: number; weight: 400 | 500; color: string; anchor: 'middle' | 'start' }   // y is the baseline
export interface SceneEdge { x1: number; y1: number; x2: number; y2: number; color: string; width: number; head: [[number, number], [number, number], [number, number]] }
export interface SceneLegend { x: number; y: number; width: number; height: number; corner: LegendCorner; background: string; border: string; items: { role: Role; label: string; swatch: SceneCircle; text: SceneText }[] }
export interface Scene {
  title: string; width: number; height: number; background: string
  edges: SceneEdge[]; circles: SceneCircle[]; texts: SceneText[]   // in drawing order; texts are the wrapped name lines
  nodeIds: string[]                // circles[i] belongs to graph node nodeIds[i]
  legend: SceneLegend | null
}
export function imageScene(graph: Graph, opts?: ImageOptions): Scene

// src/lib/pdfExport.ts
export function sceneToPdf(scene: Scene): Uint8Array
export function toPdf(graph: Graph, opts?: ImageOptions): Uint8Array   // sceneToPdf(imageScene(graph, opts))
```

- **One scene for every format.** `imageScene` holds everything 4.11 "Geometry" describes, in image coordinates (the top-left of the image is 0,0; y grows downward): the circles, the edges with their three-point arrowheads, the wrapped name lines with their baselines, the legend and the size. `toSvg` and `sceneToPdf` only draw a scene; PNG goes through the SVG as before; `toTikz` uses the scene's node centres, its colours and its legend box. Phase 37 rewrites `toSvg` on top of the scene; the SVG for `{ theme: 'light', legend: false }` stays identical to the phase 22 output (the existing tests keep passing).
- **Palettes.** `EXPORT_PALETTES.light` is the `:root` values of `--background`, `--foreground`, `--border`, `--edge` and the role tokens from `src/index.css`; `EXPORT_PALETTES.dark` is the same tokens from `.dark`. The light background stays `#ffffff` (equal to `:root --background`); the dark one is `#0e1513`. `src/model/palette.test.ts` checks every literal against `index.css` (moved from `imageExport.test.ts`, with the same parsing as `theme.test.ts`). The DOT and Mermaid writers (4.15) use `EXPORT_PALETTES.light`.
- **Theme.** `theme: 'dark'` swaps the palette: background, edge colour and role colours. Nothing else changes (sizes, fonts, positions). TikZ has no theme: LaTeX documents are printed on white.
- **Legend** (`legend: true`). A box listing only the roles in use, in `ROLES` order, one row each: a swatch circle (diameter `LEGEND.swatch`, the role's fill and a 1.5 px line in the role's line colour) and the `ROLE_LABELS` text (`LEGEND.font` px, weight 400, `foreground` colour, anchor start, `LEGEND.gap` px right of the swatch). The box is `LEGEND.width` wide and `2 × padding + n × row` tall, with a 1 px `border`-coloured outline, 4 px corner radius and the `background` fill. There is no title.
  - **Placement, best free corner.** The box is tried in the top-right, top-left, bottom-right and bottom-left corner of the drawing area (the nodes' bounding box, so the box sits inside the margin like the nodes). A corner is free when the box grown by 8 px on every side overlaps no circle (as its bounding square) and crosses no edge segment. The first free corner wins.
  - **Beside.** When no corner is free, the image grows to the right: the box sits `LEGEND.beside` px right of the nodes' bounding box, top-aligned with it, and the width grows by `LEGEND.beside + LEGEND.width`. The `corner` is `'beside'`.
  - Because the corners lie inside the nodes' bounding box, a graph whose box is narrower or shorter than the legend (a one-node graph, for example) always puts it beside. Beside, the height also grows when the legend is taller than the drawing: `height = max(height, ceil(legend height + 2 × EXPORT_MARGIN))`. `svgSize` includes the legend. A graph without nodes has no legend.
  - **TikZ legend:** at the scene's legend position (light palette), a `\draw[gcBorder, fill=white, rounded corners=3pt]` rectangle, one `\node[circle, draw=gc<Role>Line, fill=gc<Role>Fill, line width=1.125pt, minimum size=7.5pt, inner sep=0pt]` swatch and one `\node[anchor=west, font=\sffamily\footnotesize]` label per row; `gcBorder` and `gcText` join the `\definecolor` lines. Without `legend` the TikZ output is unchanged.
- **Details fixed in phase 37:**
  - A circle blocks a corner by its full canvas square; boxes that only touch do not overlap. An edge blocks a corner when the segment from its start to the arrowhead tip touches, crosses or lies inside the grown box (Liang–Barsky clipping).
  - Row `i`'s middle is `y + padding + (i + 0.5) × row`. The swatch is centred at `x + padding + swatch / 2` with radius `swatch / 2 − 0.75`, so its 1.5 px line stays inside. The label starts at `x + padding + swatch + gap` with its baseline at `middle + 0.375 × font` (the node text's rule).
  - SVG: the legend comes after the nodes in its own `<g>` (12 px, weight 400): a `<rect … rx="4">` with a 1 px centred border, then a `<circle>` and a `<text>` per row. The light SVG without a legend is byte-identical to phase 22's, checked against stored snapshots in `src/lib/__snapshots__/imageExport/`.
  - TikZ: `gcBorder` and `gcText` follow `gcEdge`; the legend comes after the edges; each label is `\node[anchor=west, inner sep=0pt, text=gcText, font=\sffamily\footnotesize]` at the row middle.
  - `EXPORT_MARGIN` now lives in `imageScene.ts` and is re-exported by `imageExport.ts`. Scene numbers are unrounded; the writers round.
- **PDF** (`sceneToPdf`): a hand-written PDF 1.4 file, no dependency. It is built as text with byte offsets counted for the `xref` table (the content is ASCII plus WinAnsi bytes, one byte per character).
  - Objects: catalog, pages, one page, the font, the content stream, and an `/Info` dictionary with `/Title (<graph name or Graph>)` and `/Producer (GraphCreator)`. The content stream is not compressed.
  - The page's `/MediaBox` is `[0 0 <width × 0.75> <height × 0.75>]` (CSS pixels to points, 96 to 72 per inch). The stream starts with `0.75 0 0 -0.75 0 <height × 0.75> cm`, so scene coordinates are used directly.
  - Background: a filled rectangle. Edges: a stroked line (`w` = edge width) and a filled arrowhead triangle. Circles: four Bézier curves (κ = 0.5523), filled and stroked (`B`). The legend box: a rounded rectangle with Bézier corners.
  - Text: the standard font Helvetica (`/Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding`; no font is embedded). Each line is drawn with `BT /F1 <size> Tf 1 0 0 -1 <x> <y> Tm (<text>) Tj ET` (the `-1` undoes the page flip). Weight 500 also uses Helvetica. A centred line starts at `x − width / 2`, its width summed from Helvetica's AFM character widths (a 224-entry table for WinAnsi codes 32–255, taken from Adobe's core-font metrics, which may be redistributed) times `size / 1000`. Characters outside WinAnsi are written as `?`. `(`, `)` and `\` are escaped.
  - Colours are set with `rg`/`RG` from the scene's hex values.
- **Details fixed in phase 38:**
  - The widths come from Adobe's 1997 `Helvetica.afm` (Core 14 AFM files), mapped to WinAnsi codes as in the PDF reference, appendix D. Codes 128–159 are mapped from their Unicode characters (€, –, curly quotes); control characters also become `?`.
  - A `/Title` with characters outside printable ASCII is written as a UTF-16BE hex string (`<FEFF…>`), so names such as "Größe β" keep their characters in the metadata. A blank title becomes `Graph`.
  - Layout: a binary comment line after the header; objects 1 catalog, 2 pages, 3 page, 4 font, 5 content, 6 info; the trailer `/Size 7 /Root 1 0 R /Info 6 0 R`.
  - Drawing order: background, edges, circles, texts, then the legend. Circle and legend paths are closed with `h`; a circle with `strokeWidth` 0 is only filled. The legend's corner radius is 4 px (at most half the box).
  - Coordinates have at most two decimals and never `-0`; colour components three decimals; hex colours may be `#rgb` or `#rrggbb`.
  - Checked with `pdfinfo`, `pdftotext`, `pdftoppm` and Ghostscript (`qpdf` and `mutool` are not installed).
- **`toPdf` is pure** (no DOM), so the Export dialog downloads `new Blob([toPdf(…)], { type: 'application/pdf' })`.

### 4.12 Share links (`src/lib/shareLink.ts`, phase 23)

```ts
export const SHARE_PREFIX = '#g='
export const SHARE_LONG = 8000           // characters; longer links get a warning
export function encodeShare(graph: Graph): Promise<string>          // base64url(deflate-raw(UTF-8 toYaml(graph))), no padding
export function shareUrl(graph: Graph, base?: string): Promise<string>   // base defaults to location.origin + location.pathname; returns base + SHARE_PREFIX + payload
export function decodeShare(hash: string): Promise<Result<Graph> | null>  // null when hash does not start with SHARE_PREFIX
```

- Compression uses the browser's `CompressionStream('deflate-raw')` and `DecompressionStream`, so there is no dependency. The payload is the canonical `toYaml` text, so a link carries everything a `.dag.yaml` file does.
- `decodeShare` decompresses and parses with `parseYaml`. A payload that is not valid base64url or does not decompress gives the error `This share link is damaged or incomplete.`; a payload that decompresses but does not parse gives `parseYaml`'s own errors.
- The fragment is never sent to a server: browsers do not send the part after `#`, and the app has no backend. This keeps the "No backend" constraint (section 1).

Details fixed in phase 23: `shareLink.ts` also exports the message texts and `copyShareLink(graph)`, the Share action itself (clipboard and toasts), so `TopBar` only adds the button; any Share failure, encoding included, shows the clipboard error toast. Base64url uses `btoa`/`atob`; an empty payload, `=` padding, a length of 1 modulo 4, invalid UTF-8 and trailing bytes all count as damaged. "Stored graph empty" means no nodes (as `confirmReplace`), so a named graph without nodes is replaced without asking. A `#g=` fragment skips the automatic welcome even when the link is damaged, without marking the visitor as welcomed. The "with N warnings" toast has no Show button (the warnings badge lists them). The shared-graph dialog keeps the close (X) button, which counts as Keep my graph. The fit uses 300 ms, or 0 with reduced motion (5.7.5). `SharedGraphDialog.tsx` exports a function next to the component, with an `oxlint-disable-next-line react/only-export-components` comment.

### 4.13 Causal analysis (`src/model/analysis/`, phases 24–28)

Pure TypeScript like the rest of `src/model/`: no React, Zustand or DOM. Every algorithm is written here from the cited papers; no dagitty code (GPL) is read or copied. dagitty-R is used only at development time, as an outside oracle that produces the expected answers in `src/model/__fixtures__/analysis/reference.json` (phase 24).

**Roles in the analysis.** All functions take node **ids** and return node ids; sets are `string[]` sorted in graph order (the order of `graph.nodes`).

| Role | Meaning in the analysis |
|---|---|
| exposure | in X, the exposure set |
| outcome | in Y, the outcome set |
| latent | not observed: never part of an adjustment set, a separating set, an instrument or its conditioning set |
| selected | S: the data exist only for S = 1. Always conditioned on, never listed inside a set; sets are judged by the selection criterion below (as dagitty-R does) |
| adjusted | Z, the user's own adjustment set; checked, never changed by the analysis (except by "Use this set", 4.14) |
| other | an ordinary observed variable |

Only the **total effect** of X on Y is analysed, with X and Y as sets (the joint effect of all exposures on all outcomes, as in DAGitty). Direct effects are in IDEAS.md.

```ts
// src/model/analysis/types.ts
export type NodeSet = string[]                 // node ids, graph order, no duplicates
export interface Roles { x: NodeSet; y: NodeSet; s: NodeSet; z: NodeSet; latent: NodeSet; observed: NodeSet }
export function rolesOf(graph: Graph): Roles   // observed = every non-latent node; all in graph order

export interface AdjustmentResult {
  sets: NodeSet[]          // minimal sufficient adjustment sets, S excluded; [] = none exists; [[]] = the empty set suffices
  truncated: boolean       // true when more than MAX_SETS exist; sets holds the first MAX_SETS
  zSufficient: boolean     // Z satisfies the adjustment criterion (with S: the selection criterion)
  zForbidden: NodeSet      // members of Z that lie on or after a proper causal path (Forb(X, Y)), for the report
  selectionBias: boolean   // S is not empty and condition (c) or (d) of the selection criterion fails: no set can work
}
export type PathKind = 'causal' | 'biasing'
export interface PathInfo { nodes: string[]; kind: PathKind; open: boolean }   // nodes from an exposure to an outcome
export interface PathsResult {
  paths: PathInfo[]        // sorted: causal before biasing, then by length, then by the names along the path
  truncated: boolean       // more than PATH_LIMIT paths exist; paths is then empty and nothing is highlighted
  causalEdges: string[]    // edge ids on at least one open causal path (and on no open biasing path)
  biasingEdges: string[]   // edge ids on at least one open biasing path
}
export interface Independence { a: string; b: string; given: NodeSet }   // a before b in graph order
export interface Instrument { instrument: string; given: NodeSet }
export type AnalysisStatus = 'ok' | 'no-exposure-or-outcome'
export interface Analysis {
  status: AnalysisStatus   // 'no-exposure-or-outcome' when X or Y is empty; then only roles and independencies are filled
  roles: Roles
  adjustment: AdjustmentResult | null
  paths: PathsResult | null
  independencies: Independence[]                 // does not need X or Y
  instruments: Instrument[] | 'needs-single'     // 'needs-single' unless |X| = |Y| = 1
}
export const MAX_SETS = 100
export const PATH_LIMIT = 500
```

```ts
// src/model/analysis/dsep.ts (phase 24)
export function parents(graph: Graph, id: string): NodeSet
export function children(graph: Graph, id: string): NodeSet
export function ancestors(graph: Graph, ids: Iterable<string>): Set<string>     // includes ids themselves
export function descendants(graph: Graph, ids: Iterable<string>): Set<string>   // includes ids themselves
export function reachable(graph: Graph, from: Iterable<string>, given: Iterable<string>): Set<string>
export function dConnected(graph: Graph, xs: Iterable<string>, ys: Iterable<string>, given: Iterable<string>): boolean
export function withoutEdges(graph: Graph, pred: (e: GEdge) => boolean): Graph   // helper for the derived graphs below
// src/model/analysis/adjustment.ts (phase 25)
export function properCausalNodes(graph: Graph, xs: NodeSet, ys: NodeSet): Set<string>   // PCP(X, Y)
export function forbidden(graph: Graph, xs: NodeSet, ys: NodeSet): Set<string>           // Forb(X, Y)
export function properBackdoorGraph(graph: Graph, xs: NodeSet, ys: NodeSet): Graph
export function isAdjustmentSet(graph: Graph, xs: NodeSet, ys: NodeSet, zs: NodeSet, s?: NodeSet): boolean   // s defaults to []: the selection criterion when not empty
export function minimalAdjustmentSets(graph: Graph, roles: Roles): { sets: NodeSet[]; truncated: boolean }
export function adjustment(graph: Graph, roles: Roles): AdjustmentResult
// src/model/analysis/paths.ts (phase 26)
export function classifyPaths(graph: Graph, roles: Roles): PathsResult
// src/model/analysis/independencies.ts (phase 27)
export function impliedIndependencies(graph: Graph, roles: Roles): Independence[]
// src/model/analysis/instruments.ts (phase 28)
export function instrumentalVariables(graph: Graph, roles: Roles): Instrument[] | 'needs-single'
// src/model/analysis/index.ts (phase 24)
export function analyze(graph: Graph): Analysis
```

Phase 24 writes `types.ts`, `dsep.ts` and `index.ts` for real and the four other modules as **stubs** with the final signatures that return empty results (`adjustment` → `{ sets: [], truncated: false, zSufficient: false, zForbidden: [], selectionBias: false }`, `classifyPaths` → no paths, `impliedIndependencies` → `[]`, `instrumentalVariables` → `[]` or `'needs-single'`; the helpers in `adjustment.ts` throw `Error('Not implemented')`), so the app works and the wave 14 phases can be built side by side.

**Algorithms.**

- **d-separation (`reachable`, `dConnected`):** Bayes-Ball reachability (Shachter 1998; Koller & Friedman 2009, Algorithm 3.1). Let `A = ancestors(given)`. Search over pairs (node, direction), starting with (x, up) for every x in `from`. From (v, up) with v ∉ given: visit every parent as (p, up) and every child as (c, down). From (v, down): if v ∉ given, visit every child as (c, down); if v ∈ A, visit every parent as (p, up). `reachable` returns every visited node not in `given`, including the start nodes that are not in `given`. `dConnected` is true when the sets overlap outside `given`, or some y ∈ ys is in `reachable(xs, given)`. Linear in the size of the graph.
- **Proper causal paths:** `G_{X̄}` is the graph with every edge into X removed and `G_{X̲}` the graph with every edge out of X removed. `PCP(X, Y) = (descendants_{G_{X̄}}(X) \ X) ∩ ancestors_{G_{X̲}}(Y)`. `Forb(X, Y) = descendants_G(PCP(X, Y)) ∪ X`. The proper back-door graph `G^pbd` removes every edge `x → w` with x ∈ X and w ∈ PCP(X, Y) (van der Zander, Liśkiewicz & Textor 2014).
- **Adjustment criterion (`isAdjustmentSet(graph, xs, ys, zs, s = [])`):** without selected nodes, Z is an adjustment set for (X, Y) when Z ∩ Forb(X, Y) = ∅ and X and Y are d-separated by Z in `G^pbd` (Shpitser, VanderWeele & Robins 2010; Perković et al. 2018).
- **Selection criterion (S not empty):** the data are a sample with S = 1 only, and the adjustment formula is `Σ_z P(y | x, z, S = 1) P(z | S = 1)`. Z is sufficient when all four hold (Correa, Tian & Bareinboim 2018, generalized adjustment without external data): (a) Z ∩ Forb(X, Y) = ∅; (b) X and Y are d-separated by Z ∪ S in `G^pbd`; (c) Y and S are d-separated by X in `G_{X̄}`; (d) every x ∈ X that is an ancestor of S is d-separated from Y (given nothing) in `G_{X̲}`. With S empty, (c) and (d) hold trivially and this is the criterion above. (c) and (d) do not depend on Z: when either fails, `selectionBias` is true and no set is sufficient. This matches dagitty-R 0.3.4's `isAdjustmentSet` with a `[selected]` node on 2,752 cases (300 seeded random DAGs with 5–8 nodes, every Z of up to two nodes), checked on 2026-11-09.
- **Minimal sets (`minimalAdjustmentSets`):** the minimal sets W ⊆ R = observed \ (Forb(X, Y) ∪ Y ∪ S) that are sufficient (with S: by the selection criterion, so W ∪ S must separate in (b)). When `selectionBias` is true there are none. "Minimal" means no proper subset of W works. Implementation: van der Zander, Liśkiewicz & Textor (2019), algorithms FindMinSep and ListMinSep (polynomial delay), run on `G^pbd` with I = S and R as above, written from the paper; S is removed from each result. Stop after `MAX_SETS` sets and set `truncated`. Sort the sets by size, then by graph order of their members. A test checks the result against brute force (every subset of R, for graphs with at most 12 nodes in R) and against `reference.json`.
- **Paths (`classifyPaths`):** every simple path in the skeleton (directions ignored) from some x ∈ X to some y ∈ Y whose inner nodes are in neither X nor Y. A path is **causal** when every edge points from the exposure end towards the outcome end, otherwise **biasing**. Given C = Z ∪ S, a path is **open** when every inner collider (→ v ←) is in `ancestors(C)` and no inner non-collider is in C; otherwise **closed**. Enumeration is a depth-first search that stops at `PATH_LIMIT + 1` paths: then `truncated: true` and `paths`, `causalEdges` and `biasingEdges` are empty. An edge on both an open causal and an open biasing path counts as biasing only.
- **Implied independencies (`impliedIndependencies`):** for every unordered pair a, b of observed nodes that are not in S and not adjacent, in graph order (a's index, then b's), one minimal separating set: FindMinSep (as above) on `G` with I = S and R = observed \ ({a, b} ∪ S), and `given` is the set it returns (S is always conditioned on and is not listed). A pair with no separating set inside R is left out (its independence is not testable from the observed variables). If several minimal sets exist, any one that FindMinSep returns is fine; tests check validity and minimality, not the exact set.
- **Instruments (`instrumentalVariables`):** only when |X| = |Y| = 1 (otherwise `'needs-single'`). Following van der Zander, Textor & Liśkiewicz (2015, "Efficiently finding conditional instruments for causal inference"): an observed node i ∉ {x, y} ∪ S is a conditional instrument given a set W of observed nodes when W contains no node of `descendants_G(PCP({x}, {y}) ∪ {y})` (no descendant of a causal-path node and no descendant of the outcome; these nodes count as unmeasured while the nearest separator is searched), i is d-connected to x given W ∪ S in G, and i is d-separated from y given W ∪ S in `G^pbd`. For each candidate i, W is the "nearest separator" of i and y in `G^pbd` relative to x as in the paper; if it yields a valid instrument, i is listed with that W (W = [] for an unconditional instrument). Sorted by graph order of i.
- **`analyze`:** `rolesOf`, then `status`; with `'ok'` all four results, otherwise `adjustment`, `paths` and `instruments` are `null`, `null` and `'needs-single'`.

Details fixed in phase 25: `findMinSep(graph, xs, ys, include, restrict)` returns the separator **including** `include` (as in the paper), in graph order, or null; callers that do not list S remove it themselves. Its candidates start from R ∩ An(X ∪ Y ∪ I), not the paper's R ∩ An(X ∪ Y): with X → W → I ← Y and I always included, {W, I} is the only separator and W is no ancestor of X or Y (confirmed by the brute-force tests with selected nodes). ListMinSep follows the paper's reduction and lists minimal separators by backtracking in the style of Takata (2010). When `truncated`, `sets` holds the first `MAX_SETS` sets the search finds, sorted; not necessarily the smallest ones.

Details fixed in phase 26: the path search only steps into a node from which an outcome can still be reached without revisiting the path or touching an exposure, so its work is bounded by the number of paths. "By the names along the path" compares names one by one in plain code-unit order (not `localeCompare`), so the order does not depend on the locale. `data-path` is set on the edge's line and on its arrowhead path; `Canvas` keeps `connectFrom`, the path marks and `hoverNodeIds` in one memoised overlay.

Details fixed in phase 28: written from the paper's NEAREST-SEPARATOR and ANCESTRAL-INSTRUMENT algorithms. The separator search runs in the moral graph of the ancestors of {y, i} ∪ S with S removed, walks from y through unmeasured nodes (latent and forbidden nodes) to the first measured ones, and keeps those that reach i without passing another, so W is minimal and independent of search order. Tests compare with a brute force over every allowed W among the ancestors (the paper's Theorem 4.3) on 300 random DAGs.

Details fixed in phase 30: `independencies.ts` imports `findMinSep` and `instruments.ts` imports `properCausalNodes` from `adjustment.ts`; their private copies are gone. NEAREST-SEPARATOR stays private to `instruments.ts`, because it is a different search (the separator nearest to y, not a minimal one). The gallery gained `selection-on-exposure`, which checks selection condition (d) against dagitty-R.

**Reference fixtures (phase 24).** `src/model/__fixtures__/analysis/` holds a gallery of dagitty files with roles: `confounding.dagitty.txt` (copied from the existing fixture), `m-bias.dagitty.txt` (copied), `mediation`, `collider`, `butterfly`, `confounding-by-indication`, `selection-bias` (with a `selected` node, written as dagitty's `[selected]`), `latent-confounder`, `two-exposures-two-outcomes`, `instrument` (Z → X → Y, U → X, U → Y, U latent) and `no-adjustment-possible`. The gallery also has `selection-confounder` (E → D, A → E, A → S, C → S, C → D, S selected; no set, `selectionBias`) and `selection-recoverable` (E → D, A → E, A → S, C → E, C → D, S selected; dagitty-R gives `{C}`). Phase 30 added `selection-on-exposure` (E → D, E → S, C → E, C → D, S selected): {C} meets conditions (a)–(c), but E is an ancestor of S and E ← C → D connects E and D in `G_X̲`, so (d) fails and dagitty-R gives no set. `scripts/dagitty-reference.R` reads each file with `dagitty::dagitty()` and writes `reference.json`: per file, `adjustmentSets(g0, type = "minimal", effect = "total")` where `g0` is `g` with the adjusted roles cleared (dagitty-R otherwise lists only sets containing every adjusted node, while GraphCreator lists them regardless of Z), `isAdjustmentSet(g, adjustedNodes(g))`, `impliedConditionalIndependencies(g, type = "missing.edge")` as pairs and sets (duplicates kept as dagitty gives them), `instrumentalVariables(g)` when there is one exposure and one outcome, and `paths(g, Z = c(adjustedNodes(g), selected nodes))` per (exposure, outcome) pair with open flags, keeping only paths whose inner nodes are neither exposures nor outcomes. A `random` section adds 100 seeded random DAGs (5–8 nodes, one exposure, one outcome, one selected node) with their minimal sets from `adjustmentSets`, for the selection criterion. Names, not ids, are written; tests map them through `parseDagitty`. The JSON is committed; CI never runs R. Install once with `Rscript -e 'install.packages("dagitty", lib = Sys.getenv("R_LIBS_USER"))'`; on a machine without libv8 or libnode, set `DOWNLOAD_STATIC_LIBV8=1` (V8's own suggestion), and the R package `curl` needs the `libcurl4-openssl-dev` headers.

**Where GraphCreator differs from dagitty-R on purpose:** adjustment sets are listed regardless of the Adjusted nodes (above); implied independencies leave S out of the pairs and always condition on S, because all data have S = 1, whereas dagitty-R treats S as an ordinary node. So for gallery files with a selected node, the independency tests check validity and minimality themselves instead of comparing with `reference.json`. Instruments also condition on S (dagitty-R 0.3.4 does not): `selection-confounder` gives `A | C` where `reference.json` has `A`. And an instrument's W may not contain descendants of mediators, where dagitty-R allows them (stricter on 14 of 4,500 random graphs compared during phase 28).

### 4.14 Analysis state (`uiStore`, `graphStore`, `useAnalysis`; phase 24)

Additions to `UiState` (4.7):

```ts
export type AnalysisKey = 'report' | 'adjustment' | 'paths' | 'instruments' | 'independencies'   // also the section order
export const ANALYSIS_KEYS: readonly AnalysisKey[]
export const ANALYSIS_KEY = 'graphcreator:analysis'
export const ANALYSIS_DEFAULTS: Record<AnalysisKey, boolean>   // report and adjustment true, the rest false
sidePanelTab: 'edit' | 'analysis'          // default 'edit'
analysisOn: Record<AnalysisKey, boolean>   // initial value from readAnalysisOn(safeLocalStorage())
hoverNodeIds: string[]                     // nodes a hovered or focused Analysis item points at; default []
setSidePanelTab(tab: 'edit' | 'analysis'): void
setAnalysisOn(key: AnalysisKey, on: boolean): void   // also writes all toggles with writeAnalysisOn
setHoverNodeIds(ids: string[]): void
export function readAnalysisOn(storage: Pick<Storage, 'getItem'> | null): Record<AnalysisKey, boolean>
export function writeAnalysisOn(storage: Pick<Storage, 'setItem'> | null, on: Record<AnalysisKey, boolean>): void
```

`readAnalysisOn` parses the JSON object under `ANALYSIS_KEY` and takes each key's boolean when present, else the default; null storage, a throwing storage or bad JSON give `ANALYSIS_DEFAULTS`. `writeAnalysisOn` ignores null or throwing storage (as `themeStore`, 4.9). The toggles are a viewer preference: not part of the graph, the file or the undo history.

Addition to `GraphState` (4.6, 4.10):

```ts
setAdjustedSet(nodeIds: string[]): void
```

Every node in `nodeIds` whose role is `other` or `adjusted` gets role `adjusted`; every other node with role `adjusted` gets role `other`. Exposure, outcome, latent and selected nodes are never changed. One undo step; a call that changes nothing records nothing (4.10 rules).

`src/components/useAnalysis.ts`:

```ts
export function useAnalysis(): Analysis   // analyze(graph), memoised on the graph object (graphs are immutable)
```

`CircleNodeData` and `FloatingEdgeData` (`src/components/canvas/types.ts`) gain optional fields, so the phase 24 Canvas still typechecks:

```ts
CircleNodeData.highlighted?: boolean        // in uiStore.hoverNodeIds: shows the hover rim (5.7.7)
FloatingEdgeData.path?: 'causal' | 'biasing'   // only while analysisOn.paths and the paths are not truncated
```

### 4.15 Exchange formats (`src/model/`, phases 31–36)

Six more text formats, so a graph can go to the tools epidemiologists and data scientists use. Each lives in its own pure module in `src/model/`. GraphCreator opens GML, DOT and networkx JSON, as well as writing them. bnlearn, Tetrad and Mermaid are export only.

| Format | Module | Writes | Opens | Used by | Carries |
|---|---|---|---|---|---|
| GML | `gml.ts` | `toGml` | `parseGml` | DoWhy (its recommended input), networkx, yEd, Gephi | everything |
| DOT | `dot.ts` | `toDot` | `parseDot` | Graphviz, DoWhy, pydot | everything, plus role colours |
| networkx JSON | `networkx.ts` | `toNetworkx` | `parseNetworkx` | networkx (`node_link_graph`), Python generally | everything |
| bnlearn | `bnlearn.ts` | `toBnlearn` | — | R `bnlearn::model2network` | structure only |
| Tetrad | `tetrad.ts` | `toTetrad` | — | Tetrad, causal-learn (`txt2generalgraph`) | structure only |
| Mermaid | `mermaid.ts` | `toMermaid` | — | Markdown, GitHub, Notion | names, edges, role colours |

**Node ids.** Every format except Mermaid names nodes by the same safe ids as dagitty export (`toDagittyIds`, 4.2: `Maternal smoking` → `Maternal_smoking`). They are valid R and Python names, so they can match the column names of a data set: DoWhy, bnlearn and networkx look nodes up by these names. Where a format can carry more, the full name is kept as well (GML and JSON `name`, DOT `label`). Mermaid uses `v1, v2, …` in graph order, because some words (`end`, `graph`) are reserved there.

**Numbers** are written with at most two decimals and never as `-0`, as in 4.11. Every writer ends its output with a newline and skips edges whose endpoints are missing, as `toYaml` does.

#### Shared parts (`src/model/exchange.ts`, phase 31)

```ts
/** A node read from GML, DOT or networkx JSON, before checking. Fields are as written in the file. */
export interface ExchangeNode {
  key: string                       // the format's own node id (GML id, DOT id, JSON id), as text
  name: string                      // name ?? label ?? key, trimmed
  role?: unknown; varType?: unknown; levels?: unknown; description?: unknown; unit?: unknown
  centre?: { x: number; y: number } // canvas px, y down, the centre of the circle
  line?: number
}
export interface ExchangeEdge { source: string; target: string; evidence?: unknown; note?: unknown; line?: number }   // source/target are node keys
export function buildGraph(
  input: { name?: string; nodes: ExchangeNode[]; edges: ExchangeEdge[] },
  warnings: Issue[],               // the parser's own warnings (ignored attributes), kept first
): Result<Graph>
export function encodeList(items: string[]): string    // ';'-joined; '\' → '\\', ';' → '\;' inside items
export function decodeList(text: string): string[]     // the reverse; empty items are dropped; a lone trailing '\' is kept
export function ignoredAttribute(format: string, key: string, line?: number): Issue
// message: Ignored <format> attribute "<key>" (not used by GraphCreator).
```

`buildGraph` turns the parsed nodes and edges into a `Graph`, so the three parsers share one set of checks and messages:

1. **Field types.** A node's `role` must be one of `ROLES` (`Node "SES": role must be one of exposure, outcome, latent, adjusted, selected, other.`). `var_type` must be one of `VAR_TYPES` (`Node "SES": var_type must be one of categorical, ordinal, continuous, discrete.`). `levels` and `evidence` must be lists of text, or one text, which counts as a one-item list (`Node "SES": levels must be a list of text.`). `description`, `unit` and `note` must be text. Numbers are accepted where text is expected and turned into text. Empty or whitespace-only text counts as absent (3.2).
2. **Edges.** An edge must name existing node keys: `The edge from "A" to "B" refers to "B", but there is no node with that id.`, with `line` when known. A duplicate edge is merged silently, keeping the first edge's evidence and note (dagitty does the same).
3. **Graph.** Nodes and edges get fresh internal ids, in file order. A node's `pos` is `centre − nodeDiameter(name) / 2` (the top-left of its square, 3.2). If any node lacks `centre`, `autoLayout` runs on the whole graph and adds the YAML warning `Some nodes had no position, so the graph was laid out automatically.`
4. **Checks.** `validateGraph` (4.4) supplies the errors: empty and duplicate names, `levels` or `unit` on the wrong type, self-edges and cycles. If there are any, the result is `{ ok: false, errors }` with every problem from steps 1–4, and nothing is loaded. Otherwise the warnings are the parser's own, then `validateGraph`'s.

Details fixed in phase 31:
- `buildGraph` also rejects two nodes with the same key (`Two nodes have the id "A".`, with `line`), which GML and JSON files can contain.
- Each error carries the node's or edge's `line` when the parser knows it.
- An edge with a missing endpoint is left out before `validateGraph` runs, so it gives only its own message.
- The layout warning is added only when the graph has nodes.

#### Formats and files (`src/model/fileFormat.ts`, phase 31)

```ts
export type GraphFormat = 'yaml' | 'dagitty' | 'gml' | 'dot' | 'networkx'   // what Open reads
export type ExportFormat = GraphFormat | 'bnlearn' | 'tetrad' | 'mermaid'    // what Save as… writes
export const EXPORT_FORMATS: readonly ExportFormat[]   // the menu order: yaml, dagitty, gml, dot, networkx, bnlearn, tetrad, mermaid
export const EXPORT_FILES: Record<ExportFormat, { label: string; extension: string; mime: string }>
export function exportText(graph: Graph, format: ExportFormat, opts?: { details?: boolean }): string   // details: dagitty only
export function exportFileName(graphName: string | undefined, format: ExportFormat): string           // `${fileSlug(name)}${extension}`
```

| Format | `label` | `extension` | `mime` |
|---|---|---|---|
| `yaml` | GraphCreator | `.dag.yaml` | `application/yaml` |
| `dagitty` | dagitty | `.dagitty.txt` | `text/plain` |
| `gml` | GML | `.gml` | `text/plain` |
| `dot` | DOT | `.dot` | `text/vnd.graphviz` |
| `networkx` | networkx JSON | `.json` | `application/json` |
| `bnlearn` | bnlearn | `.bnlearn.txt` | `text/plain` |
| `tetrad` | Tetrad | `.tetrad.txt` | `text/plain` |
| `mermaid` | Mermaid | `.mmd` | `text/plain` |

**Detection.** `detectFormat` (phase 31) decides in this order:

1. **File name:**
   - `.yaml`/`.yml` → `yaml`;
   - `.gml` → `gml`;
   - `.dot`/`.gv` → `dot`;
   - `.json` → `networkx`.
2. **Text that starts with `{`,** after leading whitespace, and that `JSON.parse` reads as an object with a `nodes` array → `networkx`. Text that starts with `{` but is not such JSON goes on to the next rules: a headerless dagitty file may start with a group, `{a b} -> c`.
3. **The first token is `graph` followed by `[`,** after any leading `#` comment lines → `gml`.
4. **The first word is `digraph` or `strict digraph`,** after any leading `//`, `/* */` or `#` comments → `dot`. dagitty's own `graph {` header still goes to dagitty, which rejects it with its own message.
5. **Otherwise,** the phase 18 rules: YAML keys → `yaml`, else `dagitty`.

`parseGraphText` dispatches to the matching parser. Up to phase 18, `digraph` text went to `parseDagitty` and got its "graph type" error; now it is read as DOT.

#### GML (`gml.ts`, phase 33)

```ts
export function toGml(graph: Graph): string
export function parseGml(text: string): Result<Graph>
```

The 4.1 example graph becomes the following. The rest of the nodes and edges follow the same pattern.

```
graph [
  directed 1
  name "Smoking and birth weight"
  node [
    id 0
    label "Maternal_smoking"
    name "Maternal smoking"
    role "exposure"
    var_type "categorical"
    levels "never"
    levels "former"
    levels "current"
    description "Self-reported during pregnancy"
    graphics [
      x 42
      y 42
    ]
  ]
  node [
    id 2
    label "SES"
    name "SES"
    var_type "ordinal"
    levels "low"
    levels "mid"
    levels "high"
    graphics [
      x 182
      y -88
    ]
  ]
  edge [
    source 2
    target 0
    evidence "PMID:123"
    evidence "doi:10.1000/xyz"
    note "Well established"
  ]
]
```

- **Writing.**
  - `directed 1` comes first, then `name` when the graph has one.
  - One `node [ … ]` per node, in graph order. `id` is the 0-based index. `label` is the safe id: networkx's `parse_gml`, which DoWhy uses, names nodes by `label`. `name` is the full name and is always written.
  - Then `role` (not written when `other`), `var_type`, one `levels` line per level, `description` and `unit`, each only when set.
  - Then `graphics [ x y ]` with the circle's centre in canvas pixels, y down (as yEd and Gephi read it).
  - One `edge [ … ]` per edge with `source` and `target` (node ids), one `evidence` line per item, and `note`.
  - Two-space indentation.
  - Strings are in double quotes. `"` and `&` are written `&#34;` and `&#38;`, and characters beyond ASCII as `&#<decimal>;`, exactly as networkx's `write_gml` does.
- **Reading.**
  - The grammar is GML's: `key value` pairs, where a value is an integer, a real, a quoted string or a list `[ … ]`, and `#` starts a comment to the end of the line.
  - The text must contain one top-level `graph [ … ]`. A missing graph gives `This text is not a GML graph (graph [ … ] is missing).`
  - `directed` must be `1`. Otherwise: `This GML graph is not directed. GraphCreator reads directed graphs (directed 1) only.`
  - `multigraph 1` gives `GML multigraphs are not supported.`
  - The graph's `name`, or else its `label`, becomes the graph name.
  - Nodes: `id` is required and its text is the node key. The name is `name`, else `label`, else the id. The other keys are as written above, and repeated keys form a list. The centre comes from `graphics`' `x` and `y`. Other keys inside `graphics` are ignored silently.
  - Edges: `source`, `target`, `evidence`, `note`. `id`, `label` and `graphics` are ignored silently.
  - Character references (`&#34;`, `&#x22;`, `&quot;`, `&amp;`, `&lt;`, `&gt;`, `&apos;`) are decoded.
  - Any other key gives `ignoredAttribute('GML', key, line)`, once per key.
  - Syntax errors stop at the first one, with `Line N:` messages in the dagitty style (4.2 "Details fixed in phase 5").
- **Round trip:** `toYaml(parseGml(toGml(g)).value)` equals `toYaml(g)` up to positions within 0.1 px.

Details fixed in phase 33:
- Escaping turns every character outside printable ASCII into `&#<code point>;` (tabs, newlines and emoji too). An unknown named reference is left as written.
- Tokens: a key is `[A-Za-z_][0-9A-Za-z_]*`; strings have no escapes and may span lines; `#` starts a comment anywhere outside strings. A number used as text or as a node key is `String(Number(text))`, so `1.0` and `1` are the same id.
- Further messages, each with `line`: `Line N: "%" is not valid GML syntax.`, `Line N: a list [ … ] is not closed (missing ]).`, `Line N: this text has more than one GML graph; GraphCreator reads one.`, `Line N: a node has no id.`, `Line N: an edge has no source.` / `… no target.`, `Line N: <key> must be one number or text.`, `Line N: graphics x and y must be numbers.`, `Line N: node must be a list, as in node [ id 0 ].` and `Line N: edge must be a list, as in edge [ source 0 target 1 ].`
- The missing-graph, second-graph, `directed` and `multigraph` checks each stop at once, in that order; a missing `directed` counts as not directed. Other GML errors are collected and come before `buildGraph`'s.
- Only the first `graphics` block and its first `x` and `y` are used; a node with only one of them has no centre. Keys outside `graph [ … ]` (yEd's `Creator`, `Version`) are ignored silently.
- A defined but empty `levels` list cannot be written as repeated keys, so it comes back absent (also in DOT and JSON, through `buildGraph`).

#### DOT (`dot.ts`, phase 34)

```ts
export function toDot(graph: Graph): string
export function parseDot(text: string): Result<Graph>
```

```
digraph "Smoking and birth weight" {
  node [shape=circle, style=filled, fontname="Helvetica"]
  edge [color="#64748b"]
  Maternal_smoking [label="Maternal smoking", gc_role="exposure", gc_var_type="categorical", gc_levels="never;former;current", gc_description="Self-reported during pregnancy", pos="31.5,-31.5!", fillcolor="#e3f1e8", color="#4a946a", fontcolor="#24563a"]
  Birth_weight [label="Birth weight", gc_role="outcome", gc_var_type="continuous", gc_unit="g", pos="252,-27!", fillcolor="#e2eaf8", color="#5b83cf", fontcolor="#23407a"]
  SES [gc_var_type="ordinal", gc_levels="low;mid;high", pos="136.5,66!", fillcolor="#ffffff", color="#7d8a9c", fontcolor="#0f172a"]
  Genetic_factors [label="Genetic factors", gc_role="latent", pos="141.75,-119.25!", fillcolor="#f3f4f6", color="#80868f", fontcolor="#374151"]
  SES -> Maternal_smoking [gc_evidence="PMID:123;doi:10.1000/xyz", gc_note="Well established"]
  Maternal_smoking -> Birth_weight
  SES -> Birth_weight
  Genetic_factors -> Birth_weight
}
```

- **Writing.**
  - The header is `digraph "<name>" {`, or `digraph {` without a name.
  - Then the `node` and `edge` default lines shown above. The edge colour is `EXPORT_PALETTES.light.edge`.
  - One node line per node, in graph order: the safe id, then in this order `label` (only when the name differs from the id), `gc_role` (not written when `other`), `gc_var_type`, `gc_levels` (`encodeList`), `gc_description`, `gc_unit`, `pos`, and the role's `fillcolor`, `color` and `fontcolor` from `EXPORT_PALETTES.light`.
  - `pos` is the circle's centre in points with y up, as Graphviz uses it: `x × 0.75, −y × 0.75`, with `!` so `neato -n` keeps it.
  - One edge line per edge, with `[gc_evidence=…, gc_note=…]` only when set.
  - The attribute names use `_` rather than dagitty's `.`, because a DOT name with a dot would need quotes.
  - Every value is quoted, with `\` and `"` escaped by a backslash.
- **Reading.** A subset of the Graphviz grammar:
  - Header: `[strict] digraph [id] {`. `graph {` and `--` are errors with the dagitty wording: `Line N: undirected edges (--) are not supported yet. GraphCreator v1 supports directed edges only.` and `Line N: undirected graphs (graph { … }) are not supported. GraphCreator reads directed graphs (digraph) only.`
  - Node statements: `id [attrs]`.
  - Edge statements: `operand (-> operand)+ [attrs]`, where an operand is an id or a group `{ … }` / `subgraph [id] { … }`. Groups expand as in dagitty (4.2), and nodes inside a subgraph are created as usual.
  - Attribute statements (`graph|node|edge [attrs]`) and `id = id` graph attributes are read and ignored silently, except the graph's `label`, which becomes the graph name when the header has no id.
  - Ids: bare words (`[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*`), numerals, and double-quoted strings with `\"` and `\\` escapes. `"a" + "b"` concatenation is supported.
  - Comments: `//`, `/* */`, and lines starting with `#`.
  - HTML strings (`<…>`) and ports (`a:n`) are errors: `Line N: HTML labels (<…>) are not supported.` and `Line N: ports (a:n) are not supported.`
  - A node is created when its id first appears. The name is `label`, else the id; a `label` of `\N` means the id.
  - The `gc_*` keys are read as metadata, with `gc_levels` and `gc_evidence` passed through `decodeList`.
  - `pos="x,y"` or `"x,y!"` gives the centre `(x / 0.75, −y / 0.75)`.
  - These styling keys are ignored silently: `shape`, `style`, `color`, `fillcolor`, `fontcolor`, `fontname`, `fontsize`, `width`, `height`, `fixedsize`, `penwidth`, `arrowhead`, `arrowsize`, `xlabel`, and `pos` on edges.
  - Any other key gives `ignoredAttribute('DOT', key, line)`.
- **Round trip:** as for GML.

Details fixed in phase 34:
- **Quoting on export:** a safe id is written bare only when it matches `[A-Za-z_][A-Za-z0-9_]*` and is not a DOT keyword (`strict`, `graph`, `digraph`, `subgraph`, `node`, `edge`, in any case); otherwise it is quoted (`"1st_visit"`, `"a.b"`, `"node"`), because `toDagittyIds` can produce ids with `.` or a leading digit.
- **Reading:** keywords are recognised in any case, and `"A"` and `A` are the same node. `\N` is checked on the label as written, so `label="\\N"` is a node named `\N`; an empty label means the id. Quoted strings unescape only `\"` and `\\` (Graphviz label escapes such as `\n` stay literal), and backslash-newline continues a string.
- Attributes need `=`; `,` or `;` separate them and several `[…]` lists are joined. A `#` line is skipped only when `#` is its first non-blank character. All keys in `graph`/`node`/`edge` default statements are silent; the graph `label` is read only at the top level.
- A subgraph used in an edge stands for every node named inside it (`{A -> B} -> C` gives A→B, A→C and B→C). `gc_evidence` and `gc_note` on a chain apply to every edge of it; on edges, `label` and other `gc_*` keys warn.
- Further messages: `Line N: pos="<value>" is not a valid position; DOT positions look like pos="31.5,-27!".`, `Line N: a comment /* … */ is not closed (missing */).`, `Line N: "<c>" is not valid DOT syntax.` and the dagitty-style `not valid here`, `ends too early` and unclosed-quote messages. Syntax errors stop at the first one in source order, so `graph { a -- b }` reports the undirected-graph error.

#### networkx JSON (`networkx.ts`, phase 35)

```ts
export function toNetworkx(graph: Graph): string
export function parseNetworkx(text: string): Result<Graph>
```

```json
{
  "directed": true,
  "multigraph": false,
  "graph": {
    "name": "Smoking and birth weight"
  },
  "nodes": [
    {
      "id": "Maternal_smoking",
      "name": "Maternal smoking",
      "role": "exposure",
      "var_type": "categorical",
      "levels": ["never", "former", "current"],
      "description": "Self-reported during pregnancy",
      "pos": [42, 42]
    }
  ],
  "edges": [
    {
      "source": "SES",
      "target": "Maternal_smoking",
      "evidence": ["PMID:123", "doi:10.1000/xyz"],
      "note": "Well established"
    }
  ]
}
```

- **Writing.**
  - The node-link format of networkx's `node_link_data`.
  - `edges` is used as the key, which is networkx 3.7's default. Python reads it with `nx.node_link_graph(data, edges="edges")`, which works from networkx 3.4.
  - Node keys, in this order: `id` (the safe id), `name` (always), `role` (not written when `other`), `var_type`, `levels`, `description`, `unit`, `pos`. `pos` is the circle's centre in canvas pixels, y down. Edge keys: `source`, `target`, `evidence` (only when not empty), `note`.
  - `graph` is `{}` without a name.
  - Written with `JSON.stringify(data, null, 2)` and a newline. Short arrays of strings and numbers (`levels`, `evidence`, `pos`) are put back on one line, as above. This is a post-processing step that joins an array whose items are all strings or numbers.
- **Reading.**
  - The text must parse as JSON (else `The file is not valid JSON: <parser message>.`) and be an object with a `nodes` array (else `This JSON is not a networkx graph (it has no "nodes" list).`).
  - `"directed"` must be `true` (else `This networkx graph is not directed. GraphCreator reads directed graphs only.`).
  - `"multigraph": true` gives `networkx multigraphs are not supported.`
  - Edges are read from `edges`, or else `links` (the key before networkx 3.4). Neither present means no edges.
  - `graph.name` becomes the graph name.
  - Nodes: `id` (a string or number, used as text) is required. The name is `name`, else `label`, else the id. The metadata keys are as written above. `pos` must be two numbers.
  - Other keys on nodes, on edges or in `graph` give `ignoredAttribute('networkx', key)`, once per key.
- **Round trip:** as for GML.

Details fixed in phase 35:
- The checks stop at the first failure in the order: invalid JSON, no `nodes`, not directed, multigraph. A missing `"directed"` counts as not directed (networkx's default).
- `edges` is read whenever that key exists, even next to `links`. A chosen key that is not a list gives `This JSON is not a networkx graph ("edges" is not a list).` (or `"links"`).
- Malformed items are collected, 1-based: `Node N in the "nodes" list is not an object.`, `Node N in the "nodes" list needs an "id" (text or a number).`, `Edge N in the "edges" list is not an object.`, `Edge N in the "edges" list needs a "source" and a "target" (text or a number).` Then the field errors `Node "X": pos must be a list of two numbers, like [42, 42].`, `Node "X": name must be text.` and `The graph name must be text.`, before `buildGraph`'s. A numeric `name`, `label` or graph name is read as text.
- An unknown key warns once in the whole file, in order of first appearance with `graph` first; unknown top-level keys and a `graph` that is not an object are ignored silently.
- The one-line arrays come from a regex on the `JSON.stringify` output that joins only arrays whose every line is one JSON string or number.

#### bnlearn (`bnlearn.ts`, phase 36)

```ts
export function toBnlearn(graph: Graph): string
```

The model string of `bnlearn::modelstring`: one `[node]` or `[node|parent1:parent2]` per node, in graph order, with the parents in graph order and safe ids throughout, all on one line. For the 4.1 graph:

```
[Maternal_smoking|SES][Birth_weight|Maternal_smoking:SES:Genetic_factors][SES][Genetic_factors]
```

It is read in R with `bnlearn::model2network("…")`. Roles, types and positions are lost; the dialog note says so. Safe ids never contain `[`, `]`, `|` or `:`.

#### Tetrad (`tetrad.ts`, phase 36)

```ts
export function toTetrad(graph: Graph): string
```

Tetrad's saved graph text, which causal-learn's `txt2generalgraph` also reads:

```
Graph Nodes:
Maternal_smoking;Birth_weight;SES;Genetic_factors

Graph Edges:
1. SES --> Maternal_smoking
2. Maternal_smoking --> Birth_weight
3. SES --> Birth_weight
4. Genetic_factors --> Birth_weight
```

The nodes are in graph order and the edges in graph order, numbered from 1. A graph without edges ends after `Graph Edges:`. Roles, latent included, types and positions are lost. Tetrad's manual also describes a form with latent nodes in parentheses, but tools do not read it, so it is not used (section 7).

#### Mermaid (`mermaid.ts`, phase 36)

```ts
export function toMermaid(graph: Graph): string
```

```
%% Smoking and birth weight
flowchart TB
  v1(("Maternal smoking"))
  v2(("Birth weight"))
  v3(("SES"))
  v4(("Genetic factors"))
  v3 --> v1
  v1 --> v2
  v3 --> v2
  v4 --> v2
  classDef exposure fill:#e3f1e8,stroke:#4a946a,color:#24563a
  classDef outcome fill:#e2eaf8,stroke:#5b83cf,color:#23407a
  classDef latent fill:#f3f4f6,stroke:#80868f,color:#374151
  classDef other fill:#ffffff,stroke:#7d8a9c,color:#0f172a
  class v1 exposure
  class v2 outcome
  class v4 latent
  class v3 other
```

- **Lines in order.**
  - A comment line with the graph name (only when it has one), then `flowchart TB`.
  - One circle node per node (`v<i>((" … "))`, in graph order) and one `-->` per edge.
  - Then, for each role in use in `ROLES` order, a `classDef` line with the role's colours from `EXPORT_PALETTES.light`.
  - Then, for each role in use in `ROLES` order, one `class <ids> <role>` line, with the ids comma-separated in graph order.
- **Escaping.** In names, `#` first becomes `#35;`, then `"` becomes `#quot;`, `<` becomes `#lt;` and `>` becomes `#gt;` (Mermaid's entity codes).
- **What is lost.** Mermaid lays the graph out itself, so positions are not kept. Types, levels and evidence are not written.

Details fixed in phase 36:
- Empty graph: bnlearn gives `''` (the one writer without a final newline), Tetrad `Graph Nodes:\n\n\nGraph Edges:\n` (an empty node line, as Tetrad writes it), Mermaid `flowchart TB\n`.
- Tetrad numbers only the edges it writes, so skipped edges leave no gaps. bnlearn lists each parent once.
- Line breaks in the graph name become one space in Mermaid's `%%` comment. `class` lines join ids with `,` and no spaces (`class v1,v4 selected`).

## 5. Behaviour

### 5.1 Screen layout

```
+--------------------------------------------------------------------------------+
| (o->o) [Graph name____] | New Open… Save|▾ Export… Share |  [⚠ 1 warning] [Help] [☾] |  top bar, 48 px
+----+---------------+-------------------------------------------+---------------+
| ▶  | Lesson panel  |                                           | NODE          |
| ⊕  | (only during  |        ( SES )                            | Name [______] |
| ⇢  |  a lesson,    |        /     \                            | Role ◍[Adj. ▾]|
| -- |  300 px)      | (Maternal ) ---> ( Birth  )               | Type [Ord.  ▾]|
| ⋔  |               | ( smoking )      ( weight )               | Levels ...    |
| ⤢  |               |                       [✓ Saved in browser]| Description   |
+----+---------------+-------------------------------------------+---------------+
 rail 56 px                   canvas (teal tint)                    side panel 320 px
```

- **Top bar** (`TopBar`, `role="toolbar"`, `aria-label="Toolbar"`): logo; graph name input (`aria-label="Graph name"`); New; Open…; Save as a split button: **Save**, a 1 px vertical divider (16 px tall) and a narrow icon-only ▾ button, grouped with no gap between them, (`aria-label="Save as…"`) whose menu has **GraphCreator…** and **dagitty…** (5.4); **Export…** (`ImageDown` icon, phase 22) and **Share** (`Link` icon, phase 23), both ghost buttons with icon and word (5.4); on the right the warnings badge (`N warning(s)`, hidden when 0; opens IssuesDialog, clicking a warning selects its node), **Help** (`CircleHelp` icon; opens the welcome slides, 5.7.9; from phase 44 a menu with Welcome and Lessons…, 5.7.11) and an icon-only **Dark mode** toggle (moon in light mode, sun in dark mode; `aria-pressed` gives the state; tooltip "Dark mode"). File buttons are ghost buttons with icon and word. There is no separate dagitty menu (phase 18).
- **Tool rail** (`ToolRail`, `role="toolbar"`, `aria-label="Canvas tools"`, `aria-orientation="vertical"`, 56 px wide): icon-only buttons, each with an accessible name, `aria-keyshortcuts` and a tooltip "Name  Key": Select (V), Add node (N), Connect (C), a divider, Auto-layout (L), Fit view (F), Zoom in (+), Zoom out (−), a divider, Undo (`Undo2` icon, Ctrl+Z) and Redo (`Redo2` icon, Ctrl+Shift+Z) (phase 21). The active tool is solid teal. Undo and Redo are disabled when `past` or `future` is empty. Their tooltips read "Undo  Ctrl+Z" and "Redo  Ctrl+Shift+Z", with ⌘ in place of Ctrl on a Mac (`/Mac|iPhone|iPad/` in `navigator.userAgent`); their `aria-keyshortcuts` are `Control+Z Meta+Z` and `Control+Shift+Z Meta+Shift+Z Control+Y`.
- **Lesson panel:** only while a lesson runs (5.7.10); 300 px, between the rail and the canvas.
- **Canvas:** React Flow, fills the remaining space, teal-tinted background (`--canvas`), no dot grid, no minimap, no React Flow attribution, no React Flow `<Controls>` (the rail has zoom and fit). The saved indicator sits in the bottom-right corner (5.2).
- **Side panel:** fixed width (320 px). Shows NodeEditor or EdgeEditor for the single selected item. With nothing selected it shows a cheat sheet (exact text in 5.7.8): add a node, connect, delete, select several, undo. From phase 29 the panel has two tabs at the top, **Edit** (all of the above) and **Analysis** (5.8).

### 5.2 Canvas interactions

- **Add node:** double-click empty canvas (React Flow zoom-on-double-click is disabled), or the Add node tool (N): with it active, the next click on empty canvas adds a node there and the tool returns to Select. The rail's Add node button with the tool already active adds a node at the viewport centre. The new node is centred on the click point (its box is `nodeDiameter(name)` wide), gets `defaultNodeName`, becomes selected, and the side panel's name field is focused with its text selected.
- **Connect by dragging:** hovering a circle shows a teal rim (5.7.7). Dragging from the rim starts a connection; dragging the middle of the circle moves it. While a connection is in progress, a dashed teal line follows the pointer, and any circle under the pointer is a drop target: a valid one gets a solid teal ring, an invalid one a red ring. Validity comes from `canAddEdge` through React Flow's `isValidConnection`. Releasing over an invalid target shows a toast with the `EdgeCheck` message and adds nothing. Implementation: React Flow's "easy connect" pattern. Each node has a ring-shaped source handle on its rim and a target handle covering the whole circle that takes pointer events only while `useConnection().inProgress` is true.
- **Connect mode (C):** with the Connect tool active, clicking a circle picks it as the source (`pickConnectSource`, shown with the hover rim kept on), and clicking a second circle calls `connect`; an invalid pair shows the same toast. The tool stays active for the next edge. Escape, or clicking empty canvas, clears the picked source.
- **Shortcuts:** V, N, C set the tool; L runs auto-layout and fits the view; F fits the view; + and − zoom; Escape returns to Select and clears the picked source. Ctrl+Z or ⌘+Z undoes; Ctrl+Shift+Z, ⌘+Shift+Z and Ctrl+Y redo (4.10, phase 21); they call `preventDefault`. Shortcuts are ignored while focus is in a text field, select or textarea, and while a dialog is open, so Ctrl+Z inside a field is the browser's own text undo.
- **Rename by double-click:** double-clicking a circle while the Select tool is active calls `focusName`: the node is selected and the side panel's name field is focused with its text selected, as after adding a node. It never adds a node (the pane double-click handler only reacts to the pane itself).
- **Select:** click a node or edge. Multi-select with Shift-click or box-select is React Flow default and is only used for deletion and moving.
- **Delete:** Delete or Backspace (when focus is not in a text field) removes the selected nodes and edges via `removeNodes` / `removeEdges`.
- **Move:** dragging updates positions; the store commits on drag stop, with one `moveNodes` call for all dragged nodes (one undo step; `moveNode` per node until phase 21).
- **Node look (`canvas/CircleNode.tsx`):** a circle of diameter `nodeDiameter(name)` with the wrapped name centred inside (`wrapLabel`, 5.7.6; full name in `title` when truncated). The fill, outline and text colours come from the role (5.7.2); colour is the only role cue on the canvas, by the user's choice. The node's accessible name is `<name>, <Role label>` (for example `SES, Adjusted`) and the element keeps `data-role`. An untyped node shows a small yellow warning dot on its rim, top right, with `title="No variable type"` and the same `aria-label`. States are in 5.7.7.
- **Edges (`canvas/FloatingEdge.tsx`):** straight lines. An edge starts on the source circle's rim, where the line between the two centres crosses it, and its closed arrowhead ends 2 px before the target's rim (`edgeEndpoints`, phase 11). Moving a circle re-aims its edges. An edge with evidence shows a chip at its midpoint: a bookmark icon and the number of evidence items (`aria-label="2 evidence items"`). Clicking the chip selects the edge.
- **Saved indicator (`SavedIndicator.tsx`):** a chip in the canvas's bottom-right corner, driven by `useUiStore().autosave`: `on` → teal check and "Saved in this browser"; `blocked` → warning style, "Not saved: browser storage is blocked"; `paused` → muted, "Practice graph: not saved".

### 5.3 Editors

- **NodeEditor:** Name (commit on Enter or blur; on error show the message under the field and keep the field red until fixed; Escape reverts), Role (`RolePicker`: a select whose trigger shows the role's colour swatch and label, and whose options show swatch, label and the role's one-line description from 5.7.8), Type (select: `—` untyped plus `VAR_TYPES`, shown with labels such as "Categorical"), Levels (ListEditor, only for categorical/ordinal; ordinal shows the hint "Order matters: lowest first."), Unit (text, only for continuous/discrete), Description (textarea). A Delete node button.
- **Labels:** options show labels ("Exposure", "Categorical") and the store keeps the keys (`exposure`, `categorical`). Labels come from `ROLE_LABELS` and `VAR_TYPE_LABELS` in `src/lib/copy.ts`.
- **Info tooltips (`InfoTip.tsx`):** Role, Variable type, Levels, Unit, Evidence and Note have a teal info icon after their label: a button with `aria-label="About <field, lower case>"`. It opens a tooltip with the text from 5.7.8 on hover or keyboard focus.
- **EdgeEditor:** heading `From → To` (names), Evidence (ListEditor of strings), Note (textarea), Delete edge button.
- **ListEditor:** one text input per item, with add, remove, move up and move down buttons; Enter in the last input adds a new item. Empty items are dropped on commit.
- Text fields commit on blur (and Enter for single-line fields), not per keystroke.

### 5.4 Files and dialogs

- **New:** if the graph has nodes, confirm `Start a new graph? Unsaved changes to the current graph will be lost.` Then `emptyGraph()`.
- **Open… (`OpenDialog`, phase 18):** a dialog titled "Open a graph" with the description "Paste GraphCreator or dagitty code, or open a file. Opening replaces the current graph.", a textarea (`aria-label="Graph code"`) and the buttons **Open file…** (any text file), Cancel and **Open** (disabled while the textarea is blank). Both paths use `parseGraphText` (4.2), so the format is recognised automatically; a file's name helps (`.yaml`/`.yml`). Open file… parses the chosen file at once. Errors are listed inside the dialog under `Could not open <file>:` (file) or `Could not open:` (pasted text), with line numbers when known, and nothing changes. On success the graph is replaced, after the same confirmation as New if the graph has nodes (its button reads "Open"); then the dialog closes, the view fits and warnings show as one toast (`Opened with 3 warnings`, its Show button opens IssuesDialog).
- **Save:** opens the "Save as GraphCreator" dialog below, the same as Save as… → GraphCreator…; its Download button saves `toYaml(graph)` as `<slug>.dag.yaml` (4.1). No server involved. (Until phase 20, Save downloaded the file directly.)
- **Save as… menu (`CodeDialog`, phase 18):** **GraphCreator…** opens "Save as GraphCreator": a read-only textarea (`aria-label="GraphCreator code"`) with `toYaml(graph)`, the note "The GraphCreator file keeps everything: roles, variable types, levels, descriptions, units, evidence and positions.", Copy and Download (`<slug>.dag.yaml`). **dagitty…** opens "Save as dagitty": textarea `dagitty code` with `toDagitty(graph)`, the note "Variable types, levels, descriptions, units and evidence are not included in dagitty files. Save as GraphCreator to keep them.", Copy and Download (`<slug>.dagitty.txt`). Copy toasts `Copied <GraphCreator|dagitty> code to the clipboard.`
- **Export… (`ExportDialog`, phase 22):** a dialog titled "Export image" with the description "The image shows names, roles (by color) and arrows. Types, levels and evidence are not included." It has a **Format** select (`aria-label="Format"`: SVG, PNG, TikZ; SVG by default; the choice is not remembered between visits). For SVG and PNG it shows a preview: an `<img alt="Preview of the image">` of `toSvg(graph)` on a white, bordered area at most 384 px tall, scaled to fit. PNG adds a **Scale** select (`aria-label="Scale"`: 1×, 2×, 3×; 2× by default) and the line `<width> × <height> pixels`. For TikZ it shows a read-only mono textarea (`aria-label="TikZ code"`) with `toTikz(graph)`, like `CodeDialog`. Buttons: **Copy** for SVG (the SVG text) and TikZ (toasts `Copied SVG code to the clipboard.` / `Copied TikZ code to the clipboard.`; the same error toast as `CodeDialog`), none for PNG; **Download**, which saves `imageFileName(name, format)` (`image/svg+xml`, `image/png`, `text/x-tex`). With no nodes the dialog shows "There is nothing to export yet. Add a node first." in place of the preview and both buttons are disabled. A failed PNG shows the error as a toast. The texts are computed when the dialog opens.
- **Import and export additions (phases 31 and 39):**
  - **Open…** reads GML, DOT and networkx JSON as well (4.15 "Detection"). Its description becomes "Paste GraphCreator, dagitty, GML, DOT or networkx JSON code, or open a file. Opening replaces the current graph." Everything else is unchanged: the errors, the confirmation and the warnings toast.
  - **Save as… menu.** The items are, in order: **GraphCreator…**, **dagitty…**, a separator, **GML…**, **DOT…**, **networkx JSON…**, **bnlearn…**, **Tetrad…** and **Mermaid…**. Each opens `CodeDialog` for its `ExportFormat`. The dialog's title is `Save as <label>` and its read-only textarea is labelled `<label> code` (with `EXPORT_FILES` labels, 4.15). It shows a note, then Copy and Download. Download saves `exportFileName(name, format)` with the format's MIME type. Copy toasts `Copied <label> code to the clipboard.` `CodeDialog` computes the text itself, with `exportText`, from the store's graph when it opens. The notes:
    - **GraphCreator** and **dagitty:** as above.
    - **GML:** "The GML file keeps roles, variable types, levels, descriptions, units, evidence and positions. Node labels are names safe for R and Python, such as Maternal_smoking; DoWhy and networkx use them as variable names."
    - **DOT:** "The DOT file keeps roles, variable types, levels, descriptions, units, evidence and positions as attributes, and the role colors for Graphviz. Node ids are names safe for R and Python, such as Maternal_smoking."
    - **networkx JSON:** "The networkx JSON keeps everything. Read it in Python with networkx.node_link_graph(data, edges=\"edges\"). Node ids are names safe for R and Python, such as Maternal_smoking."
    - **bnlearn:** "The bnlearn model string keeps the structure only: no roles, types or positions. Read it in R with bnlearn::model2network()."
    - **Tetrad:** "The Tetrad text keeps the structure only: roles (latent included), types and positions are not included."
    - **Mermaid:** "Mermaid code draws the graph with its role colors in Markdown, GitHub and Notion. Mermaid lays the graph out itself, so positions are not kept, and types and evidence are not included."
  - **dagitty details.** The Save as dagitty dialog gets a checkbox, **Include GraphCreator details**, under the textarea. It is off by default and kept across visits in `uiStore.dagittyDetails` (`graphcreator:dagitty-details`, 4.7 addition below). Switching it recomputes the text (`exportText(graph, 'dagitty', { details })`). While it is on, the note reads "Variable types, levels, descriptions, units and evidence are added as gc.* attributes. dagitty keeps them but does not use them."
  - **Export….** Format offers SVG, PNG, PDF and TikZ.
    - A **Theme** select (`aria-label="Theme"`: Light, Dark; Light by default) shows for SVG, PNG and PDF.
    - A **Legend** checkbox (label "Legend"; off by default) shows for every format.
    - Both are kept while the page is open, like Format and Scale. The preview, the pixel size and the TikZ text follow them.
    - **PDF:** shows the SVG preview and the line `<width × 0.75> × <height × 0.75> points` (rounded). It has no Copy button. Download saves `<slug>.pdf` (`application/pdf`) from `toPdf(graph, { theme, legend })`.
    - The preview area keeps its border. A dark image brings its own dark background.
    - The description becomes "The image shows names, roles (by color) and arrows, with an optional legend. Types, levels and evidence are not included."
- **Details fixed in phase 39:**
  - `CodeDialog` takes only `open`, `onOpenChange` and `format`; it reads the graph once each time it opens. `TopBar` keeps the last format apart from the open state, so the title does not change while the dialog closes.
  - If a writer throws, `CodeDialog` shows `Could not export the graph: …` (`role="alert"`) and disables Copy and Download, replacing `TopBar`'s old toast.
  - The details checkbox sits directly under the textarea, labelled "Include GraphCreator details".
  - The Export controls are in the order Format, Theme, Scale (PNG), Legend, then the pixel or points line. The preview area takes the theme's background colour and keeps its border. A failed PDF toasts `Could not download the file: …`, as SVG and TikZ do.
  - `e2e/export.spec.ts` was updated in this phase for the new description.
- **4.7 addition (phase 31):** `uiStore` gains `DAGITTY_DETAILS_KEY = 'graphcreator:dagitty-details'`, `dagittyDetails: boolean` (initial value from `readDagittyDetails(safeLocalStorage())`), `setDagittyDetails(on: boolean)` (which also writes), `readDagittyDetails(storage)` (true only for the stored text `'1'`; null or throwing storage gives false) and `writeDagittyDetails(storage, on)` (writes `'1'` or `'0'`, and ignores null or throwing storage). These follow the pattern of `readAnalysisOn` (4.14).
- **Share (phase 23):** builds `shareUrl(graph)` and writes it with `navigator.clipboard.writeText`. On success it toasts `Link copied. The graph is stored in the link itself, not on a server.`; when the link is longer than `SHARE_LONG` the toast's description adds `The link is long and may not work in every app. Save as GraphCreator to share a file instead.` When the clipboard fails it shows the error toast `Could not copy the link to the clipboard.` There is no dialog.
- **Opening a share link (phase 23):** `main.tsx` checks `location.hash` after the autosave restore and before the first render. With `#g=…` it removes the fragment at once with `history.replaceState` (so a reload or the autosaved page never applies the link again), does not open the welcome slides automatically on this load, and passes the decoded result to `offerSharedGraph` (exported by `SharedGraphDialog.tsx`, which `App` mounts inside the `ReactFlowProvider`):
  - **Damaged link:** the error toast `Could not open the shared graph.` with the first error message as its description; the stored graph stays.
  - **Stored graph empty, or its `toYaml` equal to the shared one's:** `replaceGraph(shared)`, fit the view, toast `Opened the shared graph.` (or `Opened the shared graph with N warning(s).`).
  - **Otherwise:** a dialog titled "Open the shared graph?" with the description "This replaces the graph saved in this browser. Save it first if you want to keep it." and the buttons **Keep my graph** (outline; closes, nothing changes) and **Open shared graph** (primary; replaces, fits the view, the same toast). Escape counts as Keep my graph.
  - The shared graph is then autosaved like any other change.
- **Auto-layout:** `autoLayout(graph)`, then fit the view.
- **During a lesson** (5.7.10): New and Open… are disabled, with the tooltip "Not available during a lesson." Save, the Save as… menu, Export… and Share work on the practice graph.

### 5.5 Autosave

`src/store/autosave.ts` persists the store's current graph to `localStorage` key `graphcreator:current` as the `toYaml` text, written at most every 500 ms after a change. On start-up the text is read and parsed with `parseYaml`; if it fails (corrupt or old), the app starts with `emptyGraph()` and shows the toast `Could not restore the previous graph.` All storage access is wrapped in try/catch so a blocked localStorage only disables autosave.

Details fixed in phase 9: writes are a trailing debounce (each graph change restarts the 500 ms timer), so a burst of changes is written once, 500 ms after the last one. Only changes to `graph` trigger a write; selection changes and the restore itself do not. After a failed restore the bad text stays in storage until the next change overwrites it. `main.tsx` starts autosave before the first render; the restore toast still shows because sonner replays toasts raised before `<Toaster />` mounts.

### 5.6 UI details fixed in wave 4

This is the record of the v1 look. Where it conflicts with 5.1–5.3 or 5.7 (colours, node boxes, handles, badges, bezier edges, `<Background />` and `<Controls />`, raw option values, toolbar order), the newer sections win from phase 16 on. Behaviour not mentioned there (selection sync, drag commit, dialogs, toasts, accessible names of list inputs) still holds.

- **Canvas (phase 6):** React Flow nodes/edges live in local state, rebuilt from the store's `graph` and `selection` when they change, keeping in-drag positions and `measured` sizes; `onNodeDragStop` commits `moveNode`. `onSelectionChange` sets the store selection to the single selected item, or `null` for zero or several. A double-clicked node is centred on the pointer. Shift, Meta or Control multi-select. The invalid-drop toast comes from `onConnectEnd`. Default bezier edges with a closed arrowhead (grey `#737373`; selected blue `#2563eb`, 3 px); valid hovered handle green, invalid red. `<Background />` and `<Controls />`, no minimap. Role colours: exposure `#15803d`, outcome `#1d4ed8`, latent `#4b5563`, adjusted `#b45309`, selected `#7e22ce`, other `#64748b` (each ≥ 4.5:1 with the white badge letter); the box has a role-colour border and a 12 % tint background. `Canvas` fills its parent (`h-full flex-1`).
- **Side panel (phase 7):** `SidePanel` renders its own `<aside aria-label="Side panel">` (320 px). The untyped option uses the internal select value `untyped`. Empty list items are dropped from what is saved; Enter in the last list input adds an item only when it is not empty; remove/move commit immediately. A draft unit is discarded when the type changes. Role/type options show the raw values. Accessible names: list inputs "Level N" / "Evidence N", buttons "Move level N up", "Remove level N", etc. (end-to-end tests match them with `exact: true`).
- **Toolbar (phase 8):** the warnings toast after Open/Import has a "Show" action that opens IssuesDialog. The confirmation dialog has title "Start a new graph?", description "Unsaved changes to the current graph will be lost." and a confirm button "New graph" or "Import"; Open does not confirm (per 5.4). After a successful dagitty parse the Toolbar confirms if needed, replaces the graph, closes and resets the dialog, fits the view and toasts warnings; cancelling the confirmation keeps the dialog open. IssueList prefixes "Line N: " only when `line` is set and the message doesn't already start with it. `fitView()` runs in `requestAnimationFrame`. Export text is computed when the dialog opens. MIME types: `application/yaml` and `text/plain`. The dagitty dropdown uses `modal={false}`. Add node centres the node box on the viewport centre. Toolbar order: name, New, Open, Save, dagitty ▾, Add node, Auto-layout, badge on the right.

### 5.7 Visual design ("Calm teal")

Agreed with the user on 2026-11-08 through rounds of visual options. The full set of boards is on the design canvas https://claude.ai/artifact/FYydF6w6m49LZajMSCVaeL, but this section is binding and complete on its own. Where the canvas differs from this section (for example the outline of "Other"), this section wins.

#### 5.7.1 Principles

- **The graph is the document.** The canvas gets the space; tools sit in a slim rail, a slim top bar and a fixed panel, never on top of the graph.
- **Two kinds of colour.** Teal means "you can act here": primary buttons, the active tool, selection, focus, connecting. Pastels mean "this is a role". UI chrome never uses role colours, and roles never use teal.
- **Explain, do not block.** Warn about gaps (an untyped variable); stop only what would be invalid (a cycle).
- **Nothing is lost.** Autosave; anything that discards work asks first and names the action on its button.
- **Local and private.** Say so on the welcome slides and in the saved indicator.
- **Learn while drawing.** Short info tooltips; lessons on the real canvas.

#### 5.7.2 Colour tokens

All colours are CSS variables in `src/index.css`. Light values sit in `:root`, dark values in `.dark` (set by the theme store, 4.9, when the user switches to dark with the top bar's Dark mode toggle). The app starts light, whatever the system setting; the choice is kept in `localStorage` under `graphcreator:theme`. Components use only these variables, never raw hex. Contrast ratios are checked by `src/lib/theme.test.ts` (phase 10): text pairs ≥ 4.5:1; circle outlines, edges and the selection border ≥ 3:1 against `--canvas`.

**Core (shadcn variables, replacing the neutral preset):**

| Variable | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#0E1513` | page, top bar, rail, panel |
| `--foreground` | `#0F172A` | `#E6EEEC` | text |
| `--card`, `--popover` | `#FFFFFF` | `#15201E` | dialogs, menus (their `-foreground` = `--foreground`) |
| `--primary` | `#0F766E` | `#2DD4BF` | primary button, active tool, selection, focus |
| `--primary-foreground` | `#FFFFFF` | `#0E1513` | text on primary (5.5:1 / 9.9:1) |
| `--secondary`, `--muted` | `#F1F5F9` | `#1C2A27` | hover fills, chips |
| `--secondary-foreground` | `#0F172A` | `#E6EEEC` | |
| `--muted-foreground` | `#5A6779` | `#9FB2AD` | hints, captions (5.4:1 on canvas / 8.0:1) |
| `--accent` | `#E6F6F3` | `#123B36` | teal tint: Help button, active list row |
| `--accent-foreground` | `#115E59` | `#99E2D6` | text on accent (6.8:1 / 8.3:1) |
| `--destructive` | `#B42318` | `#F97066` | errors, destructive buttons |
| `--border` | `#E2E8F0` | `#24332F` | hairlines |
| `--input` | `#CBD5E1` | `#33433F` | field borders |
| `--ring` | `#0F766E` | `#2DD4BF` | focus ring |
| `--radius` | `0.5rem` | | see 5.7.4 |

**Extra:**

| Variable | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#F3F8F7` | `#111A18` | canvas background |
| `--edge` | `#64748B` | `#8A9AAE` | edges, arrowheads (4.4:1 / 6.2:1 on canvas) |
| `--edge-hover` | `#334155` | `#C2CEDA` | hovered edge |
| `--primary-hover` | `#115E59` | `#5EEAD4` | primary button hover |
| `--rim` | `rgb(15 118 110 / 0.25)` | `rgb(45 212 191 / 0.30)` | hover rim around circles |
| `--warning-bg`, `--warning-fg`, `--warning-border` | `#FEF9C3`, `#854D0E`, `#F3E08A` | `#3A2E0A`, `#FDE68A`, `#5C4A12` | warnings badge, untyped dot, warning toasts |
| `--error-bg`, `--error-fg`, `--error-border` | `#FEF3F2`, `#B42318`, `#F8C9C4` | `#3B1512`, `#FDA29B`, `#6B241E` | error toasts and callouts |

**Roles** (`--role-<role>-fill`, `--role-<role>-line`, `--role-<role>-text`; replacing v1's single `--role-<role>`):

| Role | Light fill / line / text | Dark fill / line / text |
|---|---|---|
| exposure | `#E3F1E8` / `#4A946A` / `#24563A` | `#1B3326` / `#6FCF97` / `#D7F5E3` |
| outcome | `#E2EAF8` / `#5B83CF` / `#23407A` | `#1C2740` / `#8AAEF0` / `#DCE6FB` |
| latent | `#F3F4F6` / `#80868F` / `#374151` | `#1F2429` / `#9CA3AF` / `#E5E7EB` |
| adjusted | `#F8EEDD` / `#AD7A2C` / `#6B4510` | `#33281A` / `#E0B061` / `#F8E7C8` |
| selected | `#EFE7F7` / `#9375C4` / `#4C2F75` | `#2A2140` / `#B9A0E3` / `#ECE3FA` |
| other | `#FFFFFF` / `#7D8A9C` / `#0F172A` | `#15201E` / `#8A9AAE` / `#E6EEEC` |

Light text-on-fill ratios are 7.3 or more; outlines are 3.3–3.5 against `--canvas`. Dark text-on-fill is 11.6 or more; dark outlines 6.2 or more. Warnings are yellow, never the amber of Adjusted. Red appears only for errors; no role is red. Success (saved, copied, imported) uses teal: `--accent` background, `--accent-foreground` text and a check icon.

#### 5.7.3 Typography

- **Fonts:** IBM Plex Sans for the interface and IBM Plex Mono for anything that lives in a file (YAML, dagitty code, file names, evidence identifiers, keyboard keys). Packages `@fontsource/ibm-plex-sans` (weights 400, 500, 600) and `@fontsource/ibm-plex-mono` (400, 500) replace `@fontsource-variable/geist`. `--font-sans: 'IBM Plex Sans', system-ui, sans-serif`; `--font-heading: var(--font-sans)`; `--font-mono: 'IBM Plex Mono', ui-monospace, monospace`.
- **Scale:**

| Name | Size / weight / line height | Use |
|---|---|---|
| display | 28 / 600 / 1.2 | welcome slide titles |
| title | 18 / 600 / 1.3 | dialog titles, lesson titles |
| heading | 15 / 600 / 1.4 | edge heading `From → To`, panel sections |
| body | 14 / 400 / 1.5 | default text, fields, buttons (500) |
| node | 13 / 500 / 1.25 | names inside circles |
| hint | 13 / 400 / 1.4 | hints, captions (`--muted-foreground`) |
| label | 12 / 600, uppercase, letter-spacing 0.06em | panel header "NODE" / "EDGE" in `--accent-foreground` |

- Weights: 400 text, 500 for node names, buttons and field labels, 600 for headings. No italics in the interface.

#### 5.7.4 Shape, space and elevation

- **Radius:** `--radius: 0.5rem`. Chips, keys and badges `rounded-sm` (≈ 4 px); buttons, fields and rail tools `rounded-md` (≈ 6 px); menus, tooltips and toasts `rounded-lg` (8 px); dialogs, cards and slides `rounded-xl` (≈ 11 px). Nodes are true circles.
- **Space:** a 4 px grid. Comfortable density: text 14 px, controls 32 px high, rail buttons 40 × 40 px. Top bar 48 px high, rail 56 px wide, side panel 320 px wide with 16 px padding, 16 px between fields, 8 px from label to control, lesson panel 300 px.
- **Elevation:** flat by default; borders separate areas. Level 1 (`0 1px 2px rgb(15 23 42 / 0.08)`): circles, toasts, the saved indicator. Level 2 (`0 8px 24px rgb(15 23 42 / 0.14)`): menus, tooltips, dialogs, welcome slides.

#### 5.7.5 Icons and motion

- **Icons:** Lucide (`lucide-react`), stroke 1.75: 20 px in the rail, 16 px in buttons and fields, 15 px for info icons. Rail: `MousePointer2` Select, `CirclePlus` Add node, `Spline` Connect, `Network` Auto-layout, `Maximize` Fit view, `Plus` / `Minus` zoom. Top bar: `FilePlus` New, `FolderOpen` Open, `Download` Save, `ChevronDown` dagitty, `TriangleAlert` warnings, `BookOpen` Lessons. Others: `Info` info tips, `Bookmark` evidence chip, `Check` saved. Never emoji (this replaces v1's `⚠` text).
- **Motion:** 120 ms for hover and press, and for the rim fading in; 180 ms ease-out for menus, tooltips, toasts and panel content; 240 ms for slide and lesson-step transitions; 300 ms for fit view and auto-layout (`fitView({ duration: 300 })`). Everything is 0 ms when `prefers-reduced-motion: reduce` is set.

#### 5.7.6 Node size (`src/model/nodeSize.ts`)

```ts
export const NODE_MIN_DIAMETER = 64
export const NODE_MAX_DIAMETER = 136
export const LABEL_MAX_CHARS = 14       // per line
export const LABEL_MAX_LINES = 3
export interface NodeLabel { lines: string[]; truncated: boolean }
export function wrapLabel(name: string): NodeLabel
export function nodeDiameter(name: string): number
```

Pure and deterministic (no DOM), so `autoLayout` and the store can use it.

- **Size of a set of lines:** `w = (longest line length) × 7.5`, `h = (number of lines) × 16`, `d = ceil(√(w² + h²) + 16)`. These approximate 13 px Plex Sans 500 at line height 1.25. The result is clamped to `[NODE_MIN_DIAMETER, NODE_MAX_DIAMETER]` and rounded up to an even integer.
- **`wrapLabel(name)`:**
  1. Trim the name and split it into words on whitespace. Hard-split any word longer than `LABEL_MAX_CHARS` into 14-character pieces.
  2. For k = 1, 2, 3: greedily fill lines with limit `L`. Start with `L = max(longest word, ceil(length / k))` and raise `L` by 1 until the words fit in at most k lines or `L` exceeds `LABEL_MAX_CHARS`. Keep the wrappings that fit.
  3. Pick the fitting wrapping with the smallest diameter, preferring fewer lines on a tie.
  4. If none fits, wrap greedily at 14 characters, keep the first 3 lines, cut the third to 13 characters and add "…", and set `truncated: true`.
- **`nodeDiameter(name)`:** the diameter of `wrapLabel(name).lines`.
- **Examples** (unit-tested):

| Name | Lines | Diameter |
|---|---|---|
| `Age` | `Age` | 64 |
| `Birth weight` | `Birth` / `weight` | 72 |
| `Maternal smoking during pregnancy` | `Maternal` / `smoking during` / `pregnancy` | 132 |

#### 5.7.7 Node and edge states

| Element | State | Look |
|---|---|---|
| Circle | default | role fill, 2 px role line, role text, elevation 1 |
| Circle | hover | plus a 7 px `--rim` ring outside the outline (`box-shadow: 0 0 0 7px var(--rim)`); the ring is the drag-to-connect area |
| Circle | selected | outline replaced by a 3.5 px `--primary` border; the role still shows in the side panel |
| Circle | keyboard focus | `0 0 0 2px var(--canvas), 0 0 0 4px var(--ring)` |
| Circle | connect source (connect mode) | hover rim stays on |
| Circle | drop target while connecting | 4 px solid `--primary` ring if valid, 4 px `--destructive` ring if not |
| Circle | untyped | 20 px dot on the rim at top right: `--warning-bg` fill, 1.5 px `--background` border, `TriangleAlert` 12 px in `--warning-fg` |
| Edge | default | 1.5 px `--edge`, closed arrowhead 9 px |
| Edge | hover | 2 px `--edge-hover`; interaction width 12 px |
| Edge | selected | 2.5 px `--primary`, arrowhead in `--primary` |
| Edge | on an open causal path (phase 26) | 3 px solid `--edge-hover`, arrowhead in `--edge-hover`; `data-path="causal"` |
| Edge | on an open biasing path (phase 26) | 2 px `--edge-hover`, dashed `5 3`, arrowhead in `--edge-hover`; `data-path="biasing"` |
| Edge | selected and on a path | the selected colour with the path's width and dash |
| Circle | highlighted from the Analysis tab (phase 26) | the hover rim, as in the hover row |
| Connection line | while dragging | 1.75 px `--primary`, dashed `6 4` |
| Evidence chip | edge has evidence | 20 px high, `--background`, 1 px `--input` border, `rounded-sm`, `Bookmark` 10 px and the count in Plex Mono 11 px |

#### 5.7.8 Voice and copy

GraphCreator speaks like a careful colleague reviewing your DAG: precise, neutral and calm, and modest about what a diagram can prove.

- American English in all interface text (color, behavior). No contractions ("cannot", "does not"). Sentence case everywhere. No exclamation marks, no "Oops", no blame, no emoji.
- **Messages:** where (line, node, field), then what (exact names in straight double quotes), then why or the fix if it is not obvious. Messages end with a period; titles and buttons do not.
- **Buttons** are verbs ("Save", "Import", "Delete edge"). "…" marks a button that opens a picker or dialog. A confirm button repeats the action ("New graph"), never "OK" or "Yes".
- **Modest about causes:** say "implied by this DAG", never "the correct adjustment set" (for later analysis features).
- The v1 messages in 4.1–4.4 and 5.4 already follow these rules and stay unchanged; their e2e tests rely on them.
- **Tooltips** start with the term, then define it in epidemiology terms, in one or two sentences of at most 30 words.

`src/lib/copy.ts` exports these texts (`ROLE_LABELS`, `ROLE_DESCRIPTIONS`, `VAR_TYPE_LABELS`, `FIELD_TIPS`, `PANEL_HELP`), exactly:

| Key | Text |
|---|---|
| `ROLE_LABELS` | exposure "Exposure", outcome "Outcome", latent "Latent", adjusted "Adjusted", selected "Selected", other "Other" |
| `ROLE_DESCRIPTIONS.exposure` | "The cause whose effect you want to estimate." |
| `ROLE_DESCRIPTIONS.outcome` | "The effect you want to estimate." |
| `ROLE_DESCRIPTIONS.latent` | "A variable you did not or cannot measure." |
| `ROLE_DESCRIPTIONS.adjusted` | "A variable you control for in the analysis, by stratifying or adding it to the model." |
| `ROLE_DESCRIPTIONS.selected` | "A variable the study population was selected on, such as hospital admission." |
| `ROLE_DESCRIPTIONS.other` | "Any other variable in the model." |
| `VAR_TYPE_LABELS` | categorical "Categorical", ordinal "Ordinal", continuous "Continuous", discrete "Discrete" |
| `FIELD_TIPS.role` | "Role: the part this variable plays in your causal question. The circle's color shows the role on the canvas." |
| `FIELD_TIPS.varType` | "Variable type: how the variable is measured. Categorical and ordinal variables have levels; continuous and discrete variables can have a unit." |
| `FIELD_TIPS.levels` | "Levels: the values a categorical or ordinal variable can take. For ordinal variables, list them from lowest to highest." |
| `FIELD_TIPS.unit` | "Unit: the unit a continuous or discrete variable is measured in, such as g or years." |
| `FIELD_TIPS.evidence` | "Evidence: references that support this arrow, such as PMID:123 or doi:10.1000/xyz. One reference per line." |
| `FIELD_TIPS.note` | "Note: why you drew this arrow, or what is uncertain about it." |
| `PANEL_HELP` | typed `{ title: string; rows: readonly { action: string; how: string }[] }`: the title "Nothing selected." (kept from v1; `e2e/smoke.spec.ts` and `e2e/canvas.spec.ts` check it) followed by four rows: "Add a node" / "Double-click the canvas or press N"; "Connect" / "Drag from the rim of a circle, or press C"; "Delete" / "Select, then press Delete"; "Select several" / "Shift-click"; from phase 21 a fifth row "Undo" / "Press Ctrl+Z" |

#### 5.7.9 Welcome slides (`WelcomeDialog.tsx`)

A centred dialog, 480 px wide, `rounded-xl`, elevation 2, over a dimmed page. It is open while `useUiStore().welcomeOpen` is true and shows slide `welcomeSlide`.

- **When it opens:** on the first visit (`hasBeenWelcomed()` from `src/lib/welcome.ts` returns false; `main.tsx` then calls `openWelcome()`), and from the **Help** button in the top bar (always at slide 1; called Lessons until phase 18).
- **Closing:** any way of closing (Escape, Skip, "Get started", "Take the tour") calls `markWelcomed()`. That writes `localStorage['graphcreator:welcomed'] = '1'`; all storage access is in try/catch, and a blocked storage means the slides show again on the next visit.
- **Navigation:** a row of four dots (the current one is a 16 px teal pill) and "Skip" at the bottom of slides 1–3. Arrow keys and "Next" move between slides.

| Slide | Picture | Title (display) | Body |
|---|---|---|---|
| 1 | two circles joined by a teal arrow | Welcome to GraphCreator | "Draw causal DAGs and document every variable and every arrow." |
| 2 | four role-coloured circles | Circles are variables, arrows are causes | "A circle's color shows its role: exposure, outcome, adjusted, latent." |
| 3 | `Lock` icon | Your graph stays here | "Nothing is uploaded. Your work is kept in this browser, and Save downloads a file." |
| 4 | `BookOpen` icon | How would you like to start? | two full-width buttons: **Take the tour** (primary: closes the slides and calls `useLessonStore.start('tour')`) and **Get started** (outline: closes the slides) |

#### 5.7.10 Lessons (`src/lessons/`, `LessonPanel.tsx`)

Phase 10 built the engine and the tour. Phase 41 extends the engine; phases 45–47 write the 13 other lessons from [LESSONS.md](LESSONS.md), which is binding for their practice graphs, texts, checks, pointers, picks and test claims.

```ts
// src/lessons/types.ts (phase 41; phase 10 had isDone(graph) in place of check)
export type LessonTrack = 'app' | 'causal'           // shown as "Using GraphCreator" and "Causal thinking"
export interface LessonPointer { node: string; label: string }   // a node by name; label of at most three words
export interface LessonPick {
  answers: string[]                  // node names; selecting any of them answers the pick
  hints: Record<string, string>      // node name → the text shown after picking that node wrongly
  reveal: string                     // the explanation shown once the pick is answered
}
export interface LessonStep {
  title: string
  body?: string                      // at most three short sentences
  keyIdea?: string                   // one sentence, in the Key idea box
  task?: string                      // shown as "Try it: <task>"
  pointer?: LessonPointer[]          // canvas labels while the step shows (5.7.12)
  pick?: LessonPick
  check?(ctx: LessonContext): boolean
}
export interface Lesson {
  id: string
  title: string
  summary: string                    // one line in the Lessons dialog
  track: LessonTrack
  sample(): Graph                    // the practice graph loaded when the lesson starts
  steps: LessonStep[]
}
// src/lessons/index.ts
export const LESSONS: Lesson[]       // the 14 lessons in the order of LESSONS.md
export function findLesson(id: string): Lesson | undefined
// src/lessons/helpers.ts (phase 41): the notation of LESSONS.md "Notation for checks"
export function practiceGraph(yaml: string): Graph              // parseYaml; throws Error(`Practice graph does not parse: <first message>`) on failure
export function nodeNamed(graph: Graph, name: string): GNode | undefined
export function edgeNamed(graph: Graph, from: string, to: string): GEdge | undefined
export function roleIs(ctx: LessonContext, name: string, role: Role): boolean
export function adjustedIs(ctx: LessonContext, names: string[]): boolean   // exactly these nodes are adjusted
export function hasEvent(ctx: LessonContext, kind: LessonEventKind, formats?: string[]): boolean
export function selectedNodeName(ctx: LessonContext): string | undefined
export function selectedEdgeIs(ctx: LessonContext, from: string, to: string): boolean
export function stepDone(step: LessonStep, ctx: LessonContext): boolean   // (no pick, or the selected node's name is in pick.answers) and (no check, or check(ctx))
```

- A step with neither `pick` nor `check` is a reading step: Next is enabled at once.
- Steps name nodes by their names in the practice graph. A node the user renamed no longer matches: its pointer is not drawn and checks that name it stay false. Lessons never ask the user to rename a practice node (the tour's rename step looks for any non-default name).
- Each lesson lives in `src/lessons/<id>.ts` (`tour.ts`, `variables.ts`, `arrows.ts`, `files.ts`, `dag-basics.ts`, `confounding.ts`, `mediators.ts`, `colliders.ts`, `selection.ts`, `latent.ts`, `adjustment.ts`, `testing.ts`, `instruments.ts`, `reporting.ts`) and exports `<camelCaseId>Lesson`. Practice graphs are YAML text in the file, copied from LESSONS.md and read with `practiceGraph`; lesson 4 imports `src/model/__fixtures__/smoking.dag.yaml?raw`.

**Tour lesson** (`src/lessons/tour.ts`, id `tour`, title "Drawing your first DAG", `sample()` returns `emptyGraph()`):

| # | Title | Body | Task | `check(ctx)`, on `ctx.graph` |
|---|---|---|---|---|
| 1 | Add a variable | "Each circle is a variable." | "Double-click the canvas, or press N and click." | `graph.nodes.length >= 1` |
| 2 | Name it | "Give the variable a name in the panel on the right." | "Rename the node to Smoking." | some node's name is not `defaultNodeName`-style (`/^Node \d+$/` does not match) |
| 3 | Draw a cause | "An arrow means: this variable affects that one." | "Add a second node, then drag from the rim of one circle to the other." | `graph.edges.length >= 1` |
| 4 | Give it a role | "A role says what the variable is in your question. The color shows it." | "Set the role of one node to Exposure." | some node has role `exposure` |
| 5 | Done | "That is all you need to start. Your own graph comes back when you finish." | none | always true |

**Lesson panel:** 300 px, `--background`, border on the right, 20 px padding. From top to bottom:
- a header with the label "LESSON · STEP n OF m" (label style) and a close button (`aria-label="Close lesson"`, calls `exit()`);
- the step title (title style) and the body, when there is one;
- from phase 42, the **Key idea** box when the step has `keyIdea`: `rounded-lg`, 1 px `--border`, 12 px padding; a first line with a `Lightbulb` icon (16 px, `--primary`) and the label "Key idea" (label style), then the sentence;
- a teal callout (`--accent`, `--accent-foreground`, `CircleCheck` icon) with "Try it: <task>", which turns into "Done." with a check once the step is done (`stepDone`);
- from phase 42, the **pick feedback** under the callout (`role="status"`, body text), for a step with `pick`:
  - not done and `wrongPicks` empty: nothing;
  - not done after a wrong pick: `pick.hints[<last wrong name>]`, or `Not quite. Try again.` when the pick has no hint for that node;
  - not done and at least two wrong picks: also a link-style button **Show answer** (`variant="link"`), which calls `revealAnswer()`;
  - done: `pick.reveal`, whether the user found the answer or used Show answer;
- a row of segmented progress bars (`--primary` for steps up to the current one, `--border` for the rest);
- Back (ghost) and Next (primary; disabled until done; reads "Finish" on the last step).

On a Mac (`/Mac|iPhone|iPad/` in `navigator.userAgent`, as `ToolRail`) the panel shows `⌘` for every `Ctrl` in a body or task.

**Running a lesson** (4.8): the user's graph is set aside and the practice graph loaded with `replaceGraph`. Autosave pauses (`autosave` status `paused`, phase 16). Leaving the lesson by Finish or close restores the user's graph; the practice graph is discarded. Finish also marks the lesson as done (4.8 "Progress"). From phase 48, starting a lesson fits the practice graph into view (at most 100 %), and leaving it puts the user's earlier view back. The Analysis switches a lesson asks the user to turn on stay on afterwards; they are a viewer preference (4.14).

#### 5.7.11 Help menu and Lessons dialog (phase 44)

- **Help menu.** The top bar's Help button (same look and position, `CircleHelp` icon and the word Help) opens a dropdown menu with **Welcome** (`Sparkles` icon; calls `openWelcome()`, slide 1 as before) and **Lessons…** (`BookOpen` icon; calls `openLessons()`).
- **Lessons dialog** (`LessonsDialog.tsx`, mounted by `App`; open while `uiStore.lessonsOpen`): 560 px wide, at most 80 vh tall with the list scrolling. Title "Lessons". Description "Short interactive lessons on a practice graph. Your own graph is set aside and comes back when you finish."
  - Two groups, each a `<section>` with a heading (label style) and a `<ul>` with `aria-label` = the heading: "Using GraphCreator" (`track: 'app'`) and "Causal thinking" (`track: 'causal'`), lessons in `LESSONS` order.
  - Each row: the lesson's number in the course (1–14, Plex Mono, muted), the title (500 weight) with the summary below it (muted, 13 px), and on the right a `CircleCheck` icon in `--primary` with the accessible name "Finished" when the id is in `done`, then a small outline button **Start** (`aria-label="Start <title>"`).
  - Start closes the dialog and calls `useLessonStore.getState().start(id)`. Starting while a lesson runs exits that lesson first (4.8).
  - Below the groups a muted line: `<n> of 14 finished.` (`0 of 14 finished.` at first).
  - Close button and Escape close the dialog (`closeLessons()`).
- The welcome slides stay as they are: slide 4's **Take the tour** still starts the tour.

#### 5.7.12 Canvas pointer (phase 43)

While a lesson step has `pointer`, each entry whose node exists in the graph shows a label on the canvas.

- `CircleNodeData` gains `pointer?: string`. `Canvas` sets it from the current step's `pointer` (names mapped to ids) while a lesson runs; otherwise it is undefined.
- `CircleNode` draws the label centred above the circle with a 10 px gap: a pill in `--primary` with `--primary-foreground` text, 12 px weight 500, 2 px × 8 px padding, `rounded-full`, no wrapping, with a 6 px triangle pointing down at the circle. It has `data-lesson-pointer`, `pointer-events: none` and `aria-hidden="true"` (the lesson panel names the same variable in words).
- It pulses gently: the keyframes `gc-pointer-pulse` in `canvas.css` move it up 3 px and back and fade a 6 px `--primary` ring out around it, 1.6 s, `ease-in-out`, repeating. Under `prefers-reduced-motion: reduce` it does not move.
- The label is part of the node, so it pans, zooms and is clipped with it; it is not part of image exports.
- Phase 43 also records `lessonEvent({ kind: 'edge-refused', format: check.reason })` in `Canvas` wherever a connection is refused (the two places that toast `check.message`).

### 5.8 Analysis tab (`AnalysisPanel.tsx`, phases 26 and 29)

**Tabs.** The side panel starts with a tab list (shadcn `tabs`, `aria-label="Side panel view"`) holding **Edit** and **Analysis**, bound to `uiStore.sidePanelTab`. Edit shows today's content (5.1, 5.3). Whenever the store's `selection` changes to a node or edge, the tab switches to Edit (`SidePanel` watches `selection`; this covers canvas clicks, new nodes, double-click rename and IssuesDialog). Clicking empty canvas leaves the tab as it is. The tab is not remembered across reloads.

**Layout.** The Analysis tab is a column of five sections in the order of `ANALYSIS_KEYS`: Report, Adjustment sets, Paths, Instruments, Independencies. Each section header has the title (15 px, semibold, as the editor headings), an optional count in Plex Mono 13 px muted (`(3)`), and on the right a shadcn `switch` with `aria-label="Show <title, lower case>"` bound to `analysisOn`. A switched-off section shows only its header. Sections are separated by a 1 px `--border` line and 16 px of space.

**Empty state.** With no exposure or no outcome (`status: 'no-exposure-or-outcome'`), a muted line at the top reads `Mark at least one exposure and one outcome to see the analysis.` Report, Adjustment sets, Paths and Instruments then show only their headers; Independencies still works.

**Names.** Sets are written as names joined by `, ` (graph order); the empty set is written `(empty set)`. Lists of names in sentences use "A", "A and B", "A, B and C".

**Report** (Tennant et al. 2021; in the app only, not exported):
- `Total effect of <X names> on <Y names>.`
- One adjustment line, by case:
  - Z empty and `zSufficient`: `No adjustment is needed, as implied by this DAG.`
  - Z not empty and `zSufficient`: `Your adjusted set (<Z names>) is sufficient, as implied by this DAG.`
  - not `zSufficient`: `Your adjusted set (<Z names, or "empty">) is not sufficient, as implied by this DAG.`; then, when `zForbidden` is not empty, `<names> lie on or after a causal path from the exposure; adjusting for them can block or bias the effect.`; then, when `selectionBias` is true, `Selecting on <S names> biases the effect, and no adjustment set can remove that bias.`; otherwise, when `sets` is `[]`, `No set of observed variables is sufficient.`
- When S is not empty: `Always conditioned on (selected): <S names>.`
- `Latent: <names>.` or `Latent: none.`, followed by `Are there unmeasured common causes you should add?`

**Adjustment sets:** count = number of sets. Intro line `Minimal sufficient adjustment sets, as implied by this DAG:`. One row per set: the names, and on the right a small ghost button **Use this set** (calls `setAdjustedSet`); a set equal to the current Z shows the muted label `In use` instead. With `sets` `[]`: `No set of observed variables is sufficient.` With `truncated`: a muted line `Showing the first 100 sets.`

**Paths:** count = number of paths. One row per path: the names joined by ` → ` or ` ← ` following the edge directions (e.g. `Maternal smoking ← SES → Birth weight`), and a muted tag `causal · open`, `biasing · open`, `causal · closed` or `biasing · closed`. With the switch on, the canvas marks edges on open paths (5.7.7); with it off, nothing is marked. With `truncated`: `There are more than 500 paths, too many to list or highlight.` With no paths: `No paths connect the exposure and the outcome.`

**Instruments:** count = number of instruments. One row per instrument: `<name>` or `<name> | <given names>`. With `'needs-single'`: `Instruments need exactly one exposure and one outcome.` With none: `No instruments, as implied by this DAG.`

**Independencies:** count = number of independencies. One row per item in Plex Mono: `A ⫫ B` or `A ⫫ B | C, D` (U+2AEB). Intro line `Independencies implied by this DAG, which you can test in your data:`. With none: `This DAG implies no testable independencies.`

**Long lists.** Paths, Instruments and Independencies show the first 20 rows, then a link button `Show all <n>` that expands the list (local component state, reset when the tab is left).

**Hover.** Pointing at a row or focusing it (each row is focusable, `tabIndex=0`) calls `setHoverNodeIds` with the row's nodes (the set, the path, or the instrument with its conditioning set); leaving or blurring calls `setHoverNodeIds([])`, as does leaving the tab. Those circles show the hover rim (5.7.7).

**Accessibility.** Rows are a `<ul>` per section with `aria-label` = the section title. The canvas path marking is not colour-only: width and dashes carry it.

**During a lesson** the tab analyses the practice graph like any other graph.

Details fixed in phase 29: a count shows `(0)` for an empty list and is left out when the list cannot be computed (truncated paths, `'needs-single'`, sections hidden by the empty state). Hovering an independence row highlights a, b and the conditioning set; an adjustment row's hover area includes its button. Intro lines use body text; only `Showing the first 100 sets.` is muted. Every Report sentence is its own `<p>`. `SidePanel` switches to Edit through a `useGraphStore.subscribe` on `selection`, so clicking a node that is already selected does not switch (the selection does not change); a selection from IssuesDialog always does. "Show all" resets when the tab is left, because the tab content unmounts.

## 6. Project setup and conventions


- Scripts in `package.json`: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint` (`oxlint`), `typecheck` (`tsc -b`; the tsconfigs set `noEmit`), `test` (`vitest run`), `test:watch` (`vitest`), `test:e2e` (`playwright test`), `format` (`prettier --write .`).
- Unit tests live next to the code as `src/**/*.test.ts`; fixtures in `src/model/__fixtures__/`. Vitest config is the `test` block in `vite.config.ts` (`environment: 'node'`, `include: ['src/**/*.test.ts']`).
- Playwright: `playwright.config.ts`, tests in `e2e/`, Chromium only, `webServer` runs `npm run build && npm run preview -- --port 4173 --strictPort`, `baseURL: 'http://localhost:4173'`.
- Node version pinned in `.nvmrc` (`26`).
- CI: `.github/workflows/ci.yml`, on push to `develop` and on pull requests: checkout, setup-node from `.nvmrc` with npm cache, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:e2e`. Deployment from `develop` to `production` is added once a host is chosen (see Open issues).
- Claude Code: `.claude/settings.json` has a Stop hook `npm run typecheck 1>&2 || exit 2`. CLAUDE.md lists the scripts and the rules: `docs/SPEC.md` is the source of truth; `src/model` has no React imports; no backend; MIT, no GPL code.
- Path alias `@/` → `src/` (required by shadcn/ui), set in `tsconfig.json`, `tsconfig.app.json` and `vite.config.ts`. `paths` only, without `baseUrl` (TypeScript 7 deprecates `baseUrl`).
- shadcn/ui is initialised with the Radix base and the `radix-nova` preset (`npx shadcn@latest init -t vite -b radix -p nova`). This adds `radix-ui`, `lucide-react`, `class-variance-authority`, `cn` (shadcn's own clsx + tailwind-merge replacement), `tw-animate-css`, `@fontsource-variable/geist`, `next-themes` (used by the `sonner` wrapper; removed in phase 19 in favour of the theme store, 4.9) and `shadcn` (for `shadcn/tailwind.css`). Generated files in `src/components/ui/` are exempt from oxlint's `react/only-export-components` (override in `.oxlintrc.json`).
- `tsconfig.node.json` also includes `playwright.config.ts` and `e2e/`, so `npm run typecheck` covers the end-to-end tests.
- `.prettierignore` also lists `docs`: Prettier would rewrite the hand-aligned code blocks and tables in this spec.
- `LICENSE`: MIT, `Copyright (c) 2026 Bart van der Woude`.

## 7. Decisions and alternatives considered

| Topic | Chosen | Alternatives considered | Why |
|---|---|---|---|
| v1 scope | Drawing + dagitty round-trip + typed variables + YAML | Also causal analysis; also simulation code export | User's choice; analysis and simulation go to IDEAS.md. |
| Licence | MIT, own algorithms | GPL with DAGitty's jslib; decide later | Permissive reuse, JOSS-compatible. |
| Backend | None | Accounts and cloud saving (e.g. Supabase) | Free static hosting, no GDPR exposure, unpublished study designs stay local. |
| Hosting | Decided later | GitHub Pages; Cloudflare; EU host | User's choice; CI runs checks only until then. |
| Variable types | categorical / ordinal / continuous / discrete | cat/ord/numerical; explicit binary | User's choice: numerical split, the count type is called "discrete". Binary is categorical with two levels. |
| Edge kinds | Directed only | Directed + bidirected | User's choice: it is a DAG creator; bidirected/undirected go to IDEAS.md. |
| Roles | One role per node | Combinable flags | Simple UI, no contradictions like latent + adjusted. |
| v1 metadata | Node description + unit; edge evidence + note | Estimand field; omitted-arc justifications | User's choice; the other two go to IDEAS.md. |
| Unsupported dagitty input | Reject with a clear error | Convert `<->` to a latent node; drop with warning | Nothing is silently changed. |
| Type required? | Optional, warn if missing | Required with a default | dagitty imports have no types; no silent wrong defaults. |
| Type fields | Levels for categorical/ordinal only | Also min/max; distribution hint | User's choice: minimal until simulation needs more. |
| Node naming | Single name, any text | id + display label | User's choice. |
| Names in dagitty | Converted to safe ids (spaces → `_`) with the original kept as `label="..."` | Quote names on export; safe id without label | User's choice: dagitty-friendly ids, and re-import restores the original names. |
| dagitty metadata | Plain dagitty only | Embed as attributes; toggle | YAML is GraphCreator's own format and the source of truth. |
| v1 editor extras | Auto-layout (dagre) | Undo/redo; share link; list view | User's choice; others go to IDEAS.md. Undo/redo and share links follow in wave 12. |
| Storage | One autosaved graph + YAML files | Local library of named graphs | Simple; files are the durable store. |
| Image export | None in v1; SVG, PNG and TikZ from wave 12 (4.11) | SVG only; SVG and PNG | User's choice (2026-11-08): TikZ added for LaTeX papers. |
| Stack | React Flow, Zustand, Zod, `yaml`, dagre, shadcn/ui + Tailwind v4 | Same with plain CSS | Most documentation and examples. |
| Tests / CI | Vitest + Playwright in GitHub Actions | Vitest only | Logic and UI regressions both caught. |
| YAML identity | `schema: graphcreator/0.1`, `.dag.yaml` | Plain `.yaml`, optional version | The format can evolve safely. |
| Screen layout | Toolbar + canvas + side panel | Canvas + floating popovers | Room for levels lists and descriptions. |
| Invalid edges | Blocked while dragging + toast naming the reason | Blocked silently | Users understand why. |
| Role visuals (v1; replaced by "Role cue on the canvas" below) | Colour + text badge, latent dashed | DAGitty-like colours only | Not colour-only; accessible. |
| Multiple exposures/outcomes | Allowed, no warning | Warn; at most one | Matches imported files; later analysis can require one. |
| Adding nodes/edges | Double-click + drag handles + toolbar button | Toolbar modes | Fewer clicks. |
| Name uniqueness | Unique after trim, case-sensitive | Case-insensitive | Predictable. |
| Document location | `docs/SPEC.md`, `docs/IDEAS.md`, research moved to `docs/research.md` | Root files; delete research | User's choice. |
| Product stance | GraphCreator is its own tool; dagitty is an exchange format | DAGitty clone | User's direction. |
| shadcn base and preset (phase 1) | Radix base, `radix-nova` preset | Base UI or React Aria base; other presets | Radix is the base most shadcn docs and examples use; Nova is the CLI's default preset. Settled during phase 1, not in the interview. |
| Implementation order (2026-11-08) | Task graph with waves: contracts (phase 3), five parallel phases (wave 4), integration (phase 9) | Formats first, then UI in narrower waves without stubs | User's choice when the /design skill gained waves. Only the cut into phases changed; the design did not. |
| `Issue.nodeId` (phase 3) | Optional `nodeId` on `Issue`, set on node warnings | Match warnings to nodes by parsing the message | Needed for 5.1 "clicking a warning selects its node"; fixed in the contracts phase so wave 4 can rely on it. |
| Store API location | Section 4.6, implemented in phase 3; autosave in its own module (phase 9) | Store and autosave together with the canvas | Wave 4's UI phases all code against the store, so it is a contract. |
| Wave 4 implementation details | As recorded in 4.1, 4.2 and 5.6 ("Details fixed in phase …") | — | Not specified before; chosen by the wave 4 implementations and accepted when the wave landed. |
| dagitty y axis | Grows downward; ×100, no flip | Flip y on import/export | Confirmed in phase 5; closes the former open issue. |
| dagitty-derived fixtures | `confounding.dagitty.txt` and `bidirected.dagitty.txt` are dagitty example models used verbatim as test data | Hand-written equivalents | The spec allowed dagitty examples as data; they are model text, not code. Flagged to the user when wave 4 landed. |
| Autosave timing (phase 9) | Trailing debounce: write 500 ms after the last change | Throttle: write at most every 500 ms during a burst | Both fit "at most every 500 ms"; the debounce writes less often and was accepted when wave 5 landed. |
| Store details (phase 3) | As listed under 4.6 ("Details fixed in phase 3") | — | Not specified before; chosen by the phase 3 implementation and accepted when the wave landed. |
| Validation error messages (phase 2) | Exact texts listed in 4.4 | — | The spec named only some messages; the rest were fixed during phase 2 so later phases and tests can rely on them. |
| Prettier scope (phase 1) | `docs` added to `.prettierignore` | Format docs too | Formatting docs rewrote the spec's aligned code blocks; docs stay hand-formatted. |
| Overall look (redesign, 2026-11-08) | Friendly modern, light by default | Neutral "ink" look; warm lab notebook; dark blueprint | User's choice in the design rounds; wants a coherent UI palette, with the graph coloured by function. |
| Brand colour | Teal `#0F766E`, medium amount (tinted canvas, logo, panel header, active tool, primary buttons) | Indigo; berry; navy and coral; subtle or bold amounts | User's choice. Teal stays clear of the role hues, so selection does not look like a role. |
| Role colours | Soft pastels in the familiar hues (fill, line, text per role) | DAGitty-strength colours; colour only exposure and outcome | User's choice. The "Other" outline was darkened from the canvas's `#8996A8` to `#7D8A9C` to reach 3:1 against `--canvas`. |
| Role cue on the canvas | Colour only; the side panel names the role | Letter badges (v1); ring styles; a legend; ring styles + legend | User's choice, made after the colour-blindness trade-off was raised. Replaces the v1 row "Role visuals". |
| Fonts | IBM Plex Sans + IBM Plex Mono via `@fontsource` | Geist (v1); Inter; Plus Jakarta Sans; Geist Mono, JetBrains Mono | User's choice. |
| Density and corners | Comfortable (14 px text, 32 px controls); soft corners (`--radius: 0.5rem`) | Compact; roomy; crisp or round corners | User's choice. |
| Node shape | Circle with the name inside; the circle grows with the name | Box with badge (v1); pill; two-line card; ellipse; name below a fixed circle | User's choice. |
| Edge drawing | Straight, from rim to rim along the line between centres | Bezier (v1); right angles; open arrowheads | User's choice ("from the point closest to the node they connect to"). |
| Connecting | Drag from a teal hover rim (React Flow easy-connect pattern); plus connect mode (C) | Plus-dot handle; connect tool only; left/right handles (v1) | User's choice; connect mode added as the keyboard alternative. |
| Selection look | 3.5 px teal border on the node | Teal ring with gap; soft halo | User's choice. The border hides the role colour while selected; the side panel shows the role. |
| Screen layout | Left tool rail, slim top bar, fixed right panel | Top bar only (v1); menus and icons; floating toolbar; popover panel; tabbed panel | User's choice. |
| Buttons | Solid teal primary, outline secondary, plain cancel | Soft tinted; ink primary with teal links | User's choice. |
| Voice | Careful colleague: precise, neutral, no contractions, American spelling | Friendly guide; terse; teacher; British spelling | User's choice. The v1 messages already fit and stay unchanged. |
| Explanations | Short info-icon tooltips with exact texts in 5.7.8 | None; tooltips plus help pages; dotted underlines | User's choice; written into the spec so they can be edited before building. |
| First run | Welcome slides on the first visit; the Help button (Lessons until phase 18) reopens them; the last slide starts the tour | Start card; guided tour only; example graph | User's choice. |
| Lessons | Docked panel on the real canvas; engine plus one tour lesson now; the six real lessons in IDEAS.md | Separate lesson window; full lesson copy now | User's choice ("empty, very simple lessons now"). |
| Spec placement | Rewrite 5.1–5.3 in place, new 5.7, v1 look kept in 5.6 | A separate section 11 overriding section 5 | User's choice. |
| Rollout | New parts built unmounted in wave 7, switched on in phase 16; CI green on every commit | Edit live parts and accept red e2e until the end | User's choice. |
| Circle size | Pure estimate in `src/model/nodeSize.ts` | Measuring text in the browser | User's choice: deterministic and usable by `autoLayout` without the DOM. |
| Extras | Tool shortcuts and connect mode, evidence chip, saved indicator, dark theme following the system | Leave each for later | User's choice (all four). No theme toggle at first; added in phase 17 (see "Theme toggle"). |
| Dark theme mechanism | Own Zustand theme store (`src/store/themeStore.ts`, 4.9) since phase 19: the `dark` class and `color-scheme` on `<html>`, a stored dark theme applied by a script in `index.html`; React Flow `colorMode` and the sonner wrapper read the store | `next-themes` (phases 10–18: `attribute="class"`, `defaultTheme="system"`, then `"light"` from phase 17); CSS media query only | User's choice in phase 19: `next-themes` renders an inline `<script>` meant for server rendering, which never runs in this browser-only app and makes React 19 warn "Encountered a script tag" in development. With a fixed light default the library adds nothing. |
| Theme toggle (2026-11-08, phase 17) | Two-state Dark mode button at the right end of the top bar; light by default even when the system is dark; stored in `graphcreator:theme` | Follow the system only; three-way light/dark/system switch | User's choice. Closes the former open issue. |
| Help button (phase 18) | The top bar's Lessons button is called Help | Keep "Lessons" | User's choice. It still opens the welcome slides. |
| Open (phase 18) | One Open dialog: paste GraphCreator or dagitty code, or Open file…; the format is recognised by `detectFormat` | Separate YAML Open and dagitty Import… | User's choice; removes the dagitty menu. Errors stay inside the dialog instead of a separate IssuesDialog. |
| Confirm before Open (phase 18) | Open asks before replacing a graph that has nodes, like New and the old dagitty import | Replace without asking (v1 YAML Open) | One rule for every way of replacing the graph now that Open and import are one action. |
| Save (phase 18) | Split button: Save downloads `.dag.yaml` as before (until phase 20); the ▾ menu offers GraphCreator… and dagitty…, each a code dialog with Copy and Download | dagitty menu; a direct dagitty download | User's choice. The YAML code dialog is new and mirrors the dagitty one. |
| Save opens the dialog (phase 20) | The Save button opens the "Save as GraphCreator" code dialog; the file is downloaded from there | Direct download (phases 1–19) | User's choice: one place to copy or download the GraphCreator text. |
| Rename by double-click (phase 18) | Double-clicking a circle focuses the side panel's name field (`focusName`) | Inline text box on the canvas | User's choice; the same path as after adding a node. |
| Contrast check | `src/lib/theme.test.ts` parses `src/index.css` and checks the token pairs | Manual check | Keeps both themes accessible as tokens change. Phase 10: every 5.7.2 value passed unchanged. The test loads `node:fs` with a dynamic `import()` and types `readFileSync` by hand, because `tsconfig.app.json` has no Node types and Vite's `?raw` returns an empty string for CSS in Vitest. |
| Welcome closing | Escape, Skip, "Get started", "Take the tour" and a click on the dimmed overlay all close the slides and set the welcomed flag; no close (X) button; dots on all four slides | An X button; overlay clicks ignored | Phase 14 judgement call; the spec lists no X button. |
| Lesson panel details | Header text "LESSON · STEP n OF m" written literally; no callout on a step without a task; Back disabled on step 1; the callout is `role="status"`; the lesson's own title is not shown | Lesson title in the header | Phase 15 judgement calls within 5.7.10. |
| Role menu placement | The role picker opens below its field at the field's width (`position="popper"`); the type menu keeps the default | Default Radix placement | The default scrolled and was wider than the panel (phase 13). |
| Connect mode clicks | Every second click ends the pick, valid or not; clicking the picked circle again puts it down without the self-loop toast | Keep the source picked after a failed edge | Phase 16 judgement call: each edge is exactly two clicks. |
| Handle click-to-connect | `connectOnClick={false}` | React Flow's default (on) | It would compete with the rim drag and with connect mode (phase 16). |
| React Flow attribution | Hidden (`proOptions={{ hideAttribution: true }}`, phase 18) | Bottom left, transparent background (phases 16–17); bottom right (default) | User's choice. React Flow is MIT-licensed, so hiding the link is allowed. |
| Autosave status | `paused` while a lesson runs; otherwise `blocked` when storage is missing or the last write threw, back to `on` after a successful write; the user's graph is rewritten by the normal 500 ms debounce after a lesson ends | Re-check storage on a timer | Phase 16 judgement call within 4.7 and 5.5. |
| e2e fixture | `e2e/fixtures.ts` sets `graphcreator:welcomed` via `addInitScript`; its fixture callback is named `provide` (oxlint mistakes `use` for the React hook); `welcome.spec.ts` uses the plain Playwright `test` | Clicking through the slides in every spec | Keeps the existing specs independent of the welcome flow (phase 16). |
| Rail Add node | Pressing Add node while the add tool is active places a node at the view centre and returns to Select, like an add-tool click on the canvas | Stay in the add tool | Phase 12 judgement call, consistent with 5.2. |
| Tooltip look | Phase 10 restyles the generated shadcn `tooltip.tsx` to `rounded-lg`, elevation 2 and 180 ms ease-out (5.7.4, 5.7.5), keeping the foreground-coloured background | Leave the generated `rounded-md` look | Only phase 10 owns `tooltip.tsx`, so wave 7 cannot fix it. |
| `renameNode` keeps the centre | The store shifts `pos` when the diameter changes | Grow from the top-left corner | Circles stay where the user put them; `pos` keeps its file meaning. |
| Undo history (wave 12) | Snapshot stacks of immutable graphs in `graphStore` (4.10), 100 steps; `replaceGraph` clears them; not autosaved | A library such as zundo; command objects; undoing New and Open | Graphs are immutable, so snapshots are cheap and need no dependency. New and Open already ask first. |
| Undo controls (wave 12) | Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y and two buttons in the tool rail | Top bar buttons; shortcuts only | User's choice. |
| Image export source (wave 12) | Drawn from the graph data with the canvas geometry, light palette, embedded IBM Plex Sans | Capturing the DOM (e.g. `html-to-image`); following the current theme | No dependency; the image is independent of zoom, selection and theme. |
| Export dialog look (wave 12) | Built in the Calm teal style of the existing dialogs, no design rounds | Design rounds first | User's choice. |
| Share behaviour (wave 12) | Share copies the link at once and toasts; no dialog | A dialog with the link and a Copy button | User's choice. |
| Share link format (wave 12) | `#g=` + base64url of deflate-raw `toYaml` text, via the browser's `CompressionStream` | `lz-string`; uncompressed base64; a query parameter | No dependency; the fragment is never sent to a server. |
| Opening a share link (wave 12) | Replace at once when the stored graph is empty or the same; otherwise ask ("Keep my graph" / "Open shared graph"); the fragment is removed after reading | Always replace; always ask; keep the fragment | The same rule as New and Open: never lose a graph without asking. |
| Wave 12 file sharing | Phases 22 and 23 both add one button to `TopBar.tsx`, at fixed places; the conflict is resolved when phase 23 lands | A fourth integration phase; one phase owning both buttons | Two small additions do not justify an extra phase. The single exception to disjoint file ownership. |
| Analysis scope (2026-11-09) | Adjustment sets, path highlighting, implied independencies, instruments and an in-app Tennant report | A subset first | User's choice. |
| Tennant report | Shown in the Analysis tab only | Exportable summary; stored estimand and alternative sets with rationale | User's choice ("not exportable yet"); the rest needs file-format changes and stays in IDEAS.md. |
| Analysis placement | Edit and Analysis tabs in the side panel; each section has its own switch | A separate dialog; design rounds | User's choice. |
| Several exposures or outcomes | Treated as sets (joint total effect), as in DAGitty; instruments need exactly one of each | Require exactly one of each | User's choice; matches imported files and the "multiple exposures allowed" decision. |
| Effect type | Total effect only | Also direct effects | Keeps the first round small; direct effects go to IDEAS.md. |
| Reference answers | dagitty-R as a dev-time oracle writing committed `reference.json`, plus brute-force checks | Hand-worked examples only | User's choice. No GPL code enters the app; CI does not need R. |
| Path look on the canvas | Line style only: causal 3 px solid, biasing 2 px dashed, both in `--edge-hover` | DAGitty green/red; teal and coral; green and magenta | User's choice. Red is reserved for errors and teal for selection; no new colour tokens. |
| Section switches | A switch in each section header; off collapses to the header | A checklist on top; an accordion with one highlight switch | User's choice. |
| Tab on selection | Selecting a node or edge switches to Edit | Stay on Analysis | User's choice. |
| Closed biasing paths | Drawn as normal edges | Thin dotted | User's choice: adjusting visibly removes the dashes. |
| Default switches | Report and Adjustment sets on, the rest off; remembered in `graphcreator:analysis` | All on; all off | User's choice. |
| Section order | Report, Adjustment sets, Paths, Instruments, Independencies | Sets first, report last | User's choice. |
| Paths in the panel | A list with kind and state, 20 rows then "Show all" | Counts only | User's choice. |
| Independence notation | `A ⫫ B \| C, D` | Words | User's choice. |
| Use this set | A button per minimal set that sets the Adjusted roles, one undo step | Read-only panel | User's choice. |
| Hover highlighting | Hovering or focusing a row puts the hover rim on its nodes | None | User's choice. |
| Analysis spec location | SPEC.md 4.13–4.14, 5.8, waves 13–15; gallery in `src/model/__fixtures__/analysis/`; `scripts/dagitty-reference.R` | A separate `docs/ANALYSIS_SPEC.md` | User's choice. |
| Adjusted nodes and the listed sets (phase 24) | Minimal sets are listed regardless of the Adjusted nodes; the reference clears adjusted roles before asking dagitty-R | dagitty-R's behaviour: only sets containing every Adjusted node | User's choice; fits "Use this set" and the separate sufficiency line. |
| Selected nodes (phase 24) | The selection criterion of Correa, Tian & Bareinboim (2018), which matches dagitty-R exactly | "Z ∪ S is an adjustment set" (the first version of 4.13) | User's choice. With only S = 1 data the covariate distribution is also biased, so the first version was too optimistic (it called {C} sufficient in `selection-bias`). |
| Independencies with selected nodes (phase 24) | Always condition on S and leave S out of the pairs | dagitty-R: S as an ordinary node | User's choice: only S = 1 data can be tested. Tests for those gallery files check validity instead of comparing with dagitty-R. |
| Instruments with selected nodes (phase 28) | Condition on S, as the rest of the analysis | dagitty-R 0.3.4, which ignores S here | User's choice; consistent with paths and independencies. |
| Instrument conditioning set (phase 28) | W contains no descendant of a causal-path node and no descendant of the outcome | Descendants of causal-path nodes only (first version); dagitty-R's "mediators or descendants of the outcome" | User's choice. The first version allowed descendants of the outcome when the exposure does not cause it; conditioning on a mediator's descendants can bias an IV estimate, so GraphCreator stays stricter than dagitty-R. |
| Section 6 heading | Restored as "## 6. Project setup and conventions" | — | It was dropped by accident in 910cfc7; other sections refer to "section 6". |
| New formats, direction (2026-11-09) | Export GML, DOT, networkx JSON, bnlearn, Tetrad and Mermaid; Open also reads GML, DOT and networkx JSON | Export only; export and open all six | Recommended option. These three come back from DoWhy and Python tools; parsing Mermaid, bnlearn and Tetrad adds little. |
| New formats in the UI | One Save as… item per format, each opening `CodeDialog` | One "Other formats…" dialog with a Format select (recommended); inside the Export dialog | User's choice. |
| Node names in exchange formats | Safe ids (`toDagittyIds`) as node names; the full name kept as `name`/`label` where possible | Names as typed | Recommended option. DoWhy, bnlearn and networkx look nodes up by name, and the names must match data columns. In GML the safe id is the `label`, because networkx's `parse_gml` (used by DoWhy) names nodes by `label`. |
| Metadata in GML, DOT and JSON | Always everything (roles, types, levels, description, unit, positions, evidence, note); round trip like YAML | Structure and roles only | Recommended option. These formats are meant for data, so no checkbox. |
| DOT and Mermaid look | Role colours from the light palette (DOT `fillcolor`/`color`/`fontcolor`, Mermaid `classDef`) | DOT plain; neither | Recommended option. |
| bnlearn output | The model string only | A ready-to-run R line | Recommended option. |
| Tetrad variant | Tetrad's saved-file form (`Graph Nodes:` / `Graph Edges:`), read by causal-learn | The manual's `# Nodes` form with latent nodes in parentheses | Recommended option; tools read the saved-file form. Roles are lost. |
| networkx edge key | Write `edges`, accept `links` on import | Write `links` | networkx 3.7 defaults to `edges`; `links` was the key before 3.4. |
| PDF | Own vector PDF writer with Helvetica (`pdfExport.ts`) | jsPDF + svg2pdf.js loaded lazily; a PNG inside a PDF page | Recommended option. No dependency and vector output; the font differs slightly from the canvas. |
| Legend layout | Box in a corner listing the roles in use (option B) | A row below (A); a column on the right (C); a row below with all six roles (D) | User's choice, picked from four drawn options. |
| Legend placement | Best free corner (top right, top left, bottom right, bottom left), else beside the graph | Top right, growing when it would overlap (recommended); bottom right | User's choice. |
| Legend and theme controls | A Legend checkbox (off) and a Theme select (Light) in the Export dialog, kept while the page is open | The theme follows the app | Recommended option. |
| TikZ options | The legend, but no dark theme | Both; neither | Recommended option. LaTeX documents are printed on white. |
| dagitty details names | `gc.` prefix (`gc.var_type`, `gc.levels`, …) | The YAML key names without a prefix | Recommended option. It cannot clash with dagitty's own attributes, and dagitty-R keeps such attributes (checked). |
| dagitty details lists | `;`-separated, with `\;` and `\\` escapes | JSON array text | Recommended option; readable in dagitty.net. |
| dagitty details checkbox | Off by default, remembered across visits | On by default; remembered only per page | Recommended option. Plain dagitty stays the default. |
| Exchange-format oracle | A dev-time script (`scripts/check-formats.py` with networkx, pydot and causal-learn, plus bnlearn and dagitty in R) that reads committed sample exports and records what each tool saw | Unit tests only | Recommended option. It proves the files work in the real tools; it does not run in CI. |
| Lesson home | Interactive lessons in the app, on the lesson engine | Lessons plus a written guide; a guide only; reading pages without tasks | Recommended option (2026-11-09). |
| Lesson scope | A full course of 14 lessons in two tracks (using GraphCreator; causal thinking) | The six lessons in IDEAS.md; a core of five; causal concepts only | Recommended option. |
| Lesson audience | Researchers new to DAGs: plain words, one idea per step, the formal term named once understood, no formulas | Complete beginners; methods students with notation; plain text plus "More detail" | Recommended option. |
| Practice graphs | The smoking and birth weight story, extended per lesson, plus classic shapes (M-bias, selection, instrument) with names from the same story | One running example only; one textbook graph per concept; the user's own graph | Recommended option. |
| Step checks | `check(ctx)` on the graph, the UI state (tab, Analysis switches, selection) and a log of app events | Graph and UI state only; graph only; graph only plus "Show me" | Recommended option. The Analysis and file lessons need the UI state and events. |
| Step text | At most three short sentences, an optional Key idea box, and canvas pointers | Longer text; more steps; drawn diagrams in the panel | Recommended option. |
| Understanding checks | Picks answered on the canvas by selecting a node, checked against the analysis engine | Multiple choice in the panel; both; none | Recommended option. |
| Lesson text | Written in full during design, in `docs/LESSONS.md`, binding for the lesson files | Outlines only, text by the phase agents; text reviewed lesson by lesson | Recommended option; LESSONS.md keeps SPEC.md readable. |
| Lesson accuracy | Every causal claim in a lesson is a unit test against `src/model/analysis/` | Only the pick answers; no tests | Recommended option. |
| Lessons list | Help becomes a menu (Welcome, Lessons…); Lessons… opens a dialog with the two tracks | The last welcome slide; a Lessons button in the top bar; a book icon in the tool rail | Recommended option, picked from four drawn options. |
| Key idea and pointer look | A Key idea box in the panel and a pulsing teal label on the canvas above the named nodes | The hover rim only; a bold lead sentence; dimming the rest of the canvas | User's choice, picked from four drawn options. |
| Wrong picks | The node's own explanation, and a Show answer link after two wrong picks | Explanation only; a generic "Try again"; silent | User's choice. |
| Lesson progress | Finished lessons get a checkmark, kept in this browser; no resuming mid-lesson | Checkmarks and resuming; nothing kept | Recommended option. |

## 8. Implementation phases

Phases form a dependency graph and are grouped into waves. Every phase in a wave depends only on phases in earlier waves and owns a disjoint set of files, so a wave can run in parallel (one sub agent per phase, "run wave N") or phase by phase. Each phase is one commit and leaves the full test suite passing. Status: `[ ]` to do, `[x]` done (with the commit hash).

General rules for every phase:

- Read the whole spec first; sections 3–7 and the decisions table are binding.
- Only create or change the files the phase owns. All other files are read-only for it. Code against the contracts of earlier phases; don't change them.
- Use only the shadcn/ui components already in `src/components/ui/` (phase 1 added `button`, `input`, `select`, `textarea`, `dialog`, `dropdown-menu`, `sonner`; phase 3 adds `label` and `badge`; phase 10 adds `tooltip`; phase 24 adds `tabs` and `switch`; phase 31 adds `checkbox`). If another is needed, stop and report it.
- Don't add npm dependencies; everything needed is installed (section 6). The only exception is phase 10, which swaps the font packages (5.7.3).
- "All checks" means `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e`.

### Task graph

| Phase | Title | Depends on | Wave | Owns files |
|---|---|---|---|---|
| 1 | Tooling, CI and app shell | none | 1 | project config, CI, `src/App.tsx`, `src/index.css`, `src/model/result.ts`, `e2e/smoke.spec.ts` (see the phase) |
| 2 | Model core | 1 | 2 | `src/model/{schema,graph,cycle,validate}.ts` and their tests |
| 3 | Layout, store and contracts | 2 | 3 | `src/model/layout.ts`, `layout.test.ts`, `yaml.ts` (stub), `dagitty.ts` (stub), `result.ts`, `validate.ts`, `validate.test.ts`, `src/store/graphStore.ts`, `graphStore.test.ts`, `src/components/ui/{label,badge}.tsx` |
| 4 | YAML format | 3 | 4 | `src/model/schema.ts`, `yaml.ts`, `yaml.test.ts`, `src/model/__fixtures__/*.dag.yaml` |
| 5 | dagitty import and export | 3 | 4 | `src/model/dagitty.ts`, `dagitty.test.ts`, `src/model/__fixtures__/*.dagitty.txt` |
| 6 | Canvas and node look | 3 | 4 | `src/components/Canvas.tsx`, `DagNode.tsx`, `src/index.css` |
| 7 | Side panel editors | 3 | 4 | `src/components/SidePanel.tsx`, `NodeEditor.tsx`, `EdgeEditor.tsx`, `ListEditor.tsx` |
| 8 | Toolbar and dialogs | 3 | 4 | `src/components/Toolbar.tsx`, `IssuesDialog.tsx`, `DagittyImportDialog.tsx`, `DagittyExportDialog.tsx`, `src/lib/download.ts` |
| 9 | Integration, autosave and end-to-end tests | 4, 5, 6, 7, 8 | 5 | `src/App.tsx`, `src/main.tsx`, `src/store/autosave.ts`, `autosave.test.ts`, `e2e/*.spec.ts`, this spec's Status line |
| 10 | Design groundwork and contracts | 9 | 6 | `package.json`, `package-lock.json`, `src/index.css`, `src/lib/theme.test.ts`, `src/lib/copy.ts`, `src/model/nodeSize.ts` (+ test), `src/model/layout.ts` (+ test), `src/store/graphStore.ts` (+ test), `src/store/uiStore.ts` (+ test), `src/store/lessonStore.ts` (+ test), `src/lessons/*`, `src/components/ui/tooltip.tsx` |
| 11 | Circle nodes and floating edges | 10 | 7 | `src/components/canvas/*`, `src/lib/geometry.ts`, `geometry.test.ts` |
| 12 | Top bar, tool rail and shortcuts | 10 | 7 | `src/components/TopBar.tsx`, `ToolRail.tsx`, `useToolShortcuts.ts`, `SavedIndicator.tsx` |
| 13 | Side panel restyle and tooltips | 10 | 7 | `src/components/SidePanel.tsx`, `NodeEditor.tsx`, `EdgeEditor.tsx`, `ListEditor.tsx`, `InfoTip.tsx`, `RolePicker.tsx`, `e2e/editing.spec.ts` |
| 14 | Welcome slides | 10 | 7 | `src/components/WelcomeDialog.tsx`, `src/lib/welcome.ts`, `welcome.test.ts` |
| 15 | Lesson panel | 10 | 7 | `src/components/LessonPanel.tsx` |
| 16 | Redesign integration and end-to-end tests | 11, 12, 13, 14, 15 | 8 | `src/App.tsx`, `src/main.tsx`, `src/components/Canvas.tsx`, deletes `DagNode.tsx` and `Toolbar.tsx`, `src/model/layout.ts` (+ test), `src/index.css`, `src/store/autosave.ts` (+ test), `e2e/*`, this spec's Status line and Open issues |
| 17 | Light/dark toggle | 16 | 9 | `src/main.tsx`, `src/components/TopBar.tsx`, `e2e/smoke.spec.ts` |
| 18 | Top bar rework and double-click rename | 17 | 10 | `src/model/fileFormat.ts` (+ test), `src/store/graphStore.ts` (+ test), `src/components/TopBar.tsx`, `OpenDialog.tsx`, `CodeDialog.tsx` (replace the two dagitty dialogs), `Canvas.tsx`, `src/index.css`, `IssuesDialog.tsx` (comment), `e2e/*.spec.ts` |
| 19 | Own theme store instead of next-themes | 18 | 11 | `src/store/themeStore.ts` (+ test), `index.html`, `src/main.tsx`, `src/components/TopBar.tsx`, `Canvas.tsx`, `src/components/ui/sonner.tsx`, `package.json`, `package-lock.json` |
| 20 | Save opens the GraphCreator dialog | 19 | 11 | `src/components/TopBar.tsx`, `e2e/files.spec.ts` |
| 21 | Undo and redo | 20 | 12 | `src/store/graphStore.ts` (+ test), `src/components/Canvas.tsx`, `SidePanel.tsx`, `ToolRail.tsx`, `useToolShortcuts.ts`, `src/lib/copy.ts`, `e2e/undo.spec.ts` |
| 22 | Image export | 20 | 12 | `src/lib/imageExport.ts` (+ test), `src/lib/download.ts`, `src/components/ExportDialog.tsx`, `TopBar.tsx` (the Export… button and dialog only), `e2e/export.spec.ts` |
| 23 | Share links | 20 | 12 | `src/lib/shareLink.ts` (+ test), `src/components/SharedGraphDialog.tsx`, `src/main.tsx`, `src/App.tsx`, `TopBar.tsx` (the Share button only), `e2e/share.spec.ts` |
| 24 | Analysis contracts and core | 23 | 13 | `src/model/analysis/*` (types, dsep and index real, the other four as stubs; tests for the real ones), `src/model/__fixtures__/analysis/*`, `scripts/dagitty-reference.R`, `src/store/uiStore.ts` (+ test), `src/store/graphStore.ts` (+ test), `src/components/useAnalysis.ts`, `src/components/canvas/types.ts`, `src/lib/copy.ts` (+ `copy.test.ts`), `src/components/ui/{tabs,switch}.tsx` |
| 25 | Adjustment sets | 24 | 14 | `src/model/analysis/adjustment.ts`, `adjustment.test.ts` |
| 26 | Paths and canvas marking | 24 | 14 | `src/model/analysis/paths.ts`, `paths.test.ts`, `src/components/Canvas.tsx`, `canvas/FloatingEdge.tsx`, `canvas/CircleNode.tsx`, `canvas/canvas.css` |
| 27 | Implied independencies | 24 | 14 | `src/model/analysis/independencies.ts`, `independencies.test.ts` |
| 28 | Instrumental variables | 24 | 14 | `src/model/analysis/instruments.ts`, `instruments.test.ts` |
| 29 | Analysis tab | 24 | 14 | `src/components/SidePanel.tsx`, `src/components/AnalysisPanel.tsx` |
| 30 | Analysis integration and end-to-end tests | 25, 26, 27, 28, 29 | 15 | `e2e/analysis.spec.ts`, fixes in any file of phases 24–29, this spec's Status line and Open issues, `docs/IDEAS.md` |
| 31 | Export contracts | 30 | 16 | `src/model/exchange.ts` (+ test), `src/model/palette.ts` (+ test), `src/model/fileFormat.ts` (+ test), stubs `src/model/{gml,dot,networkx,bnlearn,tetrad,mermaid}.ts`, `src/model/dagitty.ts` (the `opts` parameter only), `src/lib/imageExport.ts` (+ test; signatures and the palette move only), `src/lib/imageScene.ts` (types, `LEGEND`, stub), `src/lib/pdfExport.ts` (`toPdf` real, `sceneToPdf` stub), `src/store/uiStore.ts` (+ test), `src/components/CodeDialog.tsx` (the `COPY` table only), `src/components/ui/checkbox.tsx` |
| 32 | dagitty details | 31 | 17 | `src/model/dagitty.ts`, `dagitty.test.ts` |
| 33 | GML | 31 | 17 | `src/model/gml.ts`, `gml.test.ts` |
| 34 | DOT | 31 | 17 | `src/model/dot.ts`, `dot.test.ts` |
| 35 | networkx JSON | 31 | 17 | `src/model/networkx.ts`, `networkx.test.ts` |
| 36 | bnlearn, Tetrad and Mermaid | 31 | 17 | `src/model/{bnlearn,tetrad,mermaid}.ts` and their tests |
| 37 | Image scene, legend and theme | 31 | 17 | `src/lib/imageScene.ts`, `imageScene.test.ts`, `src/lib/imageExport.ts`, `imageExport.test.ts` |
| 38 | PDF writer | 31 | 17 | `src/lib/pdfExport.ts`, `pdfExport.test.ts` |
| 39 | Export and format dialogs | 31 | 17 | `src/components/TopBar.tsx`, `CodeDialog.tsx`, `ExportDialog.tsx`, `OpenDialog.tsx` |
| 40 | Format integration, real-tool reference and end-to-end tests | 32, 33, 34, 35, 36, 37, 38, 39 | 18 | `scripts/check-formats.py`, `scripts/check-formats.R`, `src/model/__fixtures__/formats/*`, `src/model/formats.reference.test.ts`, `e2e/formats.spec.ts`, `e2e/export.spec.ts`, `e2e/files.spec.ts`, fixes in any file of phases 31–39, this spec's Status line and Open issues, `docs/IDEAS.md` |
| 41 | Lesson engine contracts | 40 | 19 | `src/lessons/types.ts`, `index.ts`, `helpers.ts` (+ test), `tour.ts` (+ test), stubs `src/lessons/{variables,arrows,files,dag-basics,confounding,mediators,colliders,selection,latent,adjustment,testing,instruments,reporting}.ts`, `src/store/lessonEvents.ts` (+ test), `src/store/lessonStore.ts` (+ test), `src/lib/lessonProgress.ts` (+ test), `src/store/uiStore.ts` (+ test), `src/store/graphStore.ts` (+ test; the undo event only), `src/components/LessonPanel.tsx` (the switch to `stepDone` only) |
| 42 | Lesson panel additions | 41 | 20 | `src/components/LessonPanel.tsx` |
| 43 | Canvas pointer | 41 | 20 | `src/components/Canvas.tsx`, `canvas/CircleNode.tsx`, `canvas/types.ts`, `canvas/canvas.css` |
| 44 | Help menu, Lessons dialog and events | 41 | 20 | `src/components/TopBar.tsx`, `LessonsDialog.tsx`, `CodeDialog.tsx`, `ExportDialog.tsx`, `src/App.tsx`, `e2e/welcome.spec.ts`, `e2e/lesson.spec.ts`, `e2e/share.spec.ts`, `e2e/smoke.spec.ts` |
| 45 | App-track lessons | 41 | 20 | `src/lessons/{variables,arrows,files}.ts` and their tests |
| 46 | Causal lessons 5–9 | 41 | 20 | `src/lessons/{dag-basics,confounding,mediators,colliders,selection}.ts` and their tests |
| 47 | Causal lessons 10–14 | 41 | 20 | `src/lessons/{latent,adjustment,testing,instruments,reporting}.ts` and their tests |
| 48 | Lessons integration and end-to-end tests | 42, 43, 44, 45, 46, 47 | 21 | `e2e/lessons.spec.ts`, fixes in any file of phases 41–47, this spec's Status line and Open issues, `docs/LESSONS.md` (corrections only), `docs/IDEAS.md` |

Wave 12 has one exception to disjoint ownership: phases 22 and 23 each add one button to `TopBar.tsx`. Phase 22 places Export… directly after the Save split button and phase 23 places Share directly after Export… (or after the Save split button when Export… is not there yet); neither changes anything else in the file. The small conflict is resolved when the second of them lands.

**Lesson contracts (fixed in phase 41, used by phases 42–48).** Wave 20 builds six parts in parallel against: the types and helpers in 5.7.10, the event log, context, picks and progress in 4.8, the `uiStore` additions, and `LESSONS.md`. Phase 41 leaves the app working as before: `LESSONS` holds all 14 lessons, the 13 new ones as stubs with their final `id`, `title`, `summary` and `track`, `sample` returning `emptyGraph()` and one reading step titled "Coming soon". No UI reaches them before phase 44, and phases 45–47 replace them. Phase 41 is the only phase that changes `types.ts`, `index.ts` and `helpers.ts`; a lesson phase that needs a helper writes it in its own lesson file.

**Import and export contracts (fixed in phase 31, used by phases 32–40).** Wave 17 builds eight parts in parallel against these:
- the signatures in 4.11 "PDF, legend and dark theme";
- 4.15 (`exchange.ts`, `fileFormat.ts` and the writer and parser signatures);
- the `uiStore` addition in 5.4;
- the `CodeDialog` `COPY` table.

Phase 31 leaves the app working as before. The stubs for `toGml`, `toDot`, `toNetworkx`, `toBnlearn`, `toTetrad` and `toMermaid` return `''`. `parseGml`, `parseDot` and `parseNetworkx` return the error `<label> files cannot be opened yet.`. `imageScene` and `sceneToPdf` throw `Error('not implemented')`. `toSvg` and `toTikz` accept and ignore the new options. None of these is reachable from the UI until phase 39, and phase 39 lands after the parts it shows. `dagitty.ts`, `imageExport.ts` and `CodeDialog.tsx` are touched by phase 31 and again in wave 17; phase 31 changes only what its row names.

Wave 4 is the wide one: its five phases share no files, and each codes against the contracts fixed in phase 3 (the store API in 4.6, the `yaml.ts`/`dagitty.ts` signatures in 4.1–4.2, the component contracts below). The UI phases 6–8 cannot be seen in the app until phase 9 mounts them, so their behaviour is tested end to end in phase 9.

**Component contracts (fixed here, used by phases 6–9).** Each component is a named export with no props that reads and writes the store through `useGraphStore`:

- `Canvas()` in `src/components/Canvas.tsx`, `SidePanel()` in `SidePanel.tsx`, `Toolbar()` in `Toolbar.tsx`.
- `App` (phase 9) renders, inside one `<ReactFlowProvider>` from `@xyflow/react`: `<Toolbar />` on top, then `<Canvas />` and `<SidePanel />` side by side, plus `<Toaster />` from `@/components/ui/sonner`. Because of the shared provider, `Toolbar` may call `useReactFlow()` (for `screenToFlowPosition` and `fitView`), and `Canvas` keeps the `ReactFlow` element itself.
- Toasts are raised with `toast()` from `sonner`.
- Selecting from outside the canvas (e.g. IssuesDialog) goes through the store's `select` action; `Canvas` reflects `selection` in React Flow's `selected` flags.
- Fitting the view after Open, Import and Auto-layout is done by `Toolbar` with `fitView()`.

**Redesign contracts (fixed here, used by phases 10–16).** Waves 6–8 rebuild the look in the same way as waves 3–5. Phase 10 fixes the tokens, stores, texts and lesson types. Wave 7 builds the new parts in parallel, and all but phase 13 build them as new files the app does not mount yet, so the existing e2e tests keep passing on every commit. Phase 16 switches everything on and updates the e2e tests.

- New components are named exports with no props that read and write the stores: `TopBar()`, `ToolRail()`, `SavedIndicator()`, `WelcomeDialog()`, `LessonPanel()`, plus the hook `useToolShortcuts(): void`. `CircleNode` and `FloatingEdge` are React Flow node and edge components; `src/components/canvas/types.ts` exports `nodeTypes = { circle: CircleNode }`, `edgeTypes = { floating: FloatingEdge }`, `CircleConnectionLine`, and the data types `CircleNodeData = { name: string; role: Role; untyped: boolean; connectSource: boolean }` and `FloatingEdgeData = { evidenceCount: number }`.
- `App` (phase 16) renders, inside `<ReactFlowProvider>`: `<TopBar />` on top; below it, side by side, `<ToolRail />`, `<LessonPanel />` (renders nothing without a lesson), `<main aria-label="Canvas"><Canvas /><SavedIndicator /></main>` and `<SidePanel />`; plus `<WelcomeDialog />` and `<Toaster />`. `App` calls `useToolShortcuts()`. `main.tsx` calls `applyTheme(useThemeStore.getState().theme)` before the first render, and `index.html` applies a stored dark theme before the page paints (4.9, phase 19; phase 17 used `next-themes`' `ThemeProvider`).
- Fitting the view after Open, Import, Auto-layout and the L and F shortcuts is done by the top bar and the rail with `fitView({ duration: 300 })` in `requestAnimationFrame`.
- **As built in wave 7 (binding for phase 16):**
  - `useToolShortcuts()` uses no React Flow hooks, because `App`'s own body sits outside `<ReactFlowProvider>`. `useToolShortcuts.ts` also exports `useCanvasActions()` (fit view, zoom in and out, auto-layout, add a node at the view centre), which must be called inside the provider. `TopBar` and `ToolRail` call it and register their actions in module scope; the L, F, + and − shortcuts run the registered actions, so they work once `TopBar` or `ToolRail` is mounted. V, N, C and Escape work regardless.
  - `SavedIndicator` is positioned `absolute right-3 bottom-3`, so `<main aria-label="Canvas">` must be `relative`.
  - `Canvas.tsx` imports `src/components/canvas/canvas.css` and gives each node `width = height = nodeDiameter(name)`; floating edges need measured nodes. `connectionMode` stays at React Flow's default (strict). `types.ts` also exports `CircleFlowNode` and `FloatingFlowEdge` for typing `<ReactFlow>`.
  - A circle's accessible name `"<name>, <Role label>"` and its `data-role` sit on the inner circle element (`role="img"`), not on the React Flow node wrapper; the untyped dot is its own `role="img"` named "No variable type". The evidence chip selects its edge through the store's `select`.
  - The top bar's open button is labelled "Open…" (v1: "Open"); the hidden file input keeps `aria-label="Open file"`.
  - `TopBar`, `ToolRail` and `InfoTip` each bring their own `TooltipProvider`. A tooltip opened by keyboard focus stays open until focus moves away; e2e tests close it (blur, or move the pointer away in steps) before going on.

### Wave 1: Tooling [x]

Phases: 1. Parallel: single phase. Integration check after the wave: all checks.

#### Phase 1: Tooling, CI and app shell [x] (e46eb88)

- **Goal:** all dependencies, scripts, tests and CI are in place, and the Vite demo is replaced by an empty GraphCreator shell (toolbar, canvas area, side panel placeholders).
- **Depends on:** none.
- **Owns files:**
  - `package.json`, `package-lock.json`: dependencies `@xyflow/react`, `zustand`, `zod`, `yaml`, `@dagrejs/dagre`, `tailwindcss`, `@tailwindcss/vite`, plus whatever `shadcn init` adds; dev dependencies `vitest`, `@playwright/test`, `prettier`; scripts from section 6.
  - `vite.config.ts`: Tailwind plugin, `@` alias, Vitest `test` block.
  - `tsconfig.json`, `tsconfig.app.json`: `@/*` path alias.
  - `components.json`, `src/lib/utils.ts`, `src/components/ui/*`: from `npx shadcn@latest init` (Vite path), plus `button`, `input`, `select`, `textarea`, `dialog`, `dropdown-menu`, `sonner`.
  - `src/index.css`: Tailwind import and shadcn tokens; role colour variables (placeholders are fine, finalised in phase 6).
  - `src/App.tsx`: layout skeleton per 5.1 with placeholder text; delete `src/App.css`, `src/assets/*`, `public/icons.svg`.
  - `src/model/result.ts`: the `Issue` and `Result` types (3.3) and a trivial `src/model/result.test.ts`, so Vitest has a test.
  - `playwright.config.ts`, `e2e/smoke.spec.ts`.
  - `.github/workflows/ci.yml`, `.nvmrc`, `.prettierrc` (`{ "singleQuote": true, "semi": false }`, matching the scaffold), `.prettierignore` (`dist`, `node_modules`, `package-lock.json`).
  - `.claude/settings.json`: Stop hook (section 6).
  - `LICENSE`, `README.md` (short: what it is, `npm install`, `npm run dev`, link to docs/SPEC.md), `CLAUDE.md` (Commands section with every script).
- **Contracts used:** none.
- **Work:** follow section 6. Install Tailwind v4 and shadcn/ui per the shadcn Vite guide; look up current docs (shadcn, Tailwind v4, React Flow 12, Zod 4) rather than relying on memory, since their APIs changed recently.
- **Tests:** `e2e/smoke.spec.ts` (page title is `GraphCreator`, toolbar and side panel render, no console errors); `src/model/result.test.ts`.
- **Done when:** all checks and `npm run build` pass locally; CI is green on the pushed commit; the app shows the empty shell.
- **Out of scope:** any model logic, canvas behaviour, deployment.

### Wave 2: Model core [x]

Phases: 2. Parallel: single phase. Integration check after the wave: all checks.

#### Phase 2: Model core [x] (3b115a1)

- **Goal:** the in-memory graph, its operations, cycle detection and validation exist as pure, tested TypeScript.
- **Depends on:** phase 1.
- **Owns files:** `src/model/schema.ts` (constants from 3.1 only; the Zod schema comes in phase 4), `src/model/graph.ts`, `src/model/cycle.ts`, `src/model/validate.ts`, with `graph.test.ts`, `cycle.test.ts`, `validate.test.ts`.
- **Contracts used:** `Issue`, `Result` (3.3).
- **Work:** implement 3.1, 3.2, 4.3 and 4.4 exactly as specified, including the user-facing messages.
- **Tests:** see section 9.
- **Done when:** `npm test` passes; `src/model` has no imports from `react`, `zustand` or `@xyflow/react` (`grep -rE "from '(react|zustand|@xyflow)" src/model` is empty).
- **Out of scope:** file formats, layout, UI.

### Wave 3: Layout, store and contracts [x]

Phases: 3. Parallel: single phase. Integration check after the wave: all checks.

#### Phase 3: Layout, store and contracts [x] (8f92ec0)

- **Goal:** auto-layout works, the Zustand store with all actions exists, and every interface wave 4 codes against is fixed: the final `yaml.ts` and `dagitty.ts` signatures as stubs, `Issue.nodeId`, and the extra shadcn components.
- **Depends on:** phase 2.
- **Owns files:** `src/model/layout.ts`, `src/model/layout.test.ts`, `src/model/yaml.ts` (stub), `src/model/dagitty.ts` (stub), `src/model/result.ts`, `src/model/validate.ts`, `src/model/validate.test.ts`, `src/store/graphStore.ts`, `src/store/graphStore.test.ts`, `src/components/ui/label.tsx`, `src/components/ui/badge.tsx` (via `npx shadcn@latest add label badge`).
- **Contracts used:** sections 3.1–3.3, 4.3, 4.4 (phase 2).
- **Work:**
  - `layout.ts`: implement 4.5 fully.
  - `yaml.ts`: export `parseYaml(text: string): Result<Graph>`, `toYaml(graph: Graph): string` and `fileSlug(name?: string): string` with JSDoc from 4.1; bodies `throw new Error('Not implemented yet (spec phase 4).')`.
  - `dagitty.ts`: export `DAGITTY_SCALE = 100`, `parseDagitty(text: string): Result<Graph>`, `toDagitty(graph: Graph): string`, `toDagittyIds(nodes: GNode[]): Map<string, string>` with JSDoc from 4.2; bodies throw `Not implemented yet (spec phase 5).`
  - `result.ts`: add `nodeId?: string` to `Issue` (3.3). `validate.ts`: set `nodeId` on every node-specific warning (no type, too few levels, duplicate levels); extend `validate.test.ts` to check it.
  - `graphStore.ts`: implement 4.6.
- **Tests:** `layout.test.ts` and `graphStore.test.ts` (section 9); the `nodeId` checks in `validate.test.ts`.
- **Done when:** all checks pass; `src/model` still has no React/Zustand/React Flow imports; importing `yaml.ts` and `dagitty.ts` works and their functions throw the stated message.
- **Out of scope:** YAML and dagitty logic (phases 4, 5), UI components (6–8), autosave and App wiring (9).

### Wave 4: Formats and UI parts [x]

Phases: 4, 5, 6, 7, 8. Parallel: yes (five sub agents; no shared files). Integration check after the wave: all checks (the app still shows the phase 1 shell; nothing is mounted until phase 9).

#### Phase 4: YAML format [x] (9e8e9e5)

- **Goal:** GraphCreator files can be read and written with full validation.
- **Depends on:** phase 3.
- **Owns files:** `src/model/schema.ts` (add `GraphFileSchema`, `GraphFile`), `src/model/yaml.ts` (replace the stub), `src/model/yaml.test.ts`, fixtures `src/model/__fixtures__/smoking.dag.yaml` (the example in 4.1), `minimal.dag.yaml`, and invalid fixtures `bad-schema.dag.yaml`, `cycle.dag.yaml`, `bad-refs.dag.yaml`, `unknown-key.dag.yaml`, `levels-on-continuous.dag.yaml`.
- **Contracts used:** `Graph`, graph operations (4.3), `validateGraph` (4.4), `autoLayout` (4.5), the `yaml.ts` signatures from phase 3.
- **Work:** implement 4.1 (`parseYaml`, `toYaml`, `fileSlug`) with the signatures fixed in phase 3.
- **Tests:** `yaml.test.ts` (section 9).
- **Done when:** all checks pass, including the canonical round trip `toYaml(parseYaml(smoking)) === smoking`.
- **Out of scope:** dagitty, UI, autosave.

#### Phase 5: dagitty import and export [x] (057be80)

- **Goal:** dagitty text can be imported and exported per 4.2.
- **Depends on:** phase 3.
- **Owns files:** `src/model/dagitty.ts` (replace the stub), `src/model/dagitty.test.ts`, fixtures `src/model/__fixtures__/*.dagitty.txt`: `confounding.dagitty.txt`, `m-bias.dagitty.txt`, `quoted-names.dagitty.txt` (quoted ids and `label`), `groups-and-chains.dagitty.txt`, `no-positions.dagitty.txt`, `bidirected.dagitty.txt` (must be rejected), `pdag.dagitty.txt` (rejected), `two-roles.dagitty.txt` (rejected).
- **Contracts used:** `Graph`, graph operations (4.3), `findCycle`, `validateGraph`, `autoLayout`, the `dagitty.ts` signatures from phase 3.
- **Work:** implement the tokenizer, parser, `toDagitty` and `toDagittyIds` from 4.2. Fixtures should be real dagitty output where possible (copy from dagitty.net examples, which are freely usable as data). Check the direction of dagitty's y axis against one of them and report it (the spec's Open issues entry is updated when the wave lands).
- **Tests:** `dagitty.test.ts` (section 9).
- **Done when:** all checks pass; every rejected construct produces the specified line-numbered message.
- **Out of scope:** UI dialogs (phase 8), bidirected support.

#### Phase 6: Canvas and node look [x] (07d2207)

- **Goal:** the `Canvas` component shows the store's graph with React Flow and supports adding, connecting, selecting, moving and deleting nodes and edges, with invalid connections refused and explained.
- **Depends on:** phase 3.
- **Owns files:** `src/components/Canvas.tsx`, `src/components/DagNode.tsx`, `src/index.css` (final role colour variables).
- **Contracts used:** the store API (4.6), `canAddEdge` (4.3), `NODE_WIDTH`/`NODE_HEIGHT` (4.5), the component contracts above.
- **Work:** implement 5.2: derive React Flow nodes and edges from `graph` and `selection`; register `DagNode` as the node type; double-click on the pane calls `addNodeAt` with `screenToFlowPosition` (zoom-on-double-click off); `isValidConnection` uses `canAddEdge`; on connect call `connect`; when a drag is released over an invalid target, `toast()` the `EdgeCheck` message; Delete/Backspace (outside text fields) calls `removeSelection`; drag stop calls `moveNode`; selection changes call `select`. Role colours as CSS variables with AA contrast, badge letters, dashed latent border, `⚠` for untyped nodes.
- **Tests:** none of its own (no component test setup); covered by `e2e/canvas.spec.ts` in phase 9.
- **Done when:** all checks pass; `Canvas` and `DagNode` follow the component contracts.
- **Out of scope:** mounting in `App` (phase 9), side panel, toolbar.

#### Phase 7: Side panel editors [x] (028e972)

- **Goal:** the `SidePanel` component edits the selected node or edge per 5.3.
- **Depends on:** phase 3.
- **Owns files:** `src/components/SidePanel.tsx`, `NodeEditor.tsx`, `EdgeEditor.tsx`, `ListEditor.tsx`.
- **Contracts used:** the store API (4.6), `renameNode` errors (4.3), `ROLES`, `VAR_TYPES`, `isLeveledType`, `isNumericType` (3.1), the component contracts above.
- **Work:** implement 5.3 and the side-panel part of 5.1 (help text when nothing is selected). NodeEditor focuses and selects its name field when the store's `focusNameOf` equals the node's id, then calls `clearFocusName()`. Rename errors from `renameNode` are shown under the field.
- **Tests:** none of its own; covered by `e2e/editing.spec.ts` in phase 9.
- **Done when:** all checks pass; `SidePanel` follows the component contracts.
- **Out of scope:** mounting in `App`, canvas, toolbar.

#### Phase 8: Toolbar and dialogs [x] (5bcd8dd)

- **Goal:** the `Toolbar` component with graph name, New, Open, Save, the dagitty menu, Add node, Auto-layout and the warning badge, plus its dialogs.
- **Depends on:** phase 3.
- **Owns files:** `src/components/Toolbar.tsx`, `IssuesDialog.tsx`, `DagittyImportDialog.tsx`, `DagittyExportDialog.tsx`, `src/lib/download.ts` (`downloadText(filename: string, text: string, mime: string): void`).
- **Contracts used:** the store API (4.6), `parseYaml`, `toYaml`, `fileSlug` (4.1), `parseDagitty`, `toDagitty` (4.2), `validateGraph` and `Issue.nodeId` (3.3, 4.4), the component contracts above. Until wave 4 lands, the yaml/dagitty functions are stubs: code against their signatures only.
- **Work:** implement the toolbar part of 5.1 and all of 5.4. The warning badge counts `validateGraph(graph).warnings`; clicking a warning in IssuesDialog calls `select({ kind: 'node', id: issue.nodeId })` when `nodeId` is set. Add node places the node at the viewport centre via `screenToFlowPosition`. Open, Import and Auto-layout end with `fitView()`.
- **Tests:** none of its own; covered by `e2e/files.spec.ts` and `e2e/editing.spec.ts` in phase 9.
- **Done when:** all checks pass; `Toolbar` follows the component contracts.
- **Out of scope:** mounting in `App`, canvas, side panel.

### Wave 5: Integration [x]

Phases: 9. Parallel: single phase. Integration check after the wave: all checks and a manual run-through of every 5.x behaviour in the browser.

#### Phase 9: Integration, autosave and end-to-end tests [x] (8daf610)

- **Goal:** v1 is feature-complete: the parts from wave 4 are mounted, the graph autosaves, and the end-to-end tests cover the main flows.
- **Depends on:** phases 4, 5, 6, 7, 8.
- **Owns files:** `src/App.tsx`, `src/main.tsx`, `src/store/autosave.ts`, `src/store/autosave.test.ts`, `e2e/smoke.spec.ts`, `e2e/canvas.spec.ts`, `e2e/editing.spec.ts`, `e2e/files.spec.ts`, the Status line and Open issues of this spec.
- **Contracts used:** everything above.
- **Work:**
  - `App.tsx`: replace the shell with the layout of the component contracts.
  - `autosave.ts`: `startAutosave(storage: Pick<Storage, 'getItem' | 'setItem'> | null): () => void` implements 5.5 (restore on start, debounced 500 ms writes via a store subscription, try/catch everywhere, the restore-failure toast); returns an unsubscribe function. `main.tsx` calls it with `window.localStorage` (guarded by try/catch, `null` if unavailable).
  - Fix integration breakages between the wave 4 parts here.
- **Tests:** `autosave.test.ts` and the e2e specs (section 9).
- **Done when:** all checks pass and CI is green; a manual run-through of every 5.x behaviour in the browser works; the Status line says v1 is implemented.
- **Out of scope:** everything in IDEAS.md.

### Wave 6: Design groundwork [x]

Phases: 10. Parallel: single phase. Integration check after the wave: all checks. The app still shows the v1 layout, now in IBM Plex and the teal tokens.

#### Phase 10: Design groundwork and contracts [x] (d44403a)

- **Goal:** the Calm teal tokens, fonts, texts, node sizing, UI store, lesson store and tour lesson exist, together with the shadcn tooltip, so that wave 7 can build every new part in parallel against them.
- **Depends on:** phase 9.
- **Owns files:** `package.json`, `package-lock.json`, `src/index.css`, `src/lib/theme.test.ts`, `src/lib/copy.ts`, `src/model/nodeSize.ts`, `nodeSize.test.ts`, `src/model/layout.ts`, `layout.test.ts`, `src/store/graphStore.ts`, `graphStore.test.ts`, `src/store/uiStore.ts`, `uiStore.test.ts`, `src/store/lessonStore.ts`, `lessonStore.test.ts`, `src/lessons/types.ts`, `tour.ts`, `index.ts`, `tour.test.ts`, `src/components/ui/tooltip.tsx`.
- **Contracts used:** 3.1–3.3, 4.3, 4.5, 4.6; `defaultNodeName`, `emptyGraph`.
- **Work:**
  - **Fonts:** `npm install @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono` and `npm uninstall @fontsource-variable/geist`.
  - **`index.css`:**
    - import Plex Sans 400/500/600 and Plex Mono 400/500;
    - set `--font-sans`, `--font-heading` and `--font-mono` in `@theme inline`, and map the new variables there too (`--color-canvas`, `--color-edge`, the warning and error colours, the role colours);
    - replace the neutral `:root` and `.dark` values with 5.7.2, and add the extra, status and role variables in both blocks.
    - Keep v1's `--role-<role>` variables and the React Flow rules until phase 16, because the live v1 `DagNode` still uses them.
    - Add `@media (prefers-reduced-motion: reduce)` that sets transition and animation durations to 0.
  - **`theme.test.ts`:** read `src/index.css` with `node:fs`, parse the `:root` and `.dark` custom properties (hex values only; skip `rgb()` and `var()`), and assert the ratios for every pair named in 5.7.2: text on background, surface and canvas; primary-foreground on primary; accent-foreground on accent; warning and error foreground on their backgrounds; role text on role fill; role line, `--edge` and `--primary` against `--canvas`. If a dark value fails, change it and record the new value in 5.7.2.
  - **`copy.ts`:** the exports and exact texts of 5.7.8.
  - **`nodeSize.ts`:** 5.7.6. **`layout.ts`:** the redesign paragraph of 4.5. **`graphStore.ts`:** `renameNode` keeps the centre (4.6).
  - **`uiStore.ts`:** 4.7. **`lessonStore.ts`:** 4.8.
  - **`src/lessons/`:** the types, `tourLesson`, `LESSONS` and `findLesson` from 5.7.10.
  - **Tooltip:** `npx shadcn@latest add tooltip`.
- **Tests:** `theme.test.ts`, `nodeSize.test.ts`, `uiStore.test.ts`, `lessonStore.test.ts`, `tour.test.ts`, plus the additions to `layout.test.ts` and `graphStore.test.ts` (section 9).
- **Done when:** all checks pass, including the existing e2e suite (the v1 UI is unchanged apart from fonts and colours); `src/model` still has no React, Zustand or React Flow imports.
- **Out of scope:** any new component (wave 7), mounting anything, `Canvas.tsx`, removing `NODE_WIDTH`/`NODE_HEIGHT` (phase 16).

### Wave 7: New parts [x]

Phases: 11, 12, 13, 14, 15. Parallel: yes (five sub agents; no shared files). Integration check after the wave: all checks. Phases 11, 12, 14 and 15 add unmounted files; phase 13 restyles the live side panel and keeps the e2e suite green.

#### Phase 11: Circle nodes and floating edges [x] (f1b8af2)

- **Goal:** the circle node, the floating edge and the connection line exist as React Flow components, ready for `Canvas` to register.
- **Depends on:** phase 10.
- **Owns files:** `src/components/canvas/CircleNode.tsx`, `FloatingEdge.tsx`, `types.ts`, `canvas.css`, `src/lib/geometry.ts`, `src/lib/geometry.test.ts`.
- **Contracts used:** `wrapLabel` and `nodeDiameter` (5.7.6), `ROLE_LABELS` (5.7.8), the tokens (5.7.2), `useUiStore` (4.7), the redesign contracts above.
- **Work:**
  - **`geometry.ts`:** `export interface Circle { cx: number; cy: number; r: number }` and `export function edgeEndpoints(source: Circle, target: Circle, gap = 2): { sx: number; sy: number; tx: number; ty: number } | null`. With `u` the unit vector from the source centre to the target centre, the start is `source centre + r_s·u` and the end is `target centre − (r_t + gap)·u`. Return `null` when the centres coincide.
  - **`CircleNode`:** renders 5.2 "Node look" and the circle rows of 5.7.7. It has two handles in the React Flow "easy connect" pattern:
    - a source handle styled as a ring that covers the rim, from 0 to 7 px outside the outline;
    - a target handle covering the whole circle with `isConnectableStart={false}`, which takes pointer events only while `useConnection().inProgress` is true.
    - Valid and invalid drop rings come from React Flow's `connectingto` and `valid` handle classes, styled in `canvas.css`.
    - `data.connectSource` keeps the hover rim visible.
  - **`FloatingEdge`:** reads both nodes with `useInternalNode` and gets centres and radii from `internals.positionAbsolute` and `measured`. It draws a straight `BaseEdge` from `edgeEndpoints` with a closed arrow marker coloured by state, plus the evidence chip (5.2, 5.7.7) through `EdgeLabelRenderer` when `data.evidenceCount > 0`.
  - **`CircleConnectionLine`:** the dashed teal line from 5.7.7.
  - **`types.ts`:** the exports listed in the redesign contracts.
- **Tests:** `geometry.test.ts` (section 9). The components are covered by e2e in phase 16.
- **Done when:** all checks pass; the components type-check against `@xyflow/react` 12 and nothing mounts them yet.
- **Out of scope:** `Canvas.tsx` (phase 16), tools and shortcuts (phase 12).

#### Phase 12: Top bar, tool rail and shortcuts [x] (286409e)

- **Goal:** `TopBar`, `ToolRail`, `useToolShortcuts` and `SavedIndicator` exist per 5.1, 5.2 and 5.4, unmounted.
- **Depends on:** phase 10.
- **Owns files:** `src/components/TopBar.tsx`, `ToolRail.tsx`, `useToolShortcuts.ts`, `SavedIndicator.tsx`.
- **Contracts used:** the store APIs (4.6–4.8), `parseYaml`, `toYaml`, `fileSlug`, `parseDagitty`, `toDagitty`, `validateGraph`, `defaultNodeName`, `nodeDiameter`, the existing dialogs (`IssuesDialog`, `DagittyImportDialog`, `DagittyExportDialog`) and `downloadText`, the tooltip component, the redesign contracts above.
- **Work:**
  - **`TopBar`:** port the file behaviour of `Toolbar.tsx`, which stays read-only and is deleted in phase 16: New, Open…, Save, the dagitty menu, the issues badge, and the toasts and confirmations of 5.4 and 5.6. Use the new look (5.1, 5.7.4), add Lessons (`openWelcome()`), and disable New, Open… and Import… during a lesson (5.4).
  - **`ToolRail`:** 5.1 and 5.2. Add node with the add tool already active places a node centred on the viewport centre. Auto-layout calls `layout()` and then fits the view.
  - **`useToolShortcuts`:** one `keydown` listener on `window` implementing 5.2 "Shortcuts". It ignores events with Ctrl, Meta or Alt, events whose target is an input, textarea, select or contenteditable, and events while a `[role="dialog"]` is open.
  - **`SavedIndicator`:** 5.2.
- **Tests:** none of their own; covered by e2e in phase 16.
- **Done when:** all checks pass; nothing mounts the new components yet.
- **Out of scope:** `Canvas.tsx` click handling for the add and connect tools (phase 16), deleting `Toolbar.tsx`.

#### Phase 13: Side panel restyle and tooltips [x] (215285e)

- **Goal:** the live side panel has the new look, the role picker, labels instead of raw values, info tooltips and the cheat sheet.
- **Depends on:** phase 10.
- **Owns files:** `src/components/SidePanel.tsx`, `NodeEditor.tsx`, `EdgeEditor.tsx`, `ListEditor.tsx`, `InfoTip.tsx`, `RolePicker.tsx`, `e2e/editing.spec.ts`.
- **Contracts used:** the store API (4.6), `src/lib/copy.ts` (5.7.8), the tokens, the tooltip component.
- **Work:**
  - Implement 5.3 and the side-panel part of 5.1.
  - Header label "NODE" or "EDGE" (5.7.3 label style); `PANEL_HELP` when nothing is selected; `RolePicker` with swatches (`--role-<role>-fill` and `-line`) and descriptions.
  - `InfoTip({ label, text })` renders the info button and tooltip. It must work without an app-level `TooltipProvider`.
  - Keep every existing accessible name ("Name", "Level N", "Move level N up", "Add level", "Delete node", …) and the text "Nothing selected.", which e2e files this phase does not own check.
  - Give each role and type option an accessible name equal to its label alone, with the description `aria-describedby`, so that `getByRole('option', { name: 'Exposure', exact: true })` matches.
  - Update `e2e/editing.spec.ts` for the new option labels ("Exposure", "Ordinal", "Continuous") and the help text. Leave its checks on the v1 node badges alone: `DagNode` is still live until phase 16.
- **Tests:** the updated `e2e/editing.spec.ts`.
- **Done when:** all checks pass, including the whole e2e suite.
- **Out of scope:** canvas, top bar, other e2e files.

#### Phase 14: Welcome slides [x] (67588bb)

- **Goal:** `WelcomeDialog` and the first-visit flag exist per 5.7.9, unmounted.
- **Depends on:** phase 10.
- **Owns files:** `src/components/WelcomeDialog.tsx`, `src/lib/welcome.ts`, `src/lib/welcome.test.ts`.
- **Contracts used:** `useUiStore` (4.7), `useLessonStore` (4.8), the `dialog` component, the tokens.
- **Work:**
  - **`welcome.ts`:**
    - `export const WELCOMED_KEY = 'graphcreator:welcomed'`;
    - `export function safeLocalStorage(): Storage | null`;
    - `export function hasBeenWelcomed(storage: Pick<Storage, 'getItem'> | null): boolean`: false when storage is null or throws;
    - `export function markWelcomed(storage: Pick<Storage, 'setItem'> | null): void`: ignores errors.
  - **`WelcomeDialog`:** 5.7.9. Every way of closing calls `markWelcomed(safeLocalStorage())` and `closeWelcome()`. "Take the tour" also calls `useLessonStore.getState().start('tour')`.
- **Tests:** `welcome.test.ts` (section 9).
- **Done when:** all checks pass; nothing mounts the dialog yet.
- **Out of scope:** opening the dialog on start-up (phase 16).

#### Phase 15: Lesson panel [x] (a9865c8)

- **Goal:** `LessonPanel` exists per 5.7.10, unmounted.
- **Depends on:** phase 10.
- **Owns files:** `src/components/LessonPanel.tsx`.
- **Contracts used:** `useLessonStore`, `findLesson` (4.8, 5.7.10), `useGraphStore` (4.6), the tokens.
- **Work:** render nothing when `active` is null. Otherwise render the panel from 5.7.10. Read `graph` from the store so that "done" updates as the user edits, and call `next`, `back` and `exit`. The panel is `<aside aria-label="Lesson">`.
- **Tests:** none of its own; covered by `e2e/lesson.spec.ts` in phase 16.
- **Done when:** all checks pass; nothing mounts the panel yet.
- **Out of scope:** pausing autosave (phase 16).

### Wave 8: Redesign integration [x]

Phases: 16. Parallel: single phase. Integration check after the wave: all checks, plus a manual run-through in the browser of 5.1–5.4 and 5.7 in both light and dark.

#### Phase 16: Redesign integration and end-to-end tests [x] (7ce75fe)

- **Goal:** the app runs the Calm teal design: the new layout, circles and floating edges, tools, welcome slides, lessons and dark theme. The v1 parts are gone and the e2e suite covers the new flows.
- **Depends on:** phases 11, 12, 13, 14, 15.
- **Owns files:** `src/App.tsx`, `src/main.tsx`, `src/components/Canvas.tsx`, `src/components/DagNode.tsx` (delete), `src/components/Toolbar.tsx` (delete), `src/model/layout.ts`, `layout.test.ts`, `src/index.css`, `src/store/autosave.ts`, `autosave.test.ts`, everything in `e2e/`, this spec's Status line and Open issues.
- **Contracts used:** everything above.
- **Work:**
  - **`App.tsx`, `main.tsx`:** the layout and providers in the redesign contracts. `main.tsx` calls `openWelcome()` before the first render when `hasBeenWelcomed(safeLocalStorage())` is false.
  - **`Canvas.tsx`:**
    - node type `circle` with `CircleNodeData` and `width = height = nodeDiameter(name)`; edge type `floating` with `evidenceCount`; `connectionLineComponent={CircleConnectionLine}`;
    - double-click and the add tool centre the new node on the pointer;
    - in connect mode, node clicks call `pickConnectSource`, then `connect` (with the toast on failure), and a pane click clears the picked source;
    - `colorMode` from `useTheme().resolvedTheme`; the canvas background is `var(--canvas)`; remove `<Background />` and `<Controls />`; edge colours come from the tokens.
  - **Cleanup:** delete `DagNode.tsx` and `Toolbar.tsx`. Remove `NODE_WIDTH`/`NODE_HEIGHT` from `layout.ts` (and its test if it uses them). Remove v1's `--role-<role>` variables and React Flow handle rules from `index.css`.
  - **`autosave.ts`:**
    - set `useUiStore`'s `autosave` status: `blocked` when storage is null or a write throws, `paused` while `useLessonStore` has an active lesson, otherwise `on`;
    - the debounced write checks for an active lesson when it fires and skips the write if there is one;
    - when a lesson starts, write any pending user graph at once, before the practice graph is loaded (`lessonStore.start` sets `active` before `replaceGraph`).
  - **e2e:**
    - add `e2e/fixtures.ts` with a `test` that sets `graphcreator:welcomed` through `page.addInitScript` and make every existing spec import it;
    - update the selectors: rim drag for connecting, Add node and Auto-layout in the "Canvas tools" toolbar, role through `data-role`;
    - add `e2e/welcome.spec.ts` and `e2e/lesson.spec.ts`, and extend `canvas.spec.ts` and `smoke.spec.ts` (section 9).
  - **Spec:** update the Status line and Open issues.
- **Tests:** `autosave.test.ts` additions and the e2e specs (section 9).
- **Done when:** all checks pass and CI is green; the manual run-through works in light and dark; `DagNode.tsx`, `Toolbar.tsx`, `NODE_WIDTH` and `NODE_HEIGHT` no longer exist; the Status line says the redesign is implemented.
- **Out of scope:** the six real lessons and the other lesson features in IDEAS.md, a theme toggle, rewording the raw-exception messages (Open issues).

### Wave 9: Theme toggle [x]

Phases: 17. Parallel: single phase. Check after the wave: all checks, and a manual run in the browser with the system set to dark (the app starts light, the toggle switches and the choice survives a reload).

#### Phase 17: Light/dark toggle [x] (8643c84)

- **Goal:** the user switches between the light and dark theme from the top bar; light is the default.
- **Depends on:** phase 16.
- **Owns files:** `src/main.tsx`, `src/components/TopBar.tsx`, `e2e/smoke.spec.ts`, this spec.
- **Work:**
  - **`main.tsx`:** the `ThemeProvider` props in the component contracts (`defaultTheme="light"`, `enableSystem={false}`, `storageKey="graphcreator:theme"`, `disableTransitionOnChange`).
  - **`TopBar.tsx`:** a `ThemeToggle` after Lessons as described in 5.1: ghost icon button, `useTheme()`, `setTheme(isDark ? 'light' : 'dark')`.
  - **`smoke.spec.ts`:** replace the "follows the system setting" test (section 9).
- **Tests:** `e2e/smoke.spec.ts` (section 9).
- **Done when:** all checks pass; with the system set to dark the app starts light; the toggle switches the canvas, panels, dialogs and toasts; the choice survives a reload.
- **Out of scope:** a "follow the system" option.

### Wave 10: Top bar and renaming [x]

Phases: 18. Parallel: single phase. Check after the wave: all checks, and a manual run in the browser of Help, Open (paste and file, both formats, an error), Save and both Save as… dialogs, and double-click renaming.

#### Phase 18: Top bar rework and double-click rename [x] (294c057)

- **Goal:** Lessons is called Help; the dagitty menu is gone: Open… takes pasted text or a file in either format, and Save gets a Save as… menu with GraphCreator and dagitty code dialogs; double-clicking a node opens its name for renaming.
- **Depends on:** phase 17.
- **Owns files:** see the task graph row.
- **Work:**
  - **`fileFormat.ts`:** `detectFormat` and `parseGraphText` (4.2).
  - **`graphStore.ts`:** `focusName` (4.6).
  - **`OpenDialog.tsx`, `CodeDialog.tsx`:** replace `DagittyImportDialog.tsx` and `DagittyExportDialog.tsx` (renamed with git), as in 5.4.
  - **`TopBar.tsx`:** 5.1 and 5.4: the Open dialog with `confirmReplace('Open', …)`, the Save split button, Help; remove the dagitty menu and the hidden file input.
  - **`Canvas.tsx`:** `onNodeDoubleClick` → `focusName` when the tool is Select (5.2); hide the React Flow attribution (decisions table). `index.css`: drop the attribution styles.
  - **e2e:** update selectors (Help, Save as…, Open dialog) and add the tests in section 9.
- **Tests:** `fileFormat.test.ts`, the `graphStore.test.ts` addition and the e2e changes (section 9).
- **Done when:** all checks pass; the manual run above works.
- **Out of scope:** drag-and-drop of files onto the canvas; remembering the last Save format.

### Wave 11: Theme store and Save dialog [x]

Phases: 19, 20 (done one after the other; both touch `TopBar.tsx`). Check after the wave: all checks; in the browser the theme toggle, reload and the console (no "Encountered a script tag" warning), and Save opening the GraphCreator dialog.

#### Phase 19: Own theme store instead of next-themes [x] (0f6a0b9)

- **Goal:** the light/dark switch works exactly as in phase 17 without `next-themes`, so React 19 no longer warns about its inline script.
- **Depends on:** phase 18.
- **Owns files:** see the task graph row.
- **Work:**
  - **`themeStore.ts`:** as in 4.9.
  - **`index.html`:** the early dark-theme script (4.9).
  - **`main.tsx`:** drop `ThemeProvider`; call `applyTheme` before the first render.
  - **`TopBar.tsx`, `Canvas.tsx`, `ui/sonner.tsx`:** read and set the theme through `useThemeStore` instead of `useTheme()`.
  - **`package.json`:** `npm uninstall next-themes`.
- **Tests:** `themeStore.test.ts` (section 9); the phase 17 e2e theme test keeps passing unchanged.
- **Done when:** all checks pass; `next-themes` appears nowhere in `src`, `index.html` or `package.json`; the toggle, the reload and a dark first paint work in the browser.
- **Out of scope:** a "follow the system" option.

#### Phase 20: Save opens the GraphCreator dialog [x] (0f6a0b9)

- **Goal:** the Save button opens the "Save as GraphCreator" dialog (5.4) instead of downloading at once.
- **Depends on:** phase 19.
- **Owns files:** see the task graph row.
- **Work:** in `TopBar.tsx`, Save calls `openCode('yaml')`; remove the direct-download `save()`. In `e2e/files.spec.ts`, a `saveFile` helper clicks Save, then Download in the dialog.
- **Tests:** `e2e/files.spec.ts` (section 9).
- **Done when:** all checks pass; Save shows the GraphCreator text and its Download gives `<slug>.dag.yaml`.
- **Out of scope:** a keyboard shortcut for Save.

### Wave 12: Undo, image export and share links [x]

Phases: 21, 22, 23. Parallel: all three (one sub agent each, in its own worktree); they share only `TopBar.tsx`, as described under the task graph. Land them in the order 21, 22, 23. Check after the wave: all checks; in the browser undo and redo by keys and rail buttons (including a multi-node drag and an undo while the node stays selected), the Export dialog's three formats and downloads, and a share link copied, opened in a new tab over a different stored graph, and opened again over an empty one. Parallel e2e runs need `CI=1` and a lock, because the worktrees share port 4173: `CI=1 flock <one shared lock file> npm run test:e2e`.

#### Phase 21: Undo and redo [x] (778e269)

- **Goal:** every edit can be undone and redone with Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y and two rail buttons.
- **Depends on:** phase 20.
- **Owns files:** see the task graph row.
- **Work:**
  - **`graphStore.ts`:** `past`, `future`, `revision`, `HISTORY_LIMIT`, `moveNodes`, `undo`, `redo` and the recording rules of 4.10; `replaceGraph` clears the stacks.
  - **`Canvas.tsx`:** `onNodeDragStop` commits all dragged nodes with one `moveNodes` call.
  - **`SidePanel.tsx`:** editor keys `` `${id}:${revision}` ``.
  - **`useToolShortcuts.ts`:** the undo and redo keys (5.2), handled before the guard that ignores modifier keys, with the same text-field and dialog guards.
  - **`ToolRail.tsx`:** the divider, Undo and Redo (5.1), disabled from the store.
  - **`copy.ts`:** the `PANEL_HELP` row "Undo" / "Press Ctrl+Z" (5.7.8).
- **Tests:** the `graphStore.test.ts` additions and `e2e/undo.spec.ts` (section 9). The `beforeEach` reset in `graphStore.test.ts` also resets `past`, `future` and `revision`.
- **Done when:** all checks pass; the browser checks for undo in the wave line work.
- **Out of scope:** undoing New, Open or a lesson; a history panel; keeping history across reloads; coalescing several edits into one step (each committed edit is one step).

#### Phase 22: Image export [x] (c5bc9de)

- **Goal:** Export… in the top bar opens a dialog that exports the graph as SVG, PNG or TikZ.
- **Depends on:** phase 20.
- **Owns files:** see the task graph row.
- **Work:**
  - **`imageExport.ts`:** as in 4.11.
  - **`download.ts`:** `downloadBlob`, with `downloadText` built on it.
  - **`ExportDialog.tsx`:** as in 5.4; props `{ open: boolean; onOpenChange(open: boolean): void }`; reads the graph from the store when it opens.
  - **`TopBar.tsx`:** the Export… button directly after the Save split button, and the dialog's open state. Nothing else.
- **Tests:** `imageExport.test.ts` and `e2e/export.spec.ts` (section 9).
- **Done when:** all checks pass; the three downloads open correctly in a browser (SVG, PNG) and the TikZ text compiles in a LaTeX document with `tikz` and `arrows.meta` (checked by hand when LaTeX is available; otherwise say so).
- **Out of scope:** a legend; a dark-theme export; exporting only the selection; PDF; remembering the format.

#### Phase 23: Share links [x] (ff89d72)

- **Goal:** Share copies a link that recreates the graph when opened, without any server.
- **Depends on:** phase 20.
- **Owns files:** see the task graph row.
- **Work:**
  - **`shareLink.ts`:** as in 4.12.
  - **`SharedGraphDialog.tsx`:** `export function SharedGraphDialog()` (no props) and `export function offerSharedGraph(result: Result<Graph>): void`, with the dialog state in a small module-level Zustand store in the same file; the three cases of 5.4 "Opening a share link". Fitting the view uses `useReactFlow().fitView({ duration: 300 })` in `requestAnimationFrame`.
  - **`main.tsx`:** after `startAutosave`, read and clear the fragment, skip the automatic welcome when a share link was present, and call `offerSharedGraph` when `decodeShare` resolves.
  - **`App.tsx`:** mount `<SharedGraphDialog />` inside the `ReactFlowProvider`.
  - **`TopBar.tsx`:** the Share button (5.4) directly after Export… (or after the Save split button if Export… is not there). Nothing else.
- **Tests:** `shareLink.test.ts` and `e2e/share.spec.ts` (section 9).
- **Done when:** all checks pass; the browser checks for share links in the wave line work.
- **Out of scope:** short links or any server; a QR code; read-only shared views; sharing several graphs.

### Wave 13: Analysis contracts [x]

Phases: 24. Parallel: single phase. Check after the wave: all checks; the app runs unchanged (no tab yet; the stubs return empty results).

#### Phase 24: Analysis contracts and core [x] (8720fd2)

- **Goal:** the analysis types, d-separation, the reference answers, the store additions and the UI contracts exist, so wave 14 can build the four algorithms, the canvas marking and the tab in parallel.
- **Depends on:** phase 23.
- **Owns files:** see the task graph row.
- **Contracts used:** `Graph`, `GNode`, `GEdge` (3.2), `parseDagitty` (4.2), the store rules of 4.6 and 4.10, `themeStore`'s storage helpers as the pattern for `readAnalysisOn` (4.9).
- **Work:**
  - **`src/model/analysis/types.ts`, `dsep.ts`, `index.ts`:** as in 4.13, for real. **`adjustment.ts`, `paths.ts`, `independencies.ts`, `instruments.ts`:** the 4.13 signatures as stubs.
  - **Reference:** install dagitty-R as in 4.13, write the gallery and `scripts/dagitty-reference.R`, run it and commit `reference.json`. Record the dagitty-R version in the JSON (`"dagitty": "<version>"`). Generate it exactly as 4.13 "Reference fixtures" says (adjusted roles cleared for `adjustmentSets`, selected nodes conditioned on in `paths`, the `random` section).
  - **`uiStore.ts`:** the 4.14 additions. **`graphStore.ts`:** `setAdjustedSet` (4.14).
  - **`useAnalysis.ts`:** as in 4.14. **`canvas/types.ts`:** the optional `highlighted` and `path` fields.
  - **`copy.ts`:** `ANALYSIS_TITLES: Record<AnalysisKey, string>` ("Report", "Adjustment sets", "Paths", "Instruments", "Independencies") and `ANALYSIS_TEXT`, an object with every fixed sentence of 5.8 (templates as functions taking names, e.g. `totalEffect(xs: string[], ys: string[])`), and `joinNames(names: string[])` ("A", "A and B", "A, B and C").
  - **shadcn:** `npx shadcn@latest add tabs switch` (both use the installed `radix-ui` package; no new dependency). Restyle nothing beyond the Calm teal tokens: the switch is `--primary` when on.
- **Tests:** `src/model/analysis/dsep.test.ts`, `index.test.ts`, the `uiStore.test.ts` and `graphStore.test.ts` additions, `copy.ts` `joinNames` cases in `src/lib/copy.test.ts` (section 9).
- **Done when:** all checks pass; `reference.json` covers every gallery file; `dsep.test.ts` agrees with the reference's d-separation facts (each implied independence is d-separated, each adjacent pair is not).
- **Out of scope:** the four algorithms, the tab, the canvas marking.

### Wave 14: Analysis parts [x]

Phases: 25, 26, 27, 28, 29. Parallel: all five (one sub agent each, in its own worktree); their files are disjoint. Land them in the order 25, 26, 27, 28, 29. Check after the wave: all checks; in the browser, `smoking.dag.yaml` shows the Analysis tab with real results. Parallel e2e runs need `CI=1` and a lock, as in wave 12: `CI=1 flock <one shared lock file> npm run test:e2e`.

#### Phase 25: Adjustment sets [x] (43b8bc6)

- **Goal:** `adjustment.ts` computes the adjustment criterion, the minimal sufficient sets and the report fields.
- **Depends on:** phase 24.
- **Owns files:** see the task graph row.
- **Contracts used:** `types.ts`, `dsep.ts` (4.13), `reference.json`.
- **Work:** `properCausalNodes`, `forbidden`, `properBackdoorGraph`, `isAdjustmentSet`, `minimalAdjustmentSets` (FindMinSep and ListMinSep from van der Zander, Liśkiewicz & Textor 2019) and `adjustment`, as in 4.13. FindMinSep is exported too (`findMinSep(graph, xs, ys, include, restrict): NodeSet | null`), because phases 27 and 28 need it: they may copy it into their own module until phase 30 makes them import it from here.
- **Tests:** `adjustment.test.ts` (section 9).
- **Done when:** all checks pass; every gallery file and every `random` entry matches `reference.json`; the brute-force comparison passes on all gallery files and on 200 random DAGs (seeded, 4–10 nodes).
- **Out of scope:** direct effects; sets that are not minimal (DAGitty's "all" and "canonical" sets).

#### Phase 26: Paths and canvas marking [x] (34da2c1)

- **Goal:** `classifyPaths` lists and classifies the paths, and the canvas marks edges on open paths and circles hovered from the panel.
- **Depends on:** phase 24.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.13, 4.14 (`useAnalysis`, `analysisOn.paths`, `hoverNodeIds`, the optional data fields), 5.7.7.
- **Work:**
  - **`paths.ts`:** as in 4.13.
  - **`Canvas.tsx`:** fills `data.path` from `useAnalysis().paths` while `analysisOn.paths` is on and the result is not truncated, and `data.highlighted` from `hoverNodeIds`. The comparison that keeps unchanged React Flow objects also compares the new fields.
  - **`FloatingEdge.tsx`, `canvas.css`:** the two path looks of 5.7.7 and `data-path` on the edge's path element. **`CircleNode.tsx`:** `highlighted` shows the hover rim.
- **Tests:** `paths.test.ts` (section 9).
- **Done when:** all checks pass; in the browser, setting `analysisOn.paths` from the devtools marks the smoking graph's edges (the tab does not exist yet in this branch).
- **Out of scope:** the panel list (phase 29); image export of the marking.

#### Phase 27: Implied independencies [x] (8f9d659)

- **Goal:** `impliedIndependencies` lists the testable independencies.
- **Depends on:** phase 24.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.13, `dsep.ts`.
- **Work:** as in 4.13. Until phase 25 lands, keep a private FindMinSep in this module (phase 30 replaces it with the import).
- **Tests:** `independencies.test.ts` (section 9).
- **Done when:** all checks pass; the pairs match `reference.json` (without duplicates) on every gallery file without a selected node; on files with one, validity and minimality hold.
- **Out of scope:** the "basis set" form of DAGitty; tests against data.

#### Phase 28: Instrumental variables [x] (0050117)

- **Goal:** `instrumentalVariables` finds unconditional and conditional instruments.
- **Depends on:** phase 24.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.13, `dsep.ts`.
- **Work:** as in 4.13 (van der Zander, Textor & Liśkiewicz 2015). A private FindMinSep or nearest-separator helper may live here until phase 30.
- **Tests:** `instruments.test.ts` (section 9).
- **Done when:** all checks pass; the instruments match `reference.json` on every gallery file with one exposure and one outcome.
- **Out of scope:** instruments for several exposures or outcomes.

#### Phase 29: Analysis tab [x] (52350ad)

- **Goal:** the side panel has Edit and Analysis tabs, and the Analysis tab shows the five sections of 5.8 with their switches, rows, Use this set, Show all and hover.
- **Depends on:** phase 24.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.14 (`uiStore`, `setAdjustedSet`, `useAnalysis`), `copy.ts` texts, the shadcn `tabs` and `switch`.
- **Work:** `SidePanel.tsx` gets the tabs and the switch-to-Edit rule; `AnalysisPanel.tsx` (`export function AnalysisPanel()`, no props) renders 5.8. It is coded against the stubs: with them, every section shows its "none" text. To check the real look before wave 14 lands, a local, uncommitted change may make the stubs return sample data.
- **Tests:** none of its own (components have no unit tests); `e2e/analysis.spec.ts` follows in phase 30. The existing e2e tests must still pass (the Edit tab is the default, so the editor and cheat sheet are where they were).
- **Done when:** all checks pass; in the browser the tabs switch, the switches persist across a reload, and selecting a node returns to Edit.
- **Out of scope:** the algorithms; the canvas marking (phase 26).

### Wave 15: Analysis integration [x]

Phases: 30. Parallel: single phase. Check after the wave: all checks; the browser checks in phase 30.

#### Phase 30: Analysis integration and end-to-end tests [x] (dcc2056)

- **Goal:** the analysis works end to end and the spec, IDEAS.md and memory reflect it.
- **Depends on:** phases 25–29.
- **Owns files:** see the task graph row.
- **Work:** replace the private FindMinSep copies in phases 27 and 28 with the import from `adjustment.ts`; fix integration problems; write `e2e/analysis.spec.ts`; update the Status line, the Open issues and `docs/IDEAS.md` (remove the built items; keep the exportable summary, alternative sets with rationale, direct effects and the estimand field).
- **Tests:** `e2e/analysis.spec.ts` (section 9).
- **Done when:** all checks pass; in the browser (both themes) an M-bias graph shows `(empty set)` as sufficient and adjusting the collider Z makes the path through Z dashed and the report say "not sufficient"; Use this set and undo work.
- **Out of scope:** an exportable report; analysis in exported images.

### Wave 16: Export contracts [x]

Phases: 31. Parallel: single phase. Check after the wave: all checks. The app runs unchanged, except that the Open dialog now routes `digraph` text to the DOT stub.

#### Phase 31: Export contracts [x] (18367c4)

- **Goal:** the shared parts and signatures of 4.11 "PDF, legend and dark theme", 4.15 and 5.4 exist, so wave 17 can build the formats, the image changes and the dialogs in parallel.
- **Depends on:** phase 30.
- **Owns files:** see the task graph row.
- **Contracts used:** `Graph`, `Result`, `Issue` (3.2–3.3), `validateGraph` (4.4), `autoLayout` (4.5), `nodeDiameter` (5.7.6), `toDagittyIds`, `fileSlug`, `readAnalysisOn` as the storage pattern (4.14), `safeLocalStorage` (`src/lib/welcome.ts`).
- **Work:**
  - **`exchange.ts`:** `ExchangeNode`, `ExchangeEdge`, `buildGraph`, `encodeList`, `decodeList` and `ignoredAttribute`, for real (4.15 "Shared parts").
  - **`palette.ts`:** `ImageTheme`, `ExportPalette` and `EXPORT_PALETTES` with both themes (4.11).
  - **`imageExport.ts`:** imports the palette from `palette.ts`, re-exports `EXPORT_PALETTES` and `ImageTheme`, and drops `EXPORT_PALETTE`; its users use `EXPORT_PALETTES.light`. Add `ImageOptions`, `'pdf'` in `ImageFormat` and `.pdf` in `imageFileName`. The new options are accepted and ignored. The palette test moves to `palette.test.ts`.
  - **`imageScene.ts`:** the types and `LEGEND` of 4.11, with `imageScene` as a stub.
  - **`pdfExport.ts`:** `toPdf` for real (`sceneToPdf(imageScene(graph, opts))`), with `sceneToPdf` as a stub.
  - **`fileFormat.ts`:** `GraphFormat`, `ExportFormat`, `EXPORT_FORMATS`, `EXPORT_FILES`, `exportText`, `exportFileName`, the new detection order and dispatch (4.15).
  - **Format modules:** the six format modules as stubs with their 4.15 signatures.
  - **`dagitty.ts`:** `toDagitty(graph, opts?)`, with the option ignored for now.
  - **`uiStore.ts`:** the `dagittyDetails` addition (5.4).
  - **`CodeDialog.tsx`:** `COPY` becomes `Record<ExportFormat, { title; code; note }>` with all eight entries and their notes (5.4), plus `detailsNote` for dagitty. The MIME type comes from `EXPORT_FILES`. Its `format` prop becomes `ExportFormat`. Nothing else changes.
  - **`ui/checkbox.tsx`:** `npx shadcn@latest add checkbox`. It uses the installed `radix-ui`, so no new dependency, and is styled with the Calm teal tokens: `--primary` when checked.
- **Tests:**
  - `exchange.test.ts`;
  - `palette.test.ts`;
  - the `fileFormat.test.ts` additions;
  - the `uiStore.test.ts` additions;
  - the existing `imageExport.test.ts`, updated for the palette move (section 9).
- **Done when:** all checks pass; detection sends the GML, DOT and JSON samples of section 9 to the right parser, and every existing YAML and dagitty fixture still goes where it went.
- **Out of scope:** the writers, the parsers, the scene and PDF drawing, the dialogs.

### Wave 17: Export parts [x]

Phases: 32, 33, 34, 35, 36, 37, 38, 39. Parallel: all eight, one sub agent each in its own worktree; their files are disjoint. Land them in the order 32, 33, 34, 35, 36, 37, 38, 39.

Check after the wave: all checks, then in the browser:
- each Save as… item shows its text and downloads its file;
- the dagitty checkbox adds the `gc.*` attributes and is still set after a reload;
- a pasted GML, DOT and JSON export of the smoking graph opens with its types and evidence;
- Export gives a dark PNG with a legend, and a PDF that opens in the browser's PDF viewer.

Parallel e2e runs need `CI=1` and a lock, as in wave 12: `CI=1 flock <one shared lock file> npm run test:e2e`.

#### Phase 32: dagitty details [x] (0a83773)

- **Goal:** dagitty code can carry the GraphCreator metadata as `gc.*` attributes, and Open always reads them back.
- **Depends on:** phase 31.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.2, `encodeList` and `decodeList` (4.15).
- **Work:** `toDagitty` with `details` and `parseDagitty` reading the `gc.*` keys, as in 4.2 "GraphCreator details in dagitty". Edge attribute lists on chains and groups apply to every edge.
- **Tests:** the `dagitty.test.ts` additions (section 9).
- **Done when:** all checks pass; the example in 4.2 is reproduced exactly for the 4.1 graph; the round trip with details equals `toYaml(g)`.
- **Out of scope:** the checkbox (phase 39); the dagitty-R check (phase 40).

#### Phase 33: GML [x] (20d0822)

- **Goal:** `toGml` and `parseGml` as in 4.15.
- **Depends on:** phase 31.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.15 (`buildGraph`, `ignoredAttribute`, `toDagittyIds`, the number rules).
- **Work:** the writer, a GML tokenizer and parser, and the reading rules of 4.15.
- **Tests:** `gml.test.ts` (section 9).
- **Done when:** all checks pass; the 4.15 example is reproduced exactly for the 4.1 graph (the parts shown); the round trip holds on every valid fixture.
- **Out of scope:** yEd's GraphML (XML), and other GML extensions.

#### Phase 34: DOT [x] (19f2a07)

- **Goal:** `toDot` and `parseDot` as in 4.15.
- **Depends on:** phase 31.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.15, `EXPORT_PALETTES.light`.
- **Work:** the writer, a tokenizer and recursive-descent parser for the DOT subset in 4.15, and the error messages listed there.
- **Tests:** `dot.test.ts` (section 9).
- **Done when:** all checks pass; the 4.15 example is reproduced exactly; the round trip holds on every valid fixture; a typical DoWhy string (`digraph { A -> B; B -> C; A -> C }`) opens with layout.
- **Out of scope:** undirected graphs, HTML labels, ports, edge splines.

#### Phase 35: networkx JSON [x] (b722c17)

- **Goal:** `toNetworkx` and `parseNetworkx` as in 4.15.
- **Depends on:** phase 31.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.15.
- **Work:** the writer with its one-line short arrays, and the reader with `edges`/`links`.
- **Tests:** `networkx.test.ts` (section 9).
- **Done when:** all checks pass; the 4.15 example shape is reproduced for the 4.1 graph; the round trip holds on every valid fixture.
- **Out of scope:** networkx's adjacency and tree formats; multigraphs.

#### Phase 36: bnlearn, Tetrad and Mermaid [x] (dbae502)

- **Goal:** `toBnlearn`, `toTetrad` and `toMermaid` as in 4.15.
- **Depends on:** phase 31.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.15, `EXPORT_PALETTES.light`.
- **Work:** the three writers.
- **Tests:** `bnlearn.test.ts`, `tetrad.test.ts` and `mermaid.test.ts` (section 9).
- **Done when:** all checks pass; the three 4.15 examples are reproduced exactly for the 4.1 graph.
- **Out of scope:** reading these formats.

#### Phase 37: Image scene, legend and theme [x] (5d9657a)

- **Goal:** `imageScene` computes the picture with the legend and both themes, and SVG and TikZ are drawn from it.
- **Depends on:** phase 31.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.11 (both parts), `EXPORT_PALETTES`, `ROLE_LABELS`, `nodeDiameter`, `wrapLabel`, `edgeEndpoints`.
- **Work:** `imageScene` with the legend placement of 4.11; `toSvg` and `svgSize` rewritten on top of the scene; the theme and the legend in SVG; the TikZ legend.
- **Tests:** `imageScene.test.ts` and the `imageExport.test.ts` additions (section 9).
- **Done when:** all checks pass; the light SVG without a legend is identical to before this phase for every valid fixture; a dark SVG with a legend looks right in the browser.
- **Out of scope:** PDF drawing (phase 38); the dialog (phase 39); the analysis marking in images.

#### Phase 38: PDF writer [x] (645c91a)

- **Goal:** `sceneToPdf` writes a valid vector PDF of a scene.
- **Depends on:** phase 31.
- **Owns files:** see the task graph row.
- **Contracts used:** the `Scene` types (4.11).
- **Work:** the PDF objects, the content stream, the Helvetica width table, and the escaping and WinAnsi mapping of 4.11. It is tested on hand-built scenes, because `imageScene` is a stub in this branch.
- **Tests:** `pdfExport.test.ts` (section 9).
- **Done when:** all checks pass; a PDF of a hand-built scene opens in the browser's PDF viewer and in `pdftotext` or `qpdf --check` when available (otherwise say so).
- **Out of scope:** embedded fonts; compression; several pages.

#### Phase 39: Export and format dialogs [x] (f627465)

- **Goal:** the Save as… menu, `CodeDialog`, the Export dialog and the Open dialog work as in 5.4 "Import and export additions".
- **Depends on:** phase 31.
- **Owns files:** see the task graph row.
- **Contracts used:** `EXPORT_FORMATS`, `EXPORT_FILES`, `exportText`, `exportFileName` (4.15), `uiStore.dagittyDetails`, `ImageOptions`, `toPdf`, the `checkbox` component.
- **Work:**
  - **`TopBar.tsx`:** the menu items and the separator. `openCode(format)` passes only the format.
  - **`CodeDialog.tsx`:** computes its text and file name, and adds the details checkbox for dagitty.
  - **`ExportDialog.tsx`:** PDF, Theme, Legend, and the points line.
  - **`OpenDialog.tsx`:** the new description.

  This phase is coded against the stubs, so the new formats show empty text until wave 17 lands. The existing e2e tests must still pass.
- **Tests:** none of its own (components have no unit tests). `e2e` follows in phase 40.
- **Done when:** all checks pass; in the browser every menu item opens its dialog, the checkbox survives a reload, and Theme and Legend change the preview once phase 37 has landed. When this phase runs before it lands, check that the controls update their state.
- **Out of scope:** the formats themselves.

### Wave 18: Format integration [x]

Phases: 40. Parallel: single phase. Check after the wave: all checks; the browser checks in phase 40.

#### Phase 40: Format integration, real-tool reference and end-to-end tests [x] (6527f15)

- **Goal:** the new formats are checked against the real tools, the whole feature works end to end, and the spec, IDEAS.md and memory reflect it.
- **Depends on:** phases 32–39.
- **Owns files:** see the task graph row.
- **Work:**
  - **Samples.** `src/model/__fixtures__/formats/` holds the exports of the sample graphs: `smoking.dag.yaml`, `quoted-names.dagitty.txt`, and the analysis gallery's dagitty files, read with their GraphCreator metadata where they have it. For each sample there is one file per writer (`<graph>.gml`, `.dot`, `.json`, `.bnlearn.txt`, `.tetrad.txt`, `.mmd`) and the dagitty file with details (`<graph>.details.dagitty.txt`). `formats.reference.test.ts` checks that the writers still produce these files exactly, and rewrites them when the environment variable `UPDATE_FORMAT_SAMPLES=1` is set.
  - **Real-tool reference.** `scripts/check-formats.py` and `scripts/check-formats.R` read the sample files and write `src/model/__fixtures__/formats/reference.json`: for each sample and tool, the node names, the edges and the node attributes the tool saw, plus the tool versions. The tools are:
    - Python: networkx `parse_gml` (with `label="label"`, as DoWhy uses it) and `node_link_graph(edges="edges")`; pydot `graph_from_dot_data`; causal-learn `txt2generalgraph`.
    - R: bnlearn `model2network`; dagitty, which must parse the details file and give the same `exposures`, `outcomes`, `latents` and edges as the plain export, and keep every `gc.*` attribute when printed.
  - **Running the reference.** Each script's header says how to install its tools: `python3 -m venv <dir>` then `<dir>/bin/pip install networkx pydot causal-learn`; `install.packages(c("bnlearn", "dagitty"))`. The scripts do not run in CI.
  - **Tests.** `formats.reference.test.ts` compares `reference.json` with the sample graphs. Then write the e2e tests, fix integration problems, and update the Status line, the Open issues and `docs/IDEAS.md`. Remove the built "Import and export" items there; keep the JSON Schema item.
- **Tests:** `formats.reference.test.ts`, `e2e/formats.spec.ts` and the `e2e/export.spec.ts` and `e2e/files.spec.ts` additions (section 9).
- **Done when:** all checks pass; `reference.json` covers every sample and tool; in the browser (both app themes):
  - the smoking graph's GML, DOT and JSON exports pasted into Open recreate it with types and evidence;
  - the Mermaid code renders with role colours in a Mermaid viewer;
  - the PDF with a legend opens in the browser;
  - a dark PNG with a legend downloads.
- **Out of scope:** opening bnlearn, Tetrad or Mermaid; the JSON Schema; analysis marking in images.
- **Details fixed in phase 40:**
  - The writers' outputs live in `src/model/__fixtures__/formats/samples/` as `<sample>.gml`, `.dot`, `.json`, `.bnlearn.txt`, `.tetrad.txt`, `.mmd`, `.plain.dagitty.txt` and `.details.dagitty.txt`. Besides the planned samples there is `formats/escapes.dag.yaml`, a graph with non-ASCII names, `;` and `\` in levels and evidence, quotes, `&`, `<`, and nodes named `node`, `1st visit` and `a.b`.
  - `scripts/check-formats.py` runs `scripts/check-formats.R` (which prints its JSON on stdout) and writes the whole `reference.json`, sorted, so one command refreshes it. Per sample it records `networkx_gml`, `networkx_json`, `pydot` (quotes and escapes removed), `causallearn` (directed edges as `[tail, head]`), `bnlearn` and `dagitty` (roles, edges, `same_as_plain`, `keeps_details` and the number of `gc.*` attributes). The first reference was made with Python 3.12.3, networkx 3.7, pydot 4.0.1, causal-learn 0.1.4.8, R 4.3.3, bnlearn 4.9.4 (archived: bnlearn 5 needs R 4.4) and dagitty 0.3.4.
  - dagitty-R refused the escapes sample's node `node`, which led to the `toDagittyIds` change in 4.2. Every other sample was read exactly as written by every tool.
  - The SVG snapshot test in `imageExport.test.ts` now reads only the top-level and `analysis/` fixtures, so the format samples do not need image snapshots.

### Wave 19: Lesson contracts [x]

Phases: 41. Parallel: single phase. Check after the wave: all checks.

#### Phase 41: Lesson engine contracts [x] (9a10808)

- **Goal:** the extended lesson engine exists (types, helpers, events, context, picks, progress), the tour runs on it unchanged for the user, and the 13 new lessons exist as stubs.
- **Depends on:** phase 40.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.6, 4.7, 4.8, 4.14, 5.7.10; `parseYaml` (4.1).
- **Work:**
  - `types.ts`, `index.ts` and `helpers.ts` as in 5.7.10. `tour.ts`: each `isDone(graph)` becomes `check: (ctx) => …` on `ctx.graph`, and the lesson gets `summary` and `track` from LESSONS.md.
  - The 13 stubs (contracts above), in `LESSONS` in the order of LESSONS.md.
  - `lessonEvents.ts`, the `lessonStore` additions and `lessonProgress.ts` as in 4.8. `isStepDone` uses `stepDone`.
  - `graphStore.undo` records `lessonEvent({ kind: 'undo' })` when it changed the graph.
  - `uiStore`: `lessonsOpen`, `openLessons`, `closeLessons`.
  - `LessonPanel.tsx`: replace `step.isDone(graph)` by `stepDone(step, lessonContext())`, re-rendering when the graph, the selection, the side panel tab, the Analysis switches or the events change. Nothing else in the panel changes in this phase.
- **Tests:** `helpers.test.ts`, `lessonEvents.test.ts`, `lessonProgress.test.ts`, the `lessonStore.test.ts`, `uiStore.test.ts`, `graphStore.test.ts` and `tour.test.ts` updates (section 9).
- **Done when:** all checks pass; the tour works as before in the browser.
- **Out of scope:** the panel's new parts, the pointer, the dialog, the lesson texts.
- **Details fixed in phase 41:**
  - `LessonContext.selection` is typed `GraphState['selection']`.
  - Picks: "once the step is done" is judged on the state just before the selection change, so after the answer is selected, clicking a wrong node is not recorded (the step then shows as not done again). Selection changes are compared by kind and id: A, empty canvas, A records A twice; A clicked again with no change in between counts once. Adding a node during a pick step selects it and counts as a wrong pick. `start` subscribes to the graph store and `exit` unsubscribes.
  - `next` and `back` reset `wrongPicks`, `revealed` and the events only when the step changes; `back` on step 0 keeps them. `exit` also resets `wrongPicks` and `revealed`.
  - `start` sets `active`, `wrongPicks` and `revealed`, then starts recording, then sets the user's graph aside and loads the practice graph.
  - `revealAnswer` does nothing without a pick; when the answer node no longer exists it selects nothing but still sets `revealed`.
  - `undo` records `{ kind: 'undo' }` only when `past` was not empty; `redo` records nothing.
  - `adjustedIs` compares as sets (`adjustedIs(ctx, [])` is true when nothing is adjusted). `hasEvent` with formats never matches an event without a format.
  - `tour.test.ts` also checks that `LESSONS` holds the 14 ids, titles, summaries and tracks of LESSONS.md in order; it does not check the stubs' steps.

### Wave 20: Lesson parts [x]

Phases: 42–47. Parallel: yes. Check after the wave: all checks.

#### Phase 42: Lesson panel additions [x] (dab3c6e)

- **Goal:** the panel shows the Key idea box, pick feedback and Show answer, and an optional body (5.7.10 "Lesson panel").
- **Depends on:** phase 41.
- **Owns files:** `src/components/LessonPanel.tsx`.
- **Contracts used:** 4.8 (`wrongPicks`, `revealed`, `revealAnswer`, `lessonContext`), 5.7.10 (`stepDone`, `LessonStep`).
- **Work:** 5.7.10 "Lesson panel", including `⌘` on a Mac. Until phases 45–47 land only the tour and the stubs exist, so check the new parts with a lesson built in the test or by starting a stub in the browser.
- **Tests:** covered end to end in phase 48; keep the existing e2e tests passing.
- **Done when:** all checks pass.
- **Out of scope:** the canvas pointer, the dialog.
- **Details fixed in phase 42:**
  - The feedback `role="status"` element stays mounted (empty) for the whole pick step, so a pick step has two status regions (callout and feedback); tests narrow `getByRole('status')`. An empty feedback block takes no space.
  - Show answer sits after the status text, outside the live region, left-aligned.
  - "Key idea" is written in sentence case and shown uppercase by CSS. Ctrl→⌘ applies to body and task only.
  - A wrong click after the step is done is not recorded (phase 41), so the panel then shows "Try it" with no feedback.

#### Phase 43: Canvas pointer [x] (17ea1b0)

- **Goal:** the pulsing labels of 5.7.12, and the `edge-refused` event.
- **Depends on:** phase 41.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.8, 5.7.10 (`LessonPointer`, `nodeNamed`), 5.7.12.
- **Work:** 5.7.12. Do not change the node's size, its accessible name or any existing state in 5.7.7.
- **Tests:** covered end to end in phase 48.
- **Done when:** all checks pass; with a pointer set, the label shows above the circle, moves with it, and stays still with reduced motion.
- **Out of scope:** pointers on edges or paths.
- **Details fixed in phase 43:**
  - The 10 px gap runs from the triangle's tip to the circle's top, clear of the 7 px hover rim; the triangle is 6 px tall and 12 px wide and moves with the label. The label is centred over the node and overflows evenly when wider; `z-index: 4` inside the node.
  - Pulse: `translateY` 0 → −3 px → 0 and a ring from 45% `--primary` (`color-mix`) to 6 px transparent. Reduced motion: `animation: none`.
  - Two pointer entries for one node: the first wins. Outside a lesson the `pointer` key is left out of node data.
  - `Canvas` shows refusals through one helper that toasts and records `edge-refused`, used by connect mode, `onConnect` and `onConnectEnd`.

#### Phase 44: Help menu, Lessons dialog and events [x] (291b119)

- **Goal:** the Help menu and the Lessons dialog of 5.7.11, and the app events of 4.8.
- **Depends on:** phase 41.
- **Owns files:** see the task graph row.
- **Contracts used:** 4.7 (`openWelcome`, `lessonsOpen`), 4.8 (`lessonEvent`, `done`, `start`), 5.7.10 (`LESSONS`).
- **Work:** 5.7.11. Record the events: `CodeDialog` records `code-opened` when it opens and `code-copied` or `code-downloaded` after a successful copy or download, with its `format`; `ExportDialog` records `export-copied` and `export-downloaded` with the format; `TopBar` records `link-copied` after a successful share. Update the e2e tests that click Help to choose Help → Welcome.
- **Tests:** the updated e2e tests; the dialog itself is tested end to end in phase 48.
- **Done when:** all checks pass.
- **Out of scope:** the lesson texts; any change to the welcome slides.
- **Details fixed in phase 44:**
  - The Help menu uses `modal={false}` and `align="end"`; its items are menu items "Welcome" and "Lessons…" in a portal. `e2e/smoke.spec.ts` needed no change.
  - Lessons dialog: group headings are `<h3>`; rows have dividers; the finished count sits below the scrolling list and counts only ids in `LESSONS`; the Finished icon has `role="img"`. Focus starts on the first Start button.
  - `code-opened` is recorded once per opening (an effect on open and format), even when the writer throws. Copy and download events are recorded only after success (PNG after the conversion resolves).
  - `copyShareLink` returns nothing and swallows errors, so `TopBar` repeats its steps with `shareUrl` and records `link-copied` after a successful write; `copyShareLink` is unused until phase 48 makes it report success.

#### Phase 45: App-track lessons [x] (e018b4c)

- **Goal:** lessons 2–4 (`variables`, `arrows`, `files`) exactly as in LESSONS.md.
- **Depends on:** phase 41.
- **Owns files:** `src/lessons/{variables,arrows,files}.ts` and `{variables,arrows,files}.test.ts`.
- **Contracts used:** 5.7.10, `helpers.ts`, LESSONS.md.
- **Work:** copy the practice graphs and texts character for character; write each check with the helpers.
- **Tests:** per lesson, the lesson tests in section 9.
- **Done when:** all checks pass.
- **Out of scope:** changing the texts. If a text or claim in LESSONS.md is wrong, stop and report it.
- **Details fixed in phase 45:**
  - Checks missing from `helpers.ts` are private to the lesson files (`typeIs`, `unitIs`, `levelsAre`, `hasDescription`, `hasEvidence`, `hasNote`). Units and levels compare trimmed and ignoring case; description, note and evidence need a non-blank value.
  - `sample()` parses on every call. Lesson tests parse their section of `docs/LESSONS.md?raw` and compare every text, so a correction to LESSONS.md fails the test until the lesson file follows.

#### Phase 46: Causal lessons 5–9 [x] (9185cf0)

- **Goal:** lessons 5–9 (`dag-basics`, `confounding`, `mediators`, `colliders`, `selection`) exactly as in LESSONS.md.
- **Depends on:** phase 41.
- **Owns files:** `src/lessons/{dag-basics,confounding,mediators,colliders,selection}.ts` and their tests.
- **Contracts used:** as phase 45, plus `analyze` and `dsep.ts` (4.13) in the tests.
- **Work and tests:** as phase 45; every item under a lesson's "Claims" is asserted with the analysis engine.
- **Done when:** all checks pass.
- **Out of scope:** as phase 45.
- **Details fixed in phase 46:**
  - `no edge(A, B)` is `noEdge` in `selection.ts` and needs both nodes to exist. Tab and switch checks are written inline.
  - The scripted test runs model that selecting a node switches the side panel to Edit, so steps asking for the Analysis tab after a role change start not done.

#### Phase 47: Causal lessons 10–14 [x] (7bb6e7f)

- **Goal:** lessons 10–14 (`latent`, `adjustment`, `testing`, `instruments`, `reporting`) exactly as in LESSONS.md.
- **Depends on:** phase 41.
- **Owns files:** `src/lessons/{latent,adjustment,testing,instruments,reporting}.ts` and their tests. Lessons 12 and 14 build on lesson 11's graph; write that YAML in `adjustment.ts` and export it from there.
- **Contracts used, work and tests:** as phase 46.
- **Done when:** all checks pass.
- **Out of scope:** as phase 45.
- **Details fixed in phase 47:**
  - Lesson 11's graph is exported from `adjustment.ts` as `EXTENDED_EXAMPLE_YAML` and `extendedExample()` (lessons 11 and 12). Lesson 14's graph is built in code by `reportingGraph()` from it (Genetic factors gets the next id and is the last node and edge); a test checks it field by field and through a save and reload.
  - Reading steps at the end of a lesson have no check (the tour keeps `check: () => true`).
  - Sentence counting treats "et al." as not ending a sentence. In LESSONS.md tables, `\\|` reads as `|`.
  - Because Report is on by default, lesson 14 step 2 is done as soon as the Analysis tab opens; a user whose stored switches already have Instruments or Independencies on finds lessons 13 step 3 and 12 step 2 done at once.
  - Lesson 12's collider claim is checked by giving SES and Maternal age the exposure and outcome roles and listing the paths between them.

### Wave 21: Lessons integration [x]

Phases: 48. Parallel: single phase. Check after the wave: all checks; the browser checks below.

#### Phase 48: Lessons integration and end-to-end tests [x]

- **Goal:** the whole course works end to end, and the spec, IDEAS.md and memory reflect it.
- **Depends on:** phases 42–47.
- **Owns files:** see the task graph row.
- **Work:** write `e2e/lessons.spec.ts` (section 9); fix integration problems in any file of phases 41–47; update the Status line, the Open issues and `docs/IDEAS.md`. Correct LESSONS.md only where the built app shows a text to be wrong, and record each correction under "Details fixed in phase 48".
- **Done when:** all checks pass; in the browser (both app themes) the Lessons dialog lists 14 lessons, a pointer pulses above its circle, a wrong pick shows its hint and Show answer appears after two, and a finished lesson keeps its checkmark after a reload.
- **Out of scope:** new lessons; resuming mid-lesson.
- **Details fixed in phase 48:**
  - `next` and `back` clear the selection when the step being left or the step entered has a pick, so a node picked in one step is not still selected in the next (clicking it would neither switch the side panel to Edit nor count as a pick). Other steps keep the selection, so lesson 3's selected arrow stays selected for its evidence and note steps.
  - **Lesson viewport.** A lesson starting with a fresh view (`translate(0, 0) scale(1)`) left the practice graph's upper nodes, and lesson 6's SES pointer, above the canvas, because practice graphs reach negative y. `LessonPanel` now fits the view to the practice graph when a lesson starts, with `maxZoom: 1` and the 300 ms fit (none with reduced motion), and puts the user's earlier viewport back when the lesson ends. The fit waits two animation frames, so React Flow has measured the canvas after the panel took its 300 px. An empty practice graph (the tour) is not fitted. This replaces the "Lesson viewport" open issue.
  - `copyShareLink` returns `Promise<boolean>`: true after a successful clipboard write, false after any failure (the error toast shows as before). `TopBar`'s Share calls it and records `link-copied` only when it returns true; the steps copied in phase 44 are gone.
  - The helpers repeated in the 13 lesson tests live in `src/lessons/lessonTestKit.ts` (test-only; nothing in the app imports it, so it is not in the bundle). It parses LESSONS.md (`\\|` reads as `|`), counts sentences ("et al." ends none), builds contexts, scripts tasks and runs, and gives analysis results by name. One parser and one sentence counter now serve every lesson, so the step comparison also checks the Check column for lessons 2–4 and the whole step object for lessons 10–14, picks in lessons 10–13 are also tried with an edge and with nothing selected, and every scripted run clears the events at each step. No assertion was dropped; the lesson test count is unchanged (151).
  - `e2e/lessons.spec.ts` waits for the view to stop moving after a lesson starts or ends, because of the fit above. The pick feedback is the second `role="status"` in the panel (phase 42).
  - Browser walk-through (both themes): every lesson's steps 1–n were completed with the UI, including lesson 4's "Move a circle, then press Ctrl+Z" (the practice graph starts with an empty undo history, and the move is one undo step). No text in LESSONS.md needed a correction; only its Status line changed (implemented).

## 9. Tests

- `src/model/graph.test.ts`: `newId` and `defaultNodeName` pick the smallest unused value; `addNode` returns a new graph and leaves the input unchanged; `renameNode` trims, refuses empty and duplicate names (case-sensitive: `Age` vs `age` allowed) and keeps edges; `updateNode` clears `levels`/`unit` when the type changes; `removeNodes` removes incident edges; `canAddEdge` returns `self`, `duplicate` and `cycle` with the exact messages, including the cycle path text; `addEdge` creates an edge with `evidence: []`.
- `src/model/cycle.test.ts`: `findCycle` returns null for acyclic graphs (including diamonds and disconnected parts) and a correct closed path otherwise; `findPath` finds directed paths only.
- `src/model/validate.test.ts`: each error and warning in 4.4 is produced with its exact message; a clean graph gives none.
- `src/model/yaml.test.ts`: canonical round trip of `smoking.dag.yaml`; defaults (missing role → `other`, missing nodes/edges → empty); each invalid fixture gives the expected messages and **all** problems are listed at once; YAML syntax errors carry a line number; unknown schema and missing schema messages; missing positions trigger layout and the warning; `fileSlug` cases (`"Smoking & BW"` → `smoking-bw`, empty → `graph`).
- `src/model/layout.test.ts`: every node gets integer positions; parents are left of children; same input gives the same output.
- `src/model/dagitty.test.ts`: each fixture parses to the expected names, roles, edges and positions; quoted ids and `label` become names; chains, `<-` and groups expand correctly; rejected fixtures give the specified line-numbered errors; unknown attributes give warnings; `toDagittyIds` handles spaces, punctuation, non-ASCII, empty names and collisions (`a b`, `a_b` → `a_b`, `a_b_2`); `toDagitty` output for the 4.1 graph equals the example in 4.2; round trip `parseDagitty(toDagitty(g))` preserves names, roles, edges and positions within 0.1 px.
- `src/model/validate.test.ts` (phase 3 addition): node-specific warnings carry the node's `nodeId`.
- `src/store/graphStore.test.ts`: every action in 4.6 delegates to the model and replaces `graph` without mutating it; `addNodeAt` selects the new node and sets `focusNameOf`; `connect` returns the `EdgeCheck` and only adds valid edges; `removeSelection` clears a removed selection; `replaceGraph` clears selection and `focusNameOf`; `setGraphName('  ')` clears the name.
- `src/store/autosave.test.ts` (with a fake storage): changes are written as `toYaml` text at most every 500 ms; a stored graph is restored on start; corrupt text falls back to an empty graph; a storage that throws only disables autosave.
- `e2e/smoke.spec.ts`: the app loads with title `GraphCreator` and no console errors.
- `e2e/canvas.spec.ts`: double-click adds "Node 1"; connecting two nodes adds an edge; closing a cycle shows the cycle toast; Delete removes a node and its edges; reload restores the graph.
- `e2e/editing.spec.ts`: rename refuses a duplicate name; setting type to ordinal shows the levels editor and the hint; switching to continuous hides levels and shows unit; the warning badge count drops when a node gets a type; edge evidence can be added.
- `e2e/files.spec.ts`: Save (from phase 20: Save, then Download in its dialog) downloads a `.dag.yaml` whose text parses back to the same graph; Open of `cycle.dag.yaml` shows the error dialog and leaves the graph unchanged; dagitty import of `confounding.dagitty.txt` creates its nodes and edges; importing `bidirected.dagitty.txt` shows the error; dagitty export text matches `toDagitty`.

Redesign (phases 10–16):

- `src/lib/theme.test.ts` (phase 10): every token pair in 5.7.2 meets its ratio in both `:root` and `.dark`.
- `src/model/nodeSize.test.ts` (phase 10): the three examples in 5.7.6; the minimum 64 and maximum 136; results are even; a word longer than 14 characters is hard-split; a name needing more than 3 lines is truncated with "…" and `truncated: true`; on a tie, fewer lines win; leading and trailing spaces are ignored.
- `src/model/layout.test.ts` (phase 10 addition): node boxes use `nodeDiameter`, so a long-named node gets more space and positions are the top-left of its square.
- `src/store/graphStore.test.ts` (phase 10 addition): renaming `Age` to `Maternal smoking during pregnancy` keeps the circle's centre (pos shifts by −34 on both axes); a failed rename leaves `pos` unchanged.
- `src/store/uiStore.test.ts` (phase 10): `setTool` clears `connectFrom`; `openWelcome` resets the slide to 0; `setWelcomeSlide` clamps to 0..3.
- `src/store/lessonStore.test.ts` (phase 10): `start('tour')` sets the user's graph aside and loads an empty graph; `next` does nothing until the step is done; `back` stops at 0; `exit` and finishing restore the user's graph exactly; starting an unknown lesson throws; starting while a lesson runs exits the old one first.
- `src/lessons/tour.test.ts` (phase 10): each step's `isDone` is false on the graph before the action and true after it (an added node, a rename to `Smoking`, an edge, an exposure role).
- `src/lib/geometry.test.ts` (phase 11): horizontal and diagonal endpoints with the 2 px gap; swapping source and target mirrors them; coincident centres return null.
- `src/lib/welcome.test.ts` (phase 14): unwelcomed by default; `markWelcomed` then `hasBeenWelcomed` is true; storage that is null or throws gives false and no exception.
- `src/store/autosave.test.ts` (phase 16 addition): no writes while a lesson is active; a pending write is flushed when a lesson starts; the user's graph is written again after exit; the status is `blocked` without storage and `paused` during a lesson.
- `e2e/editing.spec.ts` (phase 13 update, phase 16 update): option labels, the help text, info tooltips open on focus; from phase 16, the role is checked through `data-role`.
- `e2e/canvas.spec.ts` (phase 16 update): double-click adds a circle; dragging from the rim connects; connect mode (C, then two clicks) adds an edge; the add tool (N, then a click) adds a node; renaming to a long name makes the circle bigger; an edge with evidence shows the chip with its count.
- `e2e/welcome.spec.ts` (phase 16): a first visit shows slide 1; "Get started" closes the slides and they stay closed after a reload; Lessons reopens them at slide 1; "Take the tour" opens the lesson panel.
- `e2e/lesson.spec.ts` (phase 16): the tour's Next button enables only after each action; Finish restores the user's earlier graph; the practice graph is never written to `graphcreator:current`; New and Open are disabled during the lesson.
- `e2e/smoke.spec.ts` (phase 16 update): the top bar and the "Canvas tools" rail render; with `colorScheme: 'dark'` emulated, `<html>` has the class `dark` and there are no console errors.
- `e2e/smoke.spec.ts` (phase 17 update, replaces the dark test above): with `colorScheme: 'dark'` emulated the app starts light; the Dark mode button (`aria-pressed`) adds `dark` to `<html>` and React Flow and gives the canvas the dark `--canvas` colour; the choice survives a reload; clicking again returns to light; no console errors.
- `src/model/fileFormat.test.ts` (phase 18): every YAML and dagitty fixture is recognised from its text alone; headerless dagitty is dagitty; `.yaml`/`.yml` names force YAML; YAML keys are found after comments; `parseGraphText` returns the right parser's result and errors.
- `src/store/graphStore.test.ts` (phase 18 addition): `focusName` selects the node and sets `focusNameOf` without changing `graph`.
- `src/store/themeStore.test.ts` (phase 19): `readTheme` is light by default, with null storage, for unknown values and for a throwing storage, and dark only for `'dark'`; `writeTheme` stores under `graphcreator:theme` and ignores null or throwing storage; the store starts light without a DOM and `setTheme` switches it.
- e2e (phase 18): the top bar shows New, Open…, Save, Save as…, Help and Dark mode (`smoke`); Help reopens the slides (`welcome`, `lesson`); during a lesson New and Open… are disabled and both Save as… items work (`lesson`); `files`: Open file… with `smoking.dag.yaml` (warning toast) and with `confounding.dagitty.txt` (5 nodes, 7 edges, roles, `Opened with 5 warnings`), a cycle file lists its error in the dialog and keeps the graph, pasted YAML opens, pasted dagitty over a graph asks first, pasted bidirected dagitty shows the line-numbered error, both Save as… dialogs show the exact text and download the right file; `canvas`: double-clicking a circle focuses its name with the text selected, adds no node, and typing plus Enter renames it.

Wave 12 (phases 21–23):

- `src/store/graphStore.test.ts` (phase 21 addition): each recording action pushes exactly one entry and clears `future`; no-op actions (failed rename and connect, equal patches, same positions, removing nothing, the same name) push nothing and keep the same `graph` object; `undo` then `redo` returns the identical graph objects; `past` stops at `HISTORY_LIMIT` and drops the oldest; `replaceGraph` empties both stacks; `moveNodes` with three moves is one step; `undo` keeps a selection that still exists, clears one that does not, clears `focusNameOf` and increments `revision`; `undo` and `redo` on empty stacks change nothing.
- `e2e/undo.spec.ts` (phase 21): add a node, Ctrl+Z removes it, Ctrl+Shift+Z and Ctrl+Y bring it back; the rail's Undo and Redo do the same and are disabled at the ends; renaming a node and undoing while it stays selected shows the old name in the side panel; a box-selected two-node drag is undone in one step; Ctrl+Z while typing in the name field does not change the graph; after a reload Undo is disabled; the undone state is what autosave stores.
- `src/lib/imageExport.test.ts` (phase 22): `EXPORT_PALETTE` equals the `:root` tokens in `index.css`; for `smoking.dag.yaml`, `toSvg` has one `<circle>` per node, one `<text>` (or `<tspan>`) per wrapped line, one line and one arrowhead per edge, the size from `svgSize`, the `<title>`, and the `@font-face` only with `fontDataUrl`; names with `<`, `&` and quotes are escaped; an empty graph gives a valid empty SVG; `toTikz` has the header comments, one `\node` per node and one `\draw` per edge, only the colours in use, LaTeX-escaped names (`R&D_1 %`, which `wrapLabel` splits into two lines, gives `R\&D\_1\\\%`) and wrapped lines joined by `\\`; `imageFileName` gives `smoking-and-birth-weight.svg|.png|.tex` and `graph.svg` without a name.
- `e2e/export.spec.ts` (phase 22): with no nodes the dialog shows the empty message and Download is disabled; with `smoking.dag.yaml` open, SVG shows the preview and downloads `<slug>.svg` starting with `<svg`; PNG with Scale 2× shows the pixel size and downloads a file starting with the PNG signature (`89 50 4E 47`); TikZ shows the code, Copy toasts, and Download gives `<slug>.tex` equal to the textarea text.
- `src/lib/shareLink.test.ts` (phase 23): `decodeShare(SHARE_PREFIX + await encodeShare(g))` returns a graph whose `toYaml` equals `g`'s for `smoking.dag.yaml` and the empty graph; the payload uses only `A–Z a–z 0–9 - _`; `shareUrl` uses the given base; a hash without the prefix gives null; a damaged or truncated payload gives the exact damaged-link message; a valid payload of invalid YAML gives `parseYaml`'s errors.
- `e2e/share.spec.ts` (phase 23, with clipboard permissions granted): Share copies a URL starting with the page URL and `#g=` and toasts; opening that URL in a fresh context (empty storage) shows the graph, the toast, no welcome slides and no fragment in the address bar; opening it over a different stored graph shows the dialog, Keep my graph keeps the stored graph and Open shared graph replaces it; a damaged link shows the error toast and keeps the stored graph; a reload after opening does not ask again.

Causal analysis (phases 24–30):

- `src/model/analysis/dsep.test.ts` (phase 24): `ancestors` and `descendants` include the start nodes; chain, fork and collider cases of `dConnected` with and without conditioning, including conditioning on a collider's descendant; `reachable` from several start nodes; agreement with the gallery's reference independencies (each listed pair is d-separated by its set) and adjacency (adjacent pairs are always d-connected).
- `src/model/analysis/index.test.ts` (phase 24): `rolesOf` sorts by graph order and leaves latent nodes out of `observed`; `analyze` gives `'no-exposure-or-outcome'` with null results when X or Y is empty and `'needs-single'` with two exposures; an empty graph does not throw.
- `src/store/uiStore.test.ts` (phase 24 addition): defaults; `setAnalysisOn` writes `graphcreator:analysis`; `readAnalysisOn` with null, throwing or malformed storage gives the defaults and keeps known keys from partial JSON; `setSidePanelTab` and `setHoverNodeIds`.
- `src/store/graphStore.test.ts` (phase 24 addition): `setAdjustedSet` marks the given nodes, returns other adjusted nodes to `other`, never changes exposure, outcome, latent or selected nodes, is one undo step and records nothing when nothing changes.
- `src/lib/copy.test.ts` (phase 24): `joinNames` for zero, one, two and three names; the 5.8 templates fill in names.
- `src/model/analysis/adjustment.test.ts` (phase 25): `properCausalNodes`, `forbidden` and `properBackdoorGraph` on mediation; `isAdjustmentSet` on the textbook cases (confounder needed, mediator forbidden, collider opens M-bias); minimal sets equal `reference.json` for every gallery file (as sets of names, order-free); brute force over subsets equals `minimalAdjustmentSets` on the gallery and 200 seeded random DAGs; selected nodes are never listed; `selection-bias`, `selection-confounder` and `selection-on-exposure` give no set with `selectionBias` true, and `selection-recoverable` gives `C`; `isAdjustmentSet` and the minimal sets match the `random` section; `truncated` at `MAX_SETS` on a generated graph with many sets.
- `src/model/analysis/paths.test.ts` (phase 26): the smoking graph gives one open causal and one open biasing path; adjusting SES closes the biasing path; M-bias's path is closed until Z is adjusted; an adjusted mediator closes the causal path; the edge lists follow "biasing wins"; inner exposure or outcome nodes end a path; a generated graph with more than `PATH_LIMIT` paths gives `truncated` and empty lists; open flags equal `reference.json`.
- `src/model/analysis/independencies.test.ts` (phase 27): pairs equal `reference.json`; every `given` d-separates its pair and no proper subset does; latent and selected nodes never appear; adjacent pairs never appear.
- `src/model/analysis/instruments.test.ts` (phase 28): the `instrument` gallery file gives Z unconditionally; a conditional instrument case gives the right `given`; the results equal `reference.json`; `'needs-single'` with two exposures.
- `e2e/analysis.spec.ts` (phase 30): with `smoking.dag.yaml` open, the Analysis tab shows `Total effect of Maternal smoking on Birth weight.`, the set `SES` and "not sufficient"; Use this set marks SES as Adjusted (its circle's `data-role`), the report turns "sufficient", and Ctrl+Z undoes it; switching Paths on gives `data-path="causal"` and `data-path="biasing"` edges, and adjusting SES removes the biasing one; hovering the SES row shows the rim on the SES circle; switching Report off hides its text, and the switch states survive a reload; clicking a node switches to Edit; a pasted dagitty graph with two exposures shows the instruments message; with no exposure the empty-state line shows.


Import and export (phases 31–40):

- `src/model/exchange.test.ts` (phase 31): `encodeList`/`decodeList` round-trip items containing `;`, `\` and spaces, and drop empty items. `buildGraph`:
  - gives the role, type and list errors with their exact messages, all at once;
  - turns a number into text and a single text into a one-item list;
  - merges duplicate edges keeping the first's evidence;
  - gives the missing-node edge error;
  - converts centres to top-left positions with `nodeDiameter`;
  - lays out and warns when a centre is missing;
  - passes cycles, self-edges and `levels` on a continuous node through `validateGraph`;
  - keeps the parser's warnings first.
- `src/model/palette.test.ts` (phase 31): both palettes equal the `:root` and `.dark` tokens in `index.css`, and the light background is `#ffffff`.
- `src/model/fileFormat.test.ts` (phase 31 additions):
  - the extensions `.gml`, `.dot`, `.gv` and `.json` force their format;
  - `graph [` after `#` comments is GML;
  - `digraph`, `strict digraph` and `digraph G {` after comments are DOT;
  - JSON with a `nodes` array is networkx;
  - `{a b} -> c` and `{ "x": 1 }` without `nodes` are dagitty;
  - every phase 18 case is unchanged;
  - `exportFileName` gives `smoking-and-birth-weight.gml` etc. and `graph.mmd` without a name;
  - `exportText` dispatches to each writer and passes `details` to dagitty only.
- `src/store/uiStore.test.ts` (phase 31 addition): `dagittyDetails` is false by default and with null, throwing or unknown storage; `setDagittyDetails` writes `'1'` and `'0'`.
- `src/model/dagitty.test.ts` (phase 32 additions):
  - `toDagitty(g, { details: true })` for the 4.1 graph equals the 4.2 example;
  - without the option the output is unchanged;
  - items with `;`, `\` and `"` survive a round trip;
  - an edge chain with `[gc.note="x"]` gives the note to both edges;
  - an unknown `gc.foo` warns;
  - a bad `gc.var_type` gives its line-numbered error;
  - `gc.levels` on a continuous node gives `validateGraph`'s error;
  - the full round trip with details equals `toYaml(g)` without the graph name.
- `src/model/gml.test.ts` (phase 33):
  - the 4.15 example;
  - the round trip on every valid YAML and dagitty fixture;
  - `&#34;`, `&amp;` and non-ASCII names survive;
  - `label` is the safe id and `name` the full name;
  - a networkx-written GML without `name` keys opens with the labels as names;
  - `directed 0`, `multigraph 1`, a missing `graph [`, an unclosed list and an edge to an unknown id give their messages;
  - yEd's `graphics [ x y w h type ]` keys are silent;
  - an unknown key warns once.
- `src/model/dot.test.ts` (phase 34):
  - the 4.15 example;
  - the round trip;
  - `digraph { A -> B; B -> C; A -> C }` opens with three nodes and a layout warning;
  - `A -> {B C}`, `subgraph cluster_x { … }`, `a -> b -> c`, `"a b" -> c`, `"x" + "y"` concatenation and comments work;
  - `pos` converts from points with y up;
  - `graph {`, `--`, `<html>` labels and ports give their messages;
  - styling keys are silent and `weight` warns;
  - `label="\N"` means the id.
- `src/model/networkx.test.ts` (phase 35):
  - the 4.15 example shape (pretty-printed, short arrays on one line);
  - the round trip;
  - `links` instead of `edges` is accepted;
  - numeric ids become text;
  - invalid JSON, a missing `nodes`, `"directed": false` and `"multigraph": true` give their messages;
  - an unknown node key warns once;
  - `pos` must be two numbers.
- `src/model/bnlearn.test.ts`, `tetrad.test.ts`, `mermaid.test.ts` (phase 36):
  - the three 4.15 examples;
  - an empty graph (`''` for bnlearn; the two headers for Tetrad; only `flowchart TB` for Mermaid);
  - safe ids in bnlearn and Tetrad;
  - Mermaid escapes `"`, `<`, `>` and `#`, and has a `classDef` only for the roles in use.
- `src/lib/imageScene.test.ts` (phase 37):
  - one circle and one set of text lines per node, one edge per edge;
  - the size equals `svgSize`;
  - the legend lists only the roles in use in `ROLES` order;
  - each corner is chosen when the earlier ones are blocked (four hand-built graphs);
  - `'beside'` widens the image by 112 px;
  - the dark theme swaps only colours;
  - no legend without the option.
- `src/lib/imageExport.test.ts` (phase 37 additions):
  - for every valid fixture, the light SVG without a legend equals the output before phase 37 (a stored snapshot made at the start of the phase);
  - the dark SVG uses the dark background and role colours;
  - the legend's `<rect>`, swatches and labels appear;
  - `toTikz` with `legend` adds the box, the swatches, the labels and `gcBorder`/`gcText`, and without it is unchanged.
- `src/lib/pdfExport.test.ts` (phase 38):
  - for a hand-built scene, the file starts with `%PDF-1.4` and ends with `%%EOF`;
  - every `xref` offset points at its `n 0 obj`;
  - the `/MediaBox` is the scene size × 0.75;
  - the stream has the flip `cm`, one `B` per circle and one `Tj` per text line;
  - a centred line starts at the AFM-measured offset;
  - `(`, `)` and `\` are escaped;
  - `é` maps to its WinAnsi byte and `β` to `?`;
  - the `/Title` holds the graph name.
- `src/model/formats.reference.test.ts` (phase 40):
  - every sample file equals its writer's current output;
  - for every sample and tool in `reference.json`, the nodes are the safe ids and the edges are the graph's edges;
  - networkx sees the same `name`, `role`, `var_type`, `levels`, `description`, `unit` and `evidence`;
  - pydot sees the `gc_*` attributes;
  - causal-learn sees the directed edges;
  - bnlearn sees the arcs;
  - dagitty-R keeps the `gc.*` attributes.
- `e2e/formats.spec.ts` (phase 40):
  - each Save as… item opens its dialog with `exportText`'s text, and Download gives its file name;
  - the dagitty checkbox adds `gc.var_type` and survives a reload;
  - pasting the smoking graph's GML, DOT and JSON exports into Open recreates it (4 nodes, 4 edges, SES with type ordinal);
  - a pasted `digraph { A -> B }` opens;
  - a `graph [ directed 0 ]` paste shows the error and keeps the graph.
- `e2e/export.spec.ts` (phase 40 additions):
  - PDF shows the preview and the points line, and downloads a file starting with `%PDF-`;
  - Theme Dark changes the preview's background and is hidden for TikZ;
  - Legend adds the legend to the downloaded SVG and the TikZ text;
  - Theme and Legend keep their values when the dialog is reopened.
- `e2e/files.spec.ts` (phase 40 update): the Open dialog's new description.

- `src/lessons/helpers.test.ts` (phase 41):
  - `practiceGraph` reads a YAML text and throws `Practice graph does not parse: …` on a bad one;
  - every predicate helper is true and false on hand-built contexts;
  - `stepDone` combines the pick and the check, and a step with neither is done.
- `src/store/lessonEvents.test.ts` (phase 41):
  - nothing is recorded before `startRecording` or after `stopRecording`;
  - `clearEvents` empties the log but keeps recording.
- `src/lib/lessonProgress.test.ts` (phase 41):
  - a round trip keeps the ids, sorted;
  - null storage, a throwing storage, bad JSON and a non-array give an empty set, and non-string items are skipped.
- `src/store/lessonStore.test.ts` (phase 41 additions):
  - events are cleared by `start`, `next` and `back`, and recording stops on `exit`;
  - a wrong node selection in a pick step is recorded once, and selecting an edge, nothing or the answer is not;
  - `revealAnswer` selects the first answer and sets `revealed`;
  - finishing adds the id to `done` and writes it, and closing does not.
- `src/store/uiStore.test.ts` and `graphStore.test.ts` (phase 41 additions):
  - `openLessons` and `closeLessons` set `lessonsOpen`;
  - `undo` records an `undo` event during a lesson only when it changed the graph.
- `src/lessons/tour.test.ts` (phase 41 update): the same cases through `check(ctx)`.
- `src/lessons/<id>.test.ts` (phases 45–47), for every lesson:
  - the practice graph parses, and its nodes, roles and edges are those of the YAML in LESSONS.md;
  - each step's texts equal LESSONS.md, and bodies have at most three sentences;
  - every name in a pointer, a pick's answers or a pick's hints exists in the practice graph, and every hint key is a node that is not an answer;
  - each step with a check is not done on the graph as it is when the step starts (the practice graph with every earlier step's task applied) and done after its scripted task;
  - each pick is answered by selecting an answer node and not by any other node;
  - every item under the lesson's "Claims" holds, computed with `analyze`, `ancestors`, `descendants`, `dConnected` or `canAddEdge`.
- `e2e/lessons.spec.ts` (phase 48):
  - Help → Lessons… lists the two groups with 4 and 10 lessons, and `0 of 14 finished.`;
  - lesson 6 (Confounding) start to finish:
    - the pointer label "Common cause" shows above SES;
    - picking Birth weight shows its hint, and picking Maternal smoking as well shows Show answer;
    - Show answer selects SES and shows the explanation;
    - setting SES to Adjusted and opening the Analysis tab completes the steps;
    - Finish restores the user's graph;
  - after a reload, lesson 6 shows the Finished check, and the count reads `1 of 14 finished.`;
  - lesson 3 step 5: drawing Birth weight → SES is refused, and the step is done;
  - lesson 4: Save → Download, Save as… → dagitty… → Copy, Export as PDF, Share and Ctrl+Z each complete their step;
  - every lesson can be started from the dialog and closed again, leaving the user's graph unchanged.

## 10. Open issues

- **Hosting and deployment:** the host (GitHub Pages, Cloudflare or an EU host) is not chosen. When it is, add a deploy job that runs after CI passes on `develop` and publishes to `production`, and decide on a custom domain.
- **Raw exception text in messages:** `Could not read <file>: …`, `Could not export the graph: …` and `Could not download the file: …` append the exception's own message, which the voice rules (5.7.8) say to translate. Rewrite them case by case when the failure modes are known.
- **Lessons:** the course in [LESSONS.md](LESSONS.md) is built (waves 19–21). Left for later: resuming a lesson mid-way, translations of the lesson texts, "Lesson: …" links at the end of info tooltips, and lessons on bidirected edges and direct effects once the app supports them.
- **Analysis switches after a lesson:** a lesson that asks the user to switch on Paths, Instruments or Independencies leaves the switch on afterwards, because the switches are a stored viewer preference (4.14).
- **Text measurement:** circle sizes come from an estimate (5.7.6). If names visibly overflow or float in their circles, tune the 7.5 px and 16 px constants against the rendered font rather than switching to DOM measurement.
- **Hidden evidence chips:** edge labels render below nodes, so the evidence chip of an edge whose line runs under a third circle is hidden by that circle.
- **Bundle size:** the production build is one JavaScript chunk over 500 kB, and Vite warns about it. Code splitting (for example loading the dialogs lazily) can come later if load time matters.
- **Share links and hosting:** a link names the address it was made on, so links made on a local or preview build only open there. Once a host and domain are chosen, links should be made on that domain.
- **Analysis reference:** `reference.json` was made with one dagitty-R version (recorded in the file). If a later dagitty-R gives different answers, decide case by case which is right before regenerating it.
- **Analysis on large graphs:** the analysis runs on every change in the main thread. If large graphs feel slow, compute it lazily per switched-on section or in a Web Worker.
- **PDF text:** the PDF uses the standard Helvetica font without embedding it, so characters outside WinAnsi (Greek letters, for example) appear as `?`, and the text looks slightly different from the canvas's IBM Plex Sans. Embedding a TrueType subset of IBM Plex Sans would fix both, at the cost of a font file in the bundle.
- **Legend label weight:** the legend asks for weight 400, but only IBM Plex Sans 500 is embedded, so with the embedded font the labels render at 500. Embedding the 400 face (about 30 kB more) would fix it.
- **Formats without positions or roles:** Mermaid lays the graph out itself, and bnlearn and Tetrad keep only the structure, Tetrad dropping the latent role as well. The dialog notes say so.
- **Real-tool reference:** `src/model/__fixtures__/formats/reference.json` was made with the tool versions recorded in it. If a later networkx, pydot, causal-learn, bnlearn or dagitty reads the samples differently, decide case by case before regenerating.
- Everything in [IDEAS.md](IDEAS.md).
