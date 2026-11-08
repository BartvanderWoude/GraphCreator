# GraphCreator spec

**Status:** spec agreed 2026-11-08, not implemented yet. This document is the brief for the implementation sessions: one phase per session and per commit. Deferred features are in [IDEAS.md](IDEAS.md). [research.md](research.md) is background reading only; where it disagrees with this spec, this spec wins.

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
    result.ts            Result / Issue types
    __fixtures__/        .dag.yaml and .dagitty.txt fixture files for tests
  store/
    graphStore.ts        Zustand store wrapping the model operations; localStorage autosave
  components/
    Toolbar.tsx, Canvas.tsx, DagNode.tsx, SidePanel.tsx, NodeEditor.tsx, EdgeEditor.tsx,
    ListEditor.tsx, DagittyImportDialog.tsx, DagittyExportDialog.tsx, IssuesDialog.tsx
    ui/                  shadcn/ui generated components
  App.tsx                layout: toolbar on top, canvas in the middle, side panel on the right
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
export interface Issue { message: string; line?: number; path?: string }
export type Result<T> =
  | { ok: true; value: T; warnings: Issue[] }
  | { ok: false; errors: Issue[] }
```

Every parser and every operation that can fail returns a `Result`. Messages are complete sentences shown to the user verbatim (e.g. `Node name "Age" is used twice.`).

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

#### `toYaml(graph: Graph): string`

Writes keys in the order of the table (`schema`, `name`, `nodes`, `edges`; node keys `name, role, var_type, levels, description, unit, pos`; edge keys `from, to, evidence, note`), omits undefined, default and empty fields as stated, uses flow style for `levels`, `pos` and `evidence`, and ends with a newline. For a canonical file, `toYaml(parseYaml(text).value) === text`.

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
- `pos="x,y"` → `pos = { x: x * 100, y: y * 100 }` (`DAGITTY_SCALE = 100`).
- `label="..."` → the node's name; without a label the name is the id.
- Any other vertex attribute, and any edge attribute, is ignored with one warning per key: `Ignored dagitty attribute "beta" (not used by GraphCreator).`
- `a -> b -> c` adds `a→b` and `b→c`. `a <- b` adds `b→a`. `{a b} -> c` adds `a→c` and `b→c`; groups work on either side.
- Duplicate edges are merged silently (dagitty does the same). Self-edges and cycles are errors.
- **Rejected with an error naming the line**: `<->`, `--`, `@-`/`-@`/`o-` style edges, graph types `pdag`, `mag`, `pag`, `graph`, `digraph`, and any token the grammar does not allow. Example: `Line 3: bidirected edges (<->) are not supported yet. GraphCreator v1 supports directed edges only.`
- If any node lacks `pos`, `autoLayout` the whole graph and add the same warning as for YAML.
- Imported nodes have no type, so `validateGraph` warnings for untyped nodes follow.
- On name collisions after applying labels (two ids with the same label), error: `Two dagitty nodes have the label "Age".`

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
- One edge line per edge in `graph.edges` order.
- The graph name is not written.

#### `toDagittyIds(nodes: GNode[]): Map<string, string>`

Maps node id → dagitty id: replace whitespace runs with `_`, then every character outside `[0-9A-Za-z_.]` with `_`; empty result → `node`. Assign in node order; on collision append `_2`, `_3`, … (the first keeps the plain id). Exported ids always match dagitty's bareword pattern, so no quoting is needed on export.

Round trip: `parseDagitty(toDagitty(g))` gives the same names (via `label`), roles, edges and positions (within 0.1 px) as `g`; metadata is lost by design.

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
- `updateNode` with a new `varType` clears fields not allowed for it: switching to continuous/discrete or to untyped drops `levels`; switching to categorical/ordinal or to untyped drops `unit`.
- `canAddEdge(s, t)` messages: self `A node cannot point to itself.`; duplicate `This edge already exists.`; cycle when `findPath(t, s)` exists: `A → B → C → A would form a cycle.` (names of s, then the path from t back to s, then s again).

### 4.4 Validation (`src/model/validate.ts`)

```ts
export function validateGraph(graph: Graph): { errors: Issue[]; warnings: Issue[] }
```

- Errors: everything listed in `parseYaml` step 4, applied to an in-memory graph (used by tests and by autosave loading).
- Warnings (non-blocking, shown in the UI):
  - `Node "SES" has no variable type.` (one per untyped node)
  - `Node "SES" is categorical but has fewer than two levels.` (categorical/ordinal with 0–1 levels)
  - `Node "SES" has duplicate levels ("low").`

### 4.5 Layout (`src/model/layout.ts`)

```ts
export const NODE_WIDTH = 160
export const NODE_HEIGHT = 48
export function autoLayout(graph: Graph): Graph
```

Uses `@dagrejs/dagre` with `rankdir: 'LR'`, `nodesep: 50`, `ranksep: 100`, every node `NODE_WIDTH × NODE_HEIGHT`. dagre returns centres; convert to top-left (`x - NODE_WIDTH / 2`, `y - NODE_HEIGHT / 2`) and round to integers. Deterministic for the same input.

## 5. Behaviour

### 5.1 Screen layout

```
+---------------------------------------------------------------+
| [Graph name____] New Open Save | dagitty ▾ | Auto-layout | ⚠ 3 |
+-------------------------------------------+-------------------+
|                                           | Node              |
|     ( E Maternal smoking ) ---> ( O BW )  | Name [_________]  |
|              ^                            | Role [exposure ▾] |
|              |                            | Type [categ.   ▾] |
|          ( SES )                          | Levels  ...       |
|                                           | Description       |
+-------------------------------------------+-------------------+
```

- **Toolbar:** graph name input; New; Open; Save; a `dagitty` menu with Import… and Export…; Auto-layout; a warning badge `⚠ N` showing the `validateGraph` warning count (hidden when 0). Clicking the badge opens the IssuesDialog listing the warnings; clicking a warning selects its node.
- **Canvas:** React Flow, fills the remaining space, with zoom controls and a minimap off by default.
- **Side panel:** fixed width (320 px). Shows NodeEditor or EdgeEditor for the single selected item; with nothing selected it shows a short help text (double-click to add, drag from a node's right edge to connect, Delete to remove).

### 5.2 Canvas interactions

- **Add node:** double-click empty canvas (React Flow zoom-on-double-click is disabled) or toolbar `Add node` (places the node at the viewport centre). The node gets `defaultNodeName`, becomes selected, and the side panel's name field is focused with its text selected.
- **Connect:** each node has a target handle on the left and a source handle on the right. Dragging from a source handle to another node calls `canAddEdge` through React Flow's `isValidConnection`; invalid targets show a red handle while dragging. Releasing over an invalid target shows a toast with the `EdgeCheck` message and adds nothing.
- **Select:** click a node or edge. Multi-select with Shift-click or box-select is React Flow default and is only used for deletion and moving.
- **Delete:** Delete or Backspace (when focus is not in a text field) removes the selected nodes and edges via `removeNodes` / `removeEdges`.
- **Move:** dragging updates positions; the store commits with `moveNode` on drag stop.
- **Node look (`DagNode.tsx`):** a rounded box `NODE_WIDTH × NODE_HEIGHT` with the name (ellipsis if long, full name in `title`), a role badge (`E` exposure, `O` outcome, `L` latent, `A` adjusted, `S` selected, none for other) and a role colour; latent nodes have a dashed border; untyped nodes show a small `⚠` with `title="No variable type"`. Role colours are CSS variables in `src/index.css` (`--role-exposure`, …) chosen so the badge and name keep WCAG AA contrast. Colour is never the only cue.
- **Edges:** straight or default bezier with an arrowhead; selected edges are highlighted.

### 5.3 Editors

- **NodeEditor:** Name (commit on Enter or blur; on error show the message under the field and keep the field red until fixed; Escape reverts), Role (select of `ROLES`), Type (select: `—` untyped plus `VAR_TYPES`), Levels (ListEditor, only for categorical/ordinal; ordinal shows the hint "Order matters: lowest first"), Unit (text, only for continuous/discrete), Description (textarea). A Delete node button.
- **EdgeEditor:** heading `From → To` (names), Evidence (ListEditor of strings), Note (textarea), Delete edge button.
- **ListEditor:** one text input per item, with add, remove, move up and move down buttons; Enter in the last input adds a new item. Empty items are dropped on commit.
- Text fields commit on blur (and Enter for single-line fields), not per keystroke.

### 5.4 Files and dialogs

- **New:** if the graph has nodes, confirm `Start a new graph? Unsaved changes to the current graph will be lost.` Then `emptyGraph()`.
- **Open:** file picker (`.yaml,.yml`) → `parseYaml`. On errors open IssuesDialog with title `Could not open <file>` listing all errors (with line numbers when known); the current graph is unchanged. On success replace the graph, fit the view, and show warnings as one toast (`Opened with 3 warnings`, click opens IssuesDialog).
- **Save:** downloads `toYaml(graph)` as `<slug>.dag.yaml` (4.1). No server involved.
- **dagitty Import…:** dialog with a textarea to paste dagitty code and a `Choose file…` button (any text file). Import button runs `parseDagitty`; errors are listed inside the dialog and nothing changes; on success the graph is replaced (after the same confirmation as New if the graph has nodes) and warnings are toasted.
- **dagitty Export…:** dialog with a read-only textarea containing `toDagitty(graph)`, a Copy button and a Download button (`<slug>.dagitty.txt`), plus the note "Variable types, levels, descriptions, units and evidence are not included in dagitty files. Save as YAML to keep them."
- **Auto-layout:** `autoLayout(graph)`, then fit the view.

### 5.5 Autosave

The store persists the current graph to `localStorage` key `graphcreator:current` as the `toYaml` text, written at most every 500 ms after a change. On start-up the text is read and parsed with `parseYaml`; if it fails (corrupt or old), the app starts with `emptyGraph()` and shows the toast `Could not restore the previous graph.` All storage access is wrapped in try/catch so a blocked localStorage only disables autosave.

## 6. Project setup and conventions

- Scripts in `package.json`: `dev`, `build` (`tsc -b && vite build`), `preview`, `lint` (`oxlint`), `typecheck` (`tsc -b`; the tsconfigs set `noEmit`), `test` (`vitest run`), `test:watch` (`vitest`), `test:e2e` (`playwright test`), `format` (`prettier --write .`).
- Unit tests live next to the code as `src/**/*.test.ts`; fixtures in `src/model/__fixtures__/`. Vitest config is the `test` block in `vite.config.ts` (`environment: 'node'`, `include: ['src/**/*.test.ts']`).
- Playwright: `playwright.config.ts`, tests in `e2e/`, Chromium only, `webServer` runs `npm run build && npm run preview -- --port 4173 --strictPort`, `baseURL: 'http://localhost:4173'`.
- Node version pinned in `.nvmrc` (`26`).
- CI: `.github/workflows/ci.yml`, on push to `develop` and on pull requests: checkout, setup-node from `.nvmrc` with npm cache, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:e2e`. Deployment from `develop` to `production` is added once a host is chosen (see Open issues).
- Claude Code: `.claude/settings.json` has a Stop hook `npm run typecheck 1>&2 || exit 2`. CLAUDE.md lists the scripts and the rules: `docs/SPEC.md` is the source of truth; `src/model` has no React imports; no backend; MIT, no GPL code.
- Path alias `@/` → `src/` (required by shadcn/ui), set in `tsconfig.json`, `tsconfig.app.json` and `vite.config.ts`.
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
| Role visuals | Colour + text badge, latent dashed | DAGitty-like colours only | Not colour-only; accessible. |
| Multiple exposures/outcomes | Allowed, no warning | Warn; at most one | Matches imported files; later analysis can require one. |
| Adding nodes/edges | Double-click + drag handles + toolbar button | Toolbar modes | Fewer clicks. |
| Name uniqueness | Unique after trim, case-sensitive | Case-insensitive | Predictable. |
| Document location | `docs/SPEC.md`, `docs/IDEAS.md`, research moved to `docs/research.md` | Root files; delete research | User's choice. |
| Product stance | GraphCreator is its own tool; dagitty is an exchange format | DAGitty clone | User's direction. |

## 8. Implementation phases

One phase per session and per commit. Each phase leaves the full test suite passing. Status: `[ ]` to do, `[x]` done (with the commit hash).

### Phase 1: Tooling, CI and app shell [ ]

- **Goal:** all dependencies, scripts, tests and CI are in place, and the Vite demo is replaced by an empty GraphCreator shell (toolbar, canvas area, side panel placeholders).
- **Depends on:** none.
- **Files:**
  - `package.json`, `package-lock.json`: dependencies `@xyflow/react`, `zustand`, `zod`, `yaml`, `@dagrejs/dagre`, `tailwindcss`, `@tailwindcss/vite`, plus whatever `shadcn init` adds; dev dependencies `vitest`, `@playwright/test`, `prettier`; scripts from section 6.
  - `vite.config.ts`: Tailwind plugin, `@` alias, Vitest `test` block.
  - `tsconfig.json`, `tsconfig.app.json`: `@/*` path alias.
  - `components.json`, `src/lib/utils.ts`, `src/components/ui/*`: from `npx shadcn@latest init` (Vite path), plus `button`, `input`, `select`, `textarea`, `dialog`, `dropdown-menu`, `sonner`.
  - `src/index.css`: Tailwind import and shadcn tokens; role colour variables (placeholders are fine, finalised in phase 5).
  - `src/App.tsx`: layout skeleton per 5.1 with placeholder text; delete `src/App.css`, `src/assets/*`, `public/icons.svg`.
  - `src/model/result.ts`: the `Issue` and `Result` types (3.3) and a trivial `src/model/result.test.ts`, so Vitest has a test.
  - `playwright.config.ts`, `e2e/smoke.spec.ts`.
  - `.github/workflows/ci.yml`, `.nvmrc`, `.prettierrc` (`{ "singleQuote": true, "semi": false }`, matching the scaffold), `.prettierignore` (`dist`, `node_modules`, `package-lock.json`).
  - `.claude/settings.json`: Stop hook (section 6).
  - `LICENSE`, `README.md` (short: what it is, `npm install`, `npm run dev`, link to docs/SPEC.md), `CLAUDE.md` (Commands section with every script).
- **Work:** follow section 6. Install Tailwind v4 and shadcn/ui per the shadcn Vite guide; look up current docs (shadcn, Tailwind v4, React Flow 12, Zod 4) rather than relying on memory, since their APIs changed recently.
- **Tests:** `e2e/smoke.spec.ts` (page title is `GraphCreator`, toolbar and side panel render, no console errors); `src/model/result.test.ts`.
- **Done when:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` and `npm run build` pass locally; CI is green on the pushed commit; the app shows the empty shell.
- **Out of scope:** any model logic, canvas behaviour, deployment.

### Phase 2: Model core [ ]

- **Goal:** the in-memory graph, its operations, cycle detection and validation exist as pure, tested TypeScript.
- **Depends on:** phase 1.
- **Files:** `src/model/schema.ts` (constants from 3.1 only; the Zod schema comes in phase 3), `src/model/graph.ts`, `src/model/cycle.ts`, `src/model/validate.ts`, with `graph.test.ts`, `cycle.test.ts`, `validate.test.ts`.
- **Work:** implement 3.1, 3.2, 4.3 and 4.4 exactly as specified, including the user-facing messages.
- **Tests:** see section 9.
- **Done when:** `npm test` passes; `src/model` has no imports from `react`, `zustand` or `@xyflow/react` (`grep -rE "from '(react|zustand|@xyflow)" src/model` is empty).
- **Out of scope:** file formats, layout, UI.

### Phase 3: YAML format [ ]

- **Goal:** GraphCreator files can be read and written with full validation.
- **Depends on:** phase 2.
- **Files:** `src/model/schema.ts` (add `GraphFileSchema`, `GraphFile`), `src/model/yaml.ts`, `src/model/yaml.test.ts`, `src/model/layout.ts` (needed by step 6 of `parseYaml`; implement 4.5 here), `src/model/layout.test.ts`, fixtures `src/model/__fixtures__/smoking.dag.yaml` (the example in 4.1), `minimal.dag.yaml`, and invalid fixtures (`bad-schema.dag.yaml`, `cycle.dag.yaml`, `bad-refs.dag.yaml`, `unknown-key.dag.yaml`, `levels-on-continuous.dag.yaml`).
- **Work:** implement 4.1 (`parseYaml`, `toYaml`, slug helper `fileSlug(name?: string): string`) and 4.5.
- **Tests:** see section 9.
- **Done when:** `npm test` passes, including the canonical round-trip `toYaml(parseYaml(smoking)) === smoking`.
- **Out of scope:** dagitty, UI.

### Phase 4: dagitty import and export [ ]

- **Goal:** dagitty text can be imported and exported per 4.2.
- **Depends on:** phase 3.
- **Files:** `src/model/dagitty.ts`, `src/model/dagitty.test.ts`, fixtures `src/model/__fixtures__/*.dagitty.txt`: `confounding.dagitty.txt`, `m-bias.dagitty.txt`, `quoted-names.dagitty.txt` (quoted ids and `label`), `groups-and-chains.dagitty.txt`, `no-positions.dagitty.txt`, `bidirected.dagitty.txt` (must be rejected), `pdag.dagitty.txt` (rejected), `two-roles.dagitty.txt` (rejected).
- **Work:** implement the tokenizer, parser, `toDagitty` and `toDagittyIds` from 4.2. Fixtures should be real dagitty output where possible (copy from dagitty.net examples, which are freely usable as data); check the direction of dagitty's y axis against one of them and record the result in this spec (Open issues).
- **Tests:** see section 9.
- **Done when:** `npm test` passes; every rejected construct produces the specified line-numbered message.
- **Out of scope:** UI dialogs (phase 6), bidirected support.

### Phase 5: Store and canvas [ ]

- **Goal:** users can add, connect, select, move and delete nodes on the canvas, invalid edges are refused with a toast, and the graph autosaves.
- **Depends on:** phase 4.
- **Files:** `src/store/graphStore.ts` (+ `graphStore.test.ts`), `src/components/Canvas.tsx`, `src/components/DagNode.tsx`, `src/App.tsx` (mount canvas, `Toaster`), `src/index.css` (final role colours), `e2e/canvas.spec.ts`.
- **Work:**
  - Store state: `graph: Graph`, `selection: { kind: 'node' | 'edge'; id: string } | null`, `focusNameOf: string | null` (node whose name field should be focused). Actions: `addNodeAt(pos)`, `renameNode`, `updateNode`, `moveNode`, `connect(source, target)` (returns the `EdgeCheck`), `updateEdge`, `removeSelection(nodeIds, edgeIds)`, `select`, `replaceGraph(graph)`, `setGraphName`, `layout()`. Autosave per 5.5 (a store subscriber, not Zustand `persist`, since the stored value is YAML text).
  - Canvas and node look per 5.2.
- **Tests:** `graphStore.test.ts` (actions delegate correctly; autosave writes YAML and restores it; corrupt storage falls back to empty); `e2e/canvas.spec.ts` (double-click adds "Node 1"; connecting two nodes adds an edge; closing a cycle shows the cycle toast; Delete removes a node and its edges; reload restores the graph).
- **Done when:** all scripts pass; the flows above work in the browser.
- **Out of scope:** side-panel editors, toolbar file actions (phase 6).

### Phase 6: Side panel, toolbar and files [ ]

- **Goal:** v1 is feature-complete: node and edge editing, warnings, YAML open/save, dagitty import/export and auto-layout.
- **Depends on:** phase 5.
- **Files:** `src/components/Toolbar.tsx`, `SidePanel.tsx`, `NodeEditor.tsx`, `EdgeEditor.tsx`, `ListEditor.tsx`, `IssuesDialog.tsx`, `DagittyImportDialog.tsx`, `DagittyExportDialog.tsx`, `src/lib/download.ts` (`downloadText(filename, text, mime)`), `e2e/editing.spec.ts`, `e2e/files.spec.ts`.
- **Work:** implement 5.1, 5.3 and 5.4.
- **Tests:** `e2e/editing.spec.ts` (rename refuses a duplicate name; setting type to ordinal shows the levels editor and the hint; switching to continuous hides levels and shows unit; warning badge count drops when a node gets a type; edge evidence can be added); `e2e/files.spec.ts` (Save downloads a `.dag.yaml` whose text parses back to the same graph; Open of `cycle.dag.yaml` shows the error dialog and leaves the graph unchanged; dagitty import of `confounding.dagitty.txt` creates its nodes and edges; importing `bidirected.dagitty.txt` shows the error; dagitty export text matches `toDagitty`).
- **Done when:** all scripts pass and CI is green; a manual run-through of every 5.x behaviour in the browser works; the Status line of this spec says v1 is implemented.
- **Out of scope:** everything in IDEAS.md.

## 9. Tests

- `src/model/graph.test.ts`: `newId` and `defaultNodeName` pick the smallest unused value; `addNode` returns a new graph and leaves the input unchanged; `renameNode` trims, refuses empty and duplicate names (case-sensitive: `Age` vs `age` allowed) and keeps edges; `updateNode` clears `levels`/`unit` when the type changes; `removeNodes` removes incident edges; `canAddEdge` returns `self`, `duplicate` and `cycle` with the exact messages, including the cycle path text; `addEdge` creates an edge with `evidence: []`.
- `src/model/cycle.test.ts`: `findCycle` returns null for acyclic graphs (including diamonds and disconnected parts) and a correct closed path otherwise; `findPath` finds directed paths only.
- `src/model/validate.test.ts`: each error and warning in 4.4 is produced with its exact message; a clean graph gives none.
- `src/model/yaml.test.ts`: canonical round trip of `smoking.dag.yaml`; defaults (missing role → `other`, missing nodes/edges → empty); each invalid fixture gives the expected messages and **all** problems are listed at once; YAML syntax errors carry a line number; unknown schema and missing schema messages; missing positions trigger layout and the warning; `fileSlug` cases (`"Smoking & BW"` → `smoking-bw`, empty → `graph`).
- `src/model/layout.test.ts`: every node gets integer positions; parents are left of children; same input gives the same output.
- `src/model/dagitty.test.ts`: each fixture parses to the expected names, roles, edges and positions; quoted ids and `label` become names; chains, `<-` and groups expand correctly; rejected fixtures give the specified line-numbered errors; unknown attributes give warnings; `toDagittyIds` handles spaces, punctuation, non-ASCII, empty names and collisions (`a b`, `a_b` → `a_b`, `a_b_2`); `toDagitty` output for the 4.1 graph equals the example in 4.2; round trip `parseDagitty(toDagitty(g))` preserves names, roles, edges and positions within 0.1 px.
- `src/store/graphStore.test.ts`, `e2e/*.spec.ts`: as listed in phases 1, 5 and 6.

## 10. Open issues

- **Hosting and deployment:** the host (GitHub Pages, Cloudflare or an EU host) is not chosen. When it is, add a deploy job that runs after CI passes on `develop` and publishes to `production`, and decide on a custom domain.
- **dagitty y axis:** this spec assumes dagitty's `pos` y grows downward, like screen coordinates. Phase 4 checks this against a real dagitty file and updates 4.2 if not.
- **Tokens/colours:** role colours are chosen in phase 5; a later design pass may refine the visual style.
- Everything in [IDEAS.md](IDEAS.md).
