import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'

const LABEL: Record<PushState, string> = {
  unsupported: 'пуши не поддерживаются',
  'need-install': 'пуши: добавь на экран «Домой»',
  denied: 'пуши запрещены в настройках',
  off: 'включить пуши',
  on: 'пуши включены',
}

/** Переключатель уведомлений в шапке (US-10). */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')) }, [])
  if (!state) return null
  const clickable = state === 'off' || state === 'on'
  const toggle = async () => {
    setBusy(true); setErr('')
    try { setState(state === 'on' ? await disablePush() : await enablePush()) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  return clickable
    ? <button className="linkbtn" disabled={busy} onClick={toggle} title={err || (state === 'on' ? 'выключить' : '')}>{err ? 'пуши: ошибка' : LABEL[state]}</button>
    : <span className="status-line">{LABEL[state]}</span>
}
