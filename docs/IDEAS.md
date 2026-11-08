# GraphCreator ideas

Features deliberately left out of v1. Nothing here is designed yet. When one is picked up, it gets its own design (a section in [SPEC.md](SPEC.md) or a separate `docs/<TOPIC>_SPEC.md`) before implementation. Background for many of these is in [research.md](research.md).

## Causal analysis

- Minimal sufficient adjustment sets (back-door criterion), written ourselves under MIT and cross-checked against dagitty-R on a gallery of known DAGs.
- d-separation (e.g. Bayes-Ball) and testable implied conditional independencies.
- Highlighting causal and biasing paths between exposure and outcome.
- Instrumental variables.
- A reporting panel following Tennant et al. (2021): estimand, implied adjustment set, alternative sets with rationale, exportable summary.

## Simulation and code export

- Generate runnable simulation code from the typed model: R `simDAG` and Python DoWhy-GCM.
- Per-node distribution hints and value ranges (min/max), per-edge coefficients or functional forms.
- "Sample N datasets from this DAG" with randomised edge strengths and nonlinearities (link to synthetic-SCM priors for tabular foundation models).

## Graph model

- Bidirected edges (`A <-> B`, latent confounding) and undirected edges, including dagitty import/export of them.
- Graph-level estimand field (focal exposure, outcome, effect type).
- Omitted-arc justifications: node pairs deliberately left unconnected, each with a reason.
- Edge decision history (ESC-DAGs style keep/reverse/delete log).

## Editor

- Undo / redo (snapshot history; snapshot on drag stop).
- Keyboard-accessible list view of nodes and edges, for screen readers and bulk metadata editing.
- A local library of several named graphs in the browser.
- Share links: the graph compressed into the URL `#fragment` (never sent to a server).
- Optional LLM-suggested edges: opt-in, labelled by provenance, citations verified.

## Lessons

The lesson engine and the tour ("Drawing your first DAG") are specified in SPEC.md 5.7.10. Still to design and write, each as an interactive lesson on a practice graph (running example: smoking and birth weight):

- Roles explained: exposure, outcome, latent, adjusted, selected, other, and what each means for the analysis.
- Variable types and levels: categorical, ordinal, continuous, discrete; ordered levels; units.
- Documenting evidence: references and notes on edges, and why they matter for reporting.
- Confounders, mediators and colliders: back-door paths, what to adjust for and what not to (highlighting paths on the canvas).
- Reporting your DAG in a paper: what to show, following Tennant et al. (2021).
- Lesson features: progress kept across visits, a lessons list on the last welcome slide, "Lesson: …" links at the end of info tooltips, citations inside lessons.

## Import and export

- Image export: SVG, PNG, TikZ.
- Optional toggle to embed GraphCreator metadata (types, levels, description, unit, evidence) as dagitty attributes.
- More formats: GML, DOT, networkx node-link JSON, bnlearn modelstring, Tetrad text, Mermaid.
- A versioned JSON Schema for the YAML format.

## Project and community

- Deployment of `develop` to `production` once a host is chosen; a custom domain from day one.
- `CITATION.cff` and Zenodo DOIs per release; a JOSS paper later (needs six months of public history and real research use).
- Companion packages: an R package reading the YAML into dagitty/ggdag objects, a Python package reading it into networkx/DoWhy.
- An example gallery (M-bias, colliders, mediation, confounding by indication) that doubles as test fixtures.
- Think-aloud usability sessions with five to eight epidemiologists.
- Dependabot.
