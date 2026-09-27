import { useState, type FormEvent } from 'react'
import { fmtDate, today } from '../lib/dates'
import { companyName, KINDS, messagesFor, STATUSES, vacancyState, type Group, type StateView } from '../lib/domain'
import type { PultData, Vacancy, VacancyStatus } from '../lib/types'
import { Empty, PillSelect } from './ui'
import { AskClaude, RequestList, type NewRequest } from './AskClaude'

export interface NewVacancy { company: string; title: string; status: VacancyStatus; work_format: string; applied_on: string; channel: string; url: string; deadline: string }

interface Props {
  data: PultData
  canWrite: boolean
  onStatus: (v: Vacancy, s: VacancyStatus) => Promise<void>
  onSave: (id: string, patch: Partial<Vacancy>) => Promise<void>
  onFollowed: (id: string) => Promise<void>
  onAdd: (v: NewVacancy) => Promise<void>
  onAsk: (r: NewRequest) => Promise<void>
}

const GROUPS: { id: Group; title: string; empty: string }[] = [
  { id: 'action', title: 'Нужно действие', empty: 'Сейчас ничего не требует твоего шага.' },
  { id: 'wait', title: 'Ждём ответа', empty: 'Нет откликов в ожидании.' },
  { id: 'todo', title: 'Не подано', empty: 'Всё найденное уже подано.' },
  { id: 'closed', title: 'Закрыто', empty: '' },
]

/** Подробности по нажатию: всё, что раньше висело в строке. */
function Detail({ v, st, data, canWrite, onStatus, onSave, onFollowed, onAsk }: { v: Vacancy; st: StateView; data: PultData; canWrite: boolean } & Pick<Props, 'onStatus' | 'onSave' | 'onFollowed' | 'onAsk'>) {
  const [next, setNext] = useState(v.next_step ?? '')
  const [prep, setPrep] = useState(v.prep ?? '')
  const [notes, setNotes] = useState(v.notes ?? '')
  const [msg, setMsg] = useState('')
  const ms = messagesFor(data.messages, v.id)
  const save = async () => {
    try { await onSave(v.id, { next_step: next.trim() || null, prep: prep.trim() || null, notes: notes.trim() || null }); setMsg('Сохранено') }
    catch { setMsg('Не сохранилось') }
  }
  return (
    <div className="vdetail">
      <dl className="facts">
        {v.work_format && <><dt>Формат</dt><dd>{v.work_format}</dd></>}
        <dt>Подано</dt><dd>{v.applied_on ? fmtDate(v.applied_on) + ' через ' + (v.channel ?? '?') : 'ещё нет'}</dd>
        {v.deadline && <><dt>Срок</dt><dd>до {fmtDate(v.deadline)}</dd></>}
      </dl>
      <label className="field">Статус
        <PillSelect value={v.status} options={STATUSES} disabled={!canWrite} label="Статус" onChange={s => onStatus(v, s)} />
      </label>
      {ms.length > 0 && (
        <div className="timeline">
          {ms.map(m => <div key={m.id}><span className="mono">{fmtDate(m.received_at.slice(0, 10))}</span> <b>{KINDS[m.kind].label}.</b> {m.summary}</div>)}
        </div>
      )}
      <label className="field">Что дальше<textarea value={next} readOnly={!canWrite} maxLength={500} onChange={e => setNext(e.target.value)} /></label>
      <label className="field">К чему готовиться<textarea value={prep} readOnly={!canWrite} maxLength={2000} onChange={e => setPrep(e.target.value)} /></label>
      <label className="field">Заметки<textarea value={notes} readOnly={!canWrite} maxLength={4000} onChange={e => setNotes(e.target.value)} /></label>
      <div className="acts">
        {canWrite && <button className="btn" onClick={save}>Сохранить</button>}
        {canWrite && st.hint === 'Напомни о себе HR' && <button className="btn ghost" onClick={() => onFollowed(v.id)}>Я напомнил</button>}
        {v.url && <a className="btn ghost" href={v.url} target="_blank" rel="noopener">Вакансия ↗</a>}
        <span className="note">{msg}</span>
      </div>
      <div className="field">Спросить Claude
        <AskClaude vacancy={v} company={companyName(v)} canWrite={canWrite} onAsk={onAsk} />
        <RequestList items={data.requests.filter(r => r.vacancy_id === v.id)} />
      </div>
    </div>
  )
}

export function Funnel({ data, canWrite, onStatus, onSave, onFollowed, onAdd, onAsk }: Props) {
  const t = today()
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const items = data.vacancies
    .filter(v => !q || (companyName(v) + ' ' + v.title).toLowerCase().includes(q))
    .map(v => ({ v, st: vacancyState(v, data.messages, t) }))
    .sort((a, b) => String(b.v.applied_on ?? b.v.updated_at).localeCompare(String(a.v.applied_on ?? a.v.updated_at)))
  const applied = data.vacancies.filter(v => v.applied_on).length
  const replied = data.vacancies.filter(v => ['test', 'interview', 'offer', 'reject'].includes(v.status)).length
  const talks = data.vacancies.filter(v => ['test', 'interview', 'offer'].includes(v.status)).length

  const card = ({ v, st }: { v: Vacancy; st: StateView }) => (
    <div key={v.id} className={'vcard' + (open === v.id ? ' open' : '')}>
      <button className="vhead" aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>
        <span className="vmain">
          <span className="vco">{companyName(v)}</span>
          <span className="vrole">{v.title}</span>
        </span>
        <span className={'state ' + st.tone}>{st.label}</span>
        {st.hint && <span className="vhint">{st.hint}</span>}
      </button>
      {open === v.id && <Detail v={v} st={st} data={data} canWrite={canWrite} onStatus={onStatus} onSave={onSave} onFollowed={onFollowed} onAsk={onAsk} />}
    </div>
  )

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
      <p className="summary">Подано <b>{applied}</b> · ответили <b>{replied}</b> · в отборе <b>{talks}</b></p>
      <input className="search" type="search" placeholder="Найти компанию" aria-label="Поиск" value={query} onChange={e => setQuery(e.target.value)} />
      {GROUPS.map(g => {
        const list = items.filter(x => x.st.group === g.id)
        if (g.id === 'closed') return list.length ? (
          <details key={g.id} className="group closed-group"><summary>{g.title} <span className="count">{list.length}</span></summary><div className="cards">{list.map(card)}</div></details>
        ) : null
        return (
          <div key={g.id} className="group">
            <h2>{g.title} <span className="count">{list.length}</span></h2>
            {list.length ? <div className="cards">{list.map(card)}</div> : <Empty>{g.empty}</Empty>}
          </div>)
      })}
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
