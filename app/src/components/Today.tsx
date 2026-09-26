import { useState, type FormEvent } from 'react'
import { days, fmtDate, leftLabel, nowHM, toLocalDate, today } from '../lib/dates'
import { agenda, TASK_KINDS, type AgendaItem } from '../lib/domain'
import { LESSON_TYPES, lessonsFor, nextStudyDay } from '../lib/schedule'
import type { PultData, TaskKind } from '../lib/types'
import { Empty } from './ui'
import type { Tab } from '../App'

interface Props {
  data: PultData
  canWrite: boolean
  goto: (t: Tab) => void
  onTaskDone: (id: string, done: boolean) => Promise<void>
  onAddTask: (row: { title: string; due_date: string; due_time: string | null; kind: TaskKind }) => Promise<void>
}

function whenCls(n: number) { return n <= 0 ? 'hot' : n <= 3 ? 'warn' : '' }

function Lessons({ data }: { data: PultData }) {
  const t = today()
  const dt = toLocalDate(t)
  if (!data.schedule) return <><div className="section-head"><h2>Пары сегодня</h2></div><div className="list"><Empty>Расписание ещё не загружено.</Empty></div></>
  const { week, slots } = lessonsFor(data.schedule.payload, dt)
  const hm = nowHM()
  const next = slots.length ? null : nextStudyDay(data.schedule.payload, dt)
  return (
    <div className="section">
      <div className="section-head">
        <h2>{slots.length ? 'Пары сегодня' : 'Пар сегодня нет'}</h2>
        <span className="week">{week.num}-я неделя, {week.numerator ? 'числитель' : 'знаменатель'}</span>
      </div>
      <div className="list">
        {slots.length === 0 && (next
          ? <Empty>Следующий учебный день: {next.date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}, первая пара в {next.first}.</Empty>
          : <Empty>Пар на неделе не найдено.</Empty>)}
        {slots.map(s => {
          const cur = hm >= s.time[0] && hm <= s.time[1]
          const past = hm > s.time[1]
          return (
            <div key={s.index} className={'lesson' + (cur ? ' current' : '') + (past ? ' past' : '')}>
              <div className="t"><b>{s.time[0]}</b>{s.time[1]}</div>
              <div>{s.lessons.map((l, k) => (
                <div key={k} className={k ? 'alt' : ''}>
                  <div className="subj">{l.subject}</div>
                  <div className="info">{[LESSON_TYPES[l.type] || l.type, l.room, l.teacher].filter(Boolean).join(' · ')}{s.lessons.length > 1 ? ' · подгруппа ' + (k + 1) : ''}</div>
                </div>))}
              </div>
            </div>)
        })}
      </div>
    </div>
  )
}

export function Today({ data, canWrite, goto, onTaskDone, onAddTask }: Props) {
  const t = today()
  const ag = agenda(data, t)
  const urgent = ag.filter(x => days(t, x.date) <= 3)
  const later = ag.filter(x => { const n = days(t, x.date); return n > 3 && n <= 14 })
  const due = data.cards.filter(c => c.due_on <= t).length
  const kpis: [number, string, Tab][] = [
    [urgent.length, 'срочных дел', 'today'],
    [data.vacancies.filter(v => v.status === 'interview' || v.status === 'test').length, 'этапов отбора', 'funnel'],
    [data.messages.filter(m => !m.is_done && m.kind !== 'ack').length, 'ждут ответа', 'inbox'],
    [data.works.filter(w => w.status !== 'submitted').length, 'учебных работ', 'study'],
    [due, 'карточек на сегодня', 'train'],
  ]

  const row = (x: AgendaItem, i: number) => {
    const n = days(t, x.date)
    const when = n >= 0 && n <= 1 && x.time ? (n === 0 ? '' : 'завтра ') + x.time : n > 3 ? fmtDate(x.date) : leftLabel(n)
    return (
      <div className="item" key={i}>
        <span className={'when ' + whenCls(n)}>{when}</span>
        <div className="what">{x.title}<div className="meta"><span className="tag">{TASK_KINDS[x.kind] ?? 'Дело'}</span></div></div>
        {x.taskId && canWrite
          ? <input type="checkbox" className="chk" aria-label="Сделано" onChange={e => onTaskDone(x.taskId!, e.target.checked)} />
          : x.goto ? <button className="btn ghost small" onClick={() => goto(x.goto!)}>Открыть</button> : <span />}
      </div>
    )
  }

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(t)
  const [time, setTime] = useState('')
  const [kind, setKind] = useState<TaskKind>('study')
  const [msg, setMsg] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await onAddTask({ title: title.trim(), due_date: date, due_time: time || null, kind }); setTitle(''); setTime(''); setMsg('Добавлено') }
    catch { setMsg('Не сохранилось, попробуй ещё раз') }
  }

  return (
    <section className="panel">
      <div className="kpis">
        {kpis.map(([n, l, g]) => <button key={l} className="kpi" onClick={() => goto(g)}><span className="n">{n}</span><span className="l">{l}</span></button>)}
      </div>
      <Lessons data={data} />
      <div className="section">
        <div className="section-head"><h2>Сделать</h2><span className="note">просрочено, сегодня и ближайшие 3 дня</span></div>
        <div className="list">{urgent.length ? urgent.map(row) : <Empty>На ближайшие три дня срочного нет.</Empty>}</div>
      </div>
      <div className="section">
        <div className="section-head"><h2>Дальше, 14 дней</h2></div>
        <div className="list">{later.length ? later.map(row) : <Empty>Дальше пока пусто.</Empty>}</div>
      </div>
      {canWrite && (
        <details className="add">
          <summary>Добавить дело</summary>
          <form className="form" onSubmit={submit}>
            <label className="full">Что сделать<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="например, сдать ЛР2" /></label>
            <label>Дата<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
            <label>Время<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
            <label>Тип<select value={kind} onChange={e => setKind(e.target.value as TaskKind)}>
              {Object.entries(TASK_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
            <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" type="submit">Добавить</button><span className="note">{msg}</span>
            </div>
          </form>
        </details>
      )}
    </section>
  )
}
