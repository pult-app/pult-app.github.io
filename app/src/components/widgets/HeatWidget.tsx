import { useState, type CSSProperties } from 'react'
import { fmtDate, today } from '../../lib/dates'
import { daysWord } from '../../lib/domain'
import { heatLevel, insights } from '../../lib/insights'
import type { PultData } from '../../lib/types'

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export function HeatWidget({ data }: { data: PultData }) {
  const t = today()
  const x = insights(data, t)
  // Окно по данным: если отклики были давно, двенадцать недель дают 8% активных
  // клеток и календарь читается пустым. Сжимаем окно до четырёх недель вокруг данных.
  const lastActive = x.heat.flat().filter(c => !c.future && c.n > 0).map(c => c.day).sort().pop()
  const backlogWeeks = lastActive ? Math.ceil((Date.parse(t) - Date.parse(lastActive)) / (7 * 864e5)) : 0
  const span = lastActive ? Math.min(12, Math.max(4, backlogWeeks + 1)) : 12
  const weeks = x.heat.slice(-span)
  const past = weeks.flat().filter(c => !c.future)
  const total = past.reduce((a, c) => a + c.n, 0)
  const active = past.filter(c => c.n).length
  const [sel, setSel] = useState<string | null>(null)
  const s = sel ? past.find(c => c.day === sel) : undefined

  const month = (w: { day: string }[], i: number) => {
    const m = +w[0].day.slice(5, 7) - 1
    return i === 0 || +weeks[i - 1][0].day.slice(5, 7) - 1 !== m ? MONTHS[m] : ''
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="widget-head">
        <h3>Активность подач</h3>
        <span className="meta">{s ? fmtDate(s.day) : total + ' за ' + daysWord(active)}</span>
      </div>
      <div className="widget-heat" style={{ '--w': weeks.length } as CSSProperties}>
        <span />
        <div className="heat-months" aria-hidden>{weeks.map((w, i) => <span key={i}>{month(w, i)}</span>)}</div>
        <div className="heat-wd" aria-hidden><span>пн</span><span /><span>ср</span><span /><span>пт</span><span /><span /></div>
        <div className="heat-cells" role="list">
          {weeks.flatMap((w, wi) => w.map(c => c.future
            ? <i key={c.day} className="heat-cell future" />
            : <button key={c.day} role="listitem" className={'heat-cell l' + heatLevel(c.n) + (sel === c.day ? ' on' : '')}
              style={{ '--i': wi } as CSSProperties} onClick={() => setSel(sel === c.day ? null : c.day)}
              aria-label={`${fmtDate(c.day)}: ${c.n}`} />))}
        </div>
      </div>
      <div className="heat-legend" aria-hidden><span>меньше</span>{[0, 1, 2, 3, 4].map(l => <i key={l} className={'heat-cell l' + l} />)}<span>больше</span></div>
    </div>
  )
}