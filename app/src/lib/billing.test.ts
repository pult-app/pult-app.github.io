import { describe, expect, it } from 'vitest'
import * as edge from '../../../supabase/functions/calendar/billing'
import {
  addMonths, chargeAt, chargesBetween, dayStrip, fmtMoney, fmtTotals, groupSubs, guessCategory, inLabel, nextCharge, periodLabel, perMonth, summarize, upcoming,
  type Subscription,
} from './billing'

const b = (next_charge_on: string, unit: 'week' | 'month' | 'year' = 'month', every = 1) => ({ next_charge_on, unit, every })
const sub = (p: Partial<Subscription>): Subscription => ({
  id: 's1', external_id: null, name: 'Сервис', amount: 299, currency: 'RUB', status: 'active', category: 'other', method: null, url: null,
  notes: null, remind_days: 1, updated_by: 'owner', next_charge_on: '2026-10-26', unit: 'month', every: 1, ...p,
})
const flat = (s: string) => s.replace(/\s/g, ' ')

describe('addMonths: конец месяца не уезжает', () => {
  it('31 января + 1 месяц = 28 февраля, +2 = 31 марта', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
  })
  it('високосный год и переход через год', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-03-15', -4)).toBe('2025-11-15')
  })
})

describe('nextCharge', () => {
  it('якорь в будущем или сегодня возвращается как есть', () => {
    expect(nextCharge(b('2026-10-26'), '2026-10-12')).toBe('2026-10-26')
    expect(nextCharge(b('2026-10-12'), '2026-10-12')).toBe('2026-10-12')
  })
  it('ежемесячно от 31 января: 28 февраля, 31 марта, 30 апреля', () => {
    expect(nextCharge(b('2026-01-31'), '2026-02-01')).toBe('2026-02-28')
    expect(nextCharge(b('2026-01-31'), '2026-03-01')).toBe('2026-03-31')
    expect(nextCharge(b('2026-01-31'), '2026-03-31')).toBe('2026-03-31')
    expect(nextCharge(b('2026-01-31'), '2026-04-01')).toBe('2026-04-30')
  })
  it('прошедшая дата прокручивается до ближайшей будущей', () => {
    expect(nextCharge(b('2026-05-05'), '2026-10-12')).toBe('2026-11-05')
    expect(nextCharge(b('2026-05-20'), '2026-10-12')).toBe('2026-10-20')
  })
  it('раз в 3 месяца и раз в полгода', () => {
    expect(nextCharge(b('2026-01-15', 'month', 3), '2026-10-12')).toBe('2026-10-15')
    expect(nextCharge(b('2026-01-15', 'month', 3), '2026-10-16')).toBe('2027-01-15')
    expect(nextCharge(b('2026-01-10', 'month', 6), '2026-10-12')).toBe('2027-01-10')
  })
  it('ежегодно, в том числе от 29 февраля', () => {
    expect(nextCharge(b('2025-02-28', 'year'), '2026-10-12')).toBe('2027-02-28')
    expect(nextCharge(b('2024-02-29', 'year'), '2026-10-12')).toBe('2027-02-28')
    expect(nextCharge(b('2024-02-29', 'year'), '2027-10-12')).toBe('2028-02-29')
  })
  it('раз в 2 недели', () => {
    expect(nextCharge(b('2026-10-01', 'week', 2), '2026-10-12')).toBe('2026-10-15')
    expect(nextCharge(b('2026-10-01', 'week', 2), '2026-10-15')).toBe('2026-10-15')
    expect(nextCharge(b('2026-10-01', 'week'), '2026-10-12')).toBe('2026-10-15')
  })
  it('chargeAt даёт то же, что последовательный перебор', () => {
    const x = b('2026-01-31')
    expect([0, 1, 2, 3].map(k => chargeAt(x, k))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
})

describe('chargesBetween', () => {
  it('все списания в отрезке с границами', () => {
    expect(chargesBetween(b('2026-10-31'), '2026-10-12', '2026-12-31')).toEqual(['2026-10-31', '2026-11-30', '2026-12-31'])
    expect(chargesBetween(b('2026-10-31'), '2026-11-01', '2026-11-29')).toEqual([])
  })
  it('недельные списания', () => {
    expect(chargesBetween(b('2026-10-12', 'week'), '2026-10-12', '2026-10-30')).toEqual(['2026-10-12', '2026-10-19', '2026-10-26'])
  })
})

describe('стоимость и подписи', () => {
  it('в месяц', () => {
    expect(perMonth(1200, 'year', 1)).toBe(100)
    expect(perMonth(300, 'month', 3)).toBe(100)
    expect(perMonth(100, 'week', 1)).toBeCloseTo(433.33, 2)
    expect(perMonth(299, 'month', 1)).toBe(299)
  })
  it('период словами', () => {
    expect(periodLabel('month', 1)).toBe('раз в месяц')
    expect(periodLabel('month', 3)).toBe('раз в 3 месяца')
    expect(periodLabel('month', 6)).toBe('раз в полгода')
    expect(periodLabel('month', 5)).toBe('раз в 5 месяцев')
    expect(periodLabel('week', 2)).toBe('раз в 2 недели')
    expect(periodLabel('year', 1)).toBe('раз в год')
    expect(periodLabel('year', 2)).toBe('раз в 2 года')
  })
  it('деньги и сроки', () => {
    expect(flat(fmtMoney(1290))).toBe('1 290 ₽')
    expect(flat(fmtMoney(12.5, 'USD'))).toBe('12,50 $')
    expect(flat(fmtTotals({ USD: 12, RUB: 1290 }))).toBe('1 290 ₽ + 12 $')
    expect(flat(fmtTotals({}))).toBe('0 ₽')
    expect(inLabel(0)).toBe('сегодня')
    expect(inLabel(1)).toBe('завтра')
    expect(inLabel(14)).toBe('через 14 дн.')
    expect(inLabel(90)).toBe('через 3 мес.')
  })
})

describe('сводка по подпискам', () => {
  const t = '2026-10-12'
  const list = [
    sub({ id: 'a', name: 'iCloud+', amount: 299, next_charge_on: '2026-10-26', category: 'cloud' }),
    sub({ id: 'b', name: 'Музыка', amount: 1200, unit: 'year', next_charge_on: '2027-03-01', category: 'media' }),
    sub({ id: 'c', name: 'Пробная', amount: 500, status: 'trial', next_charge_on: '2026-10-14', category: 'ai' }),
    sub({ id: 'd', name: 'На паузе', amount: 900, status: 'paused', category: 'games' }),
    sub({ id: 'e', name: 'Отменена', amount: 700, status: 'cancelled' }),
    sub({ id: 'f', name: 'Облако USD', amount: 3, currency: 'USD', next_charge_on: '2026-10-20', category: 'cloud' }),
  ]
  const s = summarize(list, t)
  it('в месяц считаются только активные, пробные и пауза нет', () => {
    expect(s.month.RUB).toBeCloseTo(299 + 100, 5)
    expect(s.month.USD).toBe(3)
    expect(s.year.RUB).toBeCloseTo((299 + 100) * 12, 5)
    expect(s.liveCount).toBe(4)
    expect(s.trialCount).toBe(1)
    expect(s.primary).toBe('RUB')
  })
  it('ближайшие 30 дней включают пробный период: он спишется, если не отменить', () => {
    expect(s.next30.RUB).toBe(299 + 500)
    expect(s.next30.USD).toBe(3)
    expect(s.nextCharge?.sub.name).toBe('Пробная')
    expect(s.nextCharge?.in).toBe(2)
  })
  it('доли по категориям в основной валюте', () => {
    expect(s.byCategory.map(x => x.category)).toEqual(['cloud', 'media'])
    expect(s.byCategory.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 5)
  })
  it('без рублёвых подписок основной становится самая частая валюта', () => {
    expect(summarize([sub({ currency: 'USD' }), sub({ id: 'x', currency: 'USD' }), sub({ id: 'y', currency: 'EUR' })], t).primary).toBe('USD')
    expect(summarize([], t).primary).toBe('RUB')
  })
  it('upcoming сортирует по дате и не берёт паузу и отмену', () => {
    expect(upcoming(list, t, 30).map(u => u.sub.name)).toEqual(['Пробная', 'Облако USD', 'iCloud+'])
  })
  it('полоса по дням', () => {
    const strip = dayStrip(list, t, 'RUB', 30)
    expect(strip).toHaveLength(30)
    expect(strip[2].items.map(x => x.sub.name)).toEqual(['Пробная'])
    expect(strip[2].total).toBe(500)
    expect(strip[8].total).toBe(0)
    expect(strip[14].total).toBe(299)
  })
  it('группы списка', () => {
    const g = groupSubs(list, t)
    expect(g.soon.map(x => x.sub.name)).toEqual(['Пробная'])
    expect(g.later.map(x => x.sub.name)).toEqual(['Облако USD', 'iCloud+', 'Музыка'])
    expect(g.paused.map(x => x.sub.name)).toEqual(['На паузе'])
    expect(g.cancelled.map(x => x.sub.name)).toEqual(['Отменена'])
  })
})

describe('копия арифметики в Edge Function календаря совпадает с приложением', () => {
  const anchors = ['2026-01-31', '2024-02-29', '2025-12-15', '2026-03-30', '2026-10-12', '2027-05-01']
  const froms = ['2026-02-01', '2026-03-01', '2026-10-12', '2026-12-31', '2027-02-28', '2028-02-29', '2029-06-15']
  const kinds = [['week', 1], ['week', 2], ['month', 1], ['month', 3], ['month', 6], ['year', 1], ['year', 2]] as const
  it('nextCharge и chargesBetween', () => {
    for (const a of anchors) for (const [unit, every] of kinds) for (const f of froms) {
      const x = { next_charge_on: a, unit, every }
      expect(edge.nextCharge(x, f), `${a} ${unit} ${every} от ${f}`).toBe(nextCharge(x, f))
      expect(edge.chargesBetween(x, f, '2028-12-31')).toEqual(chargesBetween(x, f, '2028-12-31'))
    }
  })
})

describe('категория по названию', () => {
  it('узнаёт популярные сервисы, остальное «Другое»', () => {
    expect(guessCategory('iCloud+ 200 ГБ')).toBe('cloud')
    expect(guessCategory('ChatGPT Plus')).toBe('ai')
    expect(guessCategory('Claude Pro')).toBe('ai')
    expect(guessCategory('Яндекс Плюс')).toBe('media')
    expect(guessCategory('Мобильная связь МТС')).toBe('telecom')
    expect(guessCategory('VPN на год')).toBe('software')
    expect(guessCategory('Подписка на что-то')).toBe('other')
  })
})
