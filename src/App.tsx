import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from '@/components/Canvas'
import { LessonPanel } from '@/components/LessonPanel'
import { LessonsDialog } from '@/components/LessonsDialog'
import { SavedIndicator } from '@/components/SavedIndicator'
import { SharedGraphDialog } from '@/components/SharedGraphDialog'
import { SidePanel } from '@/components/SidePanel'
import { ToolRail } from '@/components/ToolRail'
import { TopBar } from '@/components/TopBar'
import { useToolShortcuts } from '@/components/useToolShortcuts'
import { WelcomeDialog } from '@/components/WelcomeDialog'
import { Toaster } from '@/components/ui/sonner'

/**
 * Screen layout (spec 5.1): the top bar; below it the tool rail, the lesson panel (only during a
 * lesson), the canvas with the saved indicator, and the side panel; plus the welcome slides, the
 * Lessons dialog (spec 5.7.11), the shared-graph dialog (spec 5.4) and the toasts. The shortcuts
 * hook sits outside the React Flow provider on purpose: it runs the view actions that the top bar
 * and the rail register (spec 8, redesign contracts).
 */
function App() {
  useToolShortcuts()
  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <ToolRail />
          <LessonPanel />
          <main
            aria-label="Canvas"
            className="relative flex min-h-0 min-w-0 flex-1"
          >
            <Canvas />
            <SavedIndicator />
          </main>
          <SidePanel />
        </div>
      </div>
      <WelcomeDialog />
      <LessonsDialog />
      <SharedGraphDialog />
      <Toaster />
    </ReactFlowProvider>
  )
}

export default App
