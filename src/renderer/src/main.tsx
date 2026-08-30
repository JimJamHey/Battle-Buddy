import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { OverlayApp } from '../../overlay/OverlayApp'
import { SettingsApp } from '../../settings/SettingsApp'
import './styles.css'

const hash = window.location.hash.replace('#/', '').replace('#', '')
const isOverlay = hash.startsWith('overlay')
if (isOverlay) document.documentElement.classList.add('overlay-page')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverlay ? <OverlayApp /> : <SettingsApp />}</StrictMode>
)
