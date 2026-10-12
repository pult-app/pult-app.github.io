import { useState } from 'react'
import { days, fmtDate, leftLabel, today } from '../lib/dates'
import { companyName } from '../lib/domain'
import type { Message, MessageKind, PultData } from '../lib/types'
import { Empty } from './ui'
import { Avatar, Fold, ListRow } from './kit'
import { Icons } from './icons'
import { Swipe, Title } from './native'

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
const ACTION_KINDS: MessageKind[] = ['invite', 'test', 'question', 'offer']
const needsActionKind = (k: MessageKind) => ACTION_KINDS.includes(k)
const needsAction = (m: Message) => !m.is_done && needsActionKind(m.kind)
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function dayTitle(d: string, t: string) {
  const n = days(d, t)
  if (n === 0) return 'СЕГОДНЯ'
  if (n === 1) return 'ВЧЕРА'
  return (+d.slice(8, 10) + ' ' + MONTHS[+d.slice(5, 7) - 1]).toUpperCase()
}

interface Props {
  data: PultData
  canWrite: boolean
  onDone: (id: string, done: boolean) => Promise<void>
  /** Открыть вакансию, к которой относится письмо. */
  onOpen: (vacancyId: string) => void
}

export function Inbox({ data, canWrite, onDone, onOpen }: Props) {
  const [limit, setLimit] = useState(20)
  const t = today()
  const sorted = data.messages.slice().sort((a, b) => b.received_at.localeCompare(a.received_at))
  const todo = sorted.filter(needsAction)
  const feed = sorted.filter(m => !needsAction(m))
  const shown = feed.slice(0, limit)
  const groups: { day: string; items: Message[] }[] = []
  for (const m of shown) {
    const d = m.received_at.slice(0, 10)
    const g = groups[groups.length - 1]
    if (g && g.day === d) g.items.push(m); else groups.push({ day: d, items: [m] })
  }

  return (
    <section className="scr">
      <Title title="Письма" sub="Claude разбирает почту и оставляет здесь только суть" />

      <div className="sec">
        <div className="sec-head"><h2>Нужно сделать</h2><span>{todo.length}</span></div>
        {todo.length ? todo.map(m => {
          const k = KIND_VIEW[m.kind]
          const dl = m.deadline ? days(t, m.deadline) : null
          const body = (
            <>
              <div className="hd"><span className="co">{companyName(m)}</span><span className={'spill ' + k.tone}>{k.label}</span></div>
              <div className="what">{m.action || m.summary}</div>
              {m.action && <div className="why">{m.summary}</div>}
            </>)
          return (
            <Swipe key={m.id} label="Сделано" disabled={!canWrite} onAction={() => onDone(m.id, true)}>
              <div className="mcard4">
                {m.vacancy_id
                  ? <button type="button" className="mopen" onClick={() => onOpen(m.vacancy_id!)} aria-label={'Открыть вакансию: ' + companyName(m)}>{body}<i className="chev" aria-hidden>{Icons.chev}</i></button>
                  : <div className="mopen static">{body}</div>}
                <div className="ft">
                  {canWrite && <button className="btn" onClick={() => onDone(m.id, true)}>{Icons.check}Сделано</button>}
                  {dl !== null && <span className="due">{dl < 0 ? 'просрочено' : 'срок ' + leftLabel(dl)}</span>}
                  <span>пришло {fmtDate(m.received_at.slice(0, 10))}</span>
                </div>
              </div>
            </Swipe>)
        }) : <div className="rows"><Empty>Всё разобрано, действий не нужно.</Empty></div>}
      </div>

      <Fold id="inbox-feed" title="Ответы работодателей" meta={feed.length || ''}>
        {groups.length === 0 && <div className="rows"><Empty>Здесь появятся ответы компаний с почты и hh.ru.</Empty></div>}
        {groups.map(g => (
          <div key={g.day} className="sec">
            <div className="dayhead">{dayTitle(g.day, t)}</div>
            <div className="rows">
              {g.items.map(m => {
                const done = m.is_done && needsActionKind(m.kind)
                const k = done ? { label: 'Сделано', tone: 'closed' } : KIND_VIEW[m.kind]
                const co = companyName(m)
                return (
                  <ListRow key={m.id} avatar={<Avatar name={co} tone={k.tone as 'wait'} />} title={co} sub={m.summary}
                    trail={done && canWrite ? undefined : <span className={'spill ' + k.tone}>{k.label}</span>}
                    action={done && canWrite ? <button className="spill closed" style={{ border: 0 }} onClick={() => onDone(m.id, false)} title="Вернуть в «Нужно сделать»">Сделано</button> : undefined}
                    onOpen={m.vacancy_id ? () => onOpen(m.vacancy_id!) : undefined} />)
              })}
            </div>
          </div>))}
        {feed.length > limit && <button className="linkbtn" onClick={() => setLimit(limit + 30)}>Показать ещё ({feed.length - limit})</button>}
      </Fold>
    </section>
  )
}
