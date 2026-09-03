import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { OverlayApp } from '../../overlay/OverlayApp'
import { SettingsApp } from '../../settings/SettingsApp'
import './styles.css'

const hash = window.location.hash.replace('#/', '').replace('#', '')
const isOverlay = hash.startsWith('overlay')
if (isOverlay) document.documentElement.classList.add('overlay-page')

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

window.addEventListener('error', (event) => {
  if (root.childElementCount === 0) {
    root.textContent = event.message || 'BattleBuddy failed to start'
  }
})

createRoot(root).render(
  <StrictMode>{isOverlay ? <OverlayApp /> : <SettingsApp />}</StrictMode>
)
