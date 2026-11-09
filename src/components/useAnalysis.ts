import { useMemo } from 'react'
import { analyze, type Analysis } from '@/model/analysis'
import { useGraphStore } from '@/store/graphStore'

/** The causal analysis of the current graph (spec 4.14), memoised on the immutable graph object. */
export function useAnalysis(): Analysis {
  const graph = useGraphStore((s) => s.graph)
  return useMemo(() => analyze(graph), [graph])
}
