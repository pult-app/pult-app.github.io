import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { addDays, days as diffDays, fmtDate, today } from '../../lib/dates'
import { useCountUp } from '../../lib/motion'
import type { PultData } from '../../lib/types'

// «Динамика откликов».
// Окно берём по фактическому размаху данных, а не «последние N дней»:
// иначе отклики, поданные месяц назад, висят одной точкой в пустом графике.
// Длинный размах собираем в корзины по 2-5 дней, чтобы точек было 10-14 и линия читалась.

const H = 200
/* Правый отступ шире: последняя точка с ореолом упиралась в кромку */
const PAD = { l: 36, r: 26, t: 16, b: 26 }
const TARGET_POINTS = 13

function smooth(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const wd = (d: string) => WD[new Date(d + 'T12:00:00Z').getUTCDay()]

interface Bucket { day: string; n: number; size: number }

export function AreaChartWidget({ data }: { data: PultData }) {
  const t = today()
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(620)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const cw = entries[0].contentRect.width
      if (cw > 100) setW(Math.round(cw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of data.vacancies) {
      if (!v.applied_on || v.status === 'skip') continue
      m.set(v.applied_on, (m.get(v.applied_on) ?? 0) + 1)
    }
    return m
  }, [data.vacancies])

  const count = (d: string) => byDay.get(d) ?? 0

  /** Непрерывный ряд по дням от from до to включительно. */
  const dailyFrom = (from: string, to: string) => {
    const n = Math.max(0, diffDays(from, to)) + 1
    return Array.from({ length: n }, (_, i) => {
      const day = addDays(from, i)
      return { day, n: count(day) }
    })
  }

  /** Ряд в корзинах: 10-14 точек, каждая суммирует несколько дней. */
  const bucketize = (from: string, to: string, size: number): Bucket[] => {
    const daily = dailyFrom(from, to)
    const out: Bucket[] = []
    for (let i = 0; i < daily.length; i += size) {
      const part = daily.slice(i, i + size)
      out.push({ day: part[0].day, n: part.reduce((a, p) => a + p.n, 0), size: part.length })
    }
    return out
  }

  // Границы: от первого до последнего отклика с отступом, но не дальше сегодня.
  // Отступ справа меньше: иначе график заканчивается нулевым хвостом в пустых днях.
  const range = useMemo(() => {
    const dates = [...byDay.keys()].filter(d => d <= t).sort()
    if (!dates.length) return null
    const min = dates[0]
    const max = dates[dates.length - 1]
    const span = Math.max(1, diffDays(min, max) + 1)
    const padLeft = Math.min(7, Math.max(1, Math.round(span * 0.10)))
    const padRight = Math.min(2, Math.max(0, Math.round(span * 0.03)))
    const from = addDays(min, -padLeft)
    const toRaw = addDays(max, padRight)
    const to = toRaw > t ? t : toRaw
    const total = Math.max(1, diffDays(from, to) + 1)
    return { from, to, span: total, min, max }
  }, [byDay, t])

  const { buckets, prevBuckets } = useMemo(() => {
    if (!range) return { buckets: [] as Bucket[], prevBuckets: [] as Bucket[] }
    const size = Math.max(1, Math.ceil(range.span / TARGET_POINTS))
    const buckets = bucketize(range.from, range.to, size)
    // Прошлое окно той же длины для сравнения
    const prevTo = addDays(range.from, -1)
    const prevFrom = addDays(prevTo, -(range.span - 1))
    const prevBuckets = bucketize(prevFrom, prevTo, size)
    return { buckets, prevBuckets }
  }, [range, byDay])

  const [sel, setSel] = useState(0)
  useEffect(() => { setSel(-1) }, [buckets.length])

  const total = buckets.reduce((a, b) => a + b.n, 0)
  const totalPrev = prevBuckets.reduce((a, b) => a + b.n, 0)
  const shown = useCountUp(total, 900)

  // Пустое состояние: откликов нет вовсе
  if (!range || total === 0) {
    const last = [...byDay.keys()].sort().pop()
    return (
      <div className="chart-empty">
        <div className="ce-ring"><i /><i /><i /></div>
        <div className="ce-text">
          <b>Откликов пока нет</b>
          <span>{last ? 'последний отклик ' + fmtDate(last) : 'данных о подачах нет'}</span>
        </div>
      </div>
    )
  }

  const max = Math.max(1, ...buckets.map(b => b.n), ...prevBuckets.map(b => b.n))
  const ticks = [...new Set([0, Math.round(max / 2), max])].sort((a, b) => a - b)
  const innerW = Math.max(60, W - PAD.l - PAD.r)
  const innerH = H - PAD.t - PAD.b
  const px = (i: number, len: number) => PAD.l + (innerW * i) / Math.max(1, len - 1)
  const py = (n: number) => PAD.t + innerH * (1 - n / max)

  const pts = buckets.map((b, i) => ({ x: px(i, buckets.length), y: py(b.n) }))
  const prevPts = prevBuckets.map((b, i) => ({ x: px(i, prevBuckets.length), y: py(b.n) }))
  const line = smooth(pts)
  const prevLine = prevPts.length > 1 ? smooth(prevPts) : ''
  const area = `${line} L${px(buckets.length - 1, buckets.length).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${PAD.l},${(PAD.t + innerH).toFixed(1)} Z`

  const active = sel >= 0 && sel < buckets.length ? buckets[sel] : buckets[buckets.length - 1]
  const activeIdx = sel >= 0 && sel < buckets.length ? sel : buckets.length - 1
  const delta = totalPrev ? Math.round(((total - totalPrev) / totalPrev) * 100) : null

  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - r.left) / r.width) * W
    const i = Math.round((rel - PAD.l) / (innerW / Math.max(1, buckets.length - 1)))
    setSel(Math.max(0, Math.min(buckets.length - 1, i)))
  }

  const bucketLabel = (b: Bucket) => {
    if (b.size <= 1) return fmtDate(b.day) + ', ' + wd(b.day)
    const end = addDays(b.day, b.size - 1)
    return fmtDate(b.day) + ' - ' + fmtDate(end)
  }

  return (
    <div className="chart" ref={wrap}>
      <div className="chart-head">
        <div className="chart-figure">
          <b>{shown}</b>
          <span>откликов {fmtDate(range.from)} - {fmtDate(range.to)}</span>
        </div>
        <div className="chart-side">
          <div className={'chart-delta' + (delta === null ? '' : delta > 0 ? ' up' : delta < 0 ? ' down' : '')}>
            {delta === null ? '—' : (delta > 0 ? '+' : '') + delta + '%'}
          </div>
          <div className="chart-delta-note">к прошлому окну</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="area" onMouseMove={pick} onMouseLeave={() => setSel(-1)}
        style={{ height: H }} role="img"
        aria-label={`Отклики с ${fmtDate(range.from)} по ${fmtDate(range.to)}: ${total}, за прошлое окно ${totalPrev}`}>
        <defs>
          {/* Заливка: фиолетовая у вершины, гаснет к низу */}
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--violet-line)" stopOpacity="0.30" />
            <stop offset="55%" stopColor="var(--violet-line)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--violet-line)" stopOpacity="0.01" />
          </linearGradient>

          {/* Линия: градиент по горизонтали от фиолетового к янтарю.
              Это связывает палитру: данные приходят фиолетовыми, а к «сегодня»
              теплеют в сигнальный янтарь. Один цвет на тёмном смотрелся чужим. */}
          <linearGradient id="areaStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--violet-line)" />
            <stop offset="55%" stopColor="color-mix(in srgb, var(--violet-line) 55%, var(--amber))" />
            <stop offset="100%" stopColor="var(--amber)" />
          </linearGradient>

          {/* Мягкое свечение под линией: размытая копия того же контура */}
          <filter id="areaGlow" x="-8%" y="-40%" width="116%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
            </feMerge>
          </filter>
        </defs>

        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(v)} y2={py(v)} className="grid" />
            <text x={PAD.l - 8} y={py(v) + 3.5} className="tick" textAnchor="end">{v}</text>
          </g>
        ))}

        {prevLine && <path d={prevLine} className="area-line prev" fill="none" />}
        <path d={area} fill="url(#areaFill)" className="area-fill" />
        {/* Свечение: тот же путь, размытый и полупрозрачный - даёт глубину без грязи */}
        <path d={line} className="area-glow" fill="none" filter="url(#areaGlow)" pathLength={1} />
        <path d={line} className="area-line" stroke="url(#areaStroke)" pathLength={1} fill="none" />

        <circle cx={px(activeIdx, buckets.length)} cy={py(active.n)} r="5.5" className="area-dot" />
        <line x1={px(activeIdx, buckets.length)} x2={px(activeIdx, buckets.length)} y1={PAD.t} y2={PAD.t + innerH} className="guide" />

        <text x={PAD.l} y={H - 7} className="axis" textAnchor="start">{fmtDate(range.from)}</text>
        <text x={px(Math.floor((buckets.length - 1) / 2), buckets.length)} y={H - 7} className="axis" textAnchor="middle">
          {fmtDate(buckets[Math.floor(buckets.length / 2)].day)}
        </text>
        <text x={W - PAD.r} y={H - 7} className="axis" textAnchor="end">{fmtDate(range.to)}</text>
      </svg>

      <div className="chart-foot">
        <span className="cf-item"><i className="lg-now" />за окно · <b>{total}</b></span>
        {totalPrev > 0 && <span className="cf-item"><i className="lg-prev" />до него · <b>{totalPrev}</b></span>}
        <span className="cf-day">{bucketLabel(active)}: <b>{active.n}</b></span>
      </div>
    </div>
  )
}
