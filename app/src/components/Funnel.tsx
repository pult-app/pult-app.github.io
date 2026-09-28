import { useState, type FormEvent } from 'react'
import { days, fmtDate, today } from '../lib/dates'
import { companyName, daysWord, FUNNEL_TABS, funnelTab, KINDS, messagesFor, stageOf, STATUSES, vacancyState, type FunnelTab, type StateView } from '../lib/domain'
import type { PultData, Vacancy, VacancyStatus } from '../lib/types'
import { Empty, PillSelect } from './ui'
import { AskBox, RequestList, type NewRequest } from './AskClaude'
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
    <div className="sec">
      <div className="sec-head"><h2>К чему готовиться</h2></div>
      {tags ? <div className="tags">{parts.map((p, i) => <span key={i}>{p}</span>)}</div> : <p className="prep-text">{text}</p>}
    </div>
  )
}

/** Подготовка к собесу: сколько осталось до встречи, разбор от Claude и тренажёр карточек. */
function InterviewPrep({ v, data, onTrain }: { v: Vacancy; data: PultData; onTrain: () => void }) {
  const t = today()
  const left = v.deadline ? days(t, v.deadline) : null
  const req = data.requests.find(r => r.vacancy_id === v.id && r.kind === 'prep')
  const due = data.cards.filter(c => c.due_on <= t).length
  const when = left === null ? 'Впиши дату встречи в «Письма, заметки и правка», и здесь появится обратный отсчёт'
    : left < 0 ? fmtDate(v.deadline) + ' уже прошло: запиши итог в заметки' : left === 0 ? 'Сегодня, ' + fmtDate(v.deadline) : left === 1 ? 'Завтра, ' + fmtDate(v.deadline) : 'До ' + fmtDate(v.deadline) + ' осталось ' + daysWord(left)
  return (
    <div className="prepbox">
      <div className="hd">{Icons.spark}<h2>Подготовка к {v.status === 'test' ? 'тестовому' : 'собесу'}</h2></div>
      <div className="prep-when">{when}</div>
      <div className="line">{req ? (req.status === 'done' ? 'Разбор от Claude готов, он ниже' : 'Claude готовит разбор, придёт пушем') : 'Попроси Claude подготовить разбор ниже'}</div>
      <button className="btn" onClick={onTrain}>Потренироваться: {due ? due + ' карточек' : 'карточки'}</button>
    </div>
  )
}

/** Отдельный экран вакансии (дизайн v4). */
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
  const save = async () => {
    try { await onSave(v.id, { next_step: next.trim() || null, prep: prep.trim() || null, notes: notes.trim() || null, deadline: deadline || null }); setMsg(''); toast('Сохранено') }
    catch { setMsg('Не сохранилось') }
  }
  return (
    <section className="scr">
      <Title title={co} back={{ label: 'Воронка', onClick: onBack }}
        sub={<div className="vhead4"><div className="rl">{v.title}{v.work_format ? ' · ' + v.work_format : ''}</div><span className={'spill ' + st.tone} style={{ justifySelf: 'start', marginTop: 8, display: 'inline-block' }}>{st.label}</span></div>} />
      <Stepper v={v} st={st} data={data} />
      {funnelTab(v) === 'sel' && <InterviewPrep v={v} data={data} onTrain={onTrain} />}
      <Prep text={v.prep} />
      <AskBox v={v} company={co} canWrite={canWrite} onAsk={onAsk} />
      <RequestList items={data.requests.filter(r => r.vacancy_id === v.id)} />
      <div className="vbar">
        {canWrite && <button className="btn" onClick={() => setStageOpen(!stageOpen)}>Сменить этап</button>}
        {v.url && <a className="out" href={v.url} target="_blank" rel="noopener">Вакансия{Icons.external}</a>}
        {stageOpen && <PillSelect value={v.status} options={STATUSES} label="Этап" onChange={s => { setStageOpen(false); onStatus(v, s).then(() => toast('Этап: ' + STATUSES.find(x => x.id === s)!.label.toLowerCase())) }} />}
        {canWrite && st.hint === 'Напомни о себе HR' && <button className="btn ghost" onClick={() => onFollowed(v.id)}>Я напомнил HR</button>}
      </div>
      <details className="more4">
        <summary>Письма, заметки и правка</summary>
        {ms.length > 0 && (
          <div className="timeline">
            {ms.map(m => <div key={m.id}><span className="mono">{fmtDate(m.received_at.slice(0, 10))}</span> <b>{KINDS[m.kind].label}.</b> {m.summary}</div>)}
          </div>)}
        <label className="field">Дата встречи или срок<input type="date" value={deadline} readOnly={!canWrite} onChange={e => setDeadline(e.target.value)} /></label>
        <label className="field">Что дальше<textarea value={next} readOnly={!canWrite} maxLength={500} onChange={e => setNext(e.target.value)} /></label>
        <label className="field">К чему готовиться<textarea value={prep} readOnly={!canWrite} maxLength={2000} onChange={e => setPrep(e.target.value)} /></label>
        <label className="field">Заметки<textarea value={notes} readOnly={!canWrite} maxLength={4000} onChange={e => setNotes(e.target.value)} /></label>
        {canWrite && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="btn" onClick={save}>Сохранить</button><span className="note">{msg}</span></div>}
      </details>
    </section>
  )
}

export function Funnel(p: Props) {
  const { data, canWrite, open, setOpen, onAdd } = p
  const t = today()
  const [form, setForm] = useState<NewVacancy>({ company: '', title: '', status: 'applied', work_format: '', applied_on: t, channel: '', url: '', deadline: '' })
  const [addMsg, setAddMsg] = useState('')
  const [q, setQ] = useState('')

  const openV = open ? data.vacancies.find(v => v.id === open) : null
  if (openV) return <VacancyScreen key={openV.id} v={openV} data={data} canWrite={canWrite} onBack={() => transition(() => setOpen(null), 'back')}
    onStatus={p.onStatus} onSave={p.onSave} onFollowed={p.onFollowed} onAsk={p.onAsk} onTrain={p.onTrain} />

  const all = data.vacancies.map(v => ({ v, st: vacancyState(v, data.messages, t), tab: funnelTab(v) }))
  const count = (x: FunnelTab) => all.filter(a => a.tab === x).length
  const sel = count('sel')
  const waiting = data.vacancies.filter(v => v.status === 'applied').length
  const reserve = data.vacancies.filter(v => v.status === 'reserve').length
  const rejects = data.vacancies.filter(v => v.status === 'reject').length
  const sent = data.vacancies.filter(v => v.applied_on).length
  const tab: FunnelTab = p.tab ?? (sel ? 'sel' : 'wait')
  const needle = q.trim().toLowerCase()
  const list = all.filter(a => needle ? (companyName(a.v) + ' ' + a.v.title).toLowerCase().includes(needle) : a.tab === tab).sort((a, b) =>
    Number(b.st.group === 'action') - Number(a.st.group === 'action') ||
    String(b.v.applied_on ?? b.v.updated_at).localeCompare(String(a.v.applied_on ?? a.v.updated_at)))
  const f = (k: keyof NewVacancy) => (e: { target: { value: string } }) => setForm(x => ({ ...x, [k]: e.target.value }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await onAdd(form); setAddMsg('Добавлено: ' + form.company); setForm(x => ({ ...x, company: '', title: '', url: '' })) }
    catch (err) { setAddMsg('Не сохранилось: ' + (err as Error).message) }
  }
  const bar = [{ n: sel, c: 'c-sel' }, { n: waiting, c: 'c-wait' }, { n: reserve, c: 'c-res' }, { n: rejects, c: 'c-off' }].filter(x => x.n > 0)

  return (
    <section className="scr">
      <Title title="Воронка" sub={<>{sent} откликов · {sel} в отборе · {rejects} отказов</>} />
      <div className="box stagebar">
        <div className="bar4">{bar.map(x => <i key={x.c} className={x.c} style={{ flexGrow: x.n }} />)}</div>
        <div className="legend">
          <span><i className="c-sel" />отбор <b>{sel}</b></span><span><i className="c-wait" />ждём <b>{waiting}</b></span>
          <span><i className="c-res" />резерв <b>{reserve}</b></span><span><i className="c-off" />отказ <b>{rejects}</b></span>
        </div>
      </div>
      <div className="ftabs" aria-label="Группы вакансий">
        {FUNNEL_TABS.map(x => <button key={x.id} className="chip" aria-pressed={tab === x.id} onClick={() => p.setTab(x.id)}>{x.label}<b>{count(x.id)}</b></button>)}
      </div>
      <label className="askline search4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span className="sr-only">Поиск по вакансиям</span>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Найти компанию или должность" />
      </label>
      {needle && <p className="ask-note">Найдено во всех группах: {list.length}</p>}
      <div className="vlist">
        {list.length ? list.map(({ v, st }) => {
          const n = stageOf(v, data.messages)
          return (
            <button key={v.id} className="vc" onClick={() => transition(() => { setOpen(v.id); window.scrollTo({ top: 0 }) }, 'fwd')}>
              <span className="hd">
                <span className="nm"><span className="co">{companyName(v)}</span><span className="rl">{v.title}</span></span>
                <span className={'spill ' + st.tone}>{st.label}</span>
              </span>
              <span className="steps4" aria-label={'Этап ' + (n + 1) + ' из 4'}>{[0, 1, 2, 3].map(i => <i key={i} className={i < n ? 'on' : i === n && st.group !== 'closed' ? 'cur' : ''} />)}</span>
              <span className="hint">{st.hint || v.next_step || ''}</span>
            </button>)
        }) : <div className="rows"><Empty>{EMPTY[tab]}</Empty></div>}
      </div>
      {canWrite && (
        <details className="add">
          <summary>Добавить вакансию</summary>
          <form className="form" onSubmit={submit}>
            <label>Компания<input required maxLength={120} value={form.company} onChange={f('company')} /></label>
            <label>Вакансия<input required maxLength={200} value={form.title} onChange={f('title')} /></label>
            <label>Статус<select value={form.status} onChange={f('status')}>{STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label>Формат<input maxLength={120} value={form.work_format} onChange={f('work_format')} placeholder="удалённо / гибрид Москва" /></label>
            <label>Дата подачи<input type="date" value={form.applied_on} onChange={f('applied_on')} /></label>
            <label>Где подал<input maxLength={80} value={form.channel} onChange={f('channel')} placeholder="сайт / hh" /></label>
            <label className="full">Ссылка<input type="url" value={form.url} onChange={f('url')} placeholder="https://" /></label>
            <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button className="btn" type="submit">Сохранить</button><span className="note">{addMsg}</span></div>
          </form>
        </details>
      )}
    </section>
  )
}
