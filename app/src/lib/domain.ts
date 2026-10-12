import { addDays, days } from './dates'
import { fmtMoney, upcoming } from './billing'
import type { Message, MessageKind, PultData, StudyWork, TaskKind, Vacancy, VacancyStatus, WorkStatus } from './types'

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
  /** Куда ведёт строка и что там открыть: id вакансии или подписки. */
  goto?: 'funnel' | 'inbox' | 'study' | 'money'
  ref?: string
  taskId?: string
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]+/g, '')

/** Дело «Продление iCloud+» в день списания подписки iCloud+ повторяет её строку: оставляем строку подписки. */
function dupOfCharge(task: { title: string; kind: TaskKind; due_date: string }, charges: { date: string; name: string }[]) {
  if (task.kind !== 'money') return false
  const t = norm(task.title)
  return charges.some(c => c.date === task.due_date && norm(c.name).length >= 3 && t.includes(norm(c.name)))
}

/** Единая повестка: дедлайны вакансий, писем и учёбы, дела и списания подписок (US-02, US-20).
 *  Напоминания «отклик без ответа» сюда не входят: у них нет срока, это одна сводная строка (staleCount). */
export function agenda(d: PultData, t: string): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const v of d.vacancies) {
    if (v.deadline && !['reject', 'skip', 'offer'].includes(v.status))
      out.push({ date: v.deadline, kind: 'career', title: companyName(v) + ': ' + (v.next_step || 'дедлайн'), goto: 'funnel', ref: v.id })
  }
  for (const m of d.messages) {
    if (m.deadline && !m.is_done)
      out.push({ date: m.deadline, kind: 'career', title: companyName(m) + ': ' + (m.action || m.summary), goto: 'inbox', ref: m.vacancy_id ?? undefined })
  }
  for (const w of d.works) {
    if (w.deadline && w.status !== 'submitted')
      out.push({ date: w.deadline, kind: 'study', title: (w.discipline?.name ?? '') + ': ' + w.title + (w.status === 'ready' ? ' (готово, сдать)' : ''), goto: 'study', ref: w.id })
  }
  const charges = upcoming(d.subscriptions, t, 30)
  const chargeKeys = charges.map(u => ({ date: u.date, name: u.sub.name }))
  for (const k of d.tasks) {
    if (!k.is_done && !dupOfCharge(k, chargeKeys)) out.push({ date: k.due_date, time: k.due_time?.slice(0, 5), kind: k.kind, title: k.title, taskId: k.id })
  }
  for (const u of charges)
    out.push({ date: u.date, kind: 'money', title: 'Списание: ' + u.sub.name + ', ' + fmtMoney(u.sub.amount, u.sub.currency), goto: 'money', ref: u.sub.id })
  return out.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
}

/** Сколько откликов пора напомнить о себе (одна сводная строка на «Сегодня», список в воронке). */
export const staleCount = (d: Pick<PultData, 'vacancies' | 'messages'>, t: string) => followUps(d, t).length

/** Внутри вкладки «Ждём»: пора напомнить, ждём ответа, резерв. */
export type WaitGroup = 'stale' | 'fresh' | 'reserve'
export function waitGroup(v: Vacancy, messages: Message[], t: string): WaitGroup {
  if (v.status === 'reserve') return 'reserve'
  return followUps({ vacancies: [v], messages }, t).length ? 'stale' : 'fresh'
}

/** Учебные работы по срочности: срок прошёл или в ближайшие 3 дня, остальные несданные, сданные. */
export function groupWorks(works: StudyWork[], t: string): { urgent: StudyWork[]; work: StudyWork[]; done: StudyWork[] } {
  const order: Record<WorkStatus, number> = { doing: 0, ready: 1, todo: 2, submitted: 3 }
  const byDeadline = (a: StudyWork, b: StudyWork) => (order[a.status] - order[b.status]) || String(a.deadline ?? '9999').localeCompare(String(b.deadline ?? '9999')) || a.title.localeCompare(b.title, 'ru')
  const open = works.filter(w => w.status !== 'submitted')
  const urgent = open.filter(w => w.deadline && days(t, w.deadline) <= 3).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
  return {
    urgent,
    work: open.filter(w => !urgent.includes(w)).sort(byDeadline),
    done: works.filter(w => w.status === 'submitted').sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  }
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

// ---------- Понятное состояние в одну строку (UX v3) ----------

export type Tone = 'action' | 'wait' | 'todo' | 'closed' | 'win'
export type Group = 'action' | 'wait' | 'todo' | 'closed'
export interface StateView { label: string; tone: Tone; group: Group; hint: string }

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}
export const daysWord = (n: number) => n + ' ' + plural(n, 'день', 'дня', 'дней')

/** Что сейчас с вакансией и что делать, без лишнего контекста. */
export function vacancyState(v: Vacancy, messages: Message[], t: string): StateView {
  const open = messages.find(m => m.vacancy_id === v.id && !m.is_done && ['invite', 'test', 'question', 'offer'].includes(m.kind))
  if (v.status === 'offer') return { label: 'Оффер', tone: 'win', group: 'action', hint: open?.action ?? 'Реши по офферу' }
  if (open) return { label: open.kind === 'invite' ? 'Зовут на встречу' : open.kind === 'test' ? 'Тестовое' : 'Нужен ответ', tone: 'action', group: 'action', hint: open.action ?? open.summary }
  if (v.status === 'interview') return { label: 'Собеседование', tone: 'win', group: 'action', hint: v.next_step ?? 'Готовься к следующему этапу' }
  if (v.status === 'test') return { label: 'Тестовое', tone: 'action', group: 'action', hint: v.next_step ?? 'Сделай тестовое' }
  if (v.status === 'applied') {
    const d = v.applied_on ? days(v.applied_on, t) : 0
    const followed = v.followed_up_on && days(v.followed_up_on, t) < FOLLOW_DAYS
    if (d >= FOLLOW_DAYS && !hasLiveReply(messages, v.id) && !followed)
      return { label: 'Без ответа ' + daysWord(d), tone: 'action', group: 'action', hint: 'Напомни о себе HR' }
    return { label: d === 0 ? 'Подана сегодня' : 'Ждём ответа · ' + daysWord(d), tone: 'wait', group: 'wait', hint: v.next_step ?? '' }
  }
  if (v.status === 'reserve') return { label: 'В резерве', tone: 'wait', group: 'wait', hint: v.next_step ?? '' }
  if (v.status === 'found') return { label: 'Не подана', tone: 'todo', group: 'todo', hint: v.next_step ?? 'Подать отклик' }
  return { label: v.status === 'reject' ? 'Отказ' : 'Не подходит', tone: 'closed', group: 'closed', hint: '' }
}

// ---------- Дизайн v4: вкладки воронки и этапы ----------

export type FunnelTab = 'sel' | 'wait' | 'todo' | 'closed'
export const FUNNEL_TABS: { id: FunnelTab; label: string }[] = [
  { id: 'sel', label: 'В отборе' }, { id: 'wait', label: 'Ждём' }, { id: 'todo', label: 'Не подано' }, { id: 'closed', label: 'Закрыто' },
]

export function funnelTab(v: Vacancy): FunnelTab {
  if (v.status === 'test' || v.status === 'interview' || v.status === 'offer') return 'sel'
  if (v.status === 'applied' || v.status === 'reserve') return 'wait'
  if (v.status === 'found') return 'todo'
  return 'closed'
}

/** Текущий этап из четырёх (0 отклик, 1 ответ, 2 отбор, 3 оффер); все до него пройдены. */
export function stageOf(v: Vacancy, messages: Message[]): number {
  if (v.status === 'offer') return 3
  if (v.status === 'test' || v.status === 'interview') return 2
  if (v.status === 'found' || (v.status === 'skip' && !v.applied_on)) return 0
  const replied = messages.some(m => m.vacancy_id === v.id && m.kind !== 'reject')
  return replied ? 2 : 1
}

const RANK: Record<string, number> = { 'Оффер': 0, 'Зовут на встречу': 1, 'Нужен ответ': 1, 'Тестовое': 2, 'Собеседование': 3 }

/** Одно самое важное дело по поиску работы для карточки «Следующий шаг». */
export function nextStep(d: Pick<PultData, 'vacancies' | 'messages'>, t: string): { v: Vacancy; st: StateView } | null {
  const list = d.vacancies.map(v => ({ v, st: vacancyState(v, d.messages, t) })).filter(x => x.st.group === 'action')
  list.sort((a, b) => (RANK[a.st.label] ?? 5) - (RANK[b.st.label] ?? 5) || String(b.v.updated_at).localeCompare(String(a.v.updated_at)))
  return list[0] ?? null
}
