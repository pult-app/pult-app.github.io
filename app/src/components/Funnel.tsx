import { useState, type CSSProperties, type FormEvent } from 'react'
import { days, fmtDate, today } from '../lib/dates'
import { companyName, followUps, FUNNEL, isActiveVacancy, messagesFor, STATUS, STATUS_ORDER, STATUSES } from '../lib/domain'
import type { PultData, Vacancy, VacancyStatus } from '../lib/types'
import { Chip, Empty, PillSelect } from './ui'

export interface NewVacancy { company: string; title: string; status: VacancyStatus; work_format: string; applied_on: string; channel: string; url: string; deadline: string }

interface Props {
  data: PultData
  canWrite: boolean
  onStatus: (v: Vacancy, s: VacancyStatus) => Promise<void>
  onSave: (id: string, patch: Partial<Vacancy>) => Promise<void>
  onFollowed: (id: string) => Promise<void>
  onAdd: (v: NewVacancy) => Promise<void>
}

const STAGE_LABEL: Record<string, string> = { found: 'ждут подачи', applied: 'подано всего', test: 'дошло до теста', interview: 'до собеседования', offer: 'офферов' }

function Detail({ v, data, canWrite, onSave, onFollowed, follow }: { v: Vacancy; data: PultData; canWrite: boolean; follow: boolean } & Pick<Props, 'onSave' | 'onFollowed'>) {
  const [next, setNext] = useState(v.next_step ?? '')
  const [prep, setPrep] = useState(v.prep ?? '')
  const [notes, setNotes] = useState(v.notes ?? '')
  const [deadline, setDeadline] = useState(v.deadline ?? '')
  const [msg, setMsg] = useState('')
  const ms = messagesFor(data.messages, v.id)
  const save = async () => {
    try { await onSave(v.id, { next_step: next.trim() || null, prep: prep.trim() || null, notes: notes.trim() || null, deadline: deadline || null }); setMsg('Сохранено') }
    catch { setMsg('Не сохранилось, попробуй ещё раз') }
  }
  return (
    <div className="detail">
      <label>Следующий шаг<textarea value={next} readOnly={!canWrite} maxLength={500} onChange={e => setNext(e.target.value)} /></label>
      <label>К чему готовиться<textarea value={prep} readOnly={!canWrite} maxLength={2000} onChange={e => setPrep(e.target.value)} /></label>
      <label>Заметки<textarea value={notes} readOnly={!canWrite} maxLength={4000} onChange={e => setNotes(e.target.value)} /></label>
      <label>Дедлайн<input type="date" value={deadline} readOnly={!canWrite} onChange={e => setDeadline(e.target.value)} /></label>
      {ms.length > 0 && <div className="mails">{ms.map(m => <div key={m.id} className="m"><span className="mono">{fmtDate(m.received_at.slice(0, 10))}</span> {m.summary}</div>)}</div>}
      <div className="acts">
        {canWrite && <button className="btn" onClick={save}>Сохранить</button>}
        {canWrite && follow && <button className="btn ghost" onClick={() => onFollowed(v.id)}>Напомнил о себе</button>}
        {v.url && <a href={v.url} target="_blank" rel="noopener">Открыть вакансию</a>}
        <span className="saved mono">{v.channel ?? ''} · изменено {fmtDate(v.updated_at.slice(0, 10))}</span>
        <span className="saved">{msg}</span>
      </div>
    </div>
  )
}

export function Funnel({ data, canWrite, onStatus, onSave, onFollowed, onAdd }: Props) {
  const [filter, setFilter] = useState<'active' | 'all' | VacancyStatus>('active')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const t = today()
  const vs = data.vacancies
  const fu = new Set(followUps(data, t).map(v => v.id))
  const count = (s: VacancyStatus) => vs.filter(v => v.status === s).length
  const reached = (s: VacancyStatus) => vs.filter(v => FUNNEL.indexOf(v.status) >= FUNNEL.indexOf(s) || (s === 'applied' && (v.status === 'reserve' || v.status === 'reject'))).length
  const q = query.trim().toLowerCase()
  const rows = vs
    .filter(v => filter === 'all' ? true : filter === 'active' ? isActiveVacancy(v) : v.status === filter)
    .filter(v => !q || (companyName(v) + ' ' + v.title).toLowerCase().includes(q))
    .sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || String(b.applied_on ?? '').localeCompare(String(a.applied_on ?? '')))
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const [form, setForm] = useState<NewVacancy>({ company: '', title: '', status: 'applied', work_format: '', applied_on: t, channel: '', url: '', deadline: '' })
  const [addMsg, setAddMsg] = useState('')
  const f = (k: keyof NewVacancy) => (e: { target: { value: string } }) => setForm(p => ({ ...p, [k]: e.target.value }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await onAdd(form); setAddMsg('Добавлено: ' + form.company); setForm(p => ({ ...p, company: '', title: '', url: '' })) }
    catch (err) { setAddMsg('Не сохранилось: ' + (err as Error).message) }
  }

  return (
    <section className="panel">
      <section className="funnel" aria-label="Воронка по этапам">
        {FUNNEL.map(s => (
          <div key={s} className="stage" style={{ '--c': `var(${STATUS[s].c})` } as CSSProperties}>
            <span className="n">{s === 'found' ? count('found') : reached(s)}</span><span className="l">{STAGE_LABEL[s]}</span>
          </div>))}
      </section>
      <div className="side"><span>в резерве <b>{count('reserve')}</b></span><span>отказов <b>{count('reject')}</b></span><span>не подходит <b>{count('skip')}</b></span></div>
      <div className="filters" role="group" aria-label="Фильтр по статусу">
        <Chip id="active" value={filter} onPick={setFilter}>В работе <span className="mono">{vs.filter(isActiveVacancy).length}</span></Chip>
        <Chip id="all" value={filter} onPick={setFilter}>Все <span className="mono">{vs.length}</span></Chip>
        {STATUSES.map(s => <Chip key={s.id} id={s.id} value={filter} onPick={setFilter}>{s.label} <span className="mono">{count(s.id)}</span></Chip>)}
        <input className="search" type="search" placeholder="Поиск по компании" aria-label="Поиск" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <section className="list" aria-live="polite">
        {rows.length === 0 ? <Empty>{vs.length ? 'Под этот фильтр ничего нет.' : 'Пока пусто.'}</Empty> : <>
          <div className="row head"><span>Компания и вакансия</span><span>Статус</span><span>Формат</span><span>Подано</span><span /></div>
          {rows.map(v => {
            const dl = v.deadline && isActiveVacancy(v) ? days(t, v.deadline) : null
            const n = messagesFor(data.messages, v.id).length
            const isOpen = open.has(v.id)
            return (
              <div className="row" key={v.id}>
                <div className="cell-main">
                  <div className="co">{companyName(v)}
                    {dl !== null && <span className={'flag' + (dl <= 1 ? ' hot' : '')}>до {fmtDate(v.deadline)}</span>}
                    {fu.has(v.id) && <span className="flag">напомнить о себе</span>}
                    {n > 0 && <span className="flag" style={{ background: 'var(--sunk)', color: 'var(--muted)' }}>писем {n}</span>}
                  </div>
                  <div className="role">{v.title}</div>
                  {v.next_step && <div className="next">{v.next_step}</div>}
                </div>
                <div className="cell-pill"><PillSelect value={v.status} options={STATUSES} disabled={!canWrite} label={'Статус: ' + companyName(v)} onChange={s => onStatus(v, s)} /></div>
                <div className="fmt">{v.work_format}</div>
                <div className="date mono">{fmtDate(v.applied_on)}</div>
                <button className="tog" aria-expanded={isOpen} aria-label="Подробнее" onClick={() => toggle(v.id)}>{isOpen ? '−' : '+'}</button>
                {isOpen && <Detail v={v} data={data} canWrite={canWrite} follow={fu.has(v.id)} onSave={onSave} onFollowed={onFollowed} />}
              </div>)
          })}
        </>}
      </section>
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
            <label>Дедлайн<input type="date" value={form.deadline} onChange={f('deadline')} /></label>
            <label className="full">Ссылка<input type="url" value={form.url} onChange={f('url')} placeholder="https://" /></label>
            <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button className="btn" type="submit">Сохранить</button><span className="note">{addMsg}</span></div>
          </form>
        </details>
      )}
    </section>
  )
}
