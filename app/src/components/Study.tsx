import { useState, type FormEvent } from 'react'
import { days, fmtDate, today } from '../lib/dates'
import { WORK_STATUSES } from '../lib/domain'
import type { PultData, WorkStatus } from '../lib/types'
import { Chip, Empty, PillSelect } from './ui'

interface Props {
  data: PultData
  canWrite: boolean
  onStatus: (id: string, s: WorkStatus) => Promise<void>
  onAdd: (w: { discipline: string; title: string; deadline: string; status: WorkStatus }) => Promise<void>
}

const ORDER: Record<WorkStatus, number> = { doing: 0, ready: 1, todo: 2, submitted: 3 }

export function Study({ data, canWrite, onStatus, onAdd }: Props) {
  const [filter, setFilter] = useState<'active' | 'all' | 'submitted'>('active')
  const t = today()
  const active = data.works.filter(w => w.status !== 'submitted')
  const rows = data.works
    .filter(w => filter === 'all' ? true : filter === 'submitted' ? w.status === 'submitted' : w.status !== 'submitted')
    .sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || String(a.deadline ?? '9999').localeCompare(String(b.deadline ?? '9999')))
  const subjects = [...new Set(data.works.map(w => w.discipline?.name).filter(Boolean))] as string[]

  const [form, setForm] = useState({ discipline: '', title: '', deadline: '', status: 'todo' as WorkStatus })
  const [msg, setMsg] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await onAdd(form); setMsg('Добавлено: ' + form.title); setForm(p => ({ ...p, title: '', deadline: '' })) }
    catch (err) { setMsg('Не сохранилось: ' + (err as Error).message) }
  }

  return (
    <section className="panel">
      <div className="filters">
        <Chip id="active" value={filter} onPick={setFilter}>В работе <span className="mono">{active.length}</span></Chip>
        <Chip id="all" value={filter} onPick={setFilter}>Все <span className="mono">{data.works.length}</span></Chip>
        <Chip id="submitted" value={filter} onPick={setFilter}>Сдано <span className="mono">{data.works.length - active.length}</span></Chip>
      </div>
      <section className="list">
        {rows.length === 0 ? <Empty>Здесь пусто.</Empty> : rows.map(w => {
          const n = w.deadline ? days(t, w.deadline) : null
          return (
            <div key={w.id} className="st">
              <div>
                <div className="title">{w.title}{' '}
                  {n !== null && w.status !== 'submitted' && <span className={'flag' + (n <= 1 ? ' hot' : '')}>{n < 0 ? 'срок прошёл ' + fmtDate(w.deadline) : 'до ' + fmtDate(w.deadline)}</span>}
                </div>
                <div className="subj">{w.discipline?.name}{w.discipline?.teacher ? ' · ' + w.discipline.teacher : ''}</div>
                {w.notes && <div className="note">{w.notes}</div>}
                {w.local_path && <div className="path">{w.local_path}</div>}
              </div>
              <PillSelect value={w.status} options={WORK_STATUSES} disabled={!canWrite} label="Статус работы" onChange={s => onStatus(w.id, s)} />
            </div>)
        })}
      </section>
      {canWrite && (
        <details className="add">
          <summary>Добавить работу</summary>
          <form className="form" onSubmit={submit}>
            <label>Предмет<input required list="subjects" maxLength={200} value={form.discipline} onChange={e => setForm(p => ({ ...p, discipline: e.target.value }))} /></label>
            <label className="full">Работа<input required maxLength={300} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="ЛР2, курсовая, ДЗ" /></label>
            <label>Срок<input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} /></label>
            <label>Статус<select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as WorkStatus }))}>{WORK_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button className="btn" type="submit">Добавить</button><span className="note">{msg}</span></div>
          </form>
          <datalist id="subjects">{subjects.map(s => <option key={s} value={s} />)}</datalist>
        </details>
      )}
    </section>
  )
}
