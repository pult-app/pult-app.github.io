// Подписки: когда спишут, сколько это в месяц, что ждёт в ближайшие недели.
// Дата списания хранится как «якорь» next_charge_on: от неё считаются все следующие списания,
// поэтому дата не уезжает, когда она прошла, и 31-е число не превращается в 28-е навсегда.
// Та же арифметика дат лежит в SQL (private.next_charge, docs/03-data/schema.sql) и в supabase/functions/calendar/billing.ts;
// тест billing.test.ts сверяет TypeScript-копии между собой.
import { addDays, days } from './dates'

export type BillingUnit = 'week' | 'month' | 'year'
export type SubStatus = 'active' | 'trial' | 'paused' | 'cancelled'
export type SubCategory = 'ai' | 'cloud' | 'media' | 'software' | 'telecom' | 'education' | 'games' | 'other'

export interface Billing { next_charge_on: string; unit: BillingUnit; every: number }

export const SUB_STATUSES: { id: SubStatus; label: string }[] = [
  { id: 'active', label: 'Активна' },
  { id: 'trial', label: 'Пробный период' },
  { id: 'paused', label: 'На паузе' },
  { id: 'cancelled', label: 'Отменена' },
]

export const SUB_CATEGORIES: { id: SubCategory; label: string }[] = [
  { id: 'ai', label: 'ИИ' },
  { id: 'cloud', label: 'Облако' },
  { id: 'media', label: 'Видео и музыка' },
  { id: 'software', label: 'Софт и VPN' },
  { id: 'telecom', label: 'Связь' },
  { id: 'education', label: 'Учёба' },
  { id: 'games', label: 'Игры' },
  { id: 'other', label: 'Другое' },
]
export const CATEGORY_LABEL = Object.fromEntries(SUB_CATEGORIES.map(c => [c.id, c.label])) as Record<SubCategory, string>

/** Готовые периоды для формы. Любую другую связку unit + every (например, от агента) показываем подписью. */
export const PERIODS: { id: string; unit: BillingUnit; every: number; label: string }[] = [
  { id: 'week', unit: 'week', every: 1, label: 'Раз в неделю' },
  { id: 'month', unit: 'month', every: 1, label: 'Раз в месяц' },
  { id: 'quarter', unit: 'month', every: 3, label: 'Раз в 3 месяца' },
  { id: 'half', unit: 'month', every: 6, label: 'Раз в полгода' },
  { id: 'year', unit: 'year', every: 1, label: 'Раз в год' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const monthLen = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()

/** Прибавить месяцы к дате ГГГГ-ММ-ДД; если в конечном месяце такого числа нет, берём последний день месяца. */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number)
  const total = (m - 1) + n
  const yy = y + Math.floor(total / 12)
  const mm = ((total % 12) + 12) % 12
  return `${yy}-${pad(mm + 1)}-${pad(Math.min(day, monthLen(yy, mm)))}`
}

/** Списание номер k от якоря: якорь + k периодов. Месяцы и годы считаются от якоря, а не от прошлого списания. */
export function chargeAt(b: Billing, k: number): string {
  if (b.unit === 'week') return addDays(b.next_charge_on, 7 * b.every * k)
  return addMonths(b.next_charge_on, (b.unit === 'year' ? 12 : 1) * b.every * k)
}

/** Первое списание не раньше from. Якорь в будущем возвращается как есть. */
export function nextCharge(b: Billing, from: string): string {
  if (b.next_charge_on >= from) return b.next_charge_on
  let k: number
  if (b.unit === 'week') k = Math.ceil(days(b.next_charge_on, from) / (7 * b.every))
  else {
    const [ay, am] = b.next_charge_on.split('-').map(Number)
    const [fy, fm] = from.split('-').map(Number)
    k = Math.max(0, Math.floor(((fy - ay) * 12 + (fm - am)) / ((b.unit === 'year' ? 12 : 1) * b.every)))
  }
  while (chargeAt(b, k) < from) k++
  return chargeAt(b, k)
}

/** Все списания в отрезке [from, to], включая границы. */
export function chargesBetween(b: Billing, from: string, to: string): string[] {
  const out: string[] = []
  for (let d = nextCharge(b, from), k = 0; d <= to && k < 400; k++) {
    out.push(d)
    d = nextCharge(b, addDays(d, 1))
  }
  return out
}

/** Сколько стоит подписка в месяц: неделя считается как 52/12 недели, год делится на 12. */
export function perMonth(amount: number, unit: BillingUnit, every: number): number {
  if (unit === 'week') return amount * 52 / 12 / every
  return unit === 'year' ? amount / (12 * every) : amount / every
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}

/** «раз в месяц», «раз в 3 месяца», «раз в 2 недели». */
export function periodLabel(unit: BillingUnit, every: number): string {
  if (every === 1) return unit === 'week' ? 'раз в неделю' : unit === 'month' ? 'раз в месяц' : 'раз в год'
  if (unit === 'month' && every === 6) return 'раз в полгода'
  const w = unit === 'week' ? plural(every, 'неделю', 'недели', 'недель') : unit === 'month' ? plural(every, 'месяц', 'месяца', 'месяцев') : plural(every, 'год', 'года', 'лет')
  return `раз в ${every} ${w}`
}

export interface Subscription extends Billing {
  id: string
  external_id: string | null
  name: string
  amount: number
  currency: string
  status: SubStatus
  category: SubCategory
  method: string | null
  url: string | null
  notes: string | null
  remind_days: number
  updated_by: 'owner' | 'agent' | 'system'
}

export const isLive = (s: Subscription) => s.status === 'active' || s.status === 'trial'

export interface Upcoming { sub: Subscription; date: string; in: number }

/** Ближайшие списания живых подписок в ближайших n днях (включая сегодня), по возрастанию даты. */
export function upcoming(subs: Subscription[], t: string, n: number): Upcoming[] {
  const out: Upcoming[] = []
  for (const sub of subs) {
    if (!isLive(sub)) continue
    for (const date of chargesBetween(sub, t, addDays(t, n))) out.push({ sub, date, in: days(t, date) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name, 'ru'))
}

/** Сумма по валютам: { RUB: 1290, USD: 12 }. */
export type Totals = Record<string, number>
const add = (t: Totals, cur: string, v: number) => { t[cur] = (t[cur] ?? 0) + v }

export interface MoneySummary {
  liveCount: number
  trialCount: number
  /** Основная валюта: рубли, если есть живые подписки в рублях, иначе самая частая. */
  primary: string
  month: Totals
  year: Totals
  next30: Totals
  nextCharge: Upcoming | null
  byCategory: { category: SubCategory; month: number; share: number }[]
}

export function summarize(subs: Subscription[], t: string): MoneySummary {
  const active = subs.filter(s => s.status === 'active')
  const live = subs.filter(isLive)
  const month: Totals = {}, year: Totals = {}, next30: Totals = {}
  for (const s of active) {
    const m = perMonth(s.amount, s.unit, s.every)
    add(month, s.currency, m); add(year, s.currency, m * 12)
  }
  const soon = upcoming(subs, t, 30)
  for (const u of soon) add(next30, u.sub.currency, u.sub.amount)
  const freq: Totals = {}
  for (const s of live) add(freq, s.currency, 1)
  const primary = freq.RUB ? 'RUB' : Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'RUB'
  const cat = new Map<SubCategory, number>()
  for (const s of active.filter(x => x.currency === primary)) cat.set(s.category, (cat.get(s.category) ?? 0) + perMonth(s.amount, s.unit, s.every))
  const total = [...cat.values()].reduce((a, b) => a + b, 0)
  return {
    liveCount: live.length,
    trialCount: subs.filter(s => s.status === 'trial').length,
    primary, month, year, next30,
    nextCharge: soon[0] ?? null,
    byCategory: [...cat.entries()].map(([category, m]) => ({ category, month: m, share: total ? m / total : 0 })).sort((a, b) => b.month - a.month),
  }
}

/** По дням ближайшего месяца: сколько и чего спишут. Для полосы «30 дней» (сумма в основной валюте). */
export function dayStrip(subs: Subscription[], t: string, primary: string, n = 30): { date: string; items: Upcoming[]; total: number }[] {
  const all = upcoming(subs, t, n - 1)
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(t, i)
    const items = all.filter(u => u.date === date)
    return { date, items, total: items.filter(u => u.sub.currency === primary).reduce((a, u) => a + u.sub.amount, 0) }
  })
}

export type SubGroup = 'soon' | 'later' | 'paused' | 'cancelled'

/** Группы списка: скоро (7 дней), позже, пауза, отменены. Внутри живые идут по дате ближайшего списания. */
export function groupSubs(subs: Subscription[], t: string): Record<SubGroup, { sub: Subscription; next: string | null }[]> {
  const g: Record<SubGroup, { sub: Subscription; next: string | null }[]> = { soon: [], later: [], paused: [], cancelled: [] }
  for (const sub of subs) {
    if (sub.status === 'paused') g.paused.push({ sub, next: null })
    else if (sub.status === 'cancelled') g.cancelled.push({ sub, next: null })
    else {
      const next = nextCharge(sub, t)
      g[days(t, next) <= 7 ? 'soon' : 'later'].push({ sub, next })
    }
  }
  const byDate = (a: { sub: Subscription; next: string | null }, b: { sub: Subscription; next: string | null }) =>
    String(a.next).localeCompare(String(b.next)) || a.sub.name.localeCompare(b.sub.name, 'ru')
  g.soon.sort(byDate); g.later.sort(byDate)
  g.paused.sort((a, b) => a.sub.name.localeCompare(b.sub.name, 'ru'))
  g.cancelled.sort((a, b) => a.sub.name.localeCompare(b.sub.name, 'ru'))
  return g
}

/** Категория по названию: подсказка в форме, пока Герман не выбрал её сам. */
export function guessCategory(name: string): SubCategory {
  const n = name.toLowerCase()
  if (/(chatgpt|openai|claude|anthropic|gemini|copilot|midjourney|perplexity|cursor|нейро)/.test(n)) return 'ai'
  if (/(icloud|google one|dropbox|облак|яндекс диск|яндекс 360|onedrive)/.test(n)) return 'cloud'
  if (/(spotify|youtube|netflix|кинопоиск|ivi|okko|wink|vk музык|вк музык|яндекс плюс|яндекс музык|apple music|apple tv|premier|start)/.test(n)) return 'media'
  if (/(vpn|jetbrains|adobe|figma|notion|office|microsoft 365|1password|домен|хостинг|github)/.test(n)) return 'software'
  if (/(мтс|билайн|мегафон|tele2|теле2|t2|ростелеком|интернет|связь|сотов)/.test(n)) return 'telecom'
  if (/(skillbox|нетология|stepik|coursera|udemy|курс|школа|duolingo|lingvo)/.test(n)) return 'education'
  if (/(steam|playstation|ps plus|xbox|game pass|nitro|epic|игр)/.test(n)) return 'games'
  return 'other'
}

// ---------- Формат ----------

/** 1290 -> «1 290 ₽»; доли показываем только у небольших сумм. */
export function fmtMoney(v: number, currency = 'RUB'): string {
  const frac = Math.abs(v) < 100 && Math.round(v) !== v ? 2 : 0
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, minimumFractionDigits: frac, maximumFractionDigits: frac }).format(v)
  } catch { return `${Math.round(v)} ${currency}` }
}

/** { RUB: 1290, USD: 12 } -> «1 290 ₽ + 12 $», основная валюта первой. */
export function fmtTotals(t: Totals, primary = 'RUB'): string {
  const keys = Object.keys(t).filter(k => t[k] > 0).sort((a, b) => (a === primary ? -1 : b === primary ? 1 : a.localeCompare(b)))
  return keys.length ? keys.map(k => fmtMoney(t[k], k)).join(' + ') : fmtMoney(0, primary)
}

/** Подпись срока до списания: «сегодня», «завтра», «через 5 дн.». */
export function inLabel(n: number): string {
  return n <= 0 ? 'сегодня' : n === 1 ? 'завтра' : n < 60 ? `через ${n} дн.` : `через ${Math.round(n / 30)} мес.`
}
