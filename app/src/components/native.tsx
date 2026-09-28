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
  const st = useRef<{ x: number; y: number; lock: boolean; dead: boolean } | null>(null)
  if (disabled) return <>{children}</>
  const LIMIT = 150, FIRE = 96
  return (
    <div className="sw">
      <div className={'sw-act' + (dx <= -FIRE ? ' ready' : '')} aria-hidden>{Icons.check}<span>{label}</span></div>
      <div className="sw-fg" style={{ transform: `translateX(${dx}px)`, transition: drag ? 'none' : undefined }}
        onPointerDown={e => { if (e.pointerType === 'mouse') return; st.current = { x: e.clientX, y: e.clientY, lock: false, dead: false } }}
        onPointerMove={e => {
          const s = st.current
          if (!s || s.dead) return
          const ddx = e.clientX - s.x, ddy = e.clientY - s.y
          if (!s.lock) {
            if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) { s.lock = true; setDrag(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
            else if (Math.abs(ddy) > 8) { s.dead = true; return }
            else return
          }
          const next = Math.max(-LIMIT, Math.min(0, ddx))
          if ((dx > -FIRE) !== (next > -FIRE)) haptic(8)
          setDx(next)
        }}
        onPointerUp={() => { const fire = dx <= -FIRE; st.current = null; setDrag(false); setDx(0); if (fire) { haptic(15); onAction() } }}
        onPointerCancel={() => { st.current = null; setDrag(false); setDx(0) }}>
        {children}
      </div>
    </div>
  )
}

/** Тост над таб-баром, живёт 4 секунды; кнопка «Вернуть» отменяет действие. */
export function Toaster() {
  const [t, setT] = useState<(ToastMsg & { k: number }) | null>(null)
  useEffect(() => {
    let timer = 0
    const on = (e: Event) => {
      const d = (e as CustomEvent<ToastMsg>).detail
      setT({ ...d, k: Date.now() })
      clearTimeout(timer); timer = window.setTimeout(() => setT(null), 4000)
    }
    window.addEventListener('pult-toast', on)
    return () => { window.removeEventListener('pult-toast', on); clearTimeout(timer) }
  }, [])
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {t && <div key={t.k} className="toast">
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

/** Потянуть вниз с самого верха, чтобы обновить (в приложении с экрана «Домой» нет кнопки обновления). */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let y0: number | null = null, dist = 0
    const ts = (e: TouchEvent) => { y0 = window.scrollY <= 0 && !busy ? e.touches[0].clientY : null; dist = 0 }
    const tm = (e: TouchEvent) => {
      if (y0 === null) return
      dist = Math.max(0, e.touches[0].clientY - y0)
      if (dist > 0 && window.scrollY <= 0) setPull(Math.min(dist * 0.55, 90))
    }
    const te = () => {
      if (y0 !== null && dist * 0.55 >= 64) {
        haptic(15); setBusy(true)
        refresh().finally(() => { setBusy(false); setPull(0) })
      } else setPull(0)
      y0 = null
    }
    window.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchmove', tm, { passive: true })
    window.addEventListener('touchend', te)
    return () => { window.removeEventListener('touchstart', ts); window.removeEventListener('touchmove', tm); window.removeEventListener('touchend', te) }
  }, [refresh, busy])
  return { pull: busy ? 64 : pull, busy }
}
