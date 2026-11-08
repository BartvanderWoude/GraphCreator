import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Empty app shell (spec 5.1). Toolbar actions, canvas and editors arrive in phases 5 and 6.
function App() {
  return (
    <div className="flex h-full flex-col">
      <header
        role="toolbar"
        aria-label="Toolbar"
        className="flex items-center gap-2 border-b px-3 py-2"
      >
        <Input
          aria-label="Graph name"
          placeholder="Untitled graph"
          className="w-56"
          disabled
        />
        <Button variant="ghost" disabled>
          New
        </Button>
        <Button variant="ghost" disabled>
          Open
        </Button>
        <Button variant="ghost" disabled>
          Save
        </Button>
        <Button variant="ghost" disabled>
          dagitty
        </Button>
        <Button variant="ghost" disabled>
          Auto-layout
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <main
          aria-label="Canvas"
          className="flex flex-1 items-center justify-center text-muted-foreground"
        >
          Canvas
        </main>
        <aside
          aria-label="Side panel"
          className="w-80 shrink-0 border-l p-4 text-sm text-muted-foreground"
        >
          Nothing selected.
        </aside>
      </div>
    </div>
  )
}

export default App
