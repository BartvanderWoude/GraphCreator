# GraphCreator lessons

**Status:** designed 2026-11-09, not implemented yet (waves 19–21, phases 41–48 in [SPEC.md](SPEC.md)). This document is **binding** for the lesson files in `src/lessons/`: their practice graphs, step texts, checks, pointers, picks and the claims their tests assert. The engine, the panel, the Lessons dialog and the canvas pointer are specified in SPEC.md 4.8 and 5.7.10–5.7.12.

## Course

Two tracks, in this order in the Lessons dialog (SPEC.md 5.7.11):

| Track | # | id | Title | Summary (shown in the dialog) |
|---|---|---|---|---|
| Using GraphCreator | 1 | `tour` | Drawing your first DAG | Add variables, draw arrows and set a role. |
| Using GraphCreator | 2 | `variables` | Describing your variables | Roles, variable types, levels, units and descriptions. |
| Using GraphCreator | 3 | `arrows` | Documenting your arrows | Evidence and notes, and why missing arrows matter. |
| Using GraphCreator | 4 | `files` | Saving, sharing and exporting | Files for other tools, images, links and undo. |
| Causal thinking | 5 | `dag-basics` | What a DAG says | Arrows, paths, ancestors and descendants. |
| Causal thinking | 6 | `confounding` | Confounding | Common causes, back-door paths and adjustment. |
| Causal thinking | 7 | `mediators` | Mediators | Why you do not adjust for a step on the causal path. |
| Causal thinking | 8 | `colliders` | Colliders | How adjusting for a common effect creates bias. |
| Causal thinking | 9 | `selection` | Selection bias | What happens when the study selects on a variable. |
| Causal thinking | 10 | `latent` | Unmeasured variables | Latent variables, and when no adjustment works. |
| Causal thinking | 11 | `adjustment` | Adjustment sets | Finding and using sufficient adjustment sets. |
| Causal thinking | 12 | `testing` | Testing your DAG | Independencies you can check in your data. |
| Causal thinking | 13 | `instruments` | Instrumental variables | Estimating an effect despite unmeasured confounding. |
| Causal thinking | 14 | `reporting` | Reporting your DAG | What to show and say in a paper. |

Audience: researchers new to DAGs. Each step teaches one idea in plain words and names the formal term once the idea is clear. There are no formulas. The running example is maternal smoking and birth weight; lessons 8, 9 and 13 use classic shapes (M-bias, selection on a collider, an instrument) with names from the same story. The stories are illustrations, not claims about the real epidemiology, and lesson 5 says so once ("These DAGs are teaching examples.").

## Writing rules

- Voice: SPEC.md 5.7.8. That means American English, no contractions, sentence case, no exclamation marks, and modesty about causes ("as implied by this DAG").
- **Body:** at most three short sentences. **Key idea:** one sentence. **Task:** one sentence, shown as "Try it: <task>". **Pointer label:** at most three words.
- Steps refer to variables by their names in the practice graph. Tasks never ask the user to rename a practice node; checks and pointers look nodes up by name, so a renamed node no longer matches (SPEC.md 5.7.10).
- The text below is the source. The lesson files copy it character for character; where this document shows `→`, `←` or `⫫`, the files use those characters.

## Notation for checks

A step is done when its pick is answered (if it has one) **and** its check holds (if it has one). A step with neither is a reading step: Next is enabled at once. Checks are written with these predicates, all on the lesson context (SPEC.md 4.8). `N`, `A` and `B` are node names.

| Predicate | True when |
|---|---|
| `role(N) = r` | node N has role r |
| `type(N) = t` | node N has variable type t |
| `unit(N) = u` | N's unit, trimmed, equals u ignoring case |
| `levels(N) = [a, b, c]` | N's levels, trimmed, equal the list in order, ignoring case |
| `description(N)` | N has a description that is not blank |
| `edge(A, B)` / `no edge(A, B)` | an edge from A to B exists / does not exist |
| `evidence(A, B) ≥ 1` | the edge A → B has at least one evidence item |
| `note(A, B)` | the edge A → B has a note that is not blank |
| `selected edge(A, B)` | the selection is the edge A → B |
| `tab = analysis` | the side panel shows the Analysis tab |
| `on(key)` | the Analysis switch `key` is on (`report`, `adjustment`, `paths`, `instruments`, `independencies`) |
| `adjusted = {A, B}` | exactly these nodes have role `adjusted` |
| `event(kind)` / `event(kind, f1 \| f2)` | a lesson event of that kind (with one of those formats) was recorded since the step began |

`∧` joins predicates and `∨` means either one. A pick is answered when the selected node's name is one of the pick's answers.

---

## 1. Drawing your first DAG (`tour`)

Unchanged from SPEC.md 5.7.10, except that each `isDone(graph)` becomes `check(ctx)` on `ctx.graph`. It has five steps, and its practice graph is `emptyGraph()`.

---

## 2. Describing your variables (`variables`)

Practice graph: the running example with no roles and no types, so every circle shows the untyped dot.

```yaml
schema: graphcreator/0.1
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
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | The exposure | Every circle is a variable in your causal question. Its role says what part it plays, and its color shows the role. The exposure is the cause whose effect you want to estimate. | Start every DAG by marking the exposure and the outcome. | Select Maternal smoking and set its role to Exposure. | `role(Maternal smoking) = exposure` | Maternal smoking: "The cause" |
| 2 | The outcome | The outcome is the effect you want to estimate. Here it is the baby's birth weight. | | Set the role of Birth weight to Outcome. | `role(Birth weight) = outcome` | Birth weight: "The effect" |
| 3 | Unmeasured variables | Some causes matter even though no study measured them. Mark them Latent, so the analysis never relies on them. | Leaving an unmeasured cause out of the DAG hides an assumption; drawing it as latent shows it. | Set the role of Genetic factors to Latent. | `role(Genetic factors) = latent` | Genetic factors: "Not measured" |
| 4 | Variable types | The type says how a variable is measured, and the small warning dot marks variables without one. Birth weight is measured in grams, so it is continuous. | | Set the type of Birth weight to Continuous and its unit to g. | `type(Birth weight) = continuous ∧ unit(Birth weight) = g` | |
| 5 | Levels | Categorical and ordinal variables take a fixed set of values, called levels. For an ordinal variable, list the levels from lowest to highest. | | Make SES ordinal with the levels low, mid and high. | `type(SES) = ordinal ∧ levels(SES) = [low, mid, high]` | SES: "Ordinal" |
| 6 | Descriptions | A description says exactly what was measured and how. Readers of your paper need it to judge the DAG. | | Give Maternal smoking a description, such as Self-reported during pregnancy. | `description(Maternal smoking)` | |
| 7 | Done | Roles, types, levels, units and descriptions are all kept in the GraphCreator file. Your own graph comes back when you finish. | | | | |

Claims: none about the analysis. The test checks each step's check on the graph as loaded (false) and after the scripted change (true).

---

## 3. Documenting your arrows (`arrows`)

Practice graph: the running example with roles and types, but no evidence or notes.

```yaml
schema: graphcreator/0.1
name: Smoking and birth weight
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [never, former, current], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [150, -140] }
  - { name: Genetic factors, role: latent, var_type: continuous, pos: [150, 140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
  - { from: Genetic factors, to: Birth weight }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | What an arrow claims | An arrow says that one variable directly affects another. It is a claim about the world, so it needs a reason. | | Click the arrow from SES to Maternal smoking. | `selected edge(SES, Maternal smoking)` | SES: "From here"; Maternal smoking: "To here" |
| 2 | Evidence | Evidence lists the references that support an arrow, one per line. A small chip on the arrow shows how many there are. | | Add a reference to this arrow, such as PMID:123. | `evidence(SES, Maternal smoking) ≥ 1` | |
| 3 | Notes | A note says why you drew the arrow, or what is uncertain about it. | | Add a note to the arrow, such as Well established. | `note(SES, Maternal smoking)` | |
| 4 | Missing arrows are claims too | There is no arrow from Genetic factors to Maternal smoking. That says genes do not affect smoking at all, which is a strong claim. | Draw an arrow whenever an effect is plausible; leave it out only when you are confident there is none. | | | Genetic factors: "No arrow out" |
| 5 | No cycles | A DAG has no cycles: following the arrows never leads back to where you started. GraphCreator refuses an arrow that would close a cycle and says why. | | Try to draw an arrow from Birth weight to SES. | `event(edge-refused, cycle)` | Birth weight: "Start here" |
| 6 | Done | Evidence and notes are kept in the GraphCreator file, and in GML, DOT and networkx JSON. A dagitty file keeps them only when you include GraphCreator details. | | | | |

Claims: step 4 is true of the practice graph: there is `no edge(Genetic factors, Maternal smoking)`. Step 5 is true too: `canAddEdge(Birth weight, SES)` returns reason `cycle`.

---

## 4. Saving, sharing and exporting (`files`)

Practice graph: `src/model/__fixtures__/smoking.dag.yaml`, copied into the lesson file as YAML text. Open… stays disabled during lessons (SPEC.md 5.4), so this lesson describes it in its last step.

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | Your work stays here | GraphCreator keeps your graph in this browser as you work. Nothing is uploaded. To keep a copy or send it, save a file. | | | | |
| 2 | Save a GraphCreator file | The GraphCreator file (.dag.yaml) keeps everything: roles, types, levels, evidence and positions. Open… reads it back later. | | Click Save, then Download. | `event(code-downloaded, yaml)` | |
| 3 | Files for other tools | Save as… writes formats that other tools read: dagitty, GML for DoWhy and networkx, DOT, bnlearn, Tetrad and Mermaid. Each dialog says what its format keeps. | Names become safe ids such as Maternal_smoking, so they can match the column names in your data. | Open Save as… → dagitty… and copy or download the code. | `event(code-copied, dagitty) ∨ event(code-downloaded, dagitty)` | |
| 4 | Export a picture | Export… draws the graph as SVG, PNG, PDF or TikZ, in a light or dark theme. A legend can explain the role colors. | | Export the graph as a PDF. | `event(export-downloaded, pdf)` | |
| 5 | Share a link | Share copies a link that holds the whole graph. The graph travels inside the link, not on a server. | | Click Share. | `event(link-copied)` | |
| 6 | Undo | Every change can be undone with Ctrl+Z and redone with Ctrl+Shift+Z, or with the buttons at the bottom of the tool rail. | | Move a circle, then press Ctrl+Z. | `event(undo)` | |
| 7 | Done | Open… reads GraphCreator, dagitty, GML, DOT and networkx JSON, from a file or pasted code. It is not available during a lesson, so your own graph stays safe. | | | | |

On a Mac the panel shows ⌘ instead of Ctrl, as the tool rail does (SPEC.md 5.1). Claims: none about the analysis.

---

## 5. What a DAG says (`dag-basics`)

```yaml
schema: graphcreator/0.1
name: Smoking and birth weight
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [150, -140] }
  - { name: Gestational age, var_type: continuous, unit: weeks, pos: [150, 140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Gestational age }
  - { from: Gestational age, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | Directed acyclic graph | A DAG is a set of variables joined by arrows. Directed: every arrow has one direction. Acyclic: you can never follow the arrows back to where you started. | These DAGs are teaching examples, not claims about the real epidemiology. | | | |
| 2 | An arrow is a direct cause | Maternal smoking → Gestational age says that smoking may affect how long the pregnancy lasts. Direct means: not through another variable in this DAG. | An arrow says an effect may exist; it says nothing about how strong it is. | | | Maternal smoking: "Cause"; Gestational age: "Effect" |
| 3 | Paths | A path is any route between two variables along arrows, whichever way they point. Maternal smoking and Birth weight are joined by three paths here. | Association travels along paths; the next lessons are about which ones to block. | Open the Analysis tab and switch on Paths. | `tab = analysis ∧ on(paths)` | |
| 4 | Causal paths | A path that follows the arrows from the exposure to the outcome is causal. The thick lines on the canvas mark the causal paths. | | Click the variable that lies on a causal path from Maternal smoking to Birth weight. | pick | |
| 5 | Ancestors and descendants | Everything you can reach by following the arrows forward is a descendant; everything that leads to a variable is an ancestor. Gestational age and Birth weight are descendants of Maternal smoking. | | Click an ancestor of Maternal smoking. | pick | Maternal smoking: "Its ancestors?" |
| 6 | What the DAG leaves out | Every missing arrow is an assumption. Here, SES does not affect gestational age directly. The lesson Testing your DAG shows how such assumptions can be checked in data. | | | | SES: "No arrow"; Gestational age: "No arrow" |
| 7 | Done | Variables, arrows and paths are all you need to read any DAG. The next lessons use them to decide what to adjust for. | | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 4 | Gestational age | SES: "Not quite. The path through SES runs against the arrow into Maternal smoking, so it is not causal." Maternal smoking: "That is the exposure itself. Pick a variable between the exposure and the outcome." Birth weight: "That is the outcome. Pick a variable between the exposure and the outcome." | "Gestational age: Maternal smoking → Gestational age → Birth weight follows the arrows, so it is a causal path." |
| 5 | SES | Gestational age: "Not quite. The arrow runs from Maternal smoking to Gestational age, so Gestational age is a descendant." Birth weight: "Not quite. Birth weight is a descendant of Maternal smoking." Maternal smoking: "Pick another variable: one with an arrow leading into Maternal smoking." | "SES: the arrow SES → Maternal smoking makes SES an ancestor." |

Claims:

- With no adjusted nodes there are three paths:

  | Path | Kind | Open |
  |---|---|---|
  | Maternal smoking → Birth weight | causal | open |
  | Maternal smoking → Gestational age → Birth weight | causal | open |
  | Maternal smoking ← SES → Birth weight | biasing | open |

- `ancestors(Maternal smoking)` is {Maternal smoking, SES}.
- `descendants(Maternal smoking)` is {Maternal smoking, Gestational age, Birth weight}.
- `impliedIndependencies` is exactly SES ⫫ Gestational age | Maternal smoking.

---

## 6. Confounding (`confounding`)

```yaml
schema: graphcreator/0.1
name: Confounding by SES
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [150, -140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | A common cause | SES affects both whether a mother smokes and the baby's birth weight. Because of that, babies of smokers and non-smokers would differ in birth weight even if smoking did nothing. | | | | SES: "Common cause" |
| 2 | A back-door path | The path Maternal smoking ← SES → Birth weight starts with an arrow into the exposure. It is called a back-door path, and the association it carries is not an effect of smoking. | | Open the Analysis tab and switch on Paths. | `tab = analysis ∧ on(paths)` | |
| 3 | Find the confounder | The dashed lines on the canvas mark the open back-door path. A variable that opens a back-door path like this is called a confounder. | | Click the confounder. | pick | |
| 4 | Adjusting closes the path | Adjusting for a variable means comparing like with like: mothers with the same SES. That closes the back-door path through SES. | | Set the role of SES to Adjusted. | `role(SES) = adjusted` | SES: "Adjust here" |
| 5 | Check the result | Only the causal path is still marked. The Report now says the adjusted set is sufficient, as implied by this DAG. | | Open the Analysis tab and read the Report. | `tab = analysis` | |
| 6 | Done | Confounding is association through a common cause. Adjustment closes every back-door path without opening new ones. | The analysis knows only the DAG: a common cause you leave out cannot be adjusted for. | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 3 | SES | Maternal smoking: "That is the exposure. A confounder causes both the exposure and the outcome." Birth weight: "That is the outcome. A confounder causes both the exposure and the outcome." | "SES: it causes both Maternal smoking and Birth weight, so the back-door path runs through it." |

Claims:

- With no adjusted nodes:
  - `sets` is [[SES]] and `zSufficient` is false;
  - the paths are Maternal smoking → Birth weight (causal, open) and Maternal smoking ← SES → Birth weight (biasing, open).
- With `adjusted = {SES}`:
  - `zSufficient` is true;
  - the biasing path is closed and the causal path stays open.

---

## 7. Mediators (`mediators`)

```yaml
schema: graphcreator/0.1
name: Smoking, gestational age and birth weight
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, role: adjusted, var_type: ordinal, levels: [low, mid, high], pos: [150, -140] }
  - { name: Gestational age, var_type: continuous, unit: weeks, pos: [150, 140] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Birth weight }
  - { from: Maternal smoking, to: Gestational age }
  - { from: Gestational age, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | A variable in between | Smoking can shorten pregnancy, and shorter pregnancies give lighter babies. A variable on a causal path between the exposure and the outcome is called a mediator. | | | | |
| 2 | Find the mediator | SES is already adjusted for, so its back-door path is closed. | | Click the mediator. | pick | |
| 3 | The total effect | GraphCreator analyses the total effect: everything smoking does to birth weight, along every causal path. Here there are two, and both are marked on the canvas. | | Open the Analysis tab and switch on Paths. | `tab = analysis ∧ on(paths)` | Gestational age: "Mediator" |
| 4 | Adjusting for the mediator | Many analyses adjust for every variable that predicts the outcome. See what happens when you adjust for Gestational age. | | Set the role of Gestational age to Adjusted. | `role(Gestational age) = adjusted` | |
| 5 | Overadjustment | The Report now says the set is not sufficient: Gestational age lies on a causal path, and adjusting for it blocks part of the effect. This is called overadjustment. | Do not adjust for mediators, or anything they cause, when you want the total effect. | Set the role of Gestational age back to Other. | `role(Gestational age) = other` | |
| 6 | Done | Confounders are adjusted for; mediators are not. The direct effect, the part not through the mediator, is a different question that GraphCreator does not analyse yet. | | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 2 | Gestational age | SES: "Not quite. SES causes the exposure, so it sits on a back-door path, not on a causal path." Maternal smoking: "That is the exposure. Pick a variable between the exposure and the outcome." Birth weight: "That is the outcome. Pick a variable between the exposure and the outcome." | "Gestational age: it lies on Maternal smoking → Gestational age → Birth weight." |

Claims:

- With `adjusted = {SES}`:
  - `zSufficient` is true;
  - both causal paths are open;
  - the back-door path through SES is closed.
- With `adjusted = {SES, Gestational age}`:
  - `zSufficient` is false and `zForbidden` is [Gestational age];
  - the path through Gestational age is closed;
  - `sets` is still [[SES]].

---

## 8. Colliders (`colliders`)

The M-bias shape, with two unmeasured causes.

```yaml
schema: graphcreator/0.1
name: M-bias
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: Health awareness, role: latent, var_type: continuous, pos: [0, -220] }
  - { name: Clinic access, role: latent, var_type: categorical, levels: [no, yes], pos: [300, -220] }
  - { name: Prenatal visits, var_type: discrete, pos: [150, -110] }
edges:
  - { from: Health awareness, to: Maternal smoking }
  - { from: Health awareness, to: Prenatal visits }
  - { from: Clinic access, to: Prenatal visits }
  - { from: Clinic access, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | Two arrows meeting | Health awareness and Clinic access both affect the number of prenatal visits. On a path, a variable where two arrowheads meet is called a collider. | | | | Prenatal visits: "Arrows meet" |
| 2 | Colliders block paths | Two causes are not associated just because they share an effect, so a path through a collider is closed. The Report says no adjustment is needed here. | Leave a collider alone and its path stays closed. | Open the Analysis tab and switch on Paths. | `tab = analysis ∧ on(paths)` | |
| 3 | Find the collider | Look at the path from Maternal smoking up through Health awareness and back down to Birth weight. | | Click the collider on that path. | pick | |
| 4 | Adjusting for a collider | Some analyses adjust for every variable measured before the outcome. See what happens with Prenatal visits. | | Set the role of Prenatal visits to Adjusted. | `role(Prenatal visits) = adjusted` | |
| 5 | M-bias | Adjusting for the collider opened the path: it is now dashed on the canvas, and the Report says the set is not sufficient. This shape is called M-bias. | Adjusting for more variables is not always safer: adjusting for a collider can create bias. | Set the role of Prenatal visits back to Other. | `role(Prenatal visits) = other` | |
| 6 | Done | Adjust for confounders, but not for mediators or colliders. The Analysis tab checks every path for you, as implied by this DAG. | | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 3 | Prenatal visits | Health awareness: "Not quite. Both arrows leave Health awareness, so it is not a collider." Clinic access: "Not quite. Both arrows leave Clinic access, so it is not a collider." Maternal smoking: "That is the exposure. Pick a variable on the path where two arrowheads meet." Birth weight: "That is the outcome. Pick a variable on the path where two arrowheads meet." | "Prenatal visits: the arrows from Health awareness and Clinic access both point into it." |

Claims:

- With no adjusted nodes:
  - `sets` is [[]] and `zSufficient` is true;
  - the path Maternal smoking ← Health awareness → Prenatal visits ← Clinic access → Birth weight is biasing and closed.
- With `adjusted = {Prenatal visits}`:
  - `zSufficient` is false;
  - that path is open.

---

## 9. Selection bias (`selection`)

```yaml
schema: graphcreator/0.1
name: Selection on NICU admission
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: NICU admission, var_type: categorical, levels: [no, yes], pos: [150, 140] }
edges:
  - { from: Maternal smoking, to: Birth weight }
  - { from: Maternal smoking, to: NICU admission }
  - { from: Birth weight, to: NICU admission }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | Who is in the study | Suppose a study recruits only babies admitted to neonatal intensive care (NICU). Smoking and low birth weight both make admission more likely. | | | | NICU admission: "Only these babies" |
| 2 | Mark the selection | The Selected role marks a variable the study population was selected on. The analysis then treats it as always conditioned on. | | Set the role of NICU admission to Selected. | `role(NICU admission) = selected` | |
| 3 | Selection on a collider | NICU admission is a collider on the path Maternal smoking → NICU admission ← Birth weight. Selecting on it opens that path, just as adjusting for it would. | | Open the Analysis tab and read the Report. | `tab = analysis` | |
| 4 | Where the bias comes from | The Report says no adjustment set can remove this bias. The trouble is that the outcome itself affects who is selected. | | Click the variable whose arrow into NICU admission makes the bias impossible to remove. | pick | |
| 5 | A different design | Imagine a study where admission depends on smoking but not on birth weight. | | Delete the arrow from Birth weight to NICU admission. | `no edge(Birth weight, NICU admission)` | |
| 6 | Done | Without that arrow, the Report finds no selection bias. Whether the arrow exists is a question about how people entered the study, not something the data can tell you. | When the outcome affects who is selected, adjustment cannot remove the bias, as implied by this DAG. | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 4 | Birth weight | Maternal smoking: "Not quite. In this DAG, selection that depends only on the exposure leaves the effect estimable. Look at the other arrow into NICU admission." NICU admission: "That is the selected variable itself. Which variable's arrow into it causes the trouble?" | "Birth weight: the outcome affects who is admitted, so the data show only some outcomes, and no adjustment can recover the rest." |

Claims:

- With NICU admission `other`:
  - `sets` is [[]];
  - the path through NICU admission is biasing and closed.
- With NICU admission `selected`:
  - `selectionBias` is true and `sets` is [];
  - that path is open.
- With NICU admission `selected` and `no edge(Birth weight, NICU admission)`:
  - `selectionBias` is false, `sets` is [[]] and `zSufficient` is true.

---

## 10. Unmeasured variables (`latent`)

```yaml
schema: graphcreator/0.1
name: An unmeasured confounder
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [300, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [0, -180] }
  - { name: Diet, var_type: ordinal, levels: [poor, fair, good], pos: [300, -180] }
  - { name: Genetic factors, role: latent, var_type: continuous, pos: [300, 160] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Diet }
  - { from: Diet, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
  - { from: Genetic factors, to: Birth weight }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | Measured or not | A latent variable is one you did not or cannot measure. Draw it anyway: the DAG should include every common cause, measured or not. | | | | Genetic factors: "Latent" |
| 2 | An unmeasured confounder | Suppose this study did not record SES. | | Set the role of SES to Latent. | `role(SES) = latent` | SES: "Not recorded" |
| 3 | Another way to close the path | The back-door path Maternal smoking ← SES → Diet → Birth weight can be closed at any variable on it that is not a collider. Diet was measured, so adjusting for Diet closes the path. | Adjustment sets only ever contain measured variables. | In the Analysis tab, click Use this set next to Diet. | `adjusted = {Diet}` | Diet: "Measured" |
| 4 | A harmless latent | Not every unmeasured variable causes bias. | | Click the latent variable that does not bias the effect. | pick | |
| 5 | When nothing works | Now suppose SES also affects birth weight directly, not only through diet. | | Draw an arrow from SES to Birth weight. | `edge(SES, Birth weight)` | |
| 6 | Done | The new back-door path runs only through SES, which was not measured, so no set of observed variables is sufficient, as implied by this DAG. You would need to measure SES, find an instrument, or report a sensitivity analysis. | The Report always asks whether there are unmeasured common causes you should add. | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 4 | Genetic factors | SES: "Not quite. SES causes the exposure and, through Diet, the outcome; it would bias the effect if Diet were not adjusted for." Diet: "Diet was measured: its role is Adjusted, not Latent." Maternal smoking: "That is the exposure. Pick a latent variable." Birth weight: "That is the outcome. Pick a latent variable." | "Genetic factors: it affects only Birth weight, so it opens no back-door path." |

Claims:

- With SES `other`, `sets` is [[SES], [Diet]].
- With SES `latent`:
  - `sets` is [[Diet]];
  - with `adjusted = {Diet}`, `zSufficient` is true.
- With SES `latent`, `adjusted = {Diet}` and `edge(SES, Birth weight)`:
  - `sets` is [] and `zSufficient` is false;
  - the path Maternal smoking ← SES → Birth weight is open.
- Genetic factors is on no biasing path.

---

## 11. Adjustment sets (`adjustment`)

The extended running example, also used by lessons 12 and 14:

```yaml
schema: graphcreator/0.1
name: Smoking and birth weight, extended
nodes:
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [0, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [400, 0] }
  - { name: SES, var_type: ordinal, levels: [low, mid, high], pos: [100, -180] }
  - { name: Diet, var_type: ordinal, levels: [poor, fair, good], pos: [300, -180] }
  - { name: Maternal age, var_type: continuous, unit: years, pos: [200, -70] }
  - { name: Gestational age, var_type: continuous, unit: weeks, pos: [200, 130] }
edges:
  - { from: SES, to: Maternal smoking }
  - { from: SES, to: Diet }
  - { from: Diet, to: Birth weight }
  - { from: Maternal age, to: Maternal smoking }
  - { from: Maternal age, to: Birth weight }
  - { from: Maternal smoking, to: Gestational age }
  - { from: Gestational age, to: Birth weight }
  - { from: Maternal smoking, to: Birth weight }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | Two back doors | This DAG has two back-door paths: one through SES and Diet, one through Maternal age. A sufficient adjustment set must close both. | | Open the Analysis tab and switch on Paths. | `tab = analysis ∧ on(paths)` | |
| 2 | Minimal sufficient sets | The Adjustment sets section lists the minimal sufficient sets, as implied by this DAG. Minimal means no variable can be left out of the set. | SES, Maternal age and Diet, Maternal age close the same paths. | | | |
| 3 | The variable you cannot skip | One variable is in every sufficient set. | | Click the variable that must be in every sufficient set. | pick | |
| 4 | Use a set | Use this set marks the set's variables as Adjusted and clears the others. The Report then checks the set. | | Click Use this set next to Diet, Maternal age. | `adjusted = {Diet, Maternal age}` | |
| 5 | Larger sets | Adding SES as well still gives a sufficient set. But adding a mediator, such as Gestational age, would break it. | | Set the role of SES to Adjusted too, and read the Report. | `adjusted = {SES, Diet, Maternal age} ∧ tab = analysis` | |
| 6 | Done | Every listed set removes confounding equally well, as implied by this DAG. Choose the one whose variables were measured best. | Adjustment sets are only as good as the DAG they come from. | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 3 | Maternal age | SES: "Not quite. SES can be swapped for Diet: both close the same back-door path." Diet: "Not quite. Diet can be swapped for SES: both close the same back-door path." Gestational age: "Not quite. Gestational age is a mediator, so it is in no sufficient set." Maternal smoking: "That is the exposure. Pick a variable on a back-door path." Birth weight: "That is the outcome. Pick a variable on a back-door path." | "Maternal age: it is the only variable on the path Maternal smoking ← Maternal age → Birth weight, so every sufficient set must contain it." |

Claims:

- With no adjusted nodes:
  - `sets` is [[SES, Maternal age], [Diet, Maternal age]];
  - the paths, in the order the Paths section lists them:

    | Path | Kind | Open |
    |---|---|---|
    | Maternal smoking → Birth weight | causal | open |
    | Maternal smoking → Gestational age → Birth weight | causal | open |
    | Maternal smoking ← Maternal age → Birth weight | biasing | open |
    | Maternal smoking ← SES → Diet → Birth weight | biasing | open |
- `zSufficient` for each adjusted set:

  | `adjusted =` | `zSufficient` | Also |
  |---|---|---|
  | {Diet, Maternal age} | true | |
  | {SES, Diet, Maternal age} | true | |
  | {Diet, Maternal age, Gestational age} | false | `zForbidden` is [Gestational age] |
  | {SES} | false | |

---

## 12. Testing your DAG (`testing`)

Practice graph: the lesson 11 graph.

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | A DAG makes predictions | Every missing arrow predicts that some variables are unrelated, sometimes only after adjusting for others. You can test these predictions in your data. | | | | |
| 2 | Implied independencies | The Independencies section lists the predictions of this DAG. | | Open the Analysis tab and switch on Independencies. | `tab = analysis ∧ on(independencies)` | |
| 3 | Reading a line | SES ⫫ Maternal age means that knowing one tells you nothing about the other. In Maternal smoking ⫫ Diet \| SES, the variables after \| are the ones to adjust for in the test. | Independent means your data should show no association, for example a correlation close to zero. | | | SES: "Independent"; Maternal age: "Independent" |
| 4 | Why they are independent | Every path between SES and Maternal age passes through a collider, so every one is closed. | | Click a collider between SES and Maternal age. | pick | |
| 5 | When a test fails | Suppose your data show that SES and Maternal age are associated. Then the DAG is missing something, such as an arrow between them. | | Draw an arrow from SES to Maternal age. | `edge(SES, Maternal age)` | |
| 6 | Done | SES ⫫ Maternal age is no longer listed. A failed test shows that the DAG is wrong somewhere; a passed test does not prove it right. | Many different DAGs predict the same independencies. | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 4 | Maternal smoking, Birth weight | Diet: "Not quite. On the path through Diet, the arrows pass through it, so it is not a collider." Gestational age: "Not quite. On the path through Gestational age, one arrow goes in and one comes out, so it is not a collider." SES: "That is one of the pair. Pick a variable on a path between them." Maternal age: "That is one of the pair. Pick a variable on a path between them." | "Maternal smoking: the arrows from SES and Maternal age both point into it. Birth weight is a collider on the other paths." |

Claims:

- On the graph as loaded:
  - `impliedIndependencies` contains SES ⫫ Maternal age with an empty `given`, and Maternal smoking ⫫ Diet | SES;
  - every path between SES and Maternal age has Maternal smoking or Birth weight as a collider;
  - `dConnected(SES, Maternal age, [])` is false.
- With `edge(SES, Maternal age)`, no independence pairs SES with Maternal age.

---

## 13. Instrumental variables (`instruments`)

```yaml
schema: graphcreator/0.1
name: A cigarette tax as instrument
nodes:
  - { name: Cigarette tax, var_type: continuous, unit: "%", pos: [0, 0] }
  - { name: Maternal smoking, role: exposure, var_type: categorical, levels: [no, yes], pos: [220, 0] }
  - { name: Birth weight, role: outcome, var_type: continuous, unit: g, pos: [440, 0] }
  - { name: Lifestyle, role: latent, var_type: continuous, pos: [330, -160] }
edges:
  - { from: Cigarette tax, to: Maternal smoking }
  - { from: Maternal smoking, to: Birth weight }
  - { from: Lifestyle, to: Maternal smoking }
  - { from: Lifestyle, to: Birth weight }
```

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | When adjustment fails | Lifestyle affects both smoking and birth weight, but it was not measured. The Adjustment sets section finds no sufficient set. | | Open the Analysis tab. | `tab = analysis` | Lifestyle: "Not measured" |
| 2 | An instrument | An instrument affects the exposure, shares no causes with the outcome, and affects the outcome only through the exposure. A cigarette tax changes how much people smoke, but should not change birth weight in any other way. | With an instrument, instrumental variable methods can estimate the effect without measuring the confounder. | | | Cigarette tax: "Instrument?" |
| 3 | Find instruments | The Instruments section lists the instruments implied by this DAG. | | Switch on Instruments. | `on(instruments)` | |
| 4 | Pick the instrument | | | Click the instrument. | pick | |
| 5 | Breaking the instrument | Suppose a higher tax also changed diets, and so birth weight, not through smoking. | | Draw an arrow from Cigarette tax to Birth weight. | `edge(Cigarette tax, Birth weight)` | |
| 6 | Done | Cigarette tax is no longer an instrument, as implied by this DAG. Not all the conditions for an instrument can be tested in data, so they need the same care as any arrow. | | | | |

Picks:

| Step | Answers | Wrong-pick hints | Show answer |
|---|---|---|---|
| 4 | Cigarette tax | Lifestyle: "Not quite. Lifestyle is the unmeasured confounder; it affects the outcome directly." Maternal smoking: "That is the exposure. Pick the variable that affects it from outside." Birth weight: "That is the outcome. Pick the variable that affects the exposure from outside." | "Cigarette tax: it affects Maternal smoking and reaches Birth weight only through it." |

Step 4 has no body; the panel then shows only the title and the callout.

Claims:

- On the graph as loaded:
  - `sets` is [];
  - `instruments` is [Cigarette tax] with an empty `given`.
- With `edge(Cigarette tax, Birth weight)`:
  - `instruments` is [];
  - `sets` is still [].

---

## 14. Reporting your DAG (`reporting`)

Practice graph: the lesson 11 graph with SES and Maternal age `adjusted`, evidence `["PMID:123"]` and note `Well established` on SES → Maternal smoking, and a latent `Genetic factors` (`var_type: continuous`, `pos: [400, 160]`) with an arrow to Birth weight.

| # | Title | Body | Key idea | Task | Check | Pointer |
|---|---|---|---|---|---|---|
| 1 | Why report the DAG | A DAG makes your assumptions visible, so that readers can judge them. Tennant et al. (2021) give recommendations for reporting DAGs in health research. | | | | |
| 2 | The Report | The Report states the effect, whether your adjusted set is sufficient and which variables are latent. You can adapt its sentences for your methods section. | | Open the Analysis tab and read the Report. | `tab = analysis ∧ on(report)` | |
| 3 | Show the whole DAG | Show the DAG you used for the analysis, with every variable and arrow, not a simplified one. A legend helps readers see the roles. | | Export the graph as a PDF, PNG or SVG with a legend. | `event(export-downloaded, pdf \| png \| svg)` | |
| 4 | Explain the arrows | Say why each arrow is there, and why important arrows are missing. Evidence and notes keep that reasoning next to the DAG. | Readers should see which arrows are well established and which are assumptions. | | | SES: "Has evidence" |
| 5 | Share the file | Add the GraphCreator file to your supplementary material, so that others can open, check and change your DAG. | | Click Save, then Download. | `event(code-downloaded, yaml)` | |
| 6 | Done | Report the question, the DAG, the adjustment set and why you chose it, and what you could not measure. The Report is a starting point, not a finished methods section. | | | | |

Reference shown nowhere else in the app, so the step 1 body names it in the short form above; the full reference is in this document: Tennant PWG, Murray EJ, Arnold KF, et al. Use of directed acyclic graphs (DAGs) to identify confounders in applied health research: review and recommendations. *Int J Epidemiol* 2021;50(2):620–632. doi:10.1093/ije/dyaa213.

Claims (with SES and Maternal age adjusted):

- `zSufficient` is true.
- The Report's latent line lists Genetic factors: `rolesOf(graph).latent` is [Genetic factors].
- Genetic factors is on no biasing path.
- `sets` is still [[SES, Maternal age], [Diet, Maternal age]].
