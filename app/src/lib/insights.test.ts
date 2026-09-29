import { describe, expect, it } from 'vitest'
import { heat, heatLevel, insights, outcomeOf } from './insights'
import type { Message, Vacancy } from './types'

const v = (id: string, applied_on: string | null, status: Vacancy['status'] = 'applied', channel = 'hh.ru'): Vacancy => ({
  id, company_id: 'c', external_ref: id, title: 't', status, work_format: null, channel, url: null, applied_on,
  deadline: null, followed_up_on: null, next_step: null, prep: null, notes: null, updated_at: '2026-09-28', company: { name: 'C' },
})
const m = (vacancy_id: string, kind: Message['kind'], day: string): Message => ({
  id: vacancy_id + kind + day, vacancy_id, source: 'hh', kind, received_at: day + 'T10:00:00Z', sender: null, subject: null,
  summary: '', action: null, deadline: null, is_done: false, company: null,
})

describe('страница «Ещё»: цифры', () => {
  const t = '2026-09-29'
  it('серия считает дни подряд до сегодня, а если сегодня пусто, то до вчера', () => {
    const r = insights({ vacancies: [v('a', '2026-09-28'), v('b', '2026-09-27'), v('c', '2026-09-25')], messages: [] }, t)
    expect(r.streak).toBe(2)
    expect(r.week).toBe(3)
    expect(r.perDay).toHaveLength(14)
    expect(r.perDay[13]).toEqual({ day: t, n: 0 })
  })
  it('у отклика один итог: отказ, живой ответ, автоответ или тишина', () => {
    expect(outcomeOf(v('a', '2026-09-20', 'reject'), [m('a', 'invite', '2026-09-21')])).toBe('reject')
    expect(outcomeOf(v('a', '2026-09-20'), [m('a', 'ack', '2026-09-20'), m('a', 'question', '2026-09-22')])).toBe('live')
    expect(outcomeOf(v('a', '2026-09-20'), [m('a', 'ack', '2026-09-20')])).toBe('ack')
    expect(outcomeOf(v('a', '2026-09-20'), [])).toBe('silent')
  })
  it('медиана скорости первого ответа без автоответов, найденные и пропущенные не в счёт', () => {
    const r = insights({
      vacancies: [v('a', '2026-09-20'), v('b', '2026-09-20'), v('c', '2026-09-20'), v('d', null, 'found'), v('e', '2026-09-20', 'skip')],
      messages: [m('a', 'ack', '2026-09-20'), m('a', 'reject', '2026-09-24'), m('b', 'invite', '2026-09-21'), m('c', 'question', '2026-09-26')],
    }, t)
    expect(r.total).toBe(3)
    expect(r.median).toBe(4)
    expect(r.replied).toBe(3)
  })
  it('календарь: недели с понедельника, сегодня в последнем столбце, дни после сегодня пустые', () => {
    const g = heat(d => d === '2026-09-28' ? 5 : 0, t, 3)
    expect(g).toHaveLength(3)
    expect(g[0][0].day).toBe('2026-09-14')
    expect(g[2][0]).toEqual({ day: '2026-09-28', n: 5, future: false })
    expect(g[2][1]).toEqual({ day: t, n: 0, future: false })
    expect(g[2][2].future).toBe(true)
    expect([0, 1, 2, 3, 4, 6, 7, 20].map(heatLevel)).toEqual([0, 1, 2, 2, 3, 3, 4, 4])
  })
})
