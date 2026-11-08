# GraphCreator spec

**Status:** spec agreed 2026-11-08; v1 implemented (waves 1–5, phases 1–9 done). The "Calm teal" redesign (5.7), agreed on 2026-11-08, is implemented (waves 6–8, phases 10–16 done). The light/dark toggle (wave 9, phase 17) is implemented. The top bar rework and double-click renaming (wave 10, phase 18) are implemented. Sections 4.5–5.3 and 5.7 describe the app as it is now; 5.6 records the v1 look. This document is the brief for the implementation sessions: phases are grouped into waves (section 8); a wave can be built by parallel sub agents, one commit per phase. Deferred features are in [IDEAS.md](IDEAS.md). [research.md](research.md) is background reading only; where it disagrees with this spec, this spec wins.

## 1. Purpose

Epidemiologists draw causal DAGs (directed acyclic graphs) to reason about confounding and to report their assumptions. DAGitty is the standard tool, but it treats a DAG as a picture: nodes carry roles and positions, nothing more. GraphCreator is its own browser-based DAG editor in which the DAG is a **documented model**. Every variable can carry a type (categorical, ordinal, continuous, discrete), ordered levels, a description and a unit, and every edge can carry evidence and a note. Its native format is a versioned YAML file. It is compatible with DAGitty through import and export of the dagitty text format, but it is not a DAGitty clone.

v1 delivers: drawing, typed variables and metadata, the YAML format, dagitty import/export and auto-layout. Causal analysis, simulation-code export and everything else listed in [IDEAS.md](IDEAS.md) come later.

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
    __fixtures__/        .dag.yaml and .dagitty.txt fixture files for tests
  store/
    graphStore.ts        Zustand store wrapping the model operations (4.6)
    uiStore.ts           canvas tool, connect source, welcome dialog, autosave status (4.7, phase 10)
    lessonStore.ts       active lesson and the set-aside user graph (4.8, phase 10)
    autosave.ts          localStorage autosave (5.5)
  lessons/               lesson types and the tour lesson (5.7.10, phase 10)
  components/
    Canvas.tsx, SidePanel.tsx, NodeEditor.tsx, EdgeEditor.tsx, ListEditor.tsx,
    OpenDialog.tsx, CodeDialog.tsx, IssuesDialog.tsx                     (phase 18; were DagittyImportDialog/DagittyExportDialog)
    TopBar.tsx, ToolRail.tsx, useToolShortcuts.ts, SavedIndicator.tsx    (phase 12)
    InfoTip.tsx, RolePicker.tsx                                          (phase 13)
    WelcomeDialog.tsx                                                     (phase 14)
    LessonPanel.tsx                                                       (phase 15)
    canvas/CircleNode.tsx, canvas/FloatingEdge.tsx, canvas/canvas.css     (phase 11)
    (Toolbar.tsx, DagNode.tsx: v1 parts, deleted in phase 16)
    ui/                  shadcn/ui generated components
  lib/download.ts        downloadText helper for Save and dagitty export
  lib/copy.ts            tooltip and role texts (5.7.8, phase 10)
  lib/geometry.ts        edge end points between circles (phase 11)
  lib/welcome.ts         first-visit flag for the welcome slides (phase 14)
  App.tsx                layout: top bar; tool rail, optional lesson panel, canvas, side panel (5.1)
e2e/                     Playwright tests
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

#### `toDagitty(graph: Graph): string`

Plain dagitty; no GraphCreator metadata (types, levels, description, unit, evidence, note are not written).

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

Maps node id → dagitty id: replace whitespace runs with `_`, then every character outside `[0-9A-Za-z_.]` with `_`; empty result → `node`. Assign in node order; on collision append `_2`, `_3`, … (the first keeps the plain id). Each Unicode code point becomes one `_`. Exported ids always match dagitty's bareword pattern, so no quoting is needed on export.

Round trip: `parseDagitty(toDagitty(g))` gives the same names (via `label`), roles, edges and positions (within 0.1 px) as `g`; metadata is lost by design.

#### `detectFormat(text, fileName?)` and `parseGraphText(text, fileName?)` (`src/model/fileFormat.ts`, phase 18)

Open (5.4) takes either format. `detectFormat` returns `'yaml'` when the file name ends in `.yaml`/`.yml`, or when a line starts with one of the file's top-level keys (`schema:`, `name:`, `nodes:`, `edges:`); otherwise `'dagitty'` (dagitty's `dag { … }` header is optional, so it cannot be required). `parseGraphText` calls `parseYaml` or `parseDagitty` accordingly and returns its `Result<Graph>` unchanged.

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
export function isStepDone(): boolean   // current step's isDone(useGraphStore.getState().graph); true when no lesson
```

The set-aside graph is held in module scope next to the store (not in the store's state), so autosave never sees it. `start` while a lesson is active first exits the old one. `start` with an unknown id throws `Unknown lesson "<id>".` before anything changes, so a running lesson keeps running. `next` on the last step calls `exit`, but like every step only once `isStepDone()` is true. Lessons are looked up in `LESSONS` (5.7.10).

## 5. Behaviour

### 5.1 Screen layout

```
+--------------------------------------------------------------------------------+
| (o->o) [Graph name____] | New  Open…  Save|▾ |       [⚠ 1 warning] [Help] [☾] |  top bar, 48 px
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

- **Top bar** (`TopBar`, `role="toolbar"`, `aria-label="Toolbar"`): logo; graph name input (`aria-label="Graph name"`); New; Open…; Save as a split button: **Save**, a 1 px vertical divider (16 px tall) and a narrow icon-only ▾ button, grouped with no gap between them, (`aria-label="Save as…"`) whose menu has **GraphCreator…** and **dagitty…** (5.4); on the right the warnings badge (`N warning(s)`, hidden when 0; opens IssuesDialog, clicking a warning selects its node), **Help** (`CircleHelp` icon; opens the welcome slides, 5.7.9) and an icon-only **Dark mode** toggle (moon in light mode, sun in dark mode; `aria-pressed` gives the state; tooltip "Dark mode"). File buttons are ghost buttons with icon and word. There is no separate dagitty menu (phase 18).
- **Tool rail** (`ToolRail`, `role="toolbar"`, `aria-label="Canvas tools"`, `aria-orientation="vertical"`, 56 px wide): icon-only buttons, each with an accessible name, `aria-keyshortcuts` and a tooltip "Name  Key": Select (V), Add node (N), Connect (C), a divider, Auto-layout (L), Fit view (F), Zoom in (+), Zoom out (−). The active tool is solid teal.
- **Lesson panel:** only while a lesson runs (5.7.10); 300 px, between the rail and the canvas.
- **Canvas:** React Flow, fills the remaining space, teal-tinted background (`--canvas`), no dot grid, no minimap, no React Flow attribution, no React Flow `<Controls>` (the rail has zoom and fit). The saved indicator sits in the bottom-right corner (5.2).
- **Side panel:** fixed width (320 px). Shows NodeEditor or EdgeEditor for the single selected item. With nothing selected it shows a cheat sheet (exact text in 5.7.8): add a node, connect, delete, select several.

### 5.2 Canvas interactions

- **Add node:** double-click empty canvas (React Flow zoom-on-double-click is disabled), or the Add node tool (N): with it active, the next click on empty canvas adds a node there and the tool returns to Select. The rail's Add node button with the tool already active adds a node at the viewport centre. The new node is centred on the click point (its box is `nodeDiameter(name)` wide), gets `defaultNodeName`, becomes selected, and the side panel's name field is focused with its text selected.
- **Connect by dragging:** hovering a circle shows a teal rim (5.7.7). Dragging from the rim starts a connection; dragging the middle of the circle moves it. While a connection is in progress, a dashed teal line follows the pointer, and any circle under the pointer is a drop target: a valid one gets a solid teal ring, an invalid one a red ring. Validity comes from `canAddEdge` through React Flow's `isValidConnection`. Releasing over an invalid target shows a toast with the `EdgeCheck` message and adds nothing. Implementation: React Flow's "easy connect" pattern. Each node has a ring-shaped source handle on its rim and a target handle covering the whole circle that takes pointer events only while `useConnection().inProgress` is true.
- **Connect mode (C):** with the Connect tool active, clicking a circle picks it as the source (`pickConnectSource`, shown with the hover rim kept on), and clicking a second circle calls `connect`; an invalid pair shows the same toast. The tool stays active for the next edge. Escape, or clicking empty canvas, clears the picked source.
- **Shortcuts:** V, N, C set the tool; L runs auto-layout and fits the view; F fits the view; + and − zoom; Escape returns to Select and clears the picked source. Shortcuts are ignored while focus is in a text field, select or textarea, and while a dialog is open.
- **Rename by double-click:** double-clicking a circle while the Select tool is active calls `focusName`: the node is selected and the side panel's name field is focused with its text selected, as after adding a node. It never adds a node (the pane double-click handler only reacts to the pane itself).
- **Select:** click a node or edge. Multi-select with Shift-click or box-select is React Flow default and is only used for deletion and moving.
- **Delete:** Delete or Backspace (when focus is not in a text field) removes the selected nodes and edges via `removeNodes` / `removeEdges`.
- **Move:** dragging updates positions; the store commits with `moveNode` on drag stop.
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
- **Save:** downloads `toYaml(graph)` as `<slug>.dag.yaml` (4.1). No server involved.
- **Save as… menu (`CodeDialog`, phase 18):** **GraphCreator…** opens "Save as GraphCreator": a read-only textarea (`aria-label="GraphCreator code"`) with `toYaml(graph)`, the note "The GraphCreator file keeps everything: roles, variable types, levels, descriptions, units, evidence and positions.", Copy and Download (`<slug>.dag.yaml`). **dagitty…** opens "Save as dagitty": textarea `dagitty code` with `toDagitty(graph)`, the note "Variable types, levels, descriptions, units and evidence are not included in dagitty files. Save as GraphCreator to keep them.", Copy and Download (`<slug>.dagitty.txt`). Copy toasts `Copied <GraphCreator|dagitty> code to the clipboard.`
- **Auto-layout:** `autoLayout(graph)`, then fit the view.
- **During a lesson** (5.7.10): New and Open… are disabled, with the tooltip "Not available during a lesson." Save and the Save as… menu work on the practice graph.

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

All colours are CSS variables in `src/index.css`. Light values sit in `:root`, dark values in `.dark` (set by `next-themes` when the user switches to dark with the top bar's Dark mode toggle). The app starts light, whatever the system setting; the choice is kept in `localStorage` under `graphcreator:theme`. Components use only these variables, never raw hex. Contrast ratios are checked by `src/lib/theme.test.ts` (phase 10): text pairs ≥ 4.5:1; circle outlines, edges and the selection border ≥ 3:1 against `--canvas`.

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
| `PANEL_HELP` | typed `{ title: string; rows: readonly { action: string; how: string }[] }`: the title "Nothing selected." (kept from v1; `e2e/smoke.spec.ts` and `e2e/canvas.spec.ts` check it) followed by four rows: "Add a node" / "Double-click the canvas or press N"; "Connect" / "Drag from the rim of a circle, or press C"; "Delete" / "Select, then press Delete"; "Select several" / "Shift-click" |

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

The six real lessons are deferred to [IDEAS.md](IDEAS.md). This round builds the engine and one simple tour lesson.

```ts
// src/lessons/types.ts
export interface LessonStep {
  title: string
  body: string                       // at most three short sentences
  task?: string                      // shown as "Try it: <task>"; omitted on the last step
  isDone(graph: Graph): boolean      // the Next button is enabled when this returns true
}
export interface Lesson {
  id: string
  title: string
  sample(): Graph                    // the practice graph loaded when the lesson starts
  steps: LessonStep[]
}
// src/lessons/index.ts
export const LESSONS: Lesson[]       // [tourLesson]
export function findLesson(id: string): Lesson | undefined
```

**Tour lesson** (`src/lessons/tour.ts`, id `tour`, title "Drawing your first DAG", `sample()` returns `emptyGraph()`):

| # | Title | Body | Task | `isDone(graph)` |
|---|---|---|---|---|
| 1 | Add a variable | "Each circle is a variable." | "Double-click the canvas, or press N and click." | `graph.nodes.length >= 1` |
| 2 | Name it | "Give the variable a name in the panel on the right." | "Rename the node to Smoking." | some node's name is not `defaultNodeName`-style (`/^Node \d+$/` does not match) |
| 3 | Draw a cause | "An arrow means: this variable affects that one." | "Add a second node, then drag from the rim of one circle to the other." | `graph.edges.length >= 1` |
| 4 | Give it a role | "A role says what the variable is in your question. The color shows it." | "Set the role of one node to Exposure." | some node has role `exposure` |
| 5 | Done | "That is all you need to start. Your own graph comes back when you finish." | none | always true |

**Lesson panel:** 300 px, `--background`, border on the right, 20 px padding. From top to bottom:
- a header with the label "LESSON · STEP n OF m" (label style) and a close button (`aria-label="Close lesson"`, calls `exit()`);
- the step title (title style) and the body;
- a teal callout (`--accent`, `--accent-foreground`, `CircleCheck` icon) with "Try it: <task>", which turns into "Done." with a check once `isDone` is true;
- a row of segmented progress bars (`--primary` for steps up to the current one, `--border` for the rest);
- Back (ghost) and Next (primary; disabled until done; reads "Finish" on the last step).

**Running a lesson** (4.8): the user's graph is set aside and the practice graph loaded with `replaceGraph`. Autosave pauses (`autosave` status `paused`, phase 16). Leaving the lesson by Finish or close restores the user's graph; the practice graph is discarded.


- Scripts in `package.json`: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint` (`oxlint`), `typecheck` (`tsc -b`; the tsconfigs set `noEmit`), `test` (`vitest run`), `test:watch` (`vitest`), `test:e2e` (`playwright test`), `format` (`prettier --write .`).
- Unit tests live next to the code as `src/**/*.test.ts`; fixtures in `src/model/__fixtures__/`. Vitest config is the `test` block in `vite.config.ts` (`environment: 'node'`, `include: ['src/**/*.test.ts']`).
- Playwright: `playwright.config.ts`, tests in `e2e/`, Chromium only, `webServer` runs `npm run build && npm run preview -- --port 4173 --strictPort`, `baseURL: 'http://localhost:4173'`.
- Node version pinned in `.nvmrc` (`26`).
- CI: `.github/workflows/ci.yml`, on push to `develop` and on pull requests: checkout, setup-node from `.nvmrc` with npm cache, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:e2e`. Deployment from `develop` to `production` is added once a host is chosen (see Open issues).
- Claude Code: `.claude/settings.json` has a Stop hook `npm run typecheck 1>&2 || exit 2`. CLAUDE.md lists the scripts and the rules: `docs/SPEC.md` is the source of truth; `src/model` has no React imports; no backend; MIT, no GPL code.
- Path alias `@/` → `src/` (required by shadcn/ui), set in `tsconfig.json`, `tsconfig.app.json` and `vite.config.ts`. `paths` only, without `baseUrl` (TypeScript 7 deprecates `baseUrl`).
- shadcn/ui is initialised with the Radix base and the `radix-nova` preset (`npx shadcn@latest init -t vite -b radix -p nova`). This adds `radix-ui`, `lucide-react`, `class-variance-authority`, `cn` (shadcn's own clsx + tailwind-merge replacement), `tw-animate-css`, `@fontsource-variable/geist`, `next-themes` (used by the `sonner` wrapper) and `shadcn` (for `shadcn/tailwind.css`). Generated files in `src/components/ui/` are exempt from oxlint's `react/only-export-components` (override in `.oxlintrc.json`).
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
| v1 editor extras | Auto-layout (dagre) | Undo/redo; share link; list view | User's choice; others go to IDEAS.md. |
| Storage | One autosaved graph + YAML files | Local library of named graphs | Simple; files are the durable store. |
| Image export | None in v1 | SVG; PNG; TikZ | User's choice; goes to IDEAS.md. |
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
| Dark theme mechanism | `next-themes` (`attribute="class"`; `defaultTheme="system"` until phase 17, then `"light"`); React Flow `colorMode` follows `resolvedTheme` | CSS media query only | `next-themes` is already installed and used by the sonner wrapper. |
| Theme toggle (2026-11-08, phase 17) | Two-state Dark mode button at the right end of the top bar; light by default even when the system is dark; stored in `graphcreator:theme` | Follow the system only; three-way light/dark/system switch | User's choice. Closes the former open issue. |
| Help button (phase 18) | The top bar's Lessons button is called Help | Keep "Lessons" | User's choice. It still opens the welcome slides. |
| Open (phase 18) | One Open dialog: paste GraphCreator or dagitty code, or Open file…; the format is recognised by `detectFormat` | Separate YAML Open and dagitty Import… | User's choice; removes the dagitty menu. Errors stay inside the dialog instead of a separate IssuesDialog. |
| Confirm before Open (phase 18) | Open asks before replacing a graph that has nodes, like New and the old dagitty import | Replace without asking (v1 YAML Open) | One rule for every way of replacing the graph now that Open and import are one action. |
| Save (phase 18) | Split button: Save downloads `.dag.yaml` as before; the ▾ menu offers GraphCreator… and dagitty…, each a code dialog with Copy and Download | dagitty menu; a direct dagitty download | User's choice. The YAML code dialog is new and mirrors the dagitty one. |
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

## 8. Implementation phases

Phases form a dependency graph and are grouped into waves. Every phase in a wave depends only on phases in earlier waves and owns a disjoint set of files, so a wave can run in parallel (one sub agent per phase, "run wave N") or phase by phase. Each phase is one commit and leaves the full test suite passing. Status: `[ ]` to do, `[x]` done (with the commit hash).

General rules for every phase:

- Read the whole spec first; sections 3–7 and the decisions table are binding.
- Only create or change the files the phase owns. All other files are read-only for it. Code against the contracts of earlier phases; don't change them.
- Use only the shadcn/ui components already in `src/components/ui/` (phase 1 added `button`, `input`, `select`, `textarea`, `dialog`, `dropdown-menu`, `sonner`; phase 3 adds `label` and `badge`; phase 10 adds `tooltip`). If another is needed, stop and report it.
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

Wave 4 is the wide one: its five phases share no files, and each codes against the contracts fixed in phase 3 (the store API in 4.6, the `yaml.ts`/`dagitty.ts` signatures in 4.1–4.2, the component contracts below). The UI phases 6–8 cannot be seen in the app until phase 9 mounts them, so their behaviour is tested end to end in phase 9.

**Component contracts (fixed here, used by phases 6–9).** Each component is a named export with no props that reads and writes the store through `useGraphStore`:

- `Canvas()` in `src/components/Canvas.tsx`, `SidePanel()` in `SidePanel.tsx`, `Toolbar()` in `Toolbar.tsx`.
- `App` (phase 9) renders, inside one `<ReactFlowProvider>` from `@xyflow/react`: `<Toolbar />` on top, then `<Canvas />` and `<SidePanel />` side by side, plus `<Toaster />` from `@/components/ui/sonner`. Because of the shared provider, `Toolbar` may call `useReactFlow()` (for `screenToFlowPosition` and `fitView`), and `Canvas` keeps the `ReactFlow` element itself.
- Toasts are raised with `toast()` from `sonner`.
- Selecting from outside the canvas (e.g. IssuesDialog) goes through the store's `select` action; `Canvas` reflects `selection` in React Flow's `selected` flags.
- Fitting the view after Open, Import and Auto-layout is done by `Toolbar` with `fitView()`.

**Redesign contracts (fixed here, used by phases 10–16).** Waves 6–8 rebuild the look in the same way as waves 3–5. Phase 10 fixes the tokens, stores, texts and lesson types. Wave 7 builds the new parts in parallel, and all but phase 13 build them as new files the app does not mount yet, so the existing e2e tests keep passing on every commit. Phase 16 switches everything on and updates the e2e tests.

- New components are named exports with no props that read and write the stores: `TopBar()`, `ToolRail()`, `SavedIndicator()`, `WelcomeDialog()`, `LessonPanel()`, plus the hook `useToolShortcuts(): void`. `CircleNode` and `FloatingEdge` are React Flow node and edge components; `src/components/canvas/types.ts` exports `nodeTypes = { circle: CircleNode }`, `edgeTypes = { floating: FloatingEdge }`, `CircleConnectionLine`, and the data types `CircleNodeData = { name: string; role: Role; untyped: boolean; connectSource: boolean }` and `FloatingEdgeData = { evidenceCount: number }`.
- `App` (phase 16) renders, inside `<ReactFlowProvider>`: `<TopBar />` on top; below it, side by side, `<ToolRail />`, `<LessonPanel />` (renders nothing without a lesson), `<main aria-label="Canvas"><Canvas /><SavedIndicator /></main>` and `<SidePanel />`; plus `<WelcomeDialog />` and `<Toaster />`. `App` calls `useToolShortcuts()`. `main.tsx` wraps `App` in `next-themes`' `ThemeProvider` (`attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`, `storageKey="graphcreator:theme"`, `disableTransitionOnChange`; phase 17).
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

### Wave 10: Top bar and renaming [ ]

Phases: 18. Parallel: single phase. Check after the wave: all checks, and a manual run in the browser of Help, Open (paste and file, both formats, an error), Save and both Save as… dialogs, and double-click renaming.

#### Phase 18: Top bar rework and double-click rename [ ]

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
- `e2e/files.spec.ts`: Save downloads a `.dag.yaml` whose text parses back to the same graph; Open of `cycle.dag.yaml` shows the error dialog and leaves the graph unchanged; dagitty import of `confounding.dagitty.txt` creates its nodes and edges; importing `bidirected.dagitty.txt` shows the error; dagitty export text matches `toDagitty`.

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
- e2e (phase 18): the top bar shows New, Open…, Save, Save as…, Help and Dark mode (`smoke`); Help reopens the slides (`welcome`, `lesson`); during a lesson New and Open… are disabled and both Save as… items work (`lesson`); `files`: Open file… with `smoking.dag.yaml` (warning toast) and with `confounding.dagitty.txt` (5 nodes, 7 edges, roles, `Opened with 5 warnings`), a cycle file lists its error in the dialog and keeps the graph, pasted YAML opens, pasted dagitty over a graph asks first, pasted bidirected dagitty shows the line-numbered error, both Save as… dialogs show the exact text and download the right file; `canvas`: double-clicking a circle focuses its name with the text selected, adds no node, and typing plus Enter renames it.

## 10. Open issues

- **Hosting and deployment:** the host (GitHub Pages, Cloudflare or an EU host) is not chosen. When it is, add a deploy job that runs after CI passes on `develop` and publishes to `production`, and decide on a custom domain.
- **Raw exception text in messages:** `Could not save the graph: …`, `Could not read <file>: …`, `Could not export the graph: …` and `Could not download the file: …` append the exception's own message, which the voice rules (5.7.8) say to translate. Rewrite them case by case when the failure modes are known.
- **Lessons:** only the tour exists (5.7.10). The real lessons and lesson features are listed under "Lessons" in [IDEAS.md](IDEAS.md).
- **Text measurement:** circle sizes come from an estimate (5.7.6). If names visibly overflow or float in their circles, tune the 7.5 px and 16 px constants against the rendered font rather than switching to DOM measurement.
- **Lesson viewport:** starting or ending a lesson keeps the current viewport instead of fitting the view, so the practice graph can open zoomed in (up to React Flow's 2×) after a fit on a small graph.
- **Hidden evidence chips:** edge labels render below nodes, so the evidence chip of an edge whose line runs under a third circle is hidden by that circle.
- **Bundle size:** the production build is one JavaScript chunk over 500 kB, and Vite warns about it. Code splitting (for example loading the dialogs lazily) can come later if load time matters.
- Everything in [IDEAS.md](IDEAS.md).
