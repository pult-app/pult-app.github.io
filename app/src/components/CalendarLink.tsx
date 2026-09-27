import { useState } from 'react'
import { supabase } from '../lib/api'

const BASE = (import.meta.env.VITE_SUPABASE_URL as string).replace(/^https?:\/\//, '') + '/functions/v1/calendar/'

/** Подписка на календарь: пары, собеседования, сроки и дела в «Календаре» iPhone. */
export function CalendarLink() {
  const [token, setToken] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const get = async (rotate = false) => {
    const { data, error } = await supabase.rpc('ics_token', { p_rotate: rotate })
    if (error) { setMsg('Не получилось: ' + error.message); return }
    setToken(data as string); setMsg(rotate ? 'Старая ссылка больше не работает. Подпишись заново.' : '')
  }
  const webcal = token ? 'webcal://' + BASE + token + '.ics' : ''
  return (
    <details className="add">
      <summary>Календарь на iPhone</summary>
      <div className="form">
        <p className="note full">Пары на 2 недели, собеседования, сроки по вакансиям и учёбе, дела. Обновляется само примерно раз в час.</p>
        {!token ? <button className="btn" onClick={() => get()}>Получить ссылку</button> : <>
          <a className="btn full" href={webcal}>Подписаться в Календаре</a>
          <button className="btn ghost" onClick={() => navigator.clipboard?.writeText('https://' + BASE + token + '.ics').then(() => setMsg('Ссылка скопирована'))}>Скопировать ссылку</button>
          <button className="btn ghost" onClick={() => get(true)}>Сменить ссылку</button>
        </>}
        <p className="note full">Ссылку никому не пересылай: по ней видно твоё расписание. Если утекла, нажми «Сменить ссылку».</p>
        {msg && <p className="note full">{msg}</p>}
      </div>
    </details>
  )
}
