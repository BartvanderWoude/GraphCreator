import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import plexSans500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2?inline'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  EXPORT_PALETTES,
  imageFileName,
  svgSize,
  svgToPng,
  toSvg,
  toTikz,
  type ImageFormat,
  type ImageTheme,
} from '@/lib/imageExport'
import { toPdf } from '@/lib/pdfExport'
import type { Graph } from '@/model/graph'
import { useGraphStore } from '@/store/graphStore'
import { lessonEvent } from '@/store/lessonEvents'

const FORMATS: { value: ImageFormat; label: string }[] = [
  { value: 'svg', label: 'SVG' },
  { value: 'png', label: 'PNG' },
  { value: 'pdf', label: 'PDF' },
  { value: 'tikz', label: 'TikZ' },
]

const THEMES: { value: ImageTheme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const SCALES = [1, 2, 3] as const
type Scale = (typeof SCALES)[number]

/** CSS pixels to PDF points (96 to 72 per inch, spec 4.11 "PDF"). */
const POINTS_PER_PIXEL = 0.75

/** What the dialog shows for the graph read when it opened and the current Theme and Legend. */
interface Picture {
  svg: string
  tikz: string
  width: number
  height: number
}

function picture(graph: Graph, theme: ImageTheme, legend: boolean): Picture {
  const { width, height } = svgSize(graph, { theme, legend })
  return {
    svg: toSvg(graph, { theme, legend, fontDataUrl: plexSans500 }),
    tikz: toTikz(graph, { legend }),
    width,
    height,
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Exports the graph as an SVG, PNG, PDF or TikZ image (spec 4.11, 5.4 "Export…"). The picture is
 * drawn from the graph data in the chosen theme (TikZ is always light), optionally with a legend
 * of the roles in use, and with the IBM Plex Sans font embedded in SVG and PNG. Format, Theme,
 * Scale and Legend keep their choice while the page is open. While a lesson runs, a successful
 * Copy or Download records `export-copied` or `export-downloaded` with the format (spec 4.8).
 */
export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [format, setFormat] = useState<ImageFormat>('svg')
  const [theme, setTheme] = useState<ImageTheme>('light')
  const [legend, setLegend] = useState(false)
  const [scale, setScale] = useState<Scale>(2)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [wasOpen, setWasOpen] = useState(false)

  // Read the graph each time the dialog opens, not on every change while it is open.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setGraph(useGraphStore.getState().graph)
  }

  const empty = !graph || graph.nodes.length === 0
  const data = useMemo(
    () => (graph && !empty ? picture(graph, theme, legend) : null),
    [graph, empty, theme, legend],
  )
  const disabled = data === null

  async function copyText() {
    if (!data) return
    const [text, what] =
      format === 'tikz' ? [data.tikz, 'TikZ'] : [data.svg, 'SVG']
    try {
      await navigator.clipboard.writeText(text)
      toast(`Copied ${what} code to the clipboard.`)
      lessonEvent({ kind: 'export-copied', format })
    } catch {
      toast.error(
        'Could not copy to the clipboard. Select the text and copy it instead.',
      )
    }
  }

  async function download() {
    if (!graph || !data) return
    const filename = imageFileName(graph.name, format)
    try {
      if (format === 'svg') downloadText(filename, data.svg, 'image/svg+xml')
      else if (format === 'tikz')
        downloadText(filename, data.tikz, 'text/x-tex')
      else if (format === 'pdf')
        downloadBlob(
          filename,
          new Blob(
            [toPdf(graph, { theme, legend }) as Uint8Array<ArrayBuffer>],
            {
              type: 'application/pdf',
            },
          ),
        )
      else downloadBlob(filename, await svgToPng(data.svg, scale))
      lessonEvent({ kind: 'export-downloaded', format })
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
            The image shows names, roles (by color) and arrows, with an optional
            legend. Types, levels and evidence are not included.
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
          {format !== 'tikz' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="export-theme">Theme</Label>
              <Select
                value={theme}
                onValueChange={(value) => setTheme(value as ImageTheme)}
              >
                <SelectTrigger
                  id="export-theme"
                  aria-label="Theme"
                  className="w-28 rounded-md"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THEMES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {format === 'png' && (
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
          )}
          <div className="flex h-8 items-center gap-2">
            <Checkbox
              id="export-legend"
              checked={legend}
              onCheckedChange={(checked) => setLegend(checked === true)}
            />
            <Label htmlFor="export-legend">Legend</Label>
          </div>
          {data && format === 'png' && (
            <p className="pb-1.5 text-[13px] text-muted-foreground">
              {data.width * scale} × {data.height * scale} pixels
            </p>
          )}
          {data && format === 'pdf' && (
            <p className="pb-1.5 text-[13px] text-muted-foreground">
              {Math.round(data.width * POINTS_PER_PIXEL)} ×{' '}
              {Math.round(data.height * POINTS_PER_PIXEL)} points
            </p>
          )}
        </div>

        {!data ? (
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
          // The area takes the image's own background, so a dark image has no white frame.
          <div
            className="flex max-h-96 items-center justify-center overflow-hidden rounded-md border p-4"
            style={{ backgroundColor: EXPORT_PALETTES[theme].background }}
          >
            <img
              alt="Preview of the image"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`}
              className="h-auto max-h-88 w-auto max-w-full"
            />
          </div>
        )}

        <DialogFooter showCloseButton>
          {format !== 'png' && format !== 'pdf' && (
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
