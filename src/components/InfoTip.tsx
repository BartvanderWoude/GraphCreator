import { InfoIcon } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export interface InfoTipProps {
  /** The field the tip explains, e.g. "Role" or "Variable type"; named "About <label>". */
  label: string
  /** The tooltip text (spec 5.7.8, `FIELD_TIPS`). */
  text: string
}

/**
 * Teal info button placed after a field label (spec 5.3). Opens a tooltip with `text` on hover
 * or keyboard focus. Brings its own `TooltipProvider`, so it works without an app-level one.
 */
export function InfoTip({ label, text }: InfoTipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${label.toLowerCase()}`}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-primary transition-colors duration-120 outline-none hover:text-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            <InfoIcon aria-hidden className="size-[15px]" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={4}
          className="max-w-64 text-[13px] leading-[1.4]"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
