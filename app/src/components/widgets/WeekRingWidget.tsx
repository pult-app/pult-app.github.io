import { type CSSProperties } from 'react'
import { addDays, fmtDate, today } from '../../lib/dates'
import { insights, WEEK_GOAL } from '../../lib/insights'
import { useCountUp } from '../../lib/motion'
import type { PultData } from '../../lib/types'
import type { Go } from '../../App'

// «Цель недели»: кольцо и семь столбиков по дням. Столбики заполняют высоту
// карточки, поэтому пустоты внизу не остаётся.

const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

interface Props {
  data: PultData
  goto: Go
}

export function WeekRingWidget({ data, goto }: Props) {
  const t = today()
  const x = insights(data, t)
  const r = 40, c = 2 * Math.PI * r

  // Отклики по дням. Показываем неделю с данными, а не текущую:
  // если на этой неделе откликов нет, все столбики вырождаются в точки.
  const byDay = new Map<string, number>()
  for (const v of data.vacancies) {
    if (!v.applied_on || v.status === 'skip') continue
    byDay.set(v.applied_on, (byDay.get(v.applied_on) ?? 0) + 1)
  }
  const dow = (new Date(t + 'T12:00:00Z').getUTCDay() + 6) % 7
  const thisMonday = addDays(t, -dow)

  /** Понедельник недели, в которую попадает дата. */
  const mondayOf = (d: string) => {
    const k = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7
    return addDays(d, -k)
  }
  /** Семь дат от понедельника. */
  const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  // Неделя для показа. Приоритет:
  // 1) текущая, если в ней есть отклики;
  // 2) иначе самая активная неделя за всё время - она даёт полную картину,
  //    а «последняя с одним откликом» читается как пустая.
  const weekScore = (monday: string) => weekDays(monday).reduce((a, d) => a + (byDay.get(d) ?? 0), 0)
  const mondays = [...new Set([...byDay.keys()].filter(d => d <= t).map(mondayOf))]
  const bestMonday = mondays.length
    ? mondays.reduce((best, m) => (weekScore(m) > weekScore(best) ? m : best), mondays[0])
    : thisMonday
  const weekMonday = weekScore(thisMonday) > 0 ? thisMonday : bestMonday
  const days = weekDays(weekMonday).map((day, i) => ({
    day,
    n: byDay.get(day) ?? 0,
    future: day > t,
    label: WD[i]
  }))
  const maxDay = Math.max(1, ...days.map(d => d.n))
  const isCurrentWeek = weekMonday === thisMonday
  // Кольцо считает ту же неделю, что и столбики: числа обязаны совпадать
  const weekSum = days.reduce((a, d) => a + d.n, 0)
  const shown = useCountUp(weekSum)
  const p = Math.min(1, weekSum / WEEK_GOAL)
  const left = Math.max(0, WEEK_GOAL - weekSum)
  // Сравнение с предыдущей неделей
  const prevSum = weekScore(addDays(weekMonday, -7))
  const delta = weekSum - prevSum

  return (
    <button type="button" className="week" onClick={() => goto('insights')}>
      <div className="week-top">
        <div className="widget-ring">
          <svg viewBox="0 0 96 96" aria-hidden>
            <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeOpacity=".13" strokeWidth="9" />
            <circle className="ring-arc" cx="48" cy="48" r={r} fill="none" stroke="var(--amber)" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 48 48)" />
          </svg>
          <div className="week-figure">
            <b>{shown}<i>/{WEEK_GOAL}</i></b>
            <span>{isCurrentWeek ? 'откликов за неделю' : fmtDate(weekMonday) + ' - ' + fmtDate(addDays(weekMonday, 6))}</span>
          </div>
        </div>
        <div className={'week-delta' + (delta > 0 ? ' up' : delta < 0 ? ' down' : '')}>
          {delta === 0 ? 'как на прошлой' : (delta > 0 ? '+' : '') + delta + ' к прошлой'}
        </div>
      </div>

      <div className="week-days">
        {days.map((d, i) => (
          <span
            className={'wd-col' + (d.day === t ? ' today' : '') + (d.future ? ' future' : '') + (d.n > 0 ? ' has' : '')}
            key={d.day}
            title={d.n ? d.n + ' откликов' : 'нет откликов'}
          >
            <i style={{
              /* Нулевой день оставляет видимую базу, чтобы столбик не исчезал */
              height: d.n ? Math.max(14, (d.n / maxDay) * 100) + '%' : '14%',
              '--i': i
            } as CSSProperties} />
            <em>{d.label}</em>
          </span>
        ))}
      </div>

      <div className="week-foot">
        <span>осталось <b>{left}</b></span>
        <span className="week-go">Цифры</span>
      </div>

      {/* Полоса прогресса к цели: заполняет низ и показывает долю одной линией */}
      <div className="week-bar" aria-hidden>
        <i style={{ width: Math.min(100, (x.week / WEEK_GOAL) * 100) + '%' }} />
      </div>
    </button>
  )
}
