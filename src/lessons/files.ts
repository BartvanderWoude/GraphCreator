import smokingYaml from '@/model/__fixtures__/smoking.dag.yaml?raw'
import { hasEvent, practiceGraph } from './helpers'
import type { Lesson } from './types'

/** Lesson 4 (docs/LESSONS.md); its practice graph is the smoking fixture. */
export const filesLesson: Lesson = {
  id: 'files',
  title: 'Saving, sharing and exporting',
  summary: 'Files for other tools, images, links and undo.',
  track: 'app',
  sample: () => practiceGraph(smokingYaml),
  steps: [
    {
      title: 'Your work stays here',
      body: 'GraphCreator keeps your graph in this browser as you work. Nothing is uploaded. To keep a copy or send it, save a file.',
    },
    {
      title: 'Save a GraphCreator file',
      body: 'The GraphCreator file (.dag.yaml) keeps everything: roles, types, levels, evidence and positions. Open… reads it back later.',
      task: 'Click Save, then Download.',
      check: (ctx) => hasEvent(ctx, 'code-downloaded', ['yaml']),
    },
    {
      title: 'Files for other tools',
      body: 'Save as… writes formats that other tools read: dagitty, GML for DoWhy and networkx, DOT, bnlearn, Tetrad and Mermaid. Each dialog says what its format keeps.',
      keyIdea:
        'Names become safe ids such as Maternal_smoking, so they can match the column names in your data.',
      task: 'Open Save as… → dagitty… and copy or download the code.',
      check: (ctx) =>
        hasEvent(ctx, 'code-copied', ['dagitty']) ||
        hasEvent(ctx, 'code-downloaded', ['dagitty']),
    },
    {
      title: 'Export a picture',
      body: 'Export… draws the graph as SVG, PNG, PDF or TikZ, in a light or dark theme. A legend can explain the role colors.',
      task: 'Export the graph as a PDF.',
      check: (ctx) => hasEvent(ctx, 'export-downloaded', ['pdf']),
    },
    {
      title: 'Share a link',
      body: 'Share copies a link that holds the whole graph. The graph travels inside the link, not on a server.',
      task: 'Click Share.',
      check: (ctx) => hasEvent(ctx, 'link-copied'),
    },
    {
      title: 'Undo',
      body: 'Every change can be undone with Ctrl+Z and redone with Ctrl+Shift+Z, or with the buttons at the bottom of the tool rail.',
      task: 'Move a circle, then press Ctrl+Z.',
      check: (ctx) => hasEvent(ctx, 'undo'),
    },
    {
      title: 'Done',
      body: 'Open… reads GraphCreator, dagitty, GML, DOT and networkx JSON, from a file or pasted code. It is not available during a lesson, so your own graph stays safe.',
    },
  ],
}
