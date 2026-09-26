import { addDays, days } from './dates'
import type { Message, MessageKind, PultData, TaskKind, Vacancy, VacancyStatus, WorkStatus } from './types'

export const STATUSES: { id: VacancyStatus; label: string; c: string }[] = [
  { id: 'found', label: 'Найдена', c: '--s-found' },
  { id: 'applied', label: 'Подана', c: '--s-applied' },
  { id: 'test', label: 'Тест', c: '--s-test' },
  { id: 'interview', label: 'Собеседование', c: '--s-interview' },
  { id: 'offer', label: 'Оффер', c: '--s-offer' },
  { id: 'reserve', label: 'Резерв', c: '--s-reserve' },
  { id: 'reject', label: 'Отказ', c: '--s-reject' },
  { id: 'skip', label: 'Не подходит', c: '--s-skip' },
]
export const STATUS = Object.fromEntries(STATUSES.map(s => [s.id, s])) as Record<VacancyStatus, (typeof STATUSES)[number]>
export const FUNNEL: VacancyStatus[] = ['found', 'applied', 'test', 'interview', 'offer']
export const STATUS_ORDER: Record<VacancyStatus, number> = { offer: 0, interview: 1, test: 2, applied: 3, found: 4, reserve: 5, reject: 6, skip: 7 }

export const KINDS: Record<MessageKind, { label: string; c: string }> = {
  invite: { label: 'Приглашение', c: '--s-interview' },
  test: { label: 'Тестовое', c: '--s-test' },
  offer: { label: 'Оффер', c: '--s-offer' },
  reject: { label: 'Отказ', c: '--s-reject' },
  question: { label: 'Вопрос', c: '--s-applied' },
  ack: { label: 'Получено', c: '--s-found' },
  info: { label: 'Инфо', c: '--s-reserve' },
}
export const LIVE_KINDS = new Set<MessageKind>(['invite', 'test', 'offer', 'reject', 'question'])

export const WORK_STATUSES: { id: WorkStatus; label: string; c: string }[] = [
  { id: 'todo', label: 'Не начато', c: '--s-found' },
  { id: 'doing', label: 'Делаю', c: '--s-test' },
  { id: 'ready', label: 'Готово, сдать', c: '--s-applied' },
  { id: 'submitted', label: 'Сдано', c: '--s-offer' },
]
export const TASK_KINDS: Record<TaskKind, string> = { study: 'Учёба', career: 'Карьера', money: 'Деньги', life: 'Личное' }

export const FOLLOW_DAYS = 7
/** Интервалы Лейтнера по коробкам 0-4, дни. */
export const BOX_DAYS = [0, 1, 3, 7, 14]

export const isActiveVacancy = (v: Vacancy) => v.status !== 'reject' && v.status !== 'skip'
export const companyName = (x: { company: { name: string } | null }) => x.company?.name ?? 'Без компании'

export function messagesFor(messages: Message[], vacancyId: string): Message[] {
  return messages.filter(m => m.vacancy_id === vacancyId).sort((a, b) => a.received_at.localeCompare(b.received_at))
}

export function hasLiveReply(messages: Message[], vacancyId: string): boolean {
  return messages.some(m => m.vacancy_id === vacancyId && LIVE_KINDS.has(m.kind))
}

/** Отклики без живого ответа 7+ дней и без напоминания за последние 7 дней (US-06). */
export function followUps(d: Pick<PultData, 'vacancies' | 'messages'>, t: string): Vacancy[] {
  return d.vacancies.filter(v =>
    v.status === 'applied' && v.applied_on && days(v.applied_on, t) >= FOLLOW_DAYS &&
    !hasLiveReply(d.messages, v.id) &&
    !(v.followed_up_on && days(v.followed_up_on, t) < FOLLOW_DAYS))
}

export interface AgendaItem {
  date: string
  time?: string | null
  kind: TaskKind
  title: string
  goto?: 'funnel' | 'inbox' | 'study'
  taskId?: string
}

/** Единая повестка: дедлайны вакансий, писем, учёбы, дела и напоминания (US-02). */
export function agenda(d: PultData, t: string): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const v of d.vacancies) {
    if (v.deadline && !['reject', 'skip', 'offer'].includes(v.status))
      out.push({ date: v.deadline, kind: 'career', title: companyName(v) + ': ' + (v.next_step || 'дедлайн'), goto: 'funnel' })
  }
  for (const m of d.messages) {
    if (m.deadline && !m.is_done)
      out.push({ date: m.deadline, kind: 'career', title: companyName(m) + ': ' + (m.action || m.summary), goto: 'inbox' })
  }
  for (const w of d.works) {
    if (w.deadline && w.status !== 'submitted')
      out.push({ date: w.deadline, kind: 'study', title: (w.discipline?.name ?? '') + ': ' + w.title + (w.status === 'ready' ? ' (готово, сдать)' : ''), goto: 'study' })
  }
  for (const k of d.tasks) {
    if (!k.is_done) out.push({ date: k.due_date, time: k.due_time?.slice(0, 5), kind: k.kind, title: k.title, taskId: k.id })
  }
  for (const v of followUps(d, t)) {
    out.push({ date: addDays(v.applied_on!, FOLLOW_DAYS), kind: 'career', title: 'Напомнить о себе: ' + companyName(v) + ', отклик без ответа ' + days(v.applied_on!, t) + ' дн.', goto: 'funnel' })
  }
  return out.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
}

/** Следующее состояние карточки после ответа (US-09). */
export function grade(box: number, knew: boolean, t: string): { box: number; due_on: string } {
  const next = knew ? Math.min(box + 1, 4) : 0
  return { box: next, due_on: addDays(t, knew ? BOX_DAYS[next] : 1) }
}

/** Для статусов после «найдена» база требует дату подачи. */
export function statusPatch(v: Vacancy, status: VacancyStatus, t: string): Partial<Vacancy> & { updated_by: 'owner' } {
  const patch: Partial<Vacancy> & { updated_by: 'owner' } = { status, updated_by: 'owner' }
  if (status !== 'found' && status !== 'skip' && !v.applied_on) patch.applied_on = t
  return patch
}
