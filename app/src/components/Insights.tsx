import { useState } from 'react'
import { fmtDate, today } from '../lib/dates'
import { companyName, daysWord, KINDS } from '../lib/domain'
import { insights, WEEK_GOAL, type Outcome } from '../lib/insights'
import type { PultData } from '../lib/types'

const OUTCOME: Record<Outcome, string> = { live: 'Живой ответ', reject: 'Отказ', ack: 'Автоответ', silent: 'Пока тишина' }
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const pct = (a: number, b: number) => b ? Math.round(a * 100 / b) : 0

/** Кольцо цели на неделю: доля от WEEK_GOAL, число внутри. */
function Ring({ value, goal }: { value: number; goal: number }) {
  const r = 44, c = 2 * Math.PI * r, p = Math.min(1, value / goal)
  return (
    <svg className="ring" viewBox="0 0 108 108" role="img" aria-label={`${value} из ${goal} откликов за 7 дней`}>
      <circle cx="54" cy="54" r={r} fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="10" />
      <circle cx="54" cy="54" r={r} fill="none" stroke="var(--signal)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 54 54)" />
      <text x="54" y="54" textAnchor="middle" dominantBaseline="central" className="ring-n">{value}</text>
      <text x="54" y="76" textAnchor="middle" className="ring-l">из {goal}</text>
    </svg>
  )
}

/** Отклики по дням за 14 дней: одна серия, подпись у выбранного столбца, касание выбирает день. */
function Days({ perDay }: { perDay: { day: string; n: number }[] }) {
  const max = Math.max(1, ...perDay.map(x => x.n))
  const best = perDay.reduce((a, x, i) => x.n > perDay[a].n ? i : a, 0)
  const [sel, setSel] = useState(perDay[perDay.length - 1].n ? perDay.length - 1 : best)
  const s = perDay[sel]
  const wd = (d: string) => WD[new Date(d + 'T12:00:00Z').getUTCDay()]
  return (
    <div className="ins-card">
      <div className="ins-head"><h2>Отклики по дням</h2><span>14 дней</span></div>
      <div className="ins-readout"><b className="num">{s.n}</b> {s.day === today() ? 'сегодня' : wd(s.day) + ', ' + fmtDate(s.day)}</div>
      <div className="bars" role="list">
        {perDay.map((x, i) => (
          <button key={x.day} role="listitem" className={'bar-col' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}
            aria-label={`${fmtDate(x.day)}: ${x.n}`}>
            <i style={{ height: x.n ? Math.max(6, x.n / max * 100) + '%' : '3px' }} className={x.n ? '' : 'zero'} />
          </button>))}
      </div>
      <div className="bars-axis"><span>{fmtDate(perDay[0].day)}</span><span>{fmtDate(perDay[7].day)}</span><span>сегодня</span></div>
    </div>
  )
}

/** Горизонтальная полоса с подписью слева и значением справа. */
function Row({ label, n, of, note }: { label: string; n: number; of: number; note?: string }) {
  return (
    <div className="hrow">
      <div className="hrow-top"><span>{label}</span><span><b className="num">{n}</b>{note && <em>{note}</em>}</span></div>
      <div className="hbar"><i style={{ width: of ? Math.max(n ? 2 : 0, n / of * 100) + '%' : 0 }} /></div>
    </div>
  )
}

export function Insights({ data }: { data: PultData }) {
  const t = today()
  const x = insights(data, t)
  const delta = x.week - x.prevWeek
  const topChannel = Math.max(1, ...x.channels.map(c => c.n))
  return (
    <>
      <div className="ins-hero">
        <Ring value={x.week} goal={WEEK_GOAL} />
        <div className="ins-hero-side">
          <div className="kicker"><i />ЭТА НЕДЕЛЯ</div>
          <div className="ins-hero-title">{x.week >= WEEK_GOAL ? 'Цель недели взята' : `До цели ${WEEK_GOAL - x.week}`}</div>
          <div className="ins-hero-sub">{delta === 0 ? 'Столько же, сколько неделей раньше' : (delta > 0 ? '+' : '') + delta + ' к прошлой неделе'}</div>
          <div className="ins-mini">
            <span><b className="num">{pct(x.replied, x.total)}%</b>ответили</span>
            <span><b className="num">{x.selected}</b>в отборе</span>
            <span><b className="num">{x.streak}</b>{daysWord(x.streak).replace(/^\d+ /, '')} подряд</span>
          </div>
        </div>
      </div>

      <Days perDay={x.perDay} />

      <div className="ins-card">
        <div className="ins-head"><h2>Воронка</h2><span>от поданных</span></div>
        <Row label="Подано" n={x.total} of={x.total} />
        <Row label="Ответили" n={x.replied} of={x.total} note={pct(x.replied, x.total) + '%'} />
        <Row label="Отбор: тест или собес" n={x.selected} of={x.total} note={pct(x.selected, x.total) + '%'} />
        <Row label="Оффер" n={x.offers} of={x.total} note={pct(x.offers, x.total) + '%'} />
      </div>

      <div className="ins-card">
        <div className="ins-head"><h2>Чем отвечают</h2><span>итог по каждому отклику</span></div>
        {(['live', 'reject', 'ack', 'silent'] as Outcome[]).map(o => <Row key={o} label={OUTCOME[o]} n={x.outcomes[o]} of={x.total} note={pct(x.outcomes[o], x.total) + '%'} />)}
      </div>

      <div className="ins-card">
        <div className="ins-head"><h2>Каналы</h2><span>сколько подано и доля ответов</span></div>
        {x.channels.map(c => <Row key={c.name} label={c.name} n={c.n} of={topChannel} note={'ответили ' + pct(c.replied, c.n) + '%'} />)}
      </div>

      <div className="ins-card">
        <div className="ins-head"><h2>Скорость ответа</h2><span>от подачи до первого письма</span></div>
        {x.median === null ? <p className="ins-empty">Ответов пока не было.</p> : <>
          <div className="ins-readout">{x.median === 0 ? <><b className="num">0</b> дней: чаще всего отвечают в тот же день</> : <><b className="num">{x.median}</b> {daysWord(x.median).replace(/^\d+ /, '')}: медиана до первого письма</>}</div>
          <details className="ins-more">
            <summary>По компаниям</summary>
            {x.speed.map(s => (
              <div key={s.v.id} className="ins-line"><span>{companyName(s.v)}</span><span className="num">{s.d} · {KINDS[s.kind].label.toLowerCase()}</span></div>))}
          </details>
        </>}
      </div>
    </>
  )
}
