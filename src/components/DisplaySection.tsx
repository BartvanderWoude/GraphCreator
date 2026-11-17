import { InfoTip } from '@/components/InfoTip'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DISPLAY_LABELS, DISPLAY_TIPS, DISPLAY_TITLE } from '@/lib/copy'
import { DISPLAY_KEYS, type DisplayKey } from '@/lib/display'
import { useUiStore } from '@/store/uiStore'

/**
 * The Display section of the Edit tab (spec 5.11), shown when nothing is selected: one switch per
 * display option (4.18), always all six, in `DISPLAY_KEYS` order. The switches are a viewer
 * preference in `uiStore.display`, so they stay enabled on a locked graph and during a lesson.
 */
export function DisplaySection() {
  return (
    <section aria-labelledby="display-title" className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <h2
          id="display-title"
          className="text-[15px] leading-[1.4] font-semibold"
        >
          {DISPLAY_TITLE}
        </h2>
        <InfoTip label={DISPLAY_TITLE} text={DISPLAY_TIPS.title} />
      </div>
      <div className="flex flex-col">
        {DISPLAY_KEYS.map((key) => (
          <DisplayRow key={key} displayKey={key} />
        ))}
      </div>
    </section>
  )
}

/** One option: its label and info tip, and the switch at the right end of the row. */
function DisplayRow({ displayKey }: { displayKey: DisplayKey }) {
  const on = useUiStore((s) => s.display[displayKey])
  const setDisplay = useUiStore((s) => s.setDisplay)
  const id = `display-${displayKey}`
  const label = DISPLAY_LABELS[displayKey]
  return (
    <div className="flex h-8 items-center gap-1">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <InfoTip label={label} text={DISPLAY_TIPS[displayKey]} />
      <Switch
        id={id}
        className="ml-auto"
        checked={on}
        onCheckedChange={(checked) => setDisplay(displayKey, checked)}
      />
    </div>
  )
}
