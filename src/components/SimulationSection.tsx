import type { ReactNode } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { cn } from 'cn'
import { InfoTip } from '@/components/InfoTip'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { FIELD_TIPS } from '@/lib/copy'
import { useUiStore } from '@/store/uiStore'

export interface SimulationSectionProps {
  /** The item has simulation details (`hasSimulationDetails`): a closed section shows `set`. */
  marked: boolean
  children?: ReactNode
}

/**
 * The collapsible Simulation section at the bottom of the node and edge editors (spec 5.9). Its
 * open state is `uiStore.simulationOpen`, shared by both editors and kept across visits.
 */
export function SimulationSection({
  marked,
  children,
}: SimulationSectionProps) {
  const open = useUiStore((s) => s.simulationOpen)
  const setOpen = useUiStore((s) => s.setSimulationOpen)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="flex flex-col gap-4 border-t border-border pt-4"
    >
      <div className="flex items-center gap-1">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="-ml-2 h-8 min-w-0 flex-1 justify-start gap-1.5 rounded-md px-2 text-[15px] leading-[1.4] font-semibold aria-expanded:bg-transparent aria-expanded:hover:bg-muted"
          >
            <ChevronRightIcon
              aria-hidden
              strokeWidth={1.75}
              className={cn(
                'size-4 transition-transform duration-120 motion-reduce:transition-none',
                open && 'rotate-90',
              )}
            />
            Simulation
            {!open && marked && (
              <span className="font-mono text-[13px] leading-[1.4] font-normal text-muted-foreground">
                set
              </span>
            )}
          </Button>
        </CollapsibleTrigger>
        <InfoTip label="Simulation" text={FIELD_TIPS.simulation} />
      </div>
      <CollapsibleContent className="flex flex-col gap-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
