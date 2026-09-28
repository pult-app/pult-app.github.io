import { useState, type FormEvent } from 'react'
import { fmtDate } from '../lib/dates'
import type { AgentRequest, Vacancy } from '../lib/types'
import { Icons } from './icons'

export type NewRequest = { kind: AgentRequest['kind']; prompt: string; vacancy_id: string | null }

/** Заготовки вопросов в карточке вакансии (дизайн v4). */
export const prepPrompt = (v: Vacancy, co: string) => `Подготовь меня к собеседованию в ${co} на «${v.title}»: вероятные вопросы с короткими ответами на моих примерах, что повторить, 2-3 вопроса работодателю.`
const PRESETS: { kind: AgentRequest['kind']; label: string; prompt: (v: Vacancy, co: string) => string }[] = [
  { kind: 'prep', label: 'Подготовь к собесу', prompt: prepPrompt },
  { kind: 'prep', label: 'Мок-интервью', prompt: (v, co) => `Проведи со мной мок-интервью как в ${co} на «${v.title}»: 8 вопросов от простого к сложному, к каждому короткий эталонный ответ на моих примерах и на что обратить внимание.` },
  { kind: 'analyze', label: 'Разбери вакансию', prompt: (v, co) => `Разбери вакансию ${co} «${v.title}»: ключевые требования, что у меня уже есть, чего не хватает и как это закрыть до собеса.` },
]
const SENT = 'В очереди. Ответ придёт пушем, обычно за полчаса.'

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
            <span className={'spill ' + STATUS[r.status].tone}>{STATUS[r.status].label}</span>
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

/** Строка «Спроси Claude»: поле и кнопка-стрелка. */
export function AskLine({ vacancyId, placeholder, canWrite, onAsk, onSent }: { vacancyId: string | null; placeholder: string; canWrite: boolean; onAsk: (r: NewRequest) => Promise<void>; onSent?: (msg: string) => void }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  if (!canWrite) return null
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    try { await onAsk({ kind: 'custom', prompt: text.trim(), vacancy_id: vacancyId }); setText(''); setMsg(SENT); onSent?.(SENT) }
    catch { setMsg('Не отправилось, попробуй ещё раз') }
  }
  return (
    <form onSubmit={submit} className="sec">
      <label className="askline">
        {Icons.spark}
        <span className="sr-only">Вопрос Claude</span>
        <input value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder={placeholder} />
        <button type="submit" aria-label="Спросить" disabled={!text.trim()}>{Icons.arrow}</button>
      </label>
      {msg && !onSent && <p className="ask-note">{msg}</p>}
    </form>
  )
}

/** Блок «Спросить Claude» в карточке вакансии: три заготовки и свой вопрос. */
export function AskBox({ v, company, canWrite, onAsk }: { v: Vacancy; company: string; canWrite: boolean; onAsk: (r: NewRequest) => Promise<void> }) {
  const [picked, setPicked] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  if (!canWrite) return null
  const ask = async (label: string, r: NewRequest) => {
    setPicked(label)
    try { await onAsk(r); setMsg(SENT) } catch { setMsg('Не отправилось, попробуй ещё раз'); setPicked(null) }
  }
  return (
    <div className="askbox">
      <div className="hd">{Icons.spark}<h2>Спросить Claude</h2></div>
      <div className="askgrid">
        {PRESETS.map(p => (
          <button key={p.label} aria-pressed={picked === p.label} onClick={() => ask(p.label, { kind: p.kind, prompt: p.prompt(v, company), vacancy_id: v.id })}>{p.label}</button>))}
        <button aria-pressed={picked === 'own'} onClick={() => { setPicked(picked === 'own' ? null : 'own'); setMsg('') }}>Свой вопрос</button>
      </div>
      {picked === 'own' && <AskLine vacancyId={v.id} placeholder="Вопрос про эту вакансию" canWrite={canWrite} onAsk={onAsk} onSent={setMsg} />}
      {msg && <p className="ask-note">{msg}</p>}
    </div>
  )
}
