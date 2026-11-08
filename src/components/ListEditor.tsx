import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from 'cn'

interface Row {
  key: number
  value: string
}

export interface ListEditorProps {
  /** Committed items. Read once on mount; key the editor to reset it. */
  items: string[]
  /** Called with the non-empty items whenever the list is committed and changed. */
  onCommit(items: string[]): void
  /** Accessible name of the list, also used for item and button labels (e.g. "Level"). */
  itemLabel: string
  /** Text of the add button, e.g. "Add level". */
  addLabel: string
  /** Placeholder for each item input. */
  placeholder?: string
  /** Show items in Plex Mono, for text that is an identifier (evidence, spec 5.7.3). */
  mono?: boolean
}

/**
 * Editable list of strings (spec 5.3): one input per item with add, remove, move up and move
 * down buttons. Text commits on blur and Enter; Enter in the last input adds a new item. Empty
 * items are dropped on commit.
 */
export function ListEditor({
  items,
  onCommit,
  itemLabel,
  addLabel,
  placeholder,
  mono = false,
}: ListEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((value, key) => ({ key, value })),
  )
  const nextKey = useRef(items.length)
  const committed = useRef<string[]>(items)
  const focusKey = useRef<number | null>(null)

  const commit = (next: Row[]) => {
    const values = next.map((r) => r.value.trim()).filter((v) => v !== '')
    const prev = committed.current
    if (
      values.length === prev.length &&
      values.every((v, i) => v === prev[i])
    ) {
      return
    }
    committed.current = values
    onCommit(values)
  }

  const change = (next: Row[]) => {
    setRows(next)
    commit(next)
  }

  const add = () => {
    const row: Row = { key: nextKey.current++, value: '' }
    focusKey.current = row.key
    setRows([...rows, row])
  }

  const remove = (index: number) => change(rows.filter((_, i) => i !== index))

  const move = (index: number, by: -1 | 1) => {
    const to = index + by
    if (to < 0 || to >= rows.length) return
    const next = [...rows]
    ;[next[index], next[to]] = [next[to], next[index]]
    change(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    commit(rows)
    if (index === rows.length - 1 && rows[index].value.trim() !== '') add()
  }

  const setInput = (key: number) => (el: HTMLInputElement | null) => {
    if (el && focusKey.current === key) {
      focusKey.current = null
      el.focus()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label={`${itemLabel} list`}>
          {rows.map((row, i) => (
            <li key={row.key} className="flex items-center gap-0.5">
              <Input
                ref={setInput(row.key)}
                className={cn('mr-1 rounded-md', mono && 'font-mono')}
                aria-label={`${itemLabel} ${i + 1}`}
                placeholder={placeholder}
                value={row.value}
                onChange={(e) =>
                  setRows(
                    rows.map((r) =>
                      r.key === row.key ? { ...r, value: e.target.value } : r,
                    ),
                  )
                }
                onBlur={() => commit(rows)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-md text-muted-foreground"
                aria-label={`Move ${itemLabel.toLowerCase()} ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUpIcon strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-md text-muted-foreground"
                aria-label={`Move ${itemLabel.toLowerCase()} ${i + 1} down`}
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDownIcon strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-md text-muted-foreground"
                aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
                onClick={() => remove(i)}
              >
                <XIcon strokeWidth={1.75} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start rounded-md"
        onClick={add}
      >
        <PlusIcon data-icon="inline-start" strokeWidth={1.75} />
        {addLabel}
      </Button>
    </div>
  )
}
