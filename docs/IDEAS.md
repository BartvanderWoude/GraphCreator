# GraphCreator ideas

Features deliberately left out of v1. Nothing here is designed yet. When one is picked up, it gets its own design (a section in [SPEC.md](SPEC.md) or a separate `docs/<TOPIC>_SPEC.md`) before implementation. Background for many of these is in [research.md](research.md).

## Causal analysis

Adjustment sets, implied independencies, path highlighting, instrumental variables and an in-app Tennant report are built ([SPEC.md](SPEC.md) 4.13–4.14 and 5.8). Still deferred:

- An exportable reporting summary following Tennant et al. (2021): estimand, implied adjustment set, alternative sets.
- Alternative adjustment sets with a written rationale for the one chosen.
- Direct effects (adjustment for the controlled direct effect), and non-minimal sets (DAGitty's "all" and "canonical" sets).
- The analysis marking (paths, highlighted circles) in exported images.

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

- Keyboard-accessible list view of nodes and edges, for screen readers and bulk metadata editing.
- A local library of several named graphs in the browser.
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

PDF export, the legend, the dark-theme image, dagitty details and the GML, DOT, networkx JSON, bnlearn, Tetrad and Mermaid formats are designed in [SPEC.md](SPEC.md) 4.2, 4.11, 4.15 and 5.4 (waves 16–18). Still deferred:

- A versioned JSON Schema for the YAML format.
- Opening bnlearn, Tetrad and Mermaid; GraphML.
- A PDF with an embedded font (IBM Plex Sans), so names outside WinAnsi print correctly.

## Project and community

- Deployment of `develop` to `production` once a host is chosen; a custom domain from day one.
- `CITATION.cff` and Zenodo DOIs per release; a JOSS paper later (needs six months of public history and real research use).
- Companion packages: an R package reading the YAML into dagitty/ggdag objects, a Python package reading it into networkx/DoWhy.
- An example gallery (M-bias, colliders, mediation, confounding by indication) that doubles as test fixtures.
- Think-aloud usability sessions with five to eight epidemiologists.
- Dependabot.
