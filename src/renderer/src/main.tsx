import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { initTheme } from './lib/theme'

// The app used to be called Slackish: carry saved preferences and read markers over to the new keys once.
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('slackish')) continue
    const renamed = 'sleam' + key.slice('slackish'.length)
    if (localStorage.getItem(renamed) === null) localStorage.setItem(renamed, localStorage.getItem(key) ?? '')
    localStorage.removeItem(key)
  }
} catch {
  // Preferences just start fresh.
}

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
