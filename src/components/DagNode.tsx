import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { NODE_HEIGHT, NODE_WIDTH } from '@/model/layout'
import type { Role } from '@/model/schema'
import { cn } from '@/lib/utils'

/** Data carried by a React Flow node of type `dag` (derived from a `GNode`). */
export type DagNodeData = {
  name: string
  role: Role
  untyped: boolean
}

export type DagFlowNode = Node<DagNodeData, 'dag'>

const BADGE: Record<Role, string | null> = {
  exposure: 'E',
  outcome: 'O',
  latent: 'L',
  adjusted: 'A',
  selected: 'S',
  other: null,
}

/** Node box per spec 5.2: name, role badge, role colour, dashed border for latent, ⚠ when untyped. */
export function DagNode({ data, selected }: NodeProps<DagFlowNode>) {
  const colour = `var(--role-${data.role})`
  const badge = BADGE[data.role]
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-2 text-sm text-foreground shadow-sm',
        data.role === 'latent' && 'border-dashed',
        selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
      )}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        borderColor: colour,
        backgroundColor: `color-mix(in srgb, ${colour} 12%, var(--background))`,
      }}
      data-role={data.role}
    >
      <Handle type="target" position={Position.Left} />
      {badge && (
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
          style={{ backgroundColor: colour }}
          title={data.role}
          aria-label={`Role: ${data.role}`}
        >
          {badge}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium" title={data.name}>
        {data.name}
      </span>
      {data.untyped && (
        <span
          className="shrink-0 text-xs"
          title="No variable type"
          aria-label="No variable type"
        >
          ⚠
        </span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
