import { useState, type FormEvent } from 'react'
import { days, fmtDate, today } from '../lib/dates'
import { groupWorks, WORK_STATUSES } from '../lib/domain'
import type { PultData, StudyWork, WorkStatus } from '../lib/types'
import { Empty, PillSelect } from './ui'
import { Fold, ListRow } from './kit'
import { Swipe } from './native'
import { toast } from '../lib/ux'

interface Props {
  data: PultData
  canWrite: boolean
  /** Развернуть работу сразу (переход с «Сегодня»). */
  focus?: string | null
  onStatus: (id: string, s: WorkStatus) => Promise<void>
  onSave: (id: string, patch: { deadline: string | null; notes: string | null }) => Promise<void>
  onAdd: (w: { discipline: string; title: string; deadline: string; status: WorkStatus }) => Promise<void>
}

const TONE: Record<WorkStatus, string> = { todo: 'closed', doing: 'action', ready: 'win', submitted: 'closed' }
const label = (s: WorkStatus) => WORK_STATUSES.find(x => x.id === s)!.label

/** Развёрнутая работа: статус, срок, заметка, путь к файлам. */
function Detail({ w, canWrite, onStatus, onSave }: { w: StudyWork; canWrite: boolean } & Pick<Props, 'onStatus' | 'onSave'>) {
  const [deadline, setDeadline] = useState(w.deadline ?? '')
  const [notes, setNotes] = useState(w.notes ?? '')
  const [msg, setMsg] = useState('')
  const save = async () => {
    try { await onSave(w.id, { deadline: deadline || null, notes: notes.trim() || null }); setMsg(''); toast('Сохранено') }
    catch { setMsg('Не сохранилось') }
  }
  return (
    <div className="wk-detail">
      <label className="field">Статус<PillSelect value={w.status} options={WORK_STATUSES} disabled={!canWrite} label="Статус работы" onChange={s => onStatus(w.id, s)} /></label>
      <label className="field">Срок<input type="date" value={deadline} readOnly={!canWrite} onChange={e => setDeadline(e.target.value)} /></label>
      <label className="field">Заметка<textarea value={notes} readOnly={!canWrite} maxLength={2000} onChange={e => setNotes(e.target.value)} /></label>
      {w.local_path && (
        <div className="path-row"><span className="path">{w.local_path}</span>
          <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(w.local_path!).then(() => toast('Путь скопирован'))}>Скопировать</button></div>)}
      {canWrite && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="btn" onClick={save}>Сохранить</button><span className="note">{msg}</span></div>}
    </div>
  )
}

export function Study({ data, canWrite, focus, onStatus, onSave, onAdd }: Props) {
  const t = today()
  const g = groupWorks(data.works, t)
  const [openId, setOpenId] = useState<string | null>(focus ?? null)
  const subjects = [...new Set(data.works.map(w => w.discipline?.name).filter(Boolean))] as string[]

  const [form, setForm] = useState({ discipline: '', title: '', deadline: '', status: 'todo' as WorkStatus })
  const [msg, setMsg] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await onAdd(form); setMsg('Добавлено: ' + form.title); setForm(p => ({ ...p, title: '', deadline: '' })) }
    catch (err) { setMsg('Не сохранилось: ' + (err as Error).message) }
  }

  const row = (w: StudyWork) => {
    const n = w.deadline ? days(t, w.deadline) : null
    const isOpen = openId === w.id
    const hot = n !== null && w.status !== 'submitted' && n <= 1
    const line = (
      <ListRow title={w.title}
        sub={<>{n !== null && <span className={hot ? 'sub-hot' : undefined}>{n < 0 && w.status !== 'submitted' ? 'срок прошёл ' : 'до '}{fmtDate(w.deadline)}</span>}
          {n !== null ? ' · ' : ''}{[w.discipline?.name, w.discipline?.teacher].filter(Boolean).join(' · ')}</>}
        trail={<span className={'spill ' + TONE[w.status]}>{label(w.status)}</span>}
        onOpen={() => setOpenId(isOpen ? null : w.id)} className={isOpen ? 'open' : ''} />)
    return (
      <div key={w.id} className="wk">
        {w.status !== 'submitted' && canWrite
          ? <Swipe label="Сдано" onAction={() => { onStatus(w.id, 'submitted').then(() => toast({ text: 'Работа сдана', action: { label: 'Вернуть', run: () => { onStatus(w.id, w.status) } } })) }}>{line}</Swipe>
          : line}
        {isOpen && <Detail w={w} canWrite={canWrite} onStatus={onStatus} onSave={onSave} />}
      </div>)
  }
  const none = !data.works.length

  return (
    <section className="study-list">
      {none && <div className="rows"><Empty>Учебных работ пока нет.</Empty></div>}
      {g.urgent.length > 0 && <Fold id="study-urgent" title="Срочно" meta={g.urgent.length + ', срок до 3 дней'}><div className="rows">{g.urgent.map(row)}</div></Fold>}
      {g.work.length > 0 && <Fold id="study-work" title="В работе" meta={g.work.length}><div className="rows">{g.work.map(row)}</div></Fold>}
      {g.done.length > 0 && <Fold id="study-done" title="Сдано" meta={g.done.length} defaultOpen={false}><div className="rows">{g.done.map(row)}</div></Fold>}
      {canWrite && (
        <Fold id="study-add" title="Добавить работу" defaultOpen={false}>
          <form className="form card-form" onSubmit={submit}>
            <label>Предмет<input required list="subjects" maxLength={200} value={form.discipline} onChange={e => setForm(p => ({ ...p, discipline: e.target.value }))} /></label>
            <label className="full">Работа<input required maxLength={300} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="ЛР2, курсовая, ДЗ" /></label>
            <label>Срок<input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} /></label>
            <label>Статус<select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as WorkStatus }))}>{WORK_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button className="btn" type="submit">Добавить</button><span className="note">{msg}</span></div>
          </form>
          <datalist id="subjects">{subjects.map(s => <option key={s} value={s} />)}</datalist>
        </Fold>
      )}
    </section>
  )
}
