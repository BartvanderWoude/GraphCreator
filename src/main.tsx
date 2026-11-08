import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { hasBeenWelcomed, safeLocalStorage } from './lib/welcome'
import { startAutosave } from './store/autosave'
import { applyTheme, useThemeStore } from './store/themeStore'
import { useUiStore } from './store/uiStore'

startAutosave(safeLocalStorage())

// Light unless the user chose dark (spec 5.7.2); index.html already applied a stored dark theme.
applyTheme(useThemeStore.getState().theme)

// First visit: show the welcome slides (spec 5.7.9).
if (!hasBeenWelcomed(safeLocalStorage())) useUiStore.getState().openWelcome()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
