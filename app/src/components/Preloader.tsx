import { useEffect, useRef, useState } from 'react'

/**
 * Прелоадер: сборка интерфейса из света.
 *
 * Идея: экран не «ждёт», а собирается. По полю плывут мягкие световые пятна,
 * из центра расходятся тонкие кольца, а в середине проявляется знак с живым
 * ореолом. Внизу бежит световая полоса с градиентом фиолетовый-янтарь.
 *
 * Держится минимум MIN_MS от первого рендера: иначе мелькает на один кадр.
 */
const MIN_MS = 1400
const FADE_MS = 620

export function Preloader({ done }: { done: boolean }) {
  const firstPaint = useRef<number | null>(null)
  const [gone, setGone] = useState(false)
  const [fading, setFading] = useState(false)

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
      {/* Световое поле: большие мягкие пятна, медленно дышат */}
      <div className="pl-aurora" aria-hidden>
        <i /><i /><i />
      </div>

      {/* Кольца расходятся от центра, как круги по воде */}
      <div className="pl-ripples" aria-hidden>
        <i /><i /><i /><i />
      </div>

      <div className="pl-core">
        {/* Ореол под знаком: живой, дышит */}
        <div className="pl-halo" aria-hidden />

        <div className="pl-mark">
          <span>П</span>
          <span className="pl-sheen" aria-hidden />
        </div>

        <div className="pl-word">Пульт</div>

        <div className="pl-bar" aria-hidden>
          <i />
        </div>

        <div className="pl-note">собираю день</div>
      </div>
    </div>
  )
}
