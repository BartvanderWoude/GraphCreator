import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from 'cn'
// The lock tooltip is shared with the editors (spec 5.10).
import { LockTip } from '@/components/NodeEditor'
import { useAnalysis } from '@/components/useAnalysis'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ANALYSIS_TEXT, ANALYSIS_TITLES } from '@/lib/copy'
import type {
  AdjustmentResult,
  Analysis,
  Independence,
  Instrument,
  PathInfo,
  PathsResult,
} from '@/model/analysis'
import { useGraphStore } from '@/store/graphStore'
import { ANALYSIS_KEYS, useUiStore, type AnalysisKey } from '@/store/uiStore'

/** Rows shown before "Show all <n>" in the long lists (spec 5.8). */
const LIST_LIMIT = 20

/** Node id → name. Ids not in the graph are shown as they are. */
type NamesOf = (ids: readonly string[]) => string[]

/**
 * The Analysis tab (spec 5.8): five sections in `ANALYSIS_KEYS` order, each with a switch in its
 * header. Everything shown is computed by `useAnalysis` from the current graph.
 */
export function AnalysisPanel() {
  const analysis = useAnalysis()
  const graph = useGraphStore((s) => s.graph)
  const analysisOn = useUiStore((s) => s.analysisOn)
  const setAnalysisOn = useUiStore((s) => s.setAnalysisOn)

  // Leaving the tab unmounts the panel: no circle stays highlighted.
  useEffect(() => () => useUiStore.getState().setHoverNodeIds([]), [])

  const namesOf = useMemo<NamesOf>(() => {
    const names = new Map(graph.nodes.map((n) => [n.id, n.name]))
    return (ids) => ids.map((id) => names.get(id) ?? id)
  }, [graph])
  const edgeKeys = useMemo(
    () => new Set(graph.edges.map((e) => `${e.source}\n${e.target}`)),
    [graph],
  )

  const ok = analysis.status === 'ok'

  return (
    <div className="flex flex-col gap-4">
      {!ok && (
        <p className="text-[13px] leading-[1.4] text-muted-foreground">
          {ANALYSIS_TEXT.noExposureOrOutcome}
        </p>
      )}
      {ANALYSIS_KEYS.map((key, index) => {
        const body = sectionBody(key, analysis, namesOf, edgeKeys)
        return (
          <Section
            key={key}
            sectionKey={key}
            first={index === 0}
            count={body?.count}
            on={analysisOn[key]}
            onChange={(on) => setAnalysisOn(key, on)}
          >
            {body?.content}
          </Section>
        )
      })}
    </div>
  )
}

/** A section's count and content; null when it shows only its header. */
function sectionBody(
  key: AnalysisKey,
  analysis: Analysis,
  namesOf: NamesOf,
  edgeKeys: Set<string>,
): { count?: number; content: ReactNode } | null {
  if (key === 'independencies') {
    return {
      count: analysis.independencies.length,
      content: (
        <IndependenciesBody items={analysis.independencies} namesOf={namesOf} />
      ),
    }
  }
  if (analysis.status !== 'ok') return null
  switch (key) {
    case 'report':
      return analysis.adjustment
        ? {
            content: (
              <ReportBody
                analysis={analysis}
                adjustment={analysis.adjustment}
                namesOf={namesOf}
              />
            ),
          }
        : null
    case 'adjustment':
      return analysis.adjustment
        ? {
            count: analysis.adjustment.sets.length,
            content: (
              <AdjustmentBody
                adjustment={analysis.adjustment}
                z={analysis.roles.z}
                namesOf={namesOf}
              />
            ),
          }
        : null
    case 'paths':
      return analysis.paths
        ? {
            count: analysis.paths.truncated
              ? undefined
              : analysis.paths.paths.length,
            content: (
              <PathsBody
                result={analysis.paths}
                namesOf={namesOf}
                edgeKeys={edgeKeys}
              />
            ),
          }
        : null
    case 'instruments':
      return {
        count:
          analysis.instruments === 'needs-single'
            ? undefined
            : analysis.instruments.length,
        content: (
          <InstrumentsBody
            instruments={analysis.instruments}
            namesOf={namesOf}
          />
        ),
      }
  }
}

/** A section: the header (title, count, switch) and, when switched on, its content. */
function Section({
  sectionKey,
  first,
  count,
  on,
  onChange,
  children,
}: {
  sectionKey: AnalysisKey
  first: boolean
  count?: number
  on: boolean
  onChange: (on: boolean) => void
  children: ReactNode
}) {
  const title = ANALYSIS_TITLES[sectionKey]
  const headingId = `analysis-${sectionKey}`
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-3',
        !first && 'border-t border-border pt-4',
      )}
    >
      <div className="flex items-center gap-2">
        <h2 id={headingId} className="text-[15px] leading-[1.4] font-semibold">
          {title}
        </h2>
        {count !== undefined && (
          <span className="font-mono text-[13px] leading-[1.4] text-muted-foreground">
            {ANALYSIS_TEXT.count(count)}
          </span>
        )}
        <Switch
          className="ml-auto"
          checked={on}
          onCheckedChange={onChange}
          aria-label={ANALYSIS_TEXT.switchLabel(title)}
        />
      </div>
      {on && children}
    </section>
  )
}

/** A plain sentence in a section. */
function Line({ children }: { children: ReactNode }) {
  return <p className="leading-normal">{children}</p>
}

/** A muted caption line. */
function Muted({ children }: { children: ReactNode }) {
  return (
    <p className="text-[13px] leading-[1.4] text-muted-foreground">
      {children}
    </p>
  )
}

/** The Tennant report (spec 5.8). */
function ReportBody({
  analysis,
  adjustment,
  namesOf,
}: {
  analysis: Analysis
  adjustment: AdjustmentResult
  namesOf: NamesOf
}) {
  const { roles } = analysis
  const z = namesOf(roles.z)
  const s = namesOf(roles.s)

  const adjustmentLines: string[] = []
  if (adjustment.zSufficient) {
    adjustmentLines.push(
      z.length === 0
        ? ANALYSIS_TEXT.noAdjustmentNeeded
        : ANALYSIS_TEXT.zSufficient(z),
    )
  } else {
    adjustmentLines.push(ANALYSIS_TEXT.zNotSufficient(z))
    if (adjustment.zForbidden.length > 0) {
      adjustmentLines.push(
        ANALYSIS_TEXT.zForbidden(namesOf(adjustment.zForbidden)),
      )
    }
    if (adjustment.selectionBias) {
      adjustmentLines.push(ANALYSIS_TEXT.selectionBias(s))
    } else if (adjustment.sets.length === 0) {
      adjustmentLines.push(ANALYSIS_TEXT.noSufficientSet)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Line>
        {ANALYSIS_TEXT.totalEffect(namesOf(roles.x), namesOf(roles.y))}
      </Line>
      {adjustmentLines.map((line) => (
        <Line key={line}>{line}</Line>
      ))}
      {s.length > 0 && <Line>{ANALYSIS_TEXT.selected(s)}</Line>}
      <Line>{ANALYSIS_TEXT.latent(namesOf(roles.latent))}</Line>
      <Line>{ANALYSIS_TEXT.unmeasuredQuestion}</Line>
    </div>
  )
}

/** Minimal sufficient adjustment sets with Use this set / In use (spec 5.8). */
function AdjustmentBody({
  adjustment,
  z,
  namesOf,
}: {
  adjustment: AdjustmentResult
  z: string[]
  namesOf: NamesOf
}) {
  const setAdjustedSet = useGraphStore((s) => s.setAdjustedSet)
  // A locked graph still runs the analyses, but its adjusted set cannot be changed (spec 5.10).
  const locked = useGraphStore((s) => s.graph.locked === true)
  if (adjustment.sets.length === 0) {
    return <Line>{ANALYSIS_TEXT.noSufficientSet}</Line>
  }
  const zKey = z.join('\n')
  return (
    <div className="flex flex-col gap-2">
      <Line>{ANALYSIS_TEXT.setsIntro}</Line>
      <RowList label={ANALYSIS_TITLES.adjustment}>
        {adjustment.sets.map((set) => (
          <Row key={set.join('\n')} nodeIds={set}>
            <span className="min-w-0 flex-1 break-words">
              {ANALYSIS_TEXT.set(namesOf(set))}
            </span>
            {set.join('\n') === zKey ? (
              <span className="shrink-0 px-2 text-[13px] leading-6 text-muted-foreground">
                {ANALYSIS_TEXT.inUse}
              </span>
            ) : (
              <LockTip locked={locked} className="shrink-0">
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  disabled={locked}
                  onClick={() => setAdjustedSet(set)}
                >
                  {ANALYSIS_TEXT.useThisSet}
                </Button>
              </LockTip>
            )}
          </Row>
        ))}
      </RowList>
      {adjustment.truncated && <Muted>{ANALYSIS_TEXT.setsTruncated}</Muted>}
    </div>
  )
}

/** Paths from the exposures to the outcomes with their kind and state (spec 5.8). */
function PathsBody({
  result,
  namesOf,
  edgeKeys,
}: {
  result: PathsResult
  namesOf: NamesOf
  edgeKeys: Set<string>
}) {
  if (result.truncated) return <Line>{ANALYSIS_TEXT.pathsTruncated}</Line>
  if (result.paths.length === 0) return <Line>{ANALYSIS_TEXT.noPaths}</Line>
  return (
    <LongList
      label={ANALYSIS_TITLES.paths}
      items={result.paths}
      itemKey={(path) => path.nodes.join('\n')}
      nodeIds={(path) => path.nodes}
      render={(path) => (
        <>
          <span className="min-w-0 flex-1 break-words">
            {pathText(path, namesOf, edgeKeys)}
          </span>
          <span className="shrink-0 text-[13px] leading-normal whitespace-nowrap text-muted-foreground">
            {ANALYSIS_TEXT.pathTag(path.kind, path.open)}
          </span>
        </>
      )}
    />
  )
}

/** "A ← B → C": names joined by arrows that follow the edge directions. */
function pathText(
  path: PathInfo,
  namesOf: NamesOf,
  edgeKeys: Set<string>,
): string {
  const names = namesOf(path.nodes)
  let text = names[0] ?? ''
  for (let i = 1; i < path.nodes.length; i++) {
    const forward = edgeKeys.has(`${path.nodes[i - 1]}\n${path.nodes[i]}`)
    text += `${forward ? ' → ' : ' ← '}${names[i]}`
  }
  return text
}

/** Instruments, each with its conditioning set (spec 5.8). */
function InstrumentsBody({
  instruments,
  namesOf,
}: {
  instruments: Instrument[] | 'needs-single'
  namesOf: NamesOf
}) {
  if (instruments === 'needs-single') {
    return <Line>{ANALYSIS_TEXT.instrumentsNeedSingle}</Line>
  }
  if (instruments.length === 0) {
    return <Line>{ANALYSIS_TEXT.noInstruments}</Line>
  }
  return (
    <LongList
      label={ANALYSIS_TITLES.instruments}
      items={instruments}
      itemKey={(item) => item.instrument}
      nodeIds={(item) => [item.instrument, ...item.given]}
      render={(item) => (
        <span className="min-w-0 flex-1 break-words">
          {ANALYSIS_TEXT.instrument(
            namesOf([item.instrument])[0] ?? '',
            namesOf(item.given),
          )}
        </span>
      )}
    />
  )
}

/** Testable independencies in A ⫫ B | C notation (spec 5.8). */
function IndependenciesBody({
  items,
  namesOf,
}: {
  items: Independence[]
  namesOf: NamesOf
}) {
  if (items.length === 0) {
    return <Line>{ANALYSIS_TEXT.noIndependencies}</Line>
  }
  return (
    <div className="flex flex-col gap-2">
      <Line>{ANALYSIS_TEXT.independenciesIntro}</Line>
      <LongList
        label={ANALYSIS_TITLES.independencies}
        items={items}
        itemKey={(item) => `${item.a}\n${item.b}`}
        nodeIds={(item) => [item.a, item.b, ...item.given]}
        render={(item) => {
          const [a, b] = namesOf([item.a, item.b])
          return (
            <span className="min-w-0 flex-1 font-mono text-[13px] leading-normal break-words">
              {ANALYSIS_TEXT.independence(
                a ?? '',
                b ?? '',
                namesOf(item.given),
              )}
            </span>
          )
        }}
      />
    </div>
  )
}

/** A list that shows its first `LIST_LIMIT` rows, then a "Show all <n>" link button. */
function LongList<T>({
  label,
  items,
  itemKey,
  nodeIds,
  render,
}: {
  label: string
  items: T[]
  itemKey: (item: T) => string
  nodeIds: (item: T) => string[]
  render: (item: T) => ReactNode
}) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, LIST_LIMIT)
  return (
    <div className="flex flex-col gap-1">
      <RowList label={label}>
        {shown.map((item) => (
          <Row key={itemKey(item)} nodeIds={nodeIds(item)}>
            {render(item)}
          </Row>
        ))}
      </RowList>
      {shown.length < items.length && (
        <Button
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => setAll(true)}
        >
          {ANALYSIS_TEXT.showAll(items.length)}
        </Button>
      )}
    </div>
  )
}

/** The rows of a section, labelled with its title for screen readers. */
function RowList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="-mx-2 flex flex-col">
      {children}
    </ul>
  )
}

/**
 * One focusable row. Hovering or focusing it puts the hover rim on its nodes; leaving, blurring
 * or unmounting while it is the active row clears the rim.
 */
function Row({
  nodeIds,
  children,
}: {
  nodeIds: string[]
  children: ReactNode
}) {
  const setHoverNodeIds = useUiStore((s) => s.setHoverNodeIds)
  const active = useRef(false)

  useEffect(
    () => () => {
      if (active.current) useUiStore.getState().setHoverNodeIds([])
    },
    [],
  )

  const enter = () => {
    active.current = true
    setHoverNodeIds(nodeIds)
  }
  const leave = () => {
    active.current = false
    setHoverNodeIds([])
  }

  return (
    <li
      tabIndex={0}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      className="flex items-center gap-2 rounded-md px-2 py-1 leading-normal transition-colors duration-120 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {children}
    </li>
  )
}
