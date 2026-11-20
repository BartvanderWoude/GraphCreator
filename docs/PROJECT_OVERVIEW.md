**What it is:** a free, browser-only tool for drawing causal diagrams (DAGs), mainly for epidemiologists. Like DAGitty, but every variable and arrow can carry details (type, levels, unit, evidence, notes). Graphs are saved as a YAML file and never leave the computer.

| Date   | Type    | What was done                                                                                   | Result                                                                                   |
| ------ | ------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 8 Nov  | Setup   | Set up the project and wrote the plan (SPEC.md)                                                 | Empty app with tests and checks in place                                                 |
| 8 Nov  | Build   | Core of the app: draw circles and arrows, block loops, check the graph for mistakes             | Works, covered by tests                                                                  |
| 8 Nov  | Build   | Save and open files: own YAML format and the DAGitty text format                                | Graphs can move between GraphCreator and DAGitty                                         |
| 8 Nov  | Build   | Editor: side panel to edit variables and arrows, toolbar, auto-layout, autosave in the browser  | **v1 complete**                                                                          |
| 8 Nov  | Build   | New look ("Calm teal"): round nodes, top bar, tool rail, shortcuts, welcome slides              | Cleaner, friendlier app                                                                  |
| 8 Nov  | Build   | Light/dark mode, rename by double-click, better Save dialog                                     | Done                                                                                     |
| 9 Nov  | Build   | Undo/redo, export as picture (SVG, PNG, TikZ), share a graph by link                            | Done                                                                                     |
| 9 Nov  | Build   | Causal analysis: adjustment sets, open/closed paths, implied independencies, instruments        | New Analysis tab; results checked against DAGitty                                        |
| 9 Nov  | Build   | More file formats: GML, DOT, networkx, bnlearn, Tetrad, Mermaid, PDF; legend on images          | Graphs can go to R, Python and other tools                                               |
| 9 Nov  | Build   | Lessons: 14 interactive lessons (how to use the app + causal inference basics)                  | Built-in course in the Help menu                                                         |
| 10 Nov | Release | Put the site online (GitHub Pages)                                                              | **First public release**                                                                 |
| 12 Nov | Build   | Simulation details: how common each level is, how causes combine, arrow sign (+/−) and strength | Files can feed a synthetic-data generator (FORMAT.md explains how) — **released 13 Nov** |
| 13 Nov | Build   | From feedback: all circles same size, name shows while typing, lock a graph (read-only)         | **Released**                                                                             |
| 17 Nov | Build   | Arrow signs per level of a categorical cause                                                    | Done                                                                                     |
| 17 Nov | Build   | Display options: show signs, sign colours, strength, forms, variable types, dashed latent nodes | On canvas and in images — **released**                                                   |
| 17 Nov | Build   | Small fixes: CI no longer runs on pull requests; a restored graph fits the screen on load       | Done                                                                                     |

## Take-aways

- Writing the plan first and building in parallel waves got 71 steps done in about ten days
- Keeping the graph logic apart from the screen made new file formats and analyses quick to add
- Checking the analysis and file formats against the real tools (DAGitty, networkx, bnlearn, …) caught mistakes early
- User feedback shaped the later releases: equal circles, graph lock, display options
- Changing what a saved field means (per-level signs) quietly changes old files, so the file format needs proper versions

## Limitations

- Only one-way arrows; no two-headed arrows for hidden shared causes
- One autosaved graph per browser; the files are the only real storage
- bnlearn, Tetrad and Mermaid can be exported but not opened, and they lose positions and roles
- Display settings stay in your browser, not in the file; simulation details are only in the YAML file
- PDF export shows non-standard characters (e.g. Greek letters) as `?`
- Share links only work on the site they were made on, so moving the site breaks them

## Ideas

- Generate ready-to-run simulation code (R `simDAG`, Python DoWhy)
- Two-headed and undirected arrows
- Exportable analysis report and analysis marks in images
- Save display settings inside the file
- R and Python packages that read the file
- Usability tests with epidemiologists
