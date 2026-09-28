import { useState, type FormEvent, type ReactNode } from 'react'
import { days, fmtDate, leftLabel, nowHM, toLocalDate, today } from '../lib/dates'
import { agenda, companyName, funnelTab, nextStep, TASK_KINDS, type AgendaItem } from '../lib/domain'
import { LESSON_TYPES, lessonsFor, nextStudyDay } from '../lib/schedule'
import type { PultData, TaskKind } from '../lib/types'
import { Empty } from './ui'
import { AskLine, prepPrompt, RequestList, type NewRequest } from './AskClaude'
import { Icons } from './icons'
import type { Go } from '../App'

interface Props {
  data: PultData
  canWrite: boolean
  goto: Go
  status: { text: string; cls: string }
  actions: ReactNode
  onTaskDone: (id: string, done: boolean) => Promise<void>
  onAddTask: (row: { title: string; due_date: string; due_time: string | null; kind: TaskKind }) => Promise<void>
  onAsk: (r: NewRequest) => Promise<void>
}

const greetWord = (h: number) => h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'

/** Главное дело по поиску работы: тёмная карточка сверху (дизайн v4). */
function NextStepCard({ data, canWrite, goto, onAsk }: Pick<Props, 'data' | 'canWrite' | 'goto' | 'onAsk'>) {
  const t = today()
  const [sent, setSent] = useState('')
  const x = nextStep(data, t)
  if (!x) {
    const waiting = data.vacancies.filter(v => funnelTab(v) === 'wait').length
    return (
      <div className="hero-card">
        <div className="kicker">СЛЕДУЮЩИЙ ШАГ</div>
        <div className="title">По поиску работы ничего не горит</div>
        <div className="text">Ждём ответов по {waiting} откликам. Новые письма Claude разберёт сам.</div>
        <div className="acts"><button className="hbtn ghost" onClick={() => goto('funnel')}>Открыть воронку</button></div>
      </div>
    )
  }
  const { v, st } = x
  const co = companyName(v)
  const ask = async () => {
    try { await onAsk({ kind: 'prep', prompt: prepPrompt(v, co), vacancy_id: v.id }); setSent('Отправил Claude, ответ придёт пушем') }
    catch { setSent('Не отправилось, попробуй ещё раз') }
  }
  return (
    <div className="hero-card">
      <div className="kicker">СЛЕДУЮЩИЙ ШАГ</div>
      <div className="title">{co}: {st.label.charAt(0).toLowerCase() + st.label.slice(1)}</div>
      <div className="text">{v.next_step || st.hint}</div>
      <div className="acts">
        {canWrite && !sent && <button className="hbtn" onClick={ask}>{Icons.spark}Подготовь меня</button>}
        <button className="hbtn ghost" onClick={() => goto('funnel', { vacancy: v.id })}>Открыть</button>
        {sent && <span className="sent">{sent}</span>}
      </div>
    </div>
  )
}

/** «Сегодня»: пары, дела на ближайшие дни и карточки одним списком. */
function TodayList({ data, canWrite, goto, onTaskDone }: Pick<Props, 'data' | 'canWrite' | 'goto' | 'onTaskDone'>) {
  const t = today()
  const hm = nowHM()
  const rows: ReactNode[] = []
  if (data.schedule) {
    const dt = toLocalDate(t)
    const { slots } = lessonsFor(data.schedule.payload, dt)
    for (const s of slots) {
      const cur = hm >= s.time[0] && hm <= s.time[1]
      const past = hm > s.time[1]
      s.lessons.forEach((l, k) => rows.push(
        <div key={'l' + s.index + k} className={'trow' + (past ? ' past' : '')}>
          <div className="tm">{s.time[0]}</div>
          <div className="tx"><b>{l.subject}</b><span>{[LESSON_TYPES[l.type] || l.type, l.room ? 'ауд. ' + l.room : '', s.lessons.length > 1 ? 'подгруппа ' + (k + 1) : ''].filter(Boolean).join(' · ')}</span></div>
          {cur && k === 0 && <span className="now">сейчас</span>}
        </div>))
    }
    if (!slots.length) {
      const next = nextStudyDay(data.schedule.payload, dt)
      rows.push(
        <div key="nolessons" className="trow">
          <div className="tm">·</div>
          <div className="tx"><b>Пар сегодня нет</b>{next && <span>Дальше {next.date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}, первая в {next.first}</span>}</div>
        </div>)
    }
  }
  const soon = agenda(data, t).filter(x => days(t, x.date) <= 3)
  soon.forEach((x: AgendaItem, i) => {
    const n = days(t, x.date)
    const tm = n === 0 && x.time ? x.time : n < 0 ? 'срок' : n === 0 ? 'день' : n === 1 ? 'завтра' : fmtDate(x.date)
    rows.push(
      <div key={'a' + i} className="trow">
        <div className={'tm' + (n < 0 ? ' hot' : n <= 1 ? ' warn' : '')}>{tm}</div>
        <div className="tx"><b>{x.title}</b><span>{n < 0 ? 'просрочено' : leftLabel(n)} · {TASK_KINDS[x.kind]}</span></div>
        {x.taskId && canWrite
          ? <input type="checkbox" className="chk" aria-label="Сделано" onChange={e => onTaskDone(x.taskId!, e.target.checked)} />
          : x.goto ? <button className="go" onClick={() => goto(x.goto!)}>Открыть</button> : null}
      </div>)
  })
  const due = data.cards.filter(c => c.due_on <= t).length
  if (due) rows.push(
    <div key="cards" className="trow">
      <div className="tm">день</div>
      <div className="tx"><b>{due} карточек на повтор</b><span>5 минут, пока едешь</span></div>
      <button className="go" onClick={() => goto('study', { cards: true })}>Начать</button>
    </div>)
  return (
    <div className="sec">
      <div className="sec-head"><h2>Сегодня</h2><span>пары и дела</span></div>
      {rows.length ? <div className="rows">{rows}</div> : <div className="rows"><Empty>На сегодня пусто.</Empty></div>}
    </div>
  )
}

export function Today({ data, canWrite, goto, status, actions, onTaskDone, onAddTask, onAsk }: Props) {
  const t = today()
  const h = +nowHM().slice(0, 2)
  const dateLine = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' })
  const wk = data.schedule ? lessonsFor(data.schedule.payload, toLocalDate(t)).week : null
  const sel = data.vacancies.filter(v => funnelTab(v) === 'sel').length
  const wait = data.vacancies.filter(v => funnelTab(v) === 'wait').length
  const openMail = data.messages.filter(m => !m.is_done && ['invite', 'test', 'question', 'offer'].includes(m.kind)).length
  const studyOpen = data.works.filter(w => w.status !== 'submitted').length
  const later = agenda(data, t).filter(x => { const n = days(t, x.date); return n > 3 && n <= 14 })

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
    <section className="scr">
      <div className="top">
        <div>
          <div className="date">{dateLine.charAt(0).toUpperCase() + dateLine.slice(1)}</div>
          <h1>{greetWord(h)}, Герман</h1>
        </div>
        <div className="top-actions">{actions}</div>
      </div>
      <div className="pills">
        {wk && <span className="pchip">{wk.num}-я неделя · {wk.numerator ? 'числитель' : 'знаменатель'}</span>}
        <span className={'pchip ' + status.cls}>{status.text}</span>
      </div>

      <NextStepCard data={data} canWrite={canWrite} goto={goto} onAsk={onAsk} />
      <TodayList data={data} canWrite={canWrite} goto={goto} onTaskDone={onTaskDone} />

      <div className="tiles">
        <button className="tile win" onClick={() => goto('funnel', { ftab: 'sel' })}><b>{sel}</b><span>в отборе</span></button>
        <button className="tile wait" onClick={() => goto('funnel', { ftab: 'wait' })}><b>{wait}</b><span>ждём</span></button>
        <button className="tile act" onClick={() => goto('inbox')}><b>{openMail}</b><span>{openMail === 1 ? 'письмо' : 'писем'}</span></button>
        <button className="tile plain" onClick={() => goto('study')}><b>{studyOpen}</b><span>учёба</span></button>
      </div>

      <AskLine vacancyId={null} placeholder="Спроси Claude: что подтянуть к собесу?" canWrite={canWrite} onAsk={onAsk} />
      <RequestList items={data.requests.filter(r => !r.vacancy_id).slice(0, 3)} />

      {later.length > 0 && (
        <div className="sec">
          <div className="sec-head"><h2>Дальше, 14 дней</h2></div>
          <div className="rows">{later.map((x, i) => (
            <div key={i} className="trow">
              <div className="tm">{fmtDate(x.date)}</div>
              <div className="tx"><b>{x.title}</b><span>{TASK_KINDS[x.kind]}</span></div>
              {x.goto && <button className="go" onClick={() => goto(x.goto!)}>Открыть</button>}
            </div>))}
          </div>
        </div>)}

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
