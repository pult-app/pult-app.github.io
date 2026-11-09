import { type CSSProperties } from 'react'
import { today } from '../../lib/dates'
import { insights } from '../../lib/insights'
import { useCountUp } from '../../lib/motion'
import type { PultData } from '../../lib/types'

// «Скорость ответа»: сколько дней проходит до первого живого ответа.
// Показываем распределение по срокам, а не список компаний: у компаний
// один и тот же срок, и полосы выглядят одинаковыми - график кажется пустым.

const BUCKETS = [
  { id: 'fast', label: 'в тот же день', max: 0 },
  { id: 'one', label: '1 день', max: 1 },
  { id: 'week', label: '2-7 дней', max: 7 },
  { id: 'two', label: '8-14 дней', max: 14 },
  { id: 'slow', label: 'дольше', max: Infinity },
] as const

export function SpeedWidget({ data }: { data: PultData }) {
  const t = today()
  const x = insights(data, t)

  // Пустое состояние: понятная причина, не пустой блок
  if (x.median === null) {
    return (
      <div className="chart-empty small">
        <div className="ce-ring"><i /><i /><i /></div>
        <div className="ce-text">
          <b>Живых ответов пока нет</b>
          <span>медиана появится после первого ответа</span>
        </div>
      </div>
    )
  }

  const med = useCountUp(x.median, 700)
  const fastest = x.speed[0]

  // Раскладываем ответы по срокам
  const counts = BUCKETS.map(b => ({
    ...b,
    n: x.speed.filter(s => {
      if (b.id === 'fast') return s.d === 0
      if (b.id === 'one') return s.d === 1
      if (b.id === 'week') return s.d >= 2 && s.d <= 7
      if (b.id === 'two') return s.d >= 8 && s.d <= 14
      return s.d > 14
    }).length
  }))
  const maxN = Math.max(1, ...counts.map(c => c.n))
  const total = x.speed.length

  return (
    <div className="speed">
      <div className="chart-head">
        <div className="chart-figure">
          <b>{med}</b>
          <span>{med === 1 ? 'день' : med < 5 ? 'дня' : 'дней'} до первого ответа</span>
        </div>
        <div className="chart-side">
          <div className="chart-delta up">{total}</div>
          <div className="chart-delta-note">живых ответов</div>
        </div>
      </div>

      <div className="speed-bars">
        {counts.map((c, i) => (
          <div className={'sp-row' + (c.n === 0 ? ' zero' : '')} key={c.id}>
            <span className="sp-name">{c.label}</span>
            <span className="sp-track">
              <i style={{
                /* Нулевая строка тоже видна: тонкая база вместо пустого места */
                width: c.n ? Math.max(18, (c.n / maxN) * 100) + '%' : '4px',
                '--i': i
              } as CSSProperties} />
            </span>
            <b className="sp-num">{c.n}</b>
          </div>
        ))}
      </div>

      <div className="chart-foot">
        <span className="cf-item">самый быстрый <b>{fastest.d === 0 ? 'в день отклика' : fastest.d + ' дн'}</b></span>
        <span className="cf-day">медиана {x.median} дн</span>
      </div>
    </div>
  )
}
