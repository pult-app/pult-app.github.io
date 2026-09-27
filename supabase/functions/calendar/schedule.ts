// Правила недель как в ЛАД (ADR-004):
// - числитель: учебная неделя, в которую попадает 1 сентября;
// - номер недели считается от понедельника этой недели, первая неделя = 1;
// - пара активна, если неделя в диапазоне «(с X по Y нед)», «(с X нед)», «(по Y нед)».

export interface ScheduleDay { name: string; n: string[]; z: string[] }
export interface SchedulePayload { times: [string, string][]; days: ScheduleDay[] }

export interface Lesson {
  room: string; type: string; teacher: string; subject: string; range: string; active: boolean
}
export interface Slot { index: number; time: [string, string]; lessons: Lesson[] }
export interface WeekInfo { num: number; numerator: boolean }

const DAY_NAMES = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
export const LESSON_TYPES: Record<string, string> = { 'лк': 'лекция', 'лб': 'лаба', 'пр': 'практика' }

function mondayOf(dt: Date): Date {
  const x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
  const day = x.getDay() || 7
  x.setDate(x.getDate() - day + 1)
  return x
}

const dayStamp = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())

export function weekInfo(dt: Date): WeekInfo {
  // Учебный год начинается с понедельника недели, в которую попадает 1 сентября.
  // Поэтому, например, понедельник 31.08.2026 уже относится к 2026/27 учебному году.
  const thisYearStart = mondayOf(new Date(dt.getFullYear(), 8, 1))
  const start = dayStamp(dt) >= dayStamp(thisYearStart) ? thisYearStart : mondayOf(new Date(dt.getFullYear() - 1, 8, 1))
  const delta = Math.round((dayStamp(mondayOf(dt)) - dayStamp(start)) / 6048e5)
  return { num: delta + 1, numerator: delta % 2 === 0 }
}

export function parseCell(raw: string, week: number): Lesson[] {
  return String(raw || '').split('\n').map(s => s.trim()).filter(Boolean).map(s => {
    let from: number | null = null
    let to: number | null = null
    const r = s.match(/\((?:с\s*(\d+))?\s*(?:по\s*(\d+))?\s*нед\)/i)
    if (r) { from = r[1] ? +r[1] : null; to = r[2] ? +r[2] : null }
    const clean = s.replace(/\s*\([^)]*нед\)/i, '')
    const parts = clean.split(',').map(x => x.trim())
    let room = '', type = '', teacher = '', subject = clean
    if (parts.length >= 4) { room = parts[0]; type = parts[1]; teacher = parts[2]; subject = parts.slice(3).join(', ') }
    else if (parts.length === 2) { room = parts[0]; subject = parts[1] }
    const active = (from === null || week >= from) && (to === null || week <= to)
    return { room, type, teacher, subject, active, range: r ? r[0].replace(/[()]/g, '') : '' }
  })
}

/** Активные пары на дату. */
export function lessonsFor(payload: SchedulePayload, dt: Date): { week: WeekInfo; slots: Slot[] } {
  const week = weekInfo(dt)
  const day = payload.days.find(d => d.name === DAY_NAMES[dt.getDay()])
  if (!day) return { week, slots: [] }
  const cells = week.numerator ? day.n : day.z
  const slots: Slot[] = []
  cells.forEach((raw, i) => {
    const lessons = parseCell(raw, week.num).filter(l => l.active)
    if (lessons.length) slots.push({ index: i, time: payload.times[i] ?? ['', ''], lessons })
  })
  return { week, slots }
}

/** Ближайший учебный день после dt (до 7 дней вперёд). */
export function nextStudyDay(payload: SchedulePayload, dt: Date): { date: Date; first: string } | null {
  const d = new Date(dt)
  for (let k = 1; k <= 7; k++) {
    d.setDate(d.getDate() + 1)
    const r = lessonsFor(payload, d)
    if (r.slots.length) return { date: new Date(d), first: r.slots[0].time[0] }
  }
  return null
}
