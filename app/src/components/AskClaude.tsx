import { useState, type FormEvent } from 'react'
import { fmtDate } from '../lib/dates'
import type { AgentRequest, Vacancy } from '../lib/types'

export type NewRequest = { kind: AgentRequest['kind']; prompt: string; vacancy_id: string | null }

const PRESETS: { kind: AgentRequest['kind']; label: string; prompt: (v: Vacancy, co: string) => string }[] = [
  { kind: 'prep', label: 'Подготовь к собесу', prompt: (v, co) => `Подготовь меня к собеседованию в ${co} на «${v.title}»: вероятные вопросы с короткими ответами на моих примерах, что повторить, 2-3 вопроса работодателю.` },
  { kind: 'followup', label: 'Напоминание HR', prompt: (v, co) => `Напиши короткое вежливое напоминание HR ${co} про мой отклик на «${v.title}». Только черновик, ничего не отправляй.` },
  { kind: 'analyze', label: 'Разбери вакансию', prompt: (v, co) => `Разбери вакансию ${co} «${v.title}»: ключевые требования, что у меня уже есть, чего не хватает и как это закрыть до собеса.` },
]

const STATUS: Record<AgentRequest['status'], { label: string; tone: string }> = {
  queued: { label: 'В очереди', tone: 'wait' },
  working: { label: 'Claude работает', tone: 'action' },
  done: { label: 'Готово', tone: 'win' },
  failed: { label: 'Не получилось', tone: 'closed' },
  cancelled: { label: 'Отменено', tone: 'closed' },
}

export function RequestList({ items }: { items: AgentRequest[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!items.length) return null
  return (
    <div className="cards">
      {items.map(r => (
        <div key={r.id} className="mcard">
          <div className="mtop">
            <span className="rq">{r.prompt}</span>
            <span className={'state ' + STATUS[r.status].tone}>{STATUS[r.status].label}</span>
          </div>
          {r.status === 'done' && r.result && (open === r.id
            ? <div className="answer">{r.result}</div>
            : <button className="linkbtn" onClick={() => setOpen(r.id)}>Открыть ответ</button>)}
          {r.status === 'failed' && r.error && <div className="msum">{r.error}</div>}
          <div className="mfoot"><span className="mono">{fmtDate(new Date(r.created_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }))}</span>{r.status === 'queued' && <span>ответ придёт пушем</span>}</div>
        </div>))}
    </div>
  )
}

/** Кнопки-заготовки и свой вопрос. vacancy = null: общий вопрос с экрана «Сегодня». */
export function AskClaude({ vacancy, company, canWrite, onAsk }: { vacancy: Vacancy | null; company?: string; canWrite: boolean; onAsk: (r: NewRequest) => Promise<void> }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const ask = async (r: NewRequest) => {
    try { await onAsk(r); setMsg('Отправил Claude. Ответ придёт пушем, обычно в течение получаса.'); setText('') }
    catch { setMsg('Не отправилось, попробуй ещё раз') }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); if (text.trim()) ask({ kind: 'custom', prompt: text.trim(), vacancy_id: vacancy?.id ?? null }) }
  if (!canWrite) return null
  return (
    <div className="ask">
      {vacancy && <div className="presets">{PRESETS.map(p => (
        <button key={p.kind} className="chip" onClick={() => ask({ kind: p.kind, prompt: p.prompt(vacancy, company ?? ''), vacancy_id: vacancy.id })}>{p.label}</button>))}</div>}
      <form className="askform" onSubmit={submit}>
        <input value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder={vacancy ? 'Свой вопрос про эту вакансию' : 'Спроси Claude: например, что подтянуть к собесу в Т1'} aria-label="Вопрос Claude" />
        <button className="btn" type="submit" disabled={!text.trim()}>Спросить</button>
      </form>
      {msg && <p className="note">{msg}</p>}
    </div>
  )
}
