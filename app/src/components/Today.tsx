import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { days, fmtDate, fmtDow, leftLabel, nowHM, toLocalDate, today } from '../lib/dates'
import { agenda, companyName, funnelTab, nextStep, staleCount, TASK_KINDS, type AgendaItem } from '../lib/domain'
import { fmtMoney, summarize } from '../lib/billing'
import { weekCount, WEEK_GOAL } from '../lib/insights'
import { LESSON_TYPES, lessonsFor, nextStudyDay } from '../lib/schedule'
import type { PultData, TaskKind } from '../lib/types'
import { Empty } from './ui'
import { AskLine, prepPrompt, RequestList, type NewRequest } from './AskClaude'
import { Fold, ListRow } from './kit'
import { Icons } from './icons'
import { Swipe, Title } from './native'
import type { Go } from '../App'

interface Props {
  data: PultData
  canWrite: boolean
  goto: Go
  status: { text: string; cls: string }
  onTaskDone: (id: string, done: boolean) => Promise<void>
  onAddTask: (row: { title: string; due_date: string; due_time: string | null; kind: TaskKind }) => Promise<void>
  onAsk: (r: NewRequest) => Promise<void>
}

const greetWord = (h: number) => h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
const HOT_CAP = 6

/** Главное дело по поиску работы: тёмная карточка сверху (дизайн v4). */
function NextStepCard({ data, canWrite, goto, onAsk }: Pick<Props, 'data' | 'canWrite' | 'goto' | 'onAsk'>) {
  const t = today()
  const [sent, setSent] = useState('')
  const x = nextStep(data, t)
  if (!x) {
    const waiting = data.vacancies.filter(v => funnelTab(v) === 'wait').length
    return (
      <div className="hero-card">
        <div className="kicker"><i className="calm" />СЛЕДУЮЩИЙ ШАГ</div>
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
      <div className="kicker"><i />СЛЕДУЮЩИЙ ШАГ</div>
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

/** Три нажимаемые цифры: темп поиска, воронка, ближайшее списание. Каждая ведёт на свой экран. */
function Pulse({ data, goto }: Pick<Props, 'data' | 'goto'>) {
  const t = today()
  const week = weekCount(data, t)
  const sel = data.vacancies.filter(v => funnelTab(v) === 'sel').length
  const wait = data.vacancies.filter(v => funnelTab(v) === 'wait').length
  const sum = useMemo(() => summarize(data.subscriptions, t), [data.subscriptions, t])
  const nc = sum.nextCharge
  return (
    <div className="tiles pulse">
      <button className={'tile ' + (week >= WEEK_GOAL ? 'win' : 'plain')} onClick={() => goto('insights')}><b>{week}<em>/{WEEK_GOAL}</em></b><span>откликов за неделю</span></button>
      <button className="tile wait" onClick={() => goto('funnel', { ftab: sel ? 'sel' : 'wait' })}><b>{sel}<em> · {wait}</em></b><span>в отборе · ждём</span></button>
      {data.moneyReady && (nc
        ? <button className="tile act" onClick={() => goto('money', { sub: nc.sub.id })}><b>{fmtDate(nc.date)}</b><span>{nc.sub.name} · {fmtMoney(nc.sub.amount, nc.sub.currency)}</span></button>
        : <button className="tile plain" onClick={() => goto('money')}><b>+</b><span>подписки</span></button>)}
    </div>
  )
}

/** Подпись слева в строке повестки: время, «завтра», дата или сколько дней просрочено. */
function when(x: AgendaItem, t: string): { text: string; tone?: 'hot' | 'warn' } {
  const n = days(t, x.date)
  if (n < 0) return { text: '−' + -n + ' дн', tone: 'hot' }
  if (n === 0) return { text: x.time ?? 'день', tone: 'warn' }
  if (n === 1) return { text: 'завтра', tone: 'warn' }
  return { text: fmtDate(x.date) }
}

/** Пары на сегодня: время, предмет, тип и аудитория. */
function Lessons({ data }: { data: PultData }) {
  const t = today()
  const hm = nowHM()
  const dt = toLocalDate(t)
  const { slots } = lessonsFor(data.schedule!.payload, dt)
  const next = slots.find(s => hm <= s.time[1])
  const meta = slots.length ? slots.length + (next ? ', дальше ' + next.time[0] : ', на сегодня всё') : 'сегодня нет'
  const rows: ReactNode[] = []
  for (const s of slots) {
    const cur = hm >= s.time[0] && hm <= s.time[1]
    s.lessons.forEach((l, k) => rows.push(
      <ListRow key={'l' + s.index + k} lead={s.time[0]} past={hm > s.time[1]} title={l.subject}
        sub={[LESSON_TYPES[l.type] || l.type, l.room ? 'ауд. ' + l.room : '', s.lessons.length > 1 ? 'подгруппа ' + (k + 1) : ''].filter(Boolean).join(' · ')}
        trail={cur && k === 0 ? <span className="now">сейчас</span> : undefined} />))
  }
  if (!slots.length) {
    const nx = nextStudyDay(data.schedule!.payload, dt)
    rows.push(<ListRow key="none" lead="·" title="Пар сегодня нет"
      sub={nx ? `Дальше ${nx.date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}, первая в ${nx.first}` : undefined} />)
  }
  return <Fold id="today-lessons" title="Пары" meta={meta}><div className="rows">{rows}</div></Fold>
}

export function Today({ data, canWrite, goto, status, onTaskDone, onAddTask, onAsk }: Props) {
  const t = today()
  const h = +nowHM().slice(0, 2)
  const dateLine = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' })
  const wk = data.schedule ? lessonsFor(data.schedule.payload, toLocalDate(t)).week : null
  const items = agenda(data, t)
  const hot = items.filter(x => days(t, x.date) <= 3)
  const later = items.filter(x => { const n = days(t, x.date); return n > 3 && n <= 14 })
  const stale = staleCount(data, t)
  const dueCards = data.cards.filter(c => c.due_on <= t).length
  const [all, setAll] = useState(false)
  const shown = all ? hot : hot.slice(0, HOT_CAP)
  const hotCount = hot.length + (stale ? 1 : 0) + (dueCards ? 1 : 0)

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

  const open = (x: AgendaItem) => {
    if (x.goto === 'funnel') goto('funnel', { vacancy: x.ref })
    else if (x.goto === 'money') goto('money', { sub: x.ref })
    else if (x.goto === 'inbox' && x.ref) goto('funnel', { vacancy: x.ref })
    else if (x.goto) goto(x.goto)
  }
  const item = (x: AgendaItem, i: number) => {
    const w = when(x, t)
    const n = days(t, x.date)
    const rowProps = {
      lead: w.text, leadTone: w.tone, title: x.title,
      sub: [n < 0 ? 'просрочено' : n >= 2 ? leftLabel(n) : '', TASK_KINDS[x.kind]].filter(Boolean).join(' · '),
      onOpen: x.goto ? () => open(x) : undefined,
      action: x.taskId && canWrite ? <input type="checkbox" className="chk" aria-label={'Сделано: ' + x.title} onChange={e => onTaskDone(x.taskId!, e.target.checked)} /> : undefined,
    }
    // Дело можно смахнуть влево («Готово»); остальные строки только открываются.
    return x.taskId && canWrite
      ? <Swipe key={'a' + i} label="Готово" onAction={() => onTaskDone(x.taskId!, true)}><ListRow {...rowProps} /></Swipe>
      : <ListRow key={'a' + i} {...rowProps} />
  }

  return (
    <section className="scr">
      <Title kicker={dateLine.charAt(0).toUpperCase() + dateLine.slice(1)} title={greetWord(h) + ', Герман'} compact="Сегодня"
        actions={<button className="icon-btn" aria-label="Настройки" title="Настройки" onClick={() => goto('settings')}>{Icons.settings}</button>} />
      <div className="pills">
        {wk && <span className="pchip">{wk.num}-я неделя · {wk.numerator ? 'числитель' : 'знаменатель'}</span>}
        <button className={'pchip ' + status.cls} onClick={() => goto('settings')}>{status.text}</button>
      </div>

      <NextStepCard data={data} canWrite={canWrite} goto={goto} onAsk={onAsk} />
      <Pulse data={data} goto={goto} />
      {data.schedule && <Lessons data={data} />}

      <Fold id="today-hot" title="Горит" meta={hotCount ? hotCount : ''}>
        <div className="rows">
          {stale > 0 && <ListRow lead="7+ дн" title="Пора напомнить о себе" sub={stale + ' ' + (stale === 1 ? 'отклик' : 'откликов') + ' без ответа: список в воронке'} onOpen={() => goto('funnel', { ftab: 'wait' })} />}
          {shown.map(item)}
          {dueCards > 0 && <ListRow lead="день" title={dueCards + ' карточек на повтор'} sub="5 минут, пока едешь" onOpen={() => goto('study', { cards: true })} />}
          {hotCount === 0 && <Empty>Срочного нет.</Empty>}
        </div>
        {!all && hot.length > HOT_CAP && <button className="linkbtn" onClick={() => setAll(true)}>Показать ещё ({hot.length - HOT_CAP})</button>}
      </Fold>

      {later.length > 0 && (
        <Fold id="today-later" title="Дальше, 14 дней" meta={later.length} defaultOpen={false}>
          <div className="rows">{later.map((x, i) => (
            <ListRow key={i} lead={fmtDate(x.date)} title={x.title} sub={fmtDow(x.date) + ' · ' + TASK_KINDS[x.kind]} onOpen={x.goto ? () => open(x) : undefined} />))}
          </div>
        </Fold>)}

      <Fold id="today-ask" title="Спросить Claude" meta={data.requests.filter(r => !r.vacancy_id && (r.status === 'queued' || r.status === 'working')).length ? 'в работе' : ''} defaultOpen={false}>
        <AskLine vacancyId={null} placeholder="Что подтянуть к собесу?" canWrite={canWrite} onAsk={onAsk} />
        <RequestList items={data.requests.filter(r => !r.vacancy_id).slice(0, 3)} />
      </Fold>

      {canWrite && (
        <Fold id="today-add" title="Добавить дело" defaultOpen={false}>
          <form className="form card-form" onSubmit={submit}>
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
        </Fold>
      )}
    </section>
  )
}
