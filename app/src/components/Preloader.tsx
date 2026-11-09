import { useEffect, useState, type CSSProperties } from 'react'

/**
 * Прелоадер: полёт сквозь слои в глубину.
 *
 * Вместо вращающихся колец - ощущение погружения: рамки-плашки летят из
 * точки схода на зрителя, растут и растворяются. В центре держится знак,
 * внизу заполняется полоса. Так экран не «ждёт», а втягивает внутрь.
 *
 * Гаснет, когда приложение собрало данные.
 */
const LAYERS = 7

export function Preloader({ done }: { done: boolean }) {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setGone(true), 720)
    return () => clearTimeout(t)
  }, [done])

  if (gone) return null

  return (
    <div className={'preloader' + (done ? ' out' : '')} role="status" aria-live="polite" aria-label="Загрузка пульта">
      {/* Туннель: слои уходят вглубь и летят на зрителя */}
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
