import { today } from '../../lib/dates'
import { insights, type Outcome } from '../../lib/insights'
import { useCountUp } from '../../lib/motion'
import type { PultData } from '../../lib/types'

// «Чем отвечают»: кольцо исходов и полосы-доли под ним.

const ORDER: Outcome[] = ['live', 'reject', 'ack', 'silent']
const LABEL: Record<Outcome, string> = { live: 'Живой ответ', reject: 'Отказ', ack: 'Автоответ', silent: 'Тишина' }
const TONE: Record<Outcome, string> = {
  live: 'var(--tone-ok)',
  reject: 'var(--tone-hot)',
  // Автоответ и тишина - фиолетовые: это «нейтральная масса», а не сигнал,
  // но на тёмном фиолетовый читается лучше серого и держит палитру
  ack: 'color-mix(in srgb, var(--violet) 62%, var(--tone-warn))',
  silent: 'color-mix(in srgb, var(--violet) 34%, transparent)',
}

const R = 42
const C = 2 * Math.PI * R
const GAP = 6

export function OutcomesWidget({ data }: { data: PultData }) {
  const t = today()
  const x = insights(data, t)
  const total = Math.max(1, x.total)
  const rate = Math.round((x.replied / total) * 100)
  const rateN = useCountUp(rate, 900)

  let offset = 0
  const segments = ORDER.map(o => {
    const n = x.outcomes[o]
    const len = Math.max(0, (n / total) * C - GAP)
    const seg = { o, n, len, offset }
    offset += (n / total) * C
    return seg
  }).filter(s => s.n > 0)

  return (
    <div className="outcomes">
      <div className="donut">
        <svg viewBox="0 0 116 116" role="img" aria-label={`Ответили ${rate}% из ${x.total}`}>
          <circle cx="58" cy="58" r={R} className="donut-track" />
          {segments.map(s => (
            <circle key={s.o} cx="58" cy="58" r={R} className="donut-seg" stroke={TONE[s.o]}
              strokeDasharray={`${s.len.toFixed(1)} ${(C - s.len).toFixed(1)}`}
              strokeDashoffset={(-s.offset).toFixed(1)} />
          ))}
        </svg>
        <div className="donut-center">
          <b>{rateN}<i>%</i></b>
          <span>ответили</span>
        </div>
      </div>

      <div className="out-list">
        {ORDER.map(o => {
          const pct = Math.round((x.outcomes[o] / total) * 100)
          return (
            <div className="ol-row" key={o}>
              <span className="ol-name"><i style={{ background: TONE[o] }} />{LABEL[o]}</span>
              <span className="ol-track"><i style={{ width: Math.max(2, pct) + '%', background: TONE[o] }} /></span>
              <b className="ol-num">{x.outcomes[o]}</b>
            </div>
          )
        })}
      </div>
    </div>
  )
}
