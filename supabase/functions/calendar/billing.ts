// Даты списаний подписок для календаря. Копия арифметики из app/src/lib/billing.ts и private.next_charge (schema.sql):
// Edge Function выкладывается отдельно и не может импортировать код приложения. Тест billing.test.ts сверяет обе копии.

export type BillingUnit = 'week' | 'month' | 'year'
export interface Billing { next_charge_on: string; unit: BillingUnit; every: number }

const pad = (n: number) => String(n).padStart(2, '0')
const monthLen = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
const plusDays = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number)
  const total = (m - 1) + n
  const yy = y + Math.floor(total / 12)
  const mm = ((total % 12) + 12) % 12
  return `${yy}-${pad(mm + 1)}-${pad(Math.min(day, monthLen(yy, mm)))}`
}

export function chargeAt(b: Billing, k: number): string {
  if (b.unit === 'week') return plusDays(b.next_charge_on, 7 * b.every * k)
  return addMonths(b.next_charge_on, (b.unit === 'year' ? 12 : 1) * b.every * k)
}

export function nextCharge(b: Billing, from: string): string {
  if (b.next_charge_on >= from) return b.next_charge_on
  let k: number
  if (b.unit === 'week') k = Math.ceil(dayDiff(b.next_charge_on, from) / (7 * b.every))
  else {
    const [ay, am] = b.next_charge_on.split('-').map(Number)
    const [fy, fm] = from.split('-').map(Number)
    k = Math.max(0, Math.floor(((fy - ay) * 12 + (fm - am)) / ((b.unit === 'year' ? 12 : 1) * b.every)))
  }
  while (chargeAt(b, k) < from) k++
  return chargeAt(b, k)
}

export function chargesBetween(b: Billing, from: string, to: string): string[] {
  const out: string[] = []
  for (let d = nextCharge(b, from), k = 0; d <= to && k < 400; k++) {
    out.push(d)
    d = nextCharge(b, plusDays(d, 1))
  }
  return out
}

export const periodWord = (unit: BillingUnit, every: number): string => {
  if (every === 1) return unit === 'week' ? 'раз в неделю' : unit === 'month' ? 'раз в месяц' : 'раз в год'
  const w = unit === 'week' ? 'нед.' : unit === 'month' ? 'мес.' : 'г.'
  return `раз в ${every} ${w}`
}

export const money = (amount: number, currency: string): string => {
  const n = Number(amount)
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2)
  const sym = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency
  return `${s} ${sym}`
}
