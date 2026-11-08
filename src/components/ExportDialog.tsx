import { useState } from 'react'
import { toast } from 'sonner'
import plexSans500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2?inline'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { downloadBlob, downloadText } from '@/lib/download'
import {
  imageFileName,
  svgSize,
  svgToPng,
  toSvg,
  toTikz,
  type ImageFormat,
} from '@/lib/imageExport'
import { useGraphStore } from '@/store/graphStore'

const FORMATS: { value: ImageFormat; label: string }[] = [
  { value: 'svg', label: 'SVG' },
  { value: 'png', label: 'PNG' },
  { value: 'tikz', label: 'TikZ' },
]

const SCALES = [1, 2, 3] as const
type Scale = (typeof SCALES)[number]

/** What the dialog shows, computed from the store's graph when it opens (spec 5.4). */
interface Snapshot {
  empty: boolean
  name: string | undefined
  svg: string
  tikz: string
  width: number
  height: number
}

function snapshot(): Snapshot {
  const graph = useGraphStore.getState().graph
  const { width, height } = svgSize(graph)
  return {
    empty: graph.nodes.length === 0,
    name: graph.name,
    svg: toSvg(graph, { fontDataUrl: plexSans500 }),
    tikz: toTikz(graph),
    width,
    height,
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Exports the graph as an SVG, PNG or TikZ image (spec 4.11, 5.4 "Export…"). The picture is
 * drawn from the graph data in the light palette, with the IBM Plex Sans font embedded.
 */
export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [format, setFormat] = useState<ImageFormat>('svg')
  const [scale, setScale] = useState<Scale>(2)
  const [data, setData] = useState<Snapshot | null>(null)
  const [wasOpen, setWasOpen] = useState(false)

  // Read the graph each time the dialog opens, not on every change while it is open.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setData(snapshot())
  }

  const disabled = !data || data.empty

  async function copyText() {
    if (!data) return
    const [text, what] =
      format === 'tikz' ? [data.tikz, 'TikZ'] : [data.svg, 'SVG']
    try {
      await navigator.clipboard.writeText(text)
      toast(`Copied ${what} code to the clipboard.`)
    } catch {
      toast.error(
        'Could not copy to the clipboard. Select the text and copy it instead.',
      )
    }
  }

  async function download() {
    if (!data) return
    const filename = imageFileName(data.name, format)
    try {
      if (format === 'svg') downloadText(filename, data.svg, 'image/svg+xml')
      else if (format === 'tikz')
        downloadText(filename, data.tikz, 'text/x-tex')
      else downloadBlob(filename, await svgToPng(data.svg, scale))
    } catch (e) {
      toast.error(
        format === 'png'
          ? errorMessage(e)
          : `Could not download the file: ${errorMessage(e)}`,
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export image</DialogTitle>
          <DialogDescription>
            The image shows names, roles (by color) and arrows. Types, levels
            and evidence are not included.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="export-format">Format</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as ImageFormat)}
            >
              <SelectTrigger
                id="export-format"
                aria-label="Format"
                className="w-32 rounded-md"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {format === 'png' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="export-scale">Scale</Label>
                <Select
                  value={String(scale)}
                  onValueChange={(value) => setScale(Number(value) as Scale)}
                >
                  <SelectTrigger
                    id="export-scale"
                    aria-label="Scale"
                    className="w-24 rounded-md"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCALES.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {data && !data.empty && (
                <p className="pb-1.5 text-[13px] text-muted-foreground">
                  {data.width * scale} × {data.height * scale} pixels
                </p>
              )}
            </>
          )}
        </div>

        {!data || data.empty ? (
          <p className="flex min-h-32 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
            There is nothing to export yet. Add a node first.
          </p>
        ) : format === 'tikz' ? (
          <Textarea
            aria-label="TikZ code"
            readOnly
            value={data.tikz}
            spellCheck={false}
            className="max-h-96 min-h-48 font-mono text-xs md:text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <div className="flex max-h-96 items-center justify-center overflow-hidden rounded-md border bg-white p-4">
            <img
              alt="Preview of the image"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`}
              className="h-auto max-h-88 w-auto max-w-full"
            />
          </div>
        )}

        <DialogFooter showCloseButton>
          {format !== 'png' && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => void copyText()}
            >
              Copy
            </Button>
          )}
          <Button disabled={disabled} onClick={() => void download()}>
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
