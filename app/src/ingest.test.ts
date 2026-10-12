import { describe, expect, it } from 'vitest'
import { canAgentSetSubStatus, fromDb, isDowngrade, needsAppliedOn, route, SCHEMAS, SUB_AGENT_ALWAYS, toDb, validate, validateSchedule, validateStats } from '../../supabase/functions/ingest/rules.ts'

describe('маршруты и права', () => {
  it('операции из OpenAPI находят своё право', () => {
    expect(route('POST', '/sync-runs')?.scope).toBe('runs:write')
    expect(route('PATCH', '/sync-runs/abc')).toMatchObject({ name: 'finishRun', params: ['abc'] })
    expect(route('PUT', '/messages/gmail/18c3%2Fab')).toMatchObject({ scope: 'messages:write', params: ['gmail', '18c3/ab'] })
    expect(route('PUT', '/schedules/%D0%9F%D0%98-124')?.params).toEqual(['ПИ-124'])
    expect(route('POST', '/flashcards')?.scope).toBe('cards:write')
    expect(route('GET', '/subscriptions')?.scope).toBe('subscriptions:read')
    expect(route('PUT', '/subscriptions/icloud-200')).toMatchObject({ scope: 'subscriptions:write', name: 'putSubscription', params: ['icloud-200'] })
  })
  it('удаления и неизвестных путей нет', () => {
    expect(route('DELETE', '/vacancies/x')).toBeNull()
    expect(route('GET', '/tasks')).toBeNull()
    expect(route('PUT', '/vacancies')).toBeNull()
    expect(route('DELETE', '/subscriptions/x')).toBeNull()
    expect(route('POST', '/subscriptions')).toBeNull()
  })
})

describe('валидация тел', () => {
  const vacancy = { company: 'Компания N', title: 'Стажёр SA', status: 'applied', appliedOn: '2026-09-23' }
  it('корректная вакансия проходит', () => {
    expect(validate(vacancy, SCHEMAS.vacancyInput)).toEqual([])
  })
  it('неизвестное поле, неверный статус и дата ловятся', () => {
    const e = validate({ ...vacancy, status: 'hired', appliedOn: '2026-02-30', salary: 1 }, SCHEMAS.vacancyInput)
    expect(e.map(x => x.field).sort()).toEqual(['appliedOn', 'salary', 'status'])
  })
  it('обязательные поля и длина summary', () => {
    const e = validate({ kind: 'invite', summary: 'x'.repeat(501) }, SCHEMAS.messageInput)
    expect(e.map(x => x.field).sort()).toEqual(['receivedAt', 'summary'])
  })
  it('receivedAt требует часовой пояс', () => {
    expect(validate({ kind: 'ack', receivedAt: '2026-09-25T10:04:00', summary: 's' }, SCHEMAS.messageInput)).toHaveLength(1)
    expect(validate({ kind: 'ack', receivedAt: '2026-09-25T10:04:00+03:00', summary: 's' }, SCHEMAS.messageInput)).toHaveLength(0)
  })
  it('PATCH: частичный, но не пустой', () => {
    expect(validate({ status: 'interview' }, SCHEMAS.vacancyPatch, { partial: true })).toEqual([])
    expect(validate({}, SCHEMAS.vacancyPatch, { partial: true })).toHaveLength(1)
  })
  it('время дела ЧЧ:ММ', () => {
    expect(validate({ title: 't', dueDate: '2026-10-26', kind: 'money', dueTime: '25:00' }, SCHEMAS.taskInput)).toHaveLength(1)
  })
  it('stats и расписание', () => {
    expect(validateStats({ a: 1, b: -1 })).toEqual([{ field: 'stats.b', message: 'неотрицательное целое' }])
    const cells = ['', '', '', '', '', '', '']
    const ok = { sourceHash: 'abcdef123', capturedAt: '2026-09-08T09:29:13.535Z', times: Array(7).fill(['08:30', '10:00']), days: [{ name: 'Понедельник', n: cells, z: cells }] }
    expect(validateSchedule(ok)).toEqual([])
    expect(validateSchedule({ ...ok, times: [['8:30', '10:00']] }).map(e => e.field)).toEqual(['times'])
  })
})

describe('правило статусов', () => {
  it('агент не понижает этап', () => {
    expect(isDowngrade('interview', 'applied')).toBe(true)
    expect(isDowngrade('applied', 'interview')).toBe(false)
  })
  it('отказ и резерв с любого этапа', () => {
    expect(isDowngrade('interview', 'reject')).toBe(false)
    expect(isDowngrade('test', 'reserve')).toBe(false)
  })
  it('дата подачи нужна всем, кроме found и skip', () => {
    expect(needsAppliedOn('found')).toBe(false)
    expect(needsAppliedOn('reserve')).toBe(true)
  })
})

describe('перевод полей', () => {
  it('camelCase в snake_case и обратно, owner_id не отдаётся', () => {
    expect(toDb({ appliedOn: '2026-09-23', company: 'X' }, ['company'])).toEqual({ applied_on: '2026-09-23' })
    expect(fromDb({ owner_id: 'u', next_step: 'n', is_done: false })).toEqual({ nextStep: 'n', isDone: false })
  })
})

describe('подписки', () => {
  const sub = { name: 'iCloud+ 200 ГБ', amount: 299, nextChargeOn: '2026-10-26' }
  it('минимальное тело проходит, остальное берётся по умолчанию из базы', () => {
    expect(validate(sub, SCHEMAS.subscriptionInput)).toEqual([])
    expect(validate({ ...sub, currency: 'RUB', unit: 'month', every: 1, status: 'trial', category: 'cloud', remindDays: 3, url: 'https://apple.com' }, SCHEMAS.subscriptionInput)).toEqual([])
  })
  it('сумма, валюта, период и категория проверяются', () => {
    const e = validate({ ...sub, amount: -5, currency: 'руб', unit: 'day', every: 0, category: 'food', status: 'x', remindDays: 30 }, SCHEMAS.subscriptionInput)
    expect(e.map(x => x.field).sort()).toEqual(['amount', 'category', 'currency', 'every', 'remindDays', 'status', 'unit'])
  })
  it('число не принимает строку, целое не принимает дробь', () => {
    expect(validate({ ...sub, amount: '299' }, SCHEMAS.subscriptionInput).map(x => x.field)).toEqual(['amount'])
    expect(validate({ ...sub, every: 1.5 }, SCHEMAS.subscriptionInput).map(x => x.field)).toEqual(['every'])
  })
  it('обязательные поля и неизвестные ключи', () => {
    expect(validate({ amount: 1 }, SCHEMAS.subscriptionInput).map(x => x.field).sort()).toEqual(['name', 'nextChargeOn'])
    expect(validate({ ...sub, card: '4276' }, SCHEMAS.subscriptionInput).map(x => x.field)).toEqual(['card'])
  })
  it('решения Германа агент не отменяет', () => {
    expect(canAgentSetSubStatus('active', 'cancelled')).toBe(true)
    expect(canAgentSetSubStatus('trial', 'active')).toBe(true)
    expect(canAgentSetSubStatus('cancelled', 'active')).toBe(false)
    expect(canAgentSetSubStatus('paused', 'active')).toBe(false)
    expect(canAgentSetSubStatus('paused', 'cancelled')).toBe(true)
    expect(canAgentSetSubStatus('cancelled', 'cancelled')).toBe(true)
  })
  it('поля, которые агент меняет всегда, переводятся в колонки', () => {
    expect(SUB_AGENT_ALWAYS.flatMap(k => Object.keys(toDb({ [k]: 1 })))).toEqual(['amount', 'currency', 'next_charge_on', 'status'])
    expect(toDb({ nextChargeOn: '2026-10-26', remindDays: 2 })).toEqual({ next_charge_on: '2026-10-26', remind_days: 2 })
  })
})
