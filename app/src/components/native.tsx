import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic, type ToastMsg } from '../lib/ux'
import { Icons } from './icons'

/** Большой заголовок экрана; при прокрутке его заменяет компактная стеклянная шапка (iOS). */
export function Title({ title, compact, kicker, sub, actions, back }: {
  title: string; compact?: string; kicker?: string; sub?: ReactNode; actions?: ReactNode; back?: { label: string; onClick: () => void }
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <div className={'navbar' + (stuck ? ' on' : '')} aria-hidden={!stuck}>
        {back ? <button className="nb-back" tabIndex={stuck ? 0 : -1} onClick={back.onClick}>{Icons.back}{back.label}</button> : <span />}
        <span className="nb-title">{compact ?? title}</span>
        <span />
      </div>
      <header className="lt">
        {back && <button className="backlink" onClick={back.onClick}>{Icons.back}{back.label}</button>}
        {kicker
          ? <><div className="lt-row"><div className="lt-kicker">{kicker}</div>{actions && <div className="lt-actions">{actions}</div>}</div><h1 ref={ref}>{title}</h1></>
          : <div className="lt-row"><h1 ref={ref}>{title}</h1>{actions && <div className="lt-actions">{actions}</div>}</div>}
        {sub && <div className="lt-sub">{sub}</div>}
      </header>
    </>
  )
}

/** Плавающий стеклянный таб-бар с «линзой» под активной вкладкой (iOS 26). */
export function TabBar<T extends string>({ items, value, onPick, badges }: {
  items: { id: T; label: string; icon: ReactNode }[]; value: T; onPick: (t: T) => void; badges: Partial<Record<T, number>>
}) {
  const i = Math.max(0, items.findIndex(x => x.id === value))
  return (
    <nav className="tabbar" aria-label="Разделы">
      <span className="lens" style={{ transform: `translateX(${i * 100}%)`, width: `calc((100% - 12px) / ${items.length})` }} aria-hidden />
      {items.map(x => {
        const n = badges[x.id] ?? 0
        return (
          <button key={x.id} aria-current={value === x.id ? 'page' : undefined} onClick={() => { if (value !== x.id) haptic(); onPick(x.id) }}>
            {x.icon}<span>{x.label}</span>
            {n > 0 && <b className="tb-badge">{n}</b>}
          </button>)
      })}
    </nav>
  )
}

/** Свайп влево открывает действие; дотянул до конца - действие выполняется. */
export function Swipe({ children, label, onAction, disabled }: { children: ReactNode; label: string; onAction: () => void; disabled?: boolean }) {
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const st = useRef<{ x: number; y: number; lock: boolean; dead: boolean; hist: { x: number; t: number }[] } | null>(null)
  if (disabled) return <>{children}</>
  const LIMIT = 150, FIRE = 96
  // За пределом полосы палец «тянет резину»: чем дальше, тем меньше карточка следует за ним (как в iOS).
  const rubber = (over: number) => (over * 400 * 0.55) / (400 + 0.55 * Math.abs(over))
  const follow = (raw: number) => raw > 0 ? rubber(raw) * 0.4 : raw < -LIMIT ? -LIMIT + rubber(raw + LIMIT) : raw
  const release = () => {
    const s = st.current
    st.current = null
    setDrag(false)
    if (!s?.lock) { setDx(0); return }
    // Решаем по скорости и направлению жеста, а не только по расстоянию: быстрый смахивающий жест тоже засчитывается.
    const h = s.hist, a = h[0], b = h[h.length - 1]
    const v = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0
    const fire = dx <= -FIRE || (dx < -36 && v < -0.45)
    setDx(0)
    if (fire) { haptic(15); onAction() }
  }
  return (
    <div className="sw">
      <div className={'sw-act' + (dx <= -FIRE ? ' ready' : '')} aria-hidden style={{ opacity: dx < 0 ? Math.min(1, -dx / 40) : 0 }}>{Icons.check}<span>{label}</span></div>
      <div className="sw-fg" style={{ transform: dx ? `translate3d(${dx}px,0,0)` : undefined, transition: drag ? 'none' : undefined }}
        onPointerDown={e => { if (e.pointerType === 'mouse') return; st.current = { x: e.clientX, y: e.clientY, lock: false, dead: false, hist: [] } }}
        onPointerMove={e => {
          const s = st.current
          if (!s || s.dead) return
          const ddx = e.clientX - s.x, ddy = e.clientY - s.y
          if (!s.lock) {
            if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) { s.lock = true; setDrag(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
            else if (Math.abs(ddy) > 10) { s.dead = true; return }
            else return
          }
          s.hist = [...s.hist.slice(-4), { x: e.clientX, t: e.timeStamp }]
          const next = follow(ddx)
          if ((dx > -FIRE) !== (next > -FIRE)) haptic(8)
          setDx(next)
        }}
        onPointerUp={release}
        onPointerCancel={() => { st.current = null; setDrag(false); setDx(0) }}>
        {children}
      </div>
    </div>
  )
}

/** Тост над таб-баром, живёт 4 секунды; кнопка «Вернуть» отменяет действие. */
export function Toaster() {
  const [t, setT] = useState<(ToastMsg & { k: number; out?: boolean }) | null>(null)
  useEffect(() => {
    let timer = 0, gone = 0
    const on = (e: Event) => {
      const d = (e as CustomEvent<ToastMsg>).detail
      clearTimeout(timer); clearTimeout(gone)
      setT({ ...d, k: Date.now() })
      timer = window.setTimeout(() => {
        setT(x => x && { ...x, out: true })
        gone = window.setTimeout(() => setT(null), 220)
      }, 4000)
    }
    window.addEventListener('pult-toast', on)
    return () => { window.removeEventListener('pult-toast', on); clearTimeout(timer); clearTimeout(gone) }
  }, [])
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {t && <div key={t.k} className={'toast' + (t.out ? ' out' : '')}>
        <span>{t.text}</span>
        {t.action && <button onClick={() => { t.action!.run(); setT(null) }}>{t.action.label}</button>}
      </div>}
    </div>
  )
}

/** Скелетон экрана на время первой загрузки. */
export function Skeleton() {
  return (
    <div className="scr" aria-busy="true" aria-label="Загружаю">
      <div className="sk sk-title" /><div className="sk sk-line" />
      <div className="sk sk-hero" />
      <div className="sk sk-row" /><div className="sk sk-row" /><div className="sk sk-row" />
    </div>
  )
}

/** Потянуть вниз с самого верха, чтобы обновить (в приложении с экрана «Домой» нет кнопки обновления).
 *  Индикатор двигается напрямую через style в requestAnimationFrame: React не перерисовывает экран на каждый сдвиг пальца. */
export function PullToRefresh({ refresh }: { refresh: () => Promise<unknown> }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = el.current
    if (!node) return
    const MAX = 90, FIRE = 64
    let y0: number | null = null, pull = 0, busy = false, frame = 0
    const paint = (p: number, animate: boolean) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        node.style.transition = animate ? 'transform .3s cubic-bezier(.2,.8,.2,1), opacity .3s' : 'none'
        node.style.transform = `translate3d(0, ${p - 44}px, 0) rotate(${Math.min(p, FIRE) * 4.5}deg)`
        node.style.opacity = String(Math.min(1, p / 40))
        node.classList.toggle('ready', p >= FIRE)
      })
    }
    const ts = (e: TouchEvent) => { y0 = !busy && window.scrollY <= 0 ? e.touches[0].clientY : null; pull = 0 }
    const tm = (e: TouchEvent) => {
      if (y0 === null) return
      const d = e.touches[0].clientY - y0
      if (d <= 0 || window.scrollY > 0) { if (pull) { pull = 0; paint(0, false) } return }
      // Сопротивление растёт с расстоянием: палец тянет «резину», а не линейку.
      pull = Math.min(MAX, (d * 220 * 0.55) / (220 + 0.55 * d))
      paint(pull, false)
    }
    const te = () => {
      if (y0 === null) return
      y0 = null
      if (pull >= FIRE) {
        haptic(15); busy = true; node.classList.add('busy'); paint(FIRE, true)
        refresh().finally(() => { busy = false; node.classList.remove('busy'); paint(0, true) })
      } else paint(0, true)
      pull = 0
    }
    window.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchmove', tm, { passive: true })
    window.addEventListener('touchend', te)
    window.addEventListener('touchcancel', te)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('touchstart', ts); window.removeEventListener('touchmove', tm)
      window.removeEventListener('touchend', te); window.removeEventListener('touchcancel', te)
    }
  }, [refresh])
  return <div ref={el} className="ptr" aria-hidden style={{ opacity: 0, transform: 'translate3d(0,-44px,0)' }}><i /></div>
}
