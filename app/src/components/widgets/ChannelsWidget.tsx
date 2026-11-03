import { type CSSProperties } from 'react'
import { today } from '../../lib/dates'
import { insights } from '../../lib/insights'
import { useCountUp } from '../../lib/motion'
import type { PultData } from '../../lib/types'

// «Каналы»: откуда приходят ответы. Полоса = отклики, светлая часть внутри = живые ответы.

const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0)

export function ChannelsWidget({ data }: { data: PultData }) {
  const t = today()
  const x = insights(data, t)
  const top = x.channels.filter(c => c.n > 0).slice(0, 4)
  const max = Math.max(1, ...top.map(c => c.n))
  const best = useCountUp(top[0]?.n ?? 0, 800)

  if (!top.length) return <div className="widget-empty">Пока нет поданных откликов.</div>

  return (
    <div className="channels">
      <div className="chart-head">
        <div className="chart-figure">
          <b>{best}</b>
          <span>{top[0].name}</span>
        </div>
        <div className="chart-side">
          <div className="chart-delta up">{pct(top[0].replied, top[0].n)}%</div>
          <div className="chart-delta-note">живых ответов</div>
        </div>
      </div>

      {top.map((c, i) => (
        <div className="ch-row" key={c.name}>
          <div className="ch-top">
            <span>{c.name}</span>
            <span><b>{c.n}</b><em>{pct(c.replied, c.n)}%</em></span>
          </div>
          <div className="ch-track">
            <i className="ch-all" style={{ width: (c.n / max) * 100 + '%', '--i': i } as CSSProperties} />
            {c.replied > 0 && (
              <i className="ch-rep" style={{ width: (c.replied / max) * 100 + '%', '--i': i } as CSSProperties} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
