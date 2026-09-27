import { useState } from 'react'
import { days, fmtDate, leftLabel, today } from '../lib/dates'
import { companyName } from '../lib/domain'
import type { MessageKind, PultData } from '../lib/types'
import { Empty } from './ui'

/** Что за письмо, человеческими словами, и насколько срочно. */
const KIND_VIEW: Record<MessageKind, { label: string; tone: string }> = {
  invite: { label: 'Приглашение', tone: 'action' },
  test: { label: 'Тестовое', tone: 'action' },
  offer: { label: 'Оффер', tone: 'win' },
  question: { label: 'Нужен ответ', tone: 'action' },
  reject: { label: 'Отказ', tone: 'closed' },
  ack: { label: 'Автоответ', tone: 'wait' },
  info: { label: 'Инфо', tone: 'wait' },
}

export function Inbox({ data, canWrite, onDone }: { data: PultData; canWrite: boolean; onDone: (id: string, done: boolean) => Promise<void> }) {
  const [all, setAll] = useState(false)
  const t = today()
  const todo = data.messages.filter(m => !m.is_done && m.kind !== 'ack' && m.kind !== 'reject' && m.kind !== 'info')
  const rows = (all ? data.messages : todo).slice().sort((a, b) => b.received_at.localeCompare(a.received_at))
  return (
    <section className="panel">
      <p className="summary">{todo.length ? <>Ждут твоего действия: <b>{todo.length}</b></> : 'Всё разобрано, новых действий нет.'}</p>
      <div className="cards">
        {rows.length === 0 ? <Empty>Здесь появятся ответы компаний с почты и hh.ru.</Empty> : rows.map(m => {
          const k = KIND_VIEW[m.kind]
          const dl = m.deadline && !m.is_done ? days(t, m.deadline) : null
          return (
            <div key={m.id} className={'mcard' + (m.is_done ? ' done' : '')}>
              <div className="mtop">
                <span className="vco">{companyName(m)}</span>
                <span className={'state ' + (m.is_done ? 'closed' : k.tone)}>{m.is_done ? 'Сделано' : k.label}</span>
              </div>
              {m.action && !m.is_done && <div className="mact">{m.action}{dl !== null && <span className={'due' + (dl <= 1 ? ' hot' : '')}> · {leftLabel(dl)}</span>}</div>}
              <div className="msum">{m.summary}</div>
              <div className="mfoot">
                <span className="mono">{fmtDate(m.received_at.slice(0, 10))}</span>
                {canWrite && m.kind !== 'ack' && <button className="btn ghost small" onClick={() => onDone(m.id, !m.is_done)}>{m.is_done ? 'Вернуть' : 'Сделано'}</button>}
              </div>
            </div>)
        })}
      </div>
      <button className="linkbtn" onClick={() => setAll(!all)}>{all ? 'Показать только ждущие действия' : `Показать все письма (${data.messages.length})`}</button>
    </section>
  )
}
