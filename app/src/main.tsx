import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import './v4.css'
import App from './App.tsx'
import { Crash } from './components/Crash'
import { applyTheme, readTheme } from './components/ThemeToggle'

applyTheme(readTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash><App /></Crash>
  </StrictMode>,
)
