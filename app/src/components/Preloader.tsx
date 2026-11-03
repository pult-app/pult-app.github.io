import { useEffect, useState } from 'react'

/**
 * Прелоадер: три кольца с разной скоростью и заполняющаяся полоса.
 * Гаснет, когда приложение собрало данные, и снимает себя с экрана.
 */
export function Preloader({ done }: { done: boolean }) {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setGone(true), 680)
    return () => clearTimeout(t)
  }, [done])

  if (gone) return null

  return (
    <div className={'preloader' + (done ? ' out' : '')} role="status" aria-live="polite" aria-label="Загрузка пульта">
      <div className="pl-mark">
        <svg viewBox="0 0 120 120" aria-hidden>
          <circle className="pl-ring pl-r1" cx="60" cy="60" r="48" />
          <circle className="pl-ring pl-r2" cx="60" cy="60" r="35" />
          <circle className="pl-ring pl-r3" cx="60" cy="60" r="22" />
        </svg>
        <span className="pl-core" />
      </div>
      <div className="pl-word">Пульт</div>
      <div className="pl-bar"><i /></div>
      <div className="pl-note">собираю день</div>
    </div>
  )
}
