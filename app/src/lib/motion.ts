import { useEffect, useRef, useState } from 'react'
import { hasViewTransition } from './ux'

// Живой слой десктопа: прожектор за курсором, наклон карточек, магнитные кнопки,
// появление по скроллу. Всё через transform, всё гаснет при «уменьшить движение».

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches

/** Число досчитывается до цели. Обновляет состояние только когда меняется видимое значение. */
export function useCountUp(target: number, ms = 720) {
  const [n, setN] = useState(() => (reduced() ? target : 0))
  const shown = useRef(reduced() ? target : 0)

  useEffect(() => {
    if (reduced()) { shown.current = target; setN(target); return }
    const from = shown.current
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)))
      if (v !== shown.current) { shown.current = v; setN(v) }
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    // Кадры не идут в фоновой вкладке: итог ставим в любом случае.
    const done = window.setTimeout(() => {
      cancelAnimationFrame(raf)
      if (shown.current !== target) { shown.current = target; setN(target) }
    }, ms + 140)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [target, ms])

  return n
}

/* Радиус прожектора: половина его ширины в CSS */
const SPOT = 310

/**
 * Заводит живой слой внутри контейнера дашборда.
 * Возвращает функцию остановки: снимает слушатели и наблюдатель.
 */
export function startDashboardMotion(root: HTMLElement) {
  const spot = root.querySelector<HTMLElement>('.dash-spot')
  const grid = root.querySelector<HTMLElement>('.widget-grid')
  const hover = canHover() && !reduced()

  let px = window.innerWidth / 2
  let py = window.innerHeight / 2
  // Прожектор догоняет курсор плавно: резкий прыжок читается как дергание.
  let sx = px
  let sy = py
  let raf = 0

  // Магнитные кнопки: мягкое притяжение вблизи. Слабое намеренно.
  const MAGNET_SEL = '.widget-hero .hbtn'
  const MAGNET_R = 58
  const MAGNET_PULL = 0.10
  const MAGNET_MAX = 3.5
  let magnets: { el: HTMLElement; r: DOMRect }[] = []
  const measureMagnets = () => {
    magnets = [...root.querySelectorAll<HTMLElement>(MAGNET_SEL)]
      .map(el => ({ el, r: el.getBoundingClientRect() }))
  }
  measureMagnets()

  const paintMagnets = () => {
    for (const m of magnets) {
      if (m.el.dataset.hot === '1') continue
      const dx = sx - (m.r.left + m.r.width / 2)
      const dy = sy - (m.r.top + m.r.height / 2)
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < MAGNET_R) {
        const f = (1 - dist / MAGNET_R) * MAGNET_PULL
        const ox = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dx * f))
        const oy = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dy * f))
        m.el.style.transform = `translate3d(${ox.toFixed(2)}px, ${oy.toFixed(2)}px, 0)`
      } else if (m.el.style.transform) {
        m.el.style.transform = ''
      }
    }
  }

  const paint = () => {
    raf = 0
    // Догоняем курсор: 0.24 за кадр даёт мягкое следование без инерции
    sx += (px - sx) * 0.24
    sy += (py - sy) * 0.24

    if (spot) {
      spot.style.transform = `translate3d(${(sx - SPOT).toFixed(0)}px, ${(sy - SPOT).toFixed(0)}px, 0)`
    }
    if (hover && magnets.length) paintMagnets()

    // Наклон карточек убран совсем. Вращение элемента с backdrop-filter
    // заставляло браузер пересобирать слой размытия: отсюда полупрозрачные
    // полосы по кромкам и «убегание» углов из-под курсора.
    // Объём теперь дают только подъём и тень на :hover (см. glass.css).

    // Кадры нужны, пока есть движение
    const moving = Math.abs(px - sx) > 0.4 || Math.abs(py - sy) > 0.4
    if (moving) schedule()
  }

  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint) }

  const onMove = (e: PointerEvent) => {
    px = e.clientX
    py = e.clientY
    if (!hover) return
    schedule()
  }

  // Курсор ушёл за пределы окна: прожектор ОСТАЁТСЯ на последней позиции.
  // Раньше здесь координаты сбрасывались в центр экрана - свечение уезжало
  // в середину, хотя курсор просто ушёл за край. Ничего не делаем:
  // последняя точка уже записана в px/py и остаётся на месте.
  const onLeave = () => { /* позиция сохраняется */ }

  // Прокрутка и изменение размера сдвигают кнопки: кэш габаритов пересчитываем.
  const remeasure = () => { measureMagnets() }

  // Пока кнопка нажата, магнит не мешает вдавливанию (:active со своей шкалой).
  const onDown = (e: PointerEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.(MAGNET_SEL) as HTMLElement | null
    if (!el) return
    el.dataset.hot = '1'
    el.style.transform = ''
  }
  const onUp = () => {
    for (const m of magnets) delete m.el.dataset.hot
  }

  const listeners: (() => void)[] = []
  if (hover) {
    window.addEventListener('pointermove', onMove, { passive: true })
    listeners.push(() => window.removeEventListener('pointermove', onMove))
    document.addEventListener('pointerleave', onLeave)
    listeners.push(() => document.removeEventListener('pointerleave', onLeave))
    document.addEventListener('pointerdown', onDown, { passive: true })
    listeners.push(() => document.removeEventListener('pointerdown', onDown))
    document.addEventListener('pointerup', onUp, { passive: true })
    listeners.push(() => document.removeEventListener('pointerup', onUp))
    document.addEventListener('scroll', remeasure, { passive: true, capture: true })
    listeners.push(() => document.removeEventListener('scroll', remeasure, { capture: true }))
    window.addEventListener('resize', remeasure, { passive: true })
    listeners.push(() => window.removeEventListener('resize', remeasure))
    schedule()
  }

  // Плавная перестройка раскладки панели деталей: если браузер умеет, гасим анимацию margin
  if (hasViewTransition() && !reduced()) document.documentElement.classList.add('has-vt')

  // Появление карточек: снизу вверх, лесенкой по индексу в ряду
  let io: IntersectionObserver | null = null
  if (grid && 'IntersectionObserver' in window) {
    const kids = [...grid.children] as HTMLElement[]
    grid.classList.add('reveal')
    kids.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const cols = Math.max(1, Math.round(grid.clientWidth / Math.max(1, r.width)))
      el.style.setProperty('--d', String(i % Math.max(1, cols)))
    })
    io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('in')
          io?.unobserve(en.target)
        }
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 })
    kids.forEach(el => io!.observe(el))
  }

  return () => {
    listeners.forEach(off => off())
    if (raf) cancelAnimationFrame(raf)
    io?.disconnect()
    for (const m of magnets) { m.el.style.transform = ''; delete m.el.dataset.hot }
    document.documentElement.classList.remove('has-vt')
  }
}
