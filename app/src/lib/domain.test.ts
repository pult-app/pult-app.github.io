import { describe, expect, it } from 'vitest'
import { addDays, days, today } from './dates'
import { agenda, followUps, funnelTab, grade, groupWorks, nextStep, stageOf, staleCount, statusPatch, waitGroup } from './domain'
import { lessonsFor, nextStudyDay, parseCell, weekInfo, type SchedulePayload } from './schedule'
import type { PultData, StudyWork, Subscription, Vacancy } from './types'

const d = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd) }

describe('недели по правилам ЛАД', () => {
  it('неделя с 1 сентября 2026 первая и числитель', () => {
    expect(weekInfo(d('2026-09-01'))).toEqual({ num: 1, numerator: true })
    expect(weekInfo(d('2026-08-31'))).toEqual({ num: 1, numerator: true })
  })
  it('26.09.2026 это 4-я неделя, знаменатель; 28.09 это 5-я, числитель', () => {
    expect(weekInfo(d('2026-09-26'))).toEqual({ num: 4, numerator: false })
    expect(weekInfo(d('2026-09-28'))).toEqual({ num: 5, numerator: true })
  })
  it('январь относится к учебному году, начатому в сентябре', () => {
    expect(weekInfo(d('2027-01-11')).num).toBe(20)
  })
})

describe('разбор ячейки расписания', () => {
  it('диапазон «с X по Y нед»', () => {
    const raw = '111-3, лб, Иванов И.И., Базы данных (с 9 по 15 нед)'
    expect(parseCell(raw, 8)[0].active).toBe(false)
    expect(parseCell(raw, 9)[0]).toMatchObject({ room: '111-3', type: 'лб', teacher: 'Иванов И.И.', subject: 'Базы данных', active: true })
    expect(parseCell(raw, 16)[0].active).toBe(false)
  })
  it('«с X нед» и «по Y нед»', () => {
    expect(parseCell('1, лк, П., Предмет (с 10 нед)', 9)[0].active).toBe(false)
    expect(parseCell('1, лк, П., Предмет (по 3 нед)', 4)[0].active).toBe(false)
  })
  it('подгруппы через перевод строки', () => {
    expect(parseCell('1, лб, А., X\n2, лб, Б., Y', 5)).toHaveLength(2)
  })
})

describe('пары на день', () => {
  const empty = ['', '', '', '', '', '', '']
  const payload: SchedulePayload = {
    times: [['08:30', '10:00'], ['10:20', '11:50'], ['12:10', '13:40'], ['14:00', '15:30'], ['15:50', '17:20'], ['17:40', '19:10'], ['19:20', '20:50']],
    days: [{ name: 'Понедельник', n: ['', '', '118-3, лк, У., Архитектура', '', '', '', ''], z: empty }],
  }
  it('числитель в понедельник 28.09', () => {
    const r = lessonsFor(payload, d('2026-09-28'))
    expect(r.slots).toHaveLength(1)
    expect(r.slots[0].time[0]).toBe('12:10')
  })
  it('знаменатель в понедельник 21.09 пустой, ближайший день 28.09', () => {
    expect(lessonsFor(payload, d('2026-09-21')).slots).toHaveLength(0)
    expect(nextStudyDay(payload, d('2026-09-21'))?.date.getDate()).toBe(28)
  })
})

describe('даты', () => {
  it('addDays и days', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05')
    expect(days('2026-09-23', '2026-09-30')).toBe(7)
  })
  it('today по Москве', () => {
    expect(today(new Date('2026-09-27T22:30:00Z'))).toBe('2026-09-28')
  })
})

const vacancy = (p: Partial<Vacancy>): Vacancy => ({
  id: 'v1', company_id: 'c1', external_ref: 'x', title: 'SA', status: 'applied', work_format: null, channel: null, url: null,
  applied_on: '2026-09-20', deadline: null, followed_up_on: null, next_step: null, prep: null, notes: null,
  updated_at: '', company: { name: 'Компания N' }, ...p,
})
const data = (p: Partial<PultData>): PultData => ({ vacancies: [], messages: [], works: [], tasks: [], cards: [], schedule: null, lastRun: null, requests: [], subscriptions: [], moneyReady: true, loadedAt: '', ...p })

describe('напомнить о себе', () => {
  it('7+ дней без ответа попадает, свежий отклик нет', () => {
    const r = followUps(data({ vacancies: [vacancy({}), vacancy({ id: 'v2', applied_on: '2026-09-25' })] }), '2026-09-27')
    expect(r.map(v => v.id)).toEqual(['v1'])
  })
  it('живой ответ или недавнее напоминание убирают из списка', () => {
    const msg = { id: 'm', vacancy_id: 'v1', source: 'gmail', kind: 'invite' as const, received_at: '', sender: null, subject: null, summary: 's', action: null, deadline: null, is_done: false, company: null }
    expect(followUps(data({ vacancies: [vacancy({})], messages: [msg] }), '2026-09-27')).toHaveLength(0)
    expect(followUps(data({ vacancies: [vacancy({ followed_up_on: '2026-09-26' })] }), '2026-09-27')).toHaveLength(0)
  })
})

describe('повестка', () => {
  it('сортирует дела по дате и времени, выполненные не показывает', () => {
    const r = agenda(data({ tasks: [
      { id: 'a', title: 'поздно', due_date: '2026-09-28', due_time: '18:00:00', kind: 'life', is_done: false, notes: null },
      { id: 'b', title: 'рано', due_date: '2026-09-28', due_time: '09:00:00', kind: 'life', is_done: false, notes: null },
      { id: 'c', title: 'сделано', due_date: '2026-09-27', due_time: null, kind: 'life', is_done: true, notes: null },
    ] }), '2026-09-27')
    expect(r.map(x => x.title)).toEqual(['рано', 'поздно'])
  })
})

describe('тренажёр', () => {
  it('«знаю» двигает по коробкам, «не знаю» сбрасывает на завтра', () => {
    expect(grade(0, true, '2026-09-27')).toEqual({ box: 1, due_on: '2026-09-28' })
    expect(grade(3, true, '2026-09-27')).toEqual({ box: 4, due_on: '2026-10-11' })
    expect(grade(4, true, '2026-09-27').box).toBe(4)
    expect(grade(3, false, '2026-09-27')).toEqual({ box: 0, due_on: '2026-09-28' })
  })
})

describe('смена статуса', () => {
  it('из «найдена» в «тест» ставит дату подачи, если её нет', () => {
    expect(statusPatch(vacancy({ status: 'found', applied_on: null }), 'test', '2026-09-27')).toMatchObject({ status: 'test', applied_on: '2026-09-27' })
    expect(statusPatch(vacancy({}), 'interview', '2026-09-27')).not.toHaveProperty('applied_on')
  })
})

import { vacancyState, daysWord } from './domain'
describe('понятное состояние вакансии', () => {
  it('склонение дней', () => {
    expect([1, 2, 5, 11, 21, 22].map(daysWord)).toEqual(['1 день', '2 дня', '5 дней', '11 дней', '21 день', '22 дня'])
  })
  it('ждём ответа и пора напомнить', () => {
    expect(vacancyState(vacancy({ applied_on: '2026-09-25' }), [], '2026-09-27')).toMatchObject({ label: 'Ждём ответа · 2 дня', group: 'wait' })
    expect(vacancyState(vacancy({ applied_on: '2026-09-18' }), [], '2026-09-27')).toMatchObject({ label: 'Без ответа 9 дней', group: 'action' })
  })
  it('открытое письмо с действием важнее статуса', () => {
    const m = { id: 'm', vacancy_id: 'v1', source: 'gmail', kind: 'question' as const, received_at: '', sender: null, subject: null, summary: 's', action: 'Дать согласие', deadline: null, is_done: false, company: null }
    expect(vacancyState(vacancy({}), [m], '2026-09-27')).toMatchObject({ label: 'Нужен ответ', hint: 'Дать согласие', group: 'action' })
  })
  it('отказ закрыт', () => {
    expect(vacancyState(vacancy({ status: 'reject' }), [], '2026-09-27').group).toBe('closed')
  })
})

describe('дизайн v4: вкладки и этапы воронки', () => {
  const t = '2026-09-28'
  it('статус раскладывается по вкладкам', () => {
    expect(funnelTab(vacancy({ status: 'interview' }))).toBe('sel')
    expect(funnelTab(vacancy({ status: 'reserve' }))).toBe('wait')
    expect(funnelTab(vacancy({ status: 'found' }))).toBe('todo')
    expect(funnelTab(vacancy({ status: 'skip' }))).toBe('closed')
  })
  it('текущий этап: ждём ответа 1, ответили 2, собес 2, оффер 3', () => {
    const v = vacancy({ id: 'v1', status: 'applied', applied_on: '2026-09-27' })
    expect(stageOf(v, [])).toBe(1)
    expect(stageOf(v, [{ vacancy_id: 'v1', kind: 'ack' } as never])).toBe(2)
    expect(stageOf(v, [{ vacancy_id: 'v1', kind: 'reject' } as never])).toBe(1)
    expect(stageOf(vacancy({ status: 'interview' }), [])).toBe(2)
    expect(stageOf(vacancy({ status: 'offer' }), [])).toBe(3)
    expect(stageOf(vacancy({ status: 'found' }), [])).toBe(0)
  })
  it('следующий шаг: оффер важнее собеседования, без дел пусто', () => {
    const a = vacancy({ id: 'a', status: 'interview', applied_on: '2026-09-20' })
    const b = vacancy({ id: 'b', status: 'offer', applied_on: '2026-09-20' })
    expect(nextStep({ vacancies: [a, b], messages: [] }, t)?.v.id).toBe('b')
    expect(nextStep({ vacancies: [vacancy({ status: 'applied', applied_on: t })], messages: [] }, t)).toBeNull()
  })
})

describe('экран «Сегодня»: что в повестке, а что сводной строкой', () => {
  const t = '2026-10-12'
  const sub: Subscription = {
    id: 's1', external_id: null, name: 'iCloud+', amount: 299, currency: 'RUB', status: 'active', category: 'cloud', method: null, url: null,
    notes: null, remind_days: 1, updated_by: 'owner', next_charge_on: '2026-10-14', unit: 'month', every: 1,
  }
  it('отклики без ответа не попадают в повестку, их считает staleCount', () => {
    const d = data({ vacancies: [vacancy({}), vacancy({ id: 'v2' })] })
    expect(agenda(d, t)).toHaveLength(0)
    expect(staleCount(d, t)).toBe(2)
  })
  it('списание подписки идёт в повестку с переходом на «Деньги»', () => {
    const r = agenda(data({ subscriptions: [sub, { ...sub, id: 's2', status: 'paused' }] }), t)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ date: '2026-10-14', kind: 'money', goto: 'money', ref: 's1' })
    expect(r[0].title.replace(/\s/g, ' ')).toBe('Списание: iCloud+, 299 ₽')
  })
  it('дело «Продление iCloud+» в день списания не дублирует строку подписки', () => {
    const task = { id: 'k', title: 'Продление iCloud+ 200 ГБ (Apple)', due_date: '2026-10-14', due_time: null, kind: 'money' as const, is_done: false, notes: null }
    const r = agenda(data({ tasks: [task, { ...task, id: 'k2', due_date: '2026-10-20' }, { ...task, id: 'k3', kind: 'life' as const }], subscriptions: [sub] }), t)
    expect(r.map(x => x.taskId ?? x.ref)).toEqual(['k3', 's1', 'k2'])
  })
  it('внутри «Ждём»: пора напомнить, ждём ответа, резерв', () => {
    expect(waitGroup(vacancy({ applied_on: '2026-09-20' }), [], t)).toBe('stale')
    expect(waitGroup(vacancy({ applied_on: '2026-10-10' }), [], t)).toBe('fresh')
    expect(waitGroup(vacancy({ status: 'reserve' }), [], t)).toBe('reserve')
    expect(waitGroup(vacancy({ applied_on: '2026-09-20', followed_up_on: '2026-10-10' }), [], t)).toBe('fresh')
  })
})

describe('учёба: группы по срочности', () => {
  const t = '2026-10-12'
  const work = (p: Partial<StudyWork>): StudyWork => ({ id: 'w', code: 'w', title: 'ЛР', status: 'todo', deadline: null, notes: null, local_path: null, updated_at: '2026-10-01', discipline: { name: 'Предмет', teacher: null }, ...p })
  it('срочно: просрочено и до 3 дней; сданные отдельно; остальное в работе', () => {
    const g = groupWorks([
      work({ id: 'a', deadline: '2026-10-10' }), work({ id: 'b', deadline: '2026-10-15' }), work({ id: 'c', deadline: '2026-10-16' }),
      work({ id: 'd', status: 'doing' }), work({ id: 'e', status: 'submitted', deadline: '2026-10-01' }),
    ], t)
    expect(g.urgent.map(x => x.id)).toEqual(['a', 'b'])
    expect(g.work.map(x => x.id)).toEqual(['d', 'c'])
    expect(g.done.map(x => x.id)).toEqual(['e'])
  })
})
