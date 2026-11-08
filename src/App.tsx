import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from '@/components/Canvas'
import { SidePanel } from '@/components/SidePanel'
import { Toolbar } from '@/components/Toolbar'
import { Toaster } from '@/components/ui/sonner'

/** Screen layout (spec 5.1): toolbar on top, canvas and side panel side by side below it. */
function App() {
  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar />
        <div className="flex min-h-0 flex-1">
          <main aria-label="Canvas" className="flex min-h-0 min-w-0 flex-1">
            <Canvas />
          </main>
          <SidePanel />
        </div>
      </div>
      <Toaster />
    </ReactFlowProvider>
  )
}

export default App
