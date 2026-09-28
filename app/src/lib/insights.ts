import { addDays, days } from './dates'
import { LIVE_KINDS } from './domain'
import type { Message, PultData, Vacancy } from './types'

// Цифры для страницы «Ещё»: темп подачи, воронка, чем отвечают, каналы, скорость ответа.

export const WEEK_GOAL = 20

export function channelOf(v: Vacancy): string {
  const c = (v.channel ?? '').toLowerCase()
  if (c.includes('hh')) return 'hh.ru'
  if (c.includes('changellenge') || c.includes('mars-careers')) return 'Changellenge'
  if (c.includes('хабр') || c.includes('habr')) return 'Хабр Карьера'
  if (c.includes('fut')) return 'FutureToday'
  return 'Сайты компаний'
}

export type Outcome = 'live' | 'reject' | 'ack' | 'silent'

/** Один итог на отклик: отказ важнее живого ответа, живой ответ важнее автоответа. */
export function outcomeOf(v: Vacancy, ms: Message[]): Outcome {
  if (v.status === 'reject' || (!['test', 'interview', 'offer'].includes(v.status) && ms.some(m => m.kind === 'reject'))) return 'reject'
  if (['test', 'interview', 'offer'].includes(v.status) || ms.some(m => m.kind !== 'reject' && LIVE_KINDS.has(m.kind))) return 'live'
  if (ms.some(m => m.kind === 'ack')) return 'ack'
  return 'silent'
}

export function insights(d: Pick<PultData, 'vacancies' | 'messages'>, t: string) {
  const applied = d.vacancies.filter(v => v.applied_on && v.status !== 'skip')
  const byVac = new Map<string, Message[]>()
  for (const m of d.messages) if (m.vacancy_id) byVac.set(m.vacancy_id, [...(byVac.get(m.vacancy_id) ?? []), m])
  const msgs = (v: Vacancy) => (byVac.get(v.id) ?? []).slice().sort((a, b) => a.received_at.localeCompare(b.received_at))
  const onDay = (day: string) => applied.filter(v => v.applied_on === day).length
  const ago = (v: Vacancy) => days(v.applied_on!, t)

  const perDay = Array.from({ length: 14 }, (_, i) => { const day = addDays(t, i - 13); return { day, n: onDay(day) } })
  const week = applied.filter(v => ago(v) >= 0 && ago(v) <= 6).length
  const prevWeek = applied.filter(v => ago(v) >= 7 && ago(v) <= 13).length

  let streak = 0
  let cur = onDay(t) ? t : addDays(t, -1)
  while (onDay(cur)) { streak++; cur = addDays(cur, -1) }

  const outcomes: Record<Outcome, number> = { live: 0, reject: 0, ack: 0, silent: 0 }
  for (const v of applied) outcomes[outcomeOf(v, msgs(v))]++
  const replied = outcomes.live + outcomes.reject
  const selected = applied.filter(v => ['test', 'interview', 'offer'].includes(v.status)).length
  const offers = applied.filter(v => v.status === 'offer').length

  const ch = new Map<string, { n: number; replied: number }>()
  for (const v of applied) {
    const c = channelOf(v); const x = ch.get(c) ?? { n: 0, replied: 0 }
    x.n++; if (['live', 'reject'].includes(outcomeOf(v, msgs(v)))) x.replied++
    ch.set(c, x)
  }
  const channels = [...ch.entries()].map(([name, x]) => ({ name, ...x })).sort((a, b) => b.n - a.n)

  const speed = applied.map(v => {
    const f = msgs(v).find(m => m.kind !== 'ack' && m.kind !== 'info')
    return f ? { v, d: Math.max(0, days(v.applied_on!, f.received_at.slice(0, 10))), kind: f.kind } : null
  }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => a.d - b.d)
  const median = speed.length ? speed[Math.floor((speed.length - 1) / 2)].d : null

  return { total: applied.length, perDay, week, prevWeek, streak, outcomes, replied, selected, offers, channels, speed, median }
}
