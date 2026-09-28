import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import './v4.css'
import App from './App.tsx'
import { Crash } from './components/Crash'
import { applyTheme, readTheme } from './components/ThemeToggle'

// В демо (только dev) тему можно задать в адресе: ?theme=light|dark.
const demoTheme = import.meta.env.DEV ? new URLSearchParams(location.search).get('theme') : null
applyTheme(demoTheme === 'light' || demoTheme === 'dark' ? demoTheme : readTheme())
// В демо рамка телефона: ?w=390 рисует приложение в окне 390x844 (fixed-элементы считаются от рамки).
const demoW = import.meta.env.DEV ? new URLSearchParams(location.search).get('w') : null
if (demoW) document.getElementById('root')!.style.cssText = 'width:' + demoW + 'px;height:844px;overflow:auto;transform:translateZ(0)'


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash><App /></Crash>
  </StrictMode>,
)
