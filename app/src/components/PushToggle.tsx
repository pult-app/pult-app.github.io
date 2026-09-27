import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'
import { Icons } from './icons'

const LABEL: Record<PushState, string> = {
  unsupported: 'Пуши не поддерживаются этим браузером',
  'need-install': 'Пуши на iPhone: добавь пульт на экран «Домой» и открой с иконки',
  denied: 'Пуши запрещены в настройках браузера',
  off: 'Включить пуши',
  on: 'Пуши включены, нажми, чтобы выключить',
}

/** Колокольчик в шапке (US-10). */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')) }, [])
  if (!state) return null
  const clickable = state === 'off' || state === 'on'
  const toggle = async () => {
    if (!clickable) { alert(LABEL[state]); return }
    setBusy(true); setErr('')
    try { setState(state === 'on' ? await disablePush() : await enablePush()) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  const title = err ? 'Ошибка пушей: ' + err : LABEL[state]
  return (
    <button className="icon-btn" title={title} aria-label={title} aria-pressed={state === 'on'} disabled={busy} onClick={toggle}
      style={state === 'on' ? undefined : { opacity: clickable ? 1 : .55 }}>
      {Icons.bell}
    </button>
  )
}
