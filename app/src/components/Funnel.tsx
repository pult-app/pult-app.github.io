import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { days, fmtDate, today } from '../lib/dates'
import { companyName, daysWord, FUNNEL_TABS, funnelTab, KINDS, messagesFor, stageOf, STATUSES, vacancyState, waitGroup, type FunnelTab, type StateView } from '../lib/domain'
import type { PultData, Vacancy, VacancyStatus } from '../lib/types'
import { Empty, PillSelect } from './ui'
import { AskBox, RequestList, type NewRequest } from './AskClaude'
import { Avatar, Fold, ListRow } from './kit'
import { Icons } from './icons'
import { Title } from './native'
import { toast, transition } from '../lib/ux'

export interface NewVacancy { company: string; title: string; status: VacancyStatus; work_format: string; applied_on: string; channel: string; url: string; deadline: string }

interface Props {
  data: PultData
  canWrite: boolean
  open: string | null
  setOpen: (id: string | null) => void
  tab: FunnelTab | null
  setTab: (t: FunnelTab) => void
  onStatus: (v: Vacancy, s: VacancyStatus) => Promise<void>
  onSave: (id: string, patch: Partial<Vacancy>) => Promise<void>
  onFollowed: (id: string) => Promise<void>
  onAdd: (v: NewVacancy) => Promise<void>
  onAsk: (r: NewRequest) => Promise<void>
  onTrain: () => void
  onNumbers: () => void
}

const EMPTY: Record<FunnelTab, string> = {
  sel: 'Пока никто не позвал дальше. Как только придёт приглашение, вакансия появится здесь.',
  wait: 'Нет откликов в ожидании.',
  todo: 'Всё найденное уже подано.',
  closed: 'Закрытых вакансий нет.',
}

/** Четыре этапа вакансии сверху вниз: где ты сейчас и что было. */
function Stepper({ v, st, data }: { v: Vacancy; st: StateView; data: PultData }) {
  const t = today()
  const stage = stageOf(v, data.messages)
  const reply = messagesFor(data.messages, v.id).find(m => m.kind !== 'reject')
  const closed = st.group === 'closed'
  const nowText = v.next_step || st.hint
  const steps = [
    { label: 'Отклик', sub: v.applied_on ? fmtDate(v.applied_on) + (v.channel ? ' · ' + v.channel : '') : '' },
    { label: 'Ответ работодателя', sub: reply ? fmtDate(reply.received_at.slice(0, 10)) + ' · ' + KINDS[reply.kind].label.toLowerCase() : '' },
    { label: v.status === 'test' ? 'Тестовое' : 'Собеседование', sub: '' },
    { label: 'Оффер', sub: '' },
  ]
  const waitText = stage === 1 && v.applied_on && !closed ? 'ждём ' + daysWord(Math.max(0, days(v.applied_on, t))) : ''
  return (
    <div className="box stepper">
      {steps.map((s, i) => {
        const cls = i < stage ? 'done' : i === stage ? 'cur' + (closed ? ' off' : '') : 'todo'
        const label = i === stage && closed ? (v.status === 'reject' ? 'Отказ' : 'Не подходит') : s.label
        const sub = i === stage ? [closed ? '' : waitText || 'сейчас', nowText].filter(Boolean).join(' · ') : i < stage ? s.sub : ''
        return (
          <div key={i} className={'step ' + cls}>
            <div className="rail"><div className="dot">{i < stage && Icons.check}</div><div className="ln" /></div>
            <div className="lbl"><b>{label}</b>{sub && <span>{sub}</span>}</div>
          </div>)
      })}
    </div>
  )
}

/** «К чему готовиться»: короткие темы тегами, длинный текст абзацем. */
function Prep({ text }: { text: string | null }) {
  if (!text) return null
  const parts = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
  const tags = parts.length > 1 && parts.every(p => p.length <= 40)
  return (
    <Fold id="v-prep" title="К чему готовиться" meta={tags ? parts.length : ''}>
      {tags ? <div className="tags">{parts.map((p, i) => <span key={i}>{p}</span>)}</div> : <p className="prep-text">{text}</p>}
    </Fold>
  )
}

/** Подготовка к собесу: сколько осталось до встречи и тренажёр карточек. Разбор от Claude лежит в блоке «Спросить Claude». */
function InterviewPrep({ v, data, onTrain }: { v: Vacancy; data: PultData; onTrain: () => void }) {
  const t = today()
  const left = v.deadline ? days(t, v.deadline) : null
  const due = data.cards.filter(c => c.due_on <= t).length
  const when = left === null ? 'Впиши дату встречи в «Править», и здесь появится обратный отсчёт'
    : left < 0 ? fmtDate(v.deadline) + ' уже прошло: запиши итог в заметки' : left === 0 ? 'Сегодня, ' + fmtDate(v.deadline) : left === 1 ? 'Завтра, ' + fmtDate(v.deadline) : 'До ' + fmtDate(v.deadline) + ' осталось ' + daysWord(left)
  return (
    <div className="prepbox">
      <div className="hd">{Icons.spark}<h2>Подготовка к {v.status === 'test' ? 'тестовому' : 'собесу'}</h2></div>
      <div className="prep-when">{when}</div>
      <button className="btn" onClick={onTrain}>Потренироваться: {due ? due + ' карточек' : 'карточки'}</button>
    </div>
  )
}

/** Отдельный экран вакансии (дизайн v4, редизайн 12.10: блоки сворачиваются, повторов нет). */
function VacancyScreen({ v, data, canWrite, onBack, onStatus, onSave, onFollowed, onAsk, onTrain }: { v: Vacancy; data: PultData; canWrite: boolean; onBack: () => void } & Pick<Props, 'onStatus' | 'onSave' | 'onFollowed' | 'onAsk' | 'onTrain'>) {
  const t = today()
  const st = vacancyState(v, data.messages, t)
  const co = companyName(v)
  const [stageOpen, setStageOpen] = useState(false)
  const [next, setNext] = useState(v.next_step ?? '')
  const [prep, setPrep] = useState(v.prep ?? '')
  const [notes, setNotes] = useState(v.notes ?? '')
  const [deadline, setDeadline] = useState(v.deadline ?? '')
  const [msg, setMsg] = useState('')
  const ms = messagesFor(data.messages, v.id)
  const reqs = data.requests.filter(r => r.vacancy_id === v.id)
  const save = async () => {
    try { await onSave(v.id, { next_step: next.trim() || null, prep: prep.trim() || null, notes: notes.trim() || null, deadline: deadline || null }); setMsg(''); toast('Сохранено') }
    catch { setMsg('Не сохранилось') }
  }
  const askMeta = reqs.some(r => r.status === 'queued' || r.status === 'working') ? 'в работе' : reqs.some(r => r.status === 'done') ? 'есть ответ' : ''
  return (
    <section className="scr">
      <Title title={co} back={{ label: 'Воронка', onClick: onBack }}
        sub={<div className="vhead4"><div className="rl">{v.title}{v.work_format ? ' · ' + v.work_format : ''}</div><span className={'spill ' + st.tone} style={{ justifySelf: 'start', marginTop: 8, display: 'inline-block' }}>{st.label}</span></div>} />
      <Stepper v={v} st={st} data={data} />
      {funnelTab(v) === 'sel' && <InterviewPrep v={v} data={data} onTrain={onTrain} />}
      <div className="vbar">
        {canWrite && <button className="btn" onClick={() => setStageOpen(!stageOpen)}>Сменить этап</button>}
        {v.url && <a className="out" href={v.url} target="_blank" rel="noopener">Вакансия{Icons.external}</a>}
        {stageOpen && <PillSelect value={v.status} options={STATUSES} label="Этап" onChange={s => { setStageOpen(false); onStatus(v, s).then(() => toast('Этап: ' + STATUSES.find(x => x.id === s)!.label.toLowerCase())) }} />}
        {canWrite && st.hint === 'Напомни о себе HR' && <button className="btn ghost" onClick={() => onFollowed(v.id)}>Я напомнил HR</button>}
      </div>
      <Prep text={v.prep} />
      {canWrite && (
        <Fold id="v-ask" title="Спросить Claude" meta={askMeta}>
          <AskBox v={v} company={co} canWrite={canWrite} onAsk={onAsk} />
          <RequestList items={reqs} />
        </Fold>)}
      {!canWrite && reqs.length > 0 && <Fold id="v-ask" title="Ответы Claude" meta={askMeta}><RequestList items={reqs} /></Fold>}
      {ms.length > 0 && (
        <Fold id="v-mail" title="Переписка" meta={ms.length}>
          <div className="timeline">
            {ms.map(m => <div key={m.id}><span className="mono">{fmtDate(m.received_at.slice(0, 10))}</span> <b>{KINDS[m.kind].label}.</b> {m.summary}</div>)}
          </div>
        </Fold>)}
      <Fold id="v-edit" title="Править и заметки" defaultOpen={false}>
        <div className="edit-card">
          <label className="field">Дата встречи или срок<input type="date" value={deadline} readOnly={!canWrite} onChange={e => setDeadline(e.target.value)} /></label>
          <label className="field">Что дальше<textarea value={next} readOnly={!canWrite} maxLength={500} onChange={e => setNext(e.target.value)} /></label>
          <label className="field">К чему готовиться<textarea value={prep} readOnly={!canWrite} maxLength={2000} onChange={e => setPrep(e.target.value)} /></label>
          <label className="field">Заметки<textarea value={notes} readOnly={!canWrite} maxLength={4000} onChange={e => setNotes(e.target.value)} /></label>
          {canWrite && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="btn" onClick={save}>Сохранить</button><span className="note">{msg}</span></div>}
        </div>
      </Fold>
    </section>
  )
}

export function Funnel(p: Props) {
  const { data, canWrite, open, setOpen, onAdd } = p
  const t = today()
  const [form, setForm] = useState<NewVacancy>({ company: '', title: '', status: 'applied', work_format: '', applied_on: t, channel: '', url: '', deadline: '' })
  const [addMsg, setAddMsg] = useState('')
  const [q, setQ] = useState('')

  // Список помнит прокрутку: вакансия открывается сверху, «Назад» возвращает ровно туда, где был палец.
  const listY = useRef(0)
  const wasOpen = useRef(open)
  useLayoutEffect(() => {
    if (open && !wasOpen.current) window.scrollTo(0, 0)
    if (!open && wasOpen.current) window.scrollTo(0, listY.current)
    wasOpen.current = open
  }, [open])

  const openV = open ? data.vacancies.find(v => v.id === open) : null
  if (openV) return <VacancyScreen key={openV.id} v={openV} data={data} canWrite={canWrite} onBack={() => transition(() => setOpen(null), 'back')}
    onStatus={p.onStatus} onSave={p.onSave} onFollowed={p.onFollowed} onAsk={p.onAsk} onTrain={p.onTrain} />

  const all = data.vacancies.map(v => ({ v, st: vacancyState(v, data.messages, t), tab: funnelTab(v) }))
  const count = (x: FunnelTab) => all.filter(a => a.tab === x).length
  const sel = count('sel')
  const tab: FunnelTab = p.tab ?? (sel ? 'sel' : 'wait')
  const needle = q.trim().toLowerCase()
  const byRecent = (a: { v: Vacancy }, b: { v: Vacancy }) => String(b.v.applied_on ?? b.v.updated_at).localeCompare(String(a.v.applied_on ?? a.v.updated_at))
  const byAge = (a: { v: Vacancy }, b: { v: Vacancy }) => String(a.v.applied_on ?? '').localeCompare(String(b.v.applied_on ?? ''))
  const inTab = all.filter(a => a.tab === tab)
  const found = needle ? all.filter(a => (companyName(a.v) + ' ' + a.v.title).toLowerCase().includes(needle)).sort(byRecent) : []
  const f = (k: keyof NewVacancy) => (e: { target: { value: string } }) => setForm(x => ({ ...x, [k]: e.target.value }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await onAdd(form); setAddMsg('Добавлено: ' + form.company); setForm(x => ({ ...x, company: '', title: '', url: '' })) }
    catch (err) { setAddMsg('Не сохранилось: ' + (err as Error).message) }
  }
  const openId = (id: string) => { listY.current = window.scrollY; transition(() => setOpen(id), 'fwd') }

  /** Крупная карточка: для тех, кто в отборе и требует внимания. */
  const card = ({ v, st }: { v: Vacancy; st: StateView }) => {
    const n = stageOf(v, data.messages)
    return (
      <button key={v.id} className="vc" onClick={() => openId(v.id)}>
        <span className="hd">
          <span className="nm"><span className="co">{companyName(v)}</span><span className="rl">{v.title}</span></span>
          <span className={'spill ' + st.tone}>{st.label}</span>
        </span>
        <span className="steps4" aria-label={'Этап ' + (n + 1) + ' из 4'}>{[0, 1, 2, 3].map(i => <i key={i} className={i < n ? 'on' : i === n && st.group !== 'closed' ? 'cur' : ''} />)}</span>
        <span className="hint">{st.hint || v.next_step || ''}</span>
      </button>)
  }
  /** Компактная строка: для длинных списков. Справа возраст отклика или состояние. */
  const rowOf = ({ v, st }: { v: Vacancy; st: StateView }, trail?: ReactNode) => {
    const age = v.applied_on ? days(v.applied_on, t) : null
    return (
      <ListRow key={v.id} avatar={<Avatar name={companyName(v)} tone={st.tone === 'todo' ? 'action' : st.tone} />} title={companyName(v)} sub={v.title}
        trail={trail ?? (age !== null && v.status === 'applied' ? <span className="num">{age} дн.</span> : <span className={'spill ' + st.tone}>{st.label}</span>)}
        onOpen={() => openId(v.id)} />)
  }
  const group = (id: string, title: string, rows: { v: Vacancy; st: StateView }[], defaultOpen = true) =>
    rows.length ? <Fold key={id} id={id} title={title} meta={rows.length} defaultOpen={defaultOpen}><div className="rows">{rows.map(r => rowOf(r))}</div></Fold> : null

  let body: ReactNode
  if (needle) {
    body = found.length
      ? <Fold id="funnel-found" title="Найдено" meta={found.length}><div className="rows">{found.map(a => rowOf(a, <span className={'spill ' + a.st.tone}>{a.st.label}</span>))}</div></Fold>
      : <div className="rows"><Empty>Ничего не нашлось.</Empty></div>
  } else if (!inTab.length) {
    body = <div className="rows"><Empty>{EMPTY[tab]}</Empty></div>
  } else if (tab === 'sel') {
    body = <div className="vlist">{inTab.slice().sort((a, b) => Number(b.st.group === 'action') - Number(a.st.group === 'action') || byRecent(a, b)).map(card)}</div>
  } else if (tab === 'wait') {
    const g = (k: ReturnType<typeof waitGroup>) => inTab.filter(a => waitGroup(a.v, data.messages, t) === k).sort(k === 'stale' ? byAge : byRecent)
    body = <>{group('funnel-stale', 'Пора напомнить', g('stale'))}{group('funnel-fresh', 'Ждём ответа', g('fresh'))}{group('funnel-reserve', 'В резерве', g('reserve'))}</>
  } else if (tab === 'todo') {
    body = <div className="rows">{inTab.sort(byRecent).map(a => rowOf(a, <span className="spill todo">Подать</span>))}</div>
  } else {
    body = <>{group('funnel-reject', 'Отказы', inTab.filter(a => a.v.status === 'reject').sort(byRecent), false)}{group('funnel-skip', 'Не подходит', inTab.filter(a => a.v.status !== 'reject').sort(byRecent), false)}</>
  }

  return (
    <section className="scr">
      <Title title="Воронка" actions={<button className="pillbtn" onClick={p.onNumbers}>{Icons.chart}Цифры</button>} />
      <div className="ftabs" role="group" aria-label="Группы вакансий">
        {FUNNEL_TABS.map(x => <button key={x.id} className="chip" aria-pressed={!needle && tab === x.id} onClick={() => { setQ(''); p.setTab(x.id) }}>{x.label}<b>{count(x.id)}</b></button>)}
      </div>
      <label className="askline search4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span className="sr-only">Поиск по вакансиям</span>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Найти компанию или должность" />
      </label>
      {body}
      {canWrite && (
        <Fold id="funnel-add" title="Добавить вакансию" defaultOpen={false}>
          <form className="form card-form" onSubmit={submit}>
            <label>Компания<input required maxLength={120} value={form.company} onChange={f('company')} /></label>
            <label>Вакансия<input required maxLength={200} value={form.title} onChange={f('title')} /></label>
            <label>Статус<select value={form.status} onChange={f('status')}>{STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label>Формат<input maxLength={120} value={form.work_format} onChange={f('work_format')} placeholder="удалённо / гибрид Москва" /></label>
            <label>Дата подачи<input type="date" value={form.applied_on} onChange={f('applied_on')} /></label>
            <label>Где подал<input maxLength={80} value={form.channel} onChange={f('channel')} placeholder="сайт / hh" /></label>
            <label className="full">Ссылка<input type="url" value={form.url} onChange={f('url')} placeholder="https://" /></label>
            <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button className="btn" type="submit">Сохранить</button><span className="note">{addMsg}</span></div>
          </form>
        </Fold>
      )}
    </section>
  )
}
