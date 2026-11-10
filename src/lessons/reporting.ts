import {
  addEdge,
  addNode,
  updateEdge,
  updateNode,
  type GEdge,
  type GNode,
  type Graph,
} from '@/model/graph'
import { extendedExample } from './adjustment'
import { edgeNamed, hasEvent, nodeNamed } from './helpers'
import type { Lesson } from './types'

function node(graph: Graph, name: string): GNode {
  const found = nodeNamed(graph, name)
  if (!found) throw new Error(`No node named "${name}".`)
  return found
}

function edge(graph: Graph, from: string, to: string): GEdge {
  const found = edgeNamed(graph, from, to)
  if (!found) throw new Error(`No edge from "${from}" to "${to}".`)
  return found
}

/**
 * The practice graph of lesson 14 (docs/LESSONS.md): lesson 11's graph with SES and Maternal age
 * adjusted, evidence and a note on SES → Maternal smoking, and a latent Genetic factors with an
 * arrow to Birth weight.
 */
export function reportingGraph(): Graph {
  let graph = extendedExample()
  graph = updateNode(graph, node(graph, 'SES').id, { role: 'adjusted' })
  graph = updateNode(graph, node(graph, 'Maternal age').id, {
    role: 'adjusted',
  })
  graph = updateEdge(graph, edge(graph, 'SES', 'Maternal smoking').id, {
    evidence: ['PMID:123'],
    note: 'Well established',
  })
  const added = addNode(graph, {
    pos: { x: 400, y: 160 },
    name: 'Genetic factors',
  })
  graph = updateNode(added.graph, added.node.id, {
    role: 'latent',
    varType: 'continuous',
  })
  const result = addEdge(graph, added.node.id, node(graph, 'Birth weight').id)
  if (!result.ok) throw new Error(result.errors[0].message)
  return result.value
}

/** Lesson 14, Reporting your DAG (docs/LESSONS.md). */
export const reportingLesson: Lesson = {
  id: 'reporting',
  title: 'Reporting your DAG',
  summary: 'What to show and say in a paper.',
  track: 'causal',
  sample: reportingGraph,
  steps: [
    {
      title: 'Why report the DAG',
      body: 'A DAG makes your assumptions visible, so that readers can judge them. Tennant et al. (2021) give recommendations for reporting DAGs in health research.',
    },
    {
      title: 'The Report',
      body: 'The Report states the effect, whether your adjusted set is sufficient and which variables are latent. You can adapt its sentences for your methods section.',
      task: 'Open the Analysis tab and read the Report.',
      check: (ctx) => ctx.sidePanelTab === 'analysis' && ctx.analysisOn.report,
    },
    {
      title: 'Show the whole DAG',
      body: 'Show the DAG you used for the analysis, with every variable and arrow, not a simplified one. A legend helps readers see the roles.',
      task: 'Export the graph as a PDF, PNG or SVG with a legend.',
      check: (ctx) => hasEvent(ctx, 'export-downloaded', ['pdf', 'png', 'svg']),
    },
    {
      title: 'Explain the arrows',
      body: 'Say why each arrow is there, and why important arrows are missing. Evidence and notes keep that reasoning next to the DAG.',
      keyIdea:
        'Readers should see which arrows are well established and which are assumptions.',
      pointer: [{ node: 'SES', label: 'Has evidence' }],
    },
    {
      title: 'Share the file',
      body: 'Add the GraphCreator file to your supplementary material, so that others can open, check and change your DAG.',
      task: 'Click Save, then Download.',
      check: (ctx) => hasEvent(ctx, 'code-downloaded', ['yaml']),
    },
    {
      title: 'Done',
      body: 'Report the question, the DAG, the adjustment set and why you chose it, and what you could not measure. The Report is a starting point, not a finished methods section.',
    },
  ],
}
