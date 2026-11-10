import { useEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Прелоадер: полёт сквозь слои в глубину.
 *
 * Вместо вращающихся колец - ощущение погружения: рамки-плашки летят из
 * точки схода на зрителя, растут и растворяются. В центре держится знак,
 * внизу бежит полоса.
 *
 * Держится МИНИМУМ MIN_MS от своего появления, даже если данные пришли
 * мгновенно: иначе экран мелькает на один кадр. Отсчёт идёт от первого
 * рендера в браузере, а не от начала загрузки модуля.
 */
const LAYERS = 7
/** Минимальное время показа, чтобы анимация успела прочитаться. */
const MIN_MS = 1250
/** Сколько длится плавное исчезновение, как в CSS. */
const FADE_MS = 640

export function Preloader({ done }: { done: boolean }) {
  const firstPaint = useRef<number | null>(null)
  const [gone, setGone] = useState(false)
  const [fading, setFading] = useState(false)

  // Засекаем момент, когда прелоадер реально попал в DOM
  useEffect(() => {
    if (firstPaint.current === null) firstPaint.current = performance.now()
  }, [])

  useEffect(() => {
    if (!done || gone) return
    const shownFor = performance.now() - (firstPaint.current ?? performance.now())
    const wait = Math.max(0, MIN_MS - shownFor)
    const t1 = window.setTimeout(() => setFading(true), wait)
    const t2 = window.setTimeout(() => setGone(true), wait + FADE_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [done, gone])

  if (gone) return null

  return (
    <div
      className={'preloader' + (fading ? ' out' : '')}
      role="status"
      aria-live="polite"
      aria-label="Загрузка пульта"
    >
      <div className="pl-tunnel" aria-hidden>
        {Array.from({ length: LAYERS }, (_, i) => (
          <span
            className="pl-layer"
            key={i}
            style={{ '--i': i, '--n': LAYERS } as CSSProperties}
          >
            <i /><i /><i /><i />
          </span>
        ))}
      </div>

      <div className="pl-core">
        <div className="pl-mark">П</div>
        <div className="pl-word">Пульт</div>
        <div className="pl-bar"><i /></div>
        <div className="pl-note">вхожу в день</div>
      </div>
    </div>
  )
}
