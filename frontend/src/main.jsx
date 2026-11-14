import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { AuthProvider } from './features/auth/AuthProvider'
import { themeService } from './services/preferences/themeService'
import { notificationService } from './services/notifications/notificationService'
import { notificationSoundService } from './services/notifications/notificationSoundService'
import { authMode } from './services/auth/mode'
import './styles/index.css'

themeService.initialize()
if (authMode === 'mock') notificationService.initialize()
notificationSoundService.initialize()

createRoot(document.getElementById('root')).render(
  <StrictMode><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></StrictMode>,
)
