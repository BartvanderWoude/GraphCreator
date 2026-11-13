import { useId } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/copy'
import { ROLES, type Role } from '@/model/schema'
import { cn } from 'cn'

/** Swatch colours per role (spec 5.7.2); full class names so Tailwind finds them. */
const SWATCH: Record<Role, string> = {
  exposure: 'bg-role-exposure-fill border-role-exposure-line',
  outcome: 'bg-role-outcome-fill border-role-outcome-line',
  latent: 'bg-role-latent-fill border-role-latent-line',
  adjusted: 'bg-role-adjusted-fill border-role-adjusted-line',
  selected: 'bg-role-selected-fill border-role-selected-line',
  other: 'bg-role-other-fill border-role-other-line',
}

/** A small circle in the role's fill and outline colours. */
function RoleSwatch({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-3.5 shrink-0 rounded-full border-2',
        SWATCH[role],
        className,
      )}
    />
  )
}

export interface RolePickerProps {
  /** Id of the trigger, for the field's `<Label htmlFor>`. */
  id: string
  value: Role
  onChange(role: Role): void
  /** Locked graph (spec 5.10): the role can be read but not changed. */
  disabled?: boolean
}

/**
 * Role select (spec 5.3): the trigger shows the role's swatch and label; each option shows
 * swatch, label and the role's description. An option's accessible name is its label alone;
 * the description is attached with `aria-describedby`.
 */
export function RolePicker({
  id,
  value,
  onChange,
  disabled = false,
}: RolePickerProps) {
  const descId = useId()
  return (
    <Select
      value={value}
      onValueChange={(role) => onChange(role as Role)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full rounded-md">
        <SelectValue>
          <RoleSwatch role={value} />
          {ROLE_LABELS[value]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="w-(--radix-select-trigger-width)"
      >
        {ROLES.map((role) => (
          <SelectItem
            key={role}
            value={role}
            aria-describedby={`${descId}-${role}`}
            className="py-1.5 *:[span]:last:items-start"
          >
            <RoleSwatch role={role} className="mt-[3px]" />
            <span className="flex flex-col gap-0.5">
              <span>{ROLE_LABELS[role]}</span>
              {/* Hidden from the option's name; read out as its description instead. */}
              <span
                id={`${descId}-${role}`}
                aria-hidden
                className="text-[13px] leading-[1.4] whitespace-normal text-muted-foreground"
              >
                {ROLE_DESCRIPTIONS[role]}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
