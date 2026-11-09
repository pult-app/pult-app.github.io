import { type CSSProperties } from 'react'
import { today } from '../../lib/dates'
import { insights } from '../../lib/insights'
import { useCountUp } from '../../lib/motion'
import type { FunnelTab } from '../../lib/domain'
import type { PultData } from '../../lib/types'
import type { Go } from '../../App'

// «Воронка»: четыре ступени поиска с конверсией между ними.

interface Step {
  id: string
  label: string
  ftab: FunnelTab
  hint: string
}

const STEPS: Step[] = [
  { id: 'applied', label: 'Подано', ftab: 'todo', hint: 'все отклики' },
  { id: 'reply', label: 'Ответили', ftab: 'wait', hint: 'живой ответ или отказ' },
  { id: 'select', label: 'Отбор', ftab: 'sel', hint: 'тест или собеседование' },
  { id: 'offer', label: 'Оффер', ftab: 'sel', hint: 'предложение работы' },
]

const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0)

export function FunnelWidget({ data, goto }: { data: PultData; goto: Go }) {
  const t = today()
  const x = insights(data, t)
  const total = Math.max(1, x.total)

  // Хуки по одному на ступень: в цикле их вызывать нельзя.
  const n0 = useCountUp(x.total, 640)
  const n1 = useCountUp(x.replied, 720)
  const n2 = useCountUp(x.selected, 800)
  const n3 = useCountUp(x.offers, 880)
  const shown = [n0, n1, n2, n3]
  const raw = [x.total, x.replied, x.selected, x.offers]

  return (
    <div className="funnel-steps">
      <div className="chart-readout">
        <b>{n0}</b>
        <span>откликов подано</span>
        <em>{pct(x.replied, x.total)}% ответили</em>
      </div>

      {STEPS.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className="fs-row"
          onClick={() => goto('funnel', { ftab: s.ftab })}
          title={s.hint}
        >
          <span className="fs-top">
            <span className="fs-label">{s.label}</span>
            <span className="fs-val">
              <b>{shown[i]}</b>
              <em>{pct(raw[i], x.total)}%</em>
              {i > 0 && <i className="fs-conv">↓ {pct(raw[i], raw[i - 1])}%</i>}
            </span>
          </span>
          <span className="fs-track">
            {/* Нулевая ступень оставляет видимую базу: иначе строка читается
                как незагрузившийся график, а не как честный ноль */}
            <i style={{
              width: raw[i] ? (raw[i] / total) * 100 + '%' : '4px',
              '--i': i
            } as CSSProperties} />
          </span>
        </button>
      ))}
    </div>
  )
}
