import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import './index.css'
import App from './App.tsx'
import { hasBeenWelcomed, safeLocalStorage } from './lib/welcome'
import { startAutosave } from './store/autosave'
import { useUiStore } from './store/uiStore'

startAutosave(safeLocalStorage())

// First visit: show the welcome slides (spec 5.7.9).
if (!hasBeenWelcomed(safeLocalStorage())) useUiStore.getState().openWelcome()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="graphcreator:theme"
      disableTransitionOnChange
    >
      <App />
    </ThemeProvider>
  </StrictMode>,
)
