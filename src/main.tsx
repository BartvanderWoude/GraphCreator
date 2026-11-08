import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { offerSharedGraph } from './components/SharedGraphDialog'
import { decodeShare, SHARE_PREFIX } from './lib/shareLink'
import { hasBeenWelcomed, safeLocalStorage } from './lib/welcome'
import { startAutosave } from './store/autosave'
import { applyTheme, useThemeStore } from './store/themeStore'
import { useUiStore } from './store/uiStore'

startAutosave(safeLocalStorage())

// Light unless the user chose dark (spec 5.7.2); index.html already applied a stored dark theme.
applyTheme(useThemeStore.getState().theme)

// A share link (spec 5.4): remove the fragment at once, so a reload never applies it again,
// then offer the shared graph once it is decoded.
const shareHash = location.hash.startsWith(SHARE_PREFIX) ? location.hash : null
if (shareHash !== null) {
  history.replaceState(history.state, '', location.pathname + location.search)
  void decodeShare(shareHash).then((result) => {
    if (result) offerSharedGraph(result)
  })
}

// First visit: show the welcome slides (spec 5.7.9), but not over a share link.
if (shareHash === null && !hasBeenWelcomed(safeLocalStorage())) {
  useUiStore.getState().openWelcome()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
