import { useEffect, useState, type CSSProperties } from 'react'
import { fmtDate, today } from '../lib/dates'
import { companyName, daysWord, KINDS } from '../lib/domain'
import { aging, heatLevel, insights, WEEK_GOAL, type Outcome } from '../lib/insights'
import type { PultData } from '../lib/types'
import { Fold, Segmented } from './kit'
import { Title } from './native'
import type { Go } from '../App'

const OUTCOME: Record<Outcome, string> = { live: 'Живой ответ', reject: 'Отказ', ack: 'Автоответ', silent: 'Пока тишина' }
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const pct = (a: number, b: number) => b ? Math.round(a * 100 / b) : 0
const wd = (d: string) => WD[new Date(d + 'T12:00:00Z').getUTCDay()]

/** Число досчитывается от нуля за ~0,7 с (как кольца активности); при «уменьшить движение» сразу итог. */
function useCountUp(target: number) {
  const [n, setN] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches ? target : 0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(target); return }
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 700)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    // Кадры не идут в фоновой вкладке: итог ставим в любом случае.
    const done = window.setTimeout(() => { cancelAnimationFrame(raf); setN(target) }, 800)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [target])
  return n
}

/** Кольцо цели на неделю: доля от WEEK_GOAL, число внутри. */
function Ring({ value, goal }: { value: number; goal: number }) {
  const shown = useCountUp(value)
  const r = 44, c = 2 * Math.PI * r, p = Math.min(1, value / goal)
  // Число в HTML поверх кольца: так оно набрано тем же шрифтом, что и заголовки, а не системным из SVG.
  return (
    <div className="ring" role="img" aria-label={`${value} откликов за 7 дней, цель ${goal}`}>
      <svg viewBox="0 0 108 108" aria-hidden>
        <circle cx="54" cy="54" r={r} fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="10" />
        <circle className="arc" cx="54" cy="54" r={r} fill="none" stroke="var(--signal)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 54 54)" />
      </svg>
      <div className="ring-label"><b>{shown}</b><span>за 7 дней</span></div>
    </div>
  )
}

/** Отклики по дням за 14 дней: подпись у выбранного столбца, касание выбирает день. */
function Days({ perDay }: { perDay: { day: string; n: number }[] }) {
  const max = Math.max(1, ...perDay.map(x => x.n))
  const best = perDay.reduce((a, x, i) => x.n > perDay[a].n ? i : a, 0)
  const [sel, setSel] = useState(perDay[perDay.length - 1].n ? perDay.length - 1 : best)
  const s = perDay[sel]
  return (
    <>
      <div className="ins-readout"><b className="num">{s.n}</b> {s.day === today() ? 'сегодня' : wd(s.day) + ', ' + fmtDate(s.day)}</div>
      <div className="bars" role="list">
        {perDay.map((x, i) => (
          <button key={x.day} role="listitem" className={'bar-col' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}
            aria-label={`${fmtDate(x.day)}: ${x.n}`}>
            <i style={{ height: x.n ? Math.max(6, x.n / max * 100) + '%' : '3px', '--i': i } as CSSProperties} className={x.n ? '' : 'zero'} />
          </button>))}
      </div>
      <div className="bars-axis"><span>{fmtDate(perDay[0].day)}</span><span>{fmtDate(perDay[7].day)}</span><span>сегодня</span></div>
    </>
  )
}

/** Календарь активности (идея из Skillry, Activity Calendar Chart): квадрат = день, цвет = сколько подано. */
function Heat({ weeks }: { weeks: { day: string; n: number; future: boolean }[][] }) {
  const past = weeks.flat().filter(c => !c.future)
  const total = past.reduce((a, c) => a + c.n, 0)
  const active = past.filter(c => c.n).length
  const [sel, setSel] = useState<string | null>(null)
  const s = sel ? past.find(c => c.day === sel) : undefined
  // Подпись месяца над неделей, в которой он начался.
  const month = (w: { day: string }[], i: number) => {
    const m = +w[0].day.slice(5, 7) - 1
    return i === 0 || +weeks[i - 1][0].day.slice(5, 7) - 1 !== m ? MONTHS[m] : ''
  }
  return (
    <>
      <div className="ins-readout">{s
        ? <><b className="num">{s.n}</b> {s.day === today() ? 'сегодня' : wd(s.day) + ', ' + fmtDate(s.day)}</>
        : <><b className="num">{total}</b> откликов за {daysWord(active)} с подачей</>}</div>
      <div className="heat" style={{ '--w': weeks.length } as CSSProperties}>
        <span />
        <div className="heat-months" aria-hidden>{weeks.map((w, i) => <span key={i}>{month(w, i)}</span>)}</div>
        <div className="heat-wd" aria-hidden><span>пн</span><span /><span>ср</span><span /><span>пт</span><span /><span /></div>
        <div className="heat-cells" role="list">
          {weeks.flatMap((w, i) => w.map(c => c.future
            ? <i key={c.day} className="heat-cell future" />
            : <button key={c.day} role="listitem" className={'heat-cell l' + heatLevel(c.n) + (sel === c.day ? ' on' : '')}
              style={{ '--i': i } as CSSProperties} onClick={() => setSel(sel === c.day ? null : c.day)}
              aria-label={`${fmtDate(c.day)}: ${c.n}`} />))}
        </div>
      </div>
      <div className="heat-legend" aria-hidden><span>меньше</span>{[0, 1, 2, 3, 4].map(l => <i key={l} className={'heat-cell l' + l} />)}<span>больше</span></div>
    </>
  )
}

/** Горизонтальная полоса с подписью слева и значением справа; с `onClick` строка нажимается и ведёт в список. */
function Row({ label, n, of, note, i = 0, onClick }: { label: string; n: number; of: number; note?: string; i?: number; onClick?: () => void }) {
  const inner = (
    <>
      <div className="hrow-top"><span>{label}</span><span><b className="num">{n}</b>{note && <em>{note}</em>}</span></div>
      <div className="hbar"><i style={{ width: of ? Math.max(n ? 2 : 0, n / of * 100) + '%' : 0, '--i': i } as CSSProperties} /></div>
    </>)
  return onClick ? <button type="button" className="hrow tap" onClick={onClick}>{inner}</button> : <div className="hrow">{inner}</div>
}

export function Insights({ data, backLabel, onBack, goto }: { data: PultData; backLabel: string; onBack: () => void; goto: Go }) {
  const t = today()
  const x = insights(data, t)
  const ag = aging(data, t)
  const agTotal = ag.reduce((a, b) => a + b.n, 0)
  const [pace, setPace] = useState<'days' | 'weeks'>('days')
  const [view, setView] = useState<'outcomes' | 'channels'>('outcomes')
  const delta = x.week - x.prevWeek
  const topChannel = Math.max(1, ...x.channels.map(c => c.n))
  return (
    <section className="scr">
      <Title title="Цифры" sub="Поиск работы: темп, воронка, ответы" back={{ label: backLabel, onClick: onBack }} />
      <div className="ins-hero">
        <Ring value={x.week} goal={WEEK_GOAL} />
        <div className="ins-hero-side">
          <div className="kicker"><i />ЭТА НЕДЕЛЯ</div>
          <div className="ins-hero-title">{x.week >= WEEK_GOAL ? 'Цель недели взята' : `До цели ${WEEK_GOAL - x.week}`}</div>
          <div className="ins-hero-sub">{delta === 0 ? 'Столько же, сколько неделей раньше' : (delta > 0 ? '+' : '') + delta + ' к прошлой неделе'}</div>
          <div className="ins-mini">
            <span><b className="num">{x.total}</b>подано</span>
            <span><b className="num">{x.streak}</b>дн. подряд</span>
            <span><b className="num">{x.median ?? '·'}</b>дн. до ответа</span>
          </div>
        </div>
      </div>

      <Fold id="ins-funnel" card title="Воронка" meta={`${pct(x.replied, x.total)}% ответили`}>
        <Row label="Подано" n={x.total} of={x.total} />
        <Row i={1} label="Ответили" n={x.replied} of={x.total} note={pct(x.replied, x.total) + '%'} />
        <Row i={2} label="Отбор: тест или собес" n={x.selected} of={x.total} note={pct(x.selected, x.total) + '%'} onClick={() => goto('funnel', { ftab: 'sel' })} />
        <Row i={3} label="Оффер" n={x.offers} of={x.total} note={pct(x.offers, x.total) + '%'} />
        {x.median !== null && (
          <details className="ins-more">
            <summary>Скорость ответа по компаниям</summary>
            {x.speed.map(s => (
              <div key={s.v.id} className="ins-line"><span>{companyName(s.v)}</span><span className="num">{s.d} · {KINDS[s.kind].label.toLowerCase()}</span></div>))}
          </details>)}
      </Fold>

      <Fold id="ins-aging" card title="Где застряли" meta={agTotal + ' без ответа'}>
        {ag.map((b, i) => <Row key={b.id} i={i} label={b.label} n={b.n} of={Math.max(1, agTotal)} note={pct(b.n, agTotal) + '%'} onClick={b.n ? () => goto('funnel', { ftab: 'wait' }) : undefined} />)}
        <p className="ins-empty">Строки с откликами нажимаются: откроется список в воронке, самые старые первыми.</p>
      </Fold>

      <Fold id="ins-pace" card title="Темп подачи" meta={x.week + ' за неделю'}>
        <Segmented label="Масштаб" value={pace} onPick={setPace} options={[{ id: 'days', label: '14 дней' }, { id: 'weeks', label: '18 недель' }]} />
        {pace === 'days' ? <Days perDay={x.perDay} /> : <Heat weeks={x.heat} />}
      </Fold>

      <Fold id="ins-outcomes" card title="Чем отвечают" meta={x.channels[0]?.name ?? ''} defaultOpen={false}>
        <Segmented label="Разрез" value={view} onPick={setView} options={[{ id: 'outcomes', label: 'Итоги' }, { id: 'channels', label: 'Каналы' }]} />
        {view === 'outcomes'
          ? (['live', 'reject', 'ack', 'silent'] as Outcome[]).map((o, i) => <Row key={o} i={i} label={OUTCOME[o]} n={x.outcomes[o]} of={x.total} note={pct(x.outcomes[o], x.total) + '%'} />)
          : x.channels.map((c, i) => <Row key={c.name} i={i} label={c.name} n={c.n} of={topChannel} note={'ответили ' + pct(c.replied, c.n) + '%'} />)}
      </Fold>
    </section>
  )
}
