import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { initTheme } from './lib/theme'
import { isMac } from './lib/platform'

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
// The Mac window draws its own title bar around the traffic lights; elsewhere the system frame does.
document.documentElement.dataset.platform = isMac ? 'mac' : 'other'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
