import { useEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Прелоадер «сборка дашборда».
 *
 * Не отдельная сцена, а каркас самого интерфейса: тот же остров навигации
 * и та же сетка карточек, только собранные из света. Пока данные грузятся,
 * каркас дышит и по нему бегут блики, а настоящий дашборд проявляется под ним.
 * Когда данные готовы, каркас растворяется - и на его месте уже живой экран.
 */
const MIN_MS = 1400
const FADE_MS = 700

/** Силуэт сетки: ширина колонок и высота в px, как у настоящего bento.
 *  Блоков с запасом: каркас обязан заполнить экран до низа, иначе
 *  прелоадер выглядит обрубленным. */
const BLOCKS: { w: 2 | 3 | 6; h: number }[] = [
  { w: 6, h: 96 },
  { w: 6, h: 200 },
  { w: 2, h: 130 },
  { w: 2, h: 130 },
  { w: 2, h: 130 },
  { w: 3, h: 148 },
  { w: 3, h: 148 },
  { w: 3, h: 126 },
  { w: 3, h: 126 },
  { w: 2, h: 150 },
  { w: 2, h: 150 },
  { w: 2, h: 150 },
  { w: 3, h: 132 },
  { w: 3, h: 132 },
  { w: 6, h: 140 },
]

export function Preloader({ done, inline }: { done: boolean; inline?: boolean }) {
  const firstPaint = useRef<number | null>(null)
  const [gone, setGone] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (firstPaint.current === null) firstPaint.current = performance.now()
  }, [])

  useEffect(() => {
    // В inline-режиме каркас уже часть экрана: он не гаснет сам, а уступает
    // место живому контенту, когда тот смонтируется. Держим только затухание.
    if (inline || !done || gone) return
    const shownFor = performance.now() - (firstPaint.current ?? performance.now())
    const wait = Math.max(0, MIN_MS - shownFor)
    const t1 = window.setTimeout(() => setFading(true), wait)
    const t2 = window.setTimeout(() => setGone(true), wait + FADE_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [done, gone, inline])

  if (gone) return null

  return (
    <div
      className={'preloader' + (inline ? ' inline' : '') + (fading ? ' out' : '')}
      role="status"
      aria-live="polite"
      aria-label="Загрузка пульта"
    >
      {/* Аврора: живёт прямо в полотне будущего дашборда */}
      <div className="pl-aurora" aria-hidden>
        <i /><i /><i />
      </div>

      {/* Каркас: та же геометрия, что у настоящего экрана */}
      <div className="pl-frame" aria-hidden>
        <div className="pl-island">
          <i /><i /><i /><i /><i /><i /><i />
        </div>

        <div className="pl-grid">
          {BLOCKS.map((b, i) => (
            <div
              className={'pl-card w-' + b.w}
              key={i}
              style={{ '--i': i, height: b.h } as CSSProperties}
            >
              <span className="pl-card-glow" />
            </div>
          ))}
        </div>
      </div>

      {/* Знак по центру: единственный непрозрачный элемент */}
      <div className="pl-core">
        <div className="pl-halo" aria-hidden />
        <div className="pl-mark">
          <span>П</span>
          <span className="pl-sheen" aria-hidden />
        </div>
        <div className="pl-word">Пульт</div>
      </div>
    </div>
  )
}
