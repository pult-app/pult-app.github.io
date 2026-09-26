// Все бизнес-даты считаются по Москве (NFR-06).
export const TZ = 'Europe/Moscow'

/** Сегодняшняя дата в Москве, ГГГГ-ММ-ДД. */
export function today(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: TZ })
}

/** Текущее время в Москве, ЧЧ:ММ. */
export function nowHM(now: Date = new Date()): string {
  return now.toLocaleTimeString('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

/** Разница в днях между датами ГГГГ-ММ-ДД (b - a). */
export function days(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
}

export function addDays(d: string, n: number): string {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** 2026-09-27 -> 27.09 */
export function fmtDate(d?: string | null): string {
  return d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '·'
}

export function leftLabel(n: number): string {
  if (n < 0) return 'просрочено'
  if (n === 0) return 'сегодня'
  if (n === 1) return 'завтра'
  return 'через ' + n + ' дн.'
}

/** Локальная (без времени) дата из ГГГГ-ММ-ДД для расчёта дня недели. */
export function toLocalDate(d: string): Date {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(y, m - 1, dd)
}
