import { useEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Прелоадер «сборка дашборда».
 *
 * Не отдельная сцена, а каркас самого интерфейса. Блоков немного и они крупные:
 * силуэт читается сразу, без дробления на мелкую плитку. Появление быстрое,
 * а в конце каркас проваливается в глубину - камера уходит внутрь экрана
 * и на его месте остаётся живой дашборд.
 */
const MIN_MS = 1250
/* Каркас уходит вглубь столько же, сколько всходит контент: движения
   идут навстречу и не обрываются на снятии. */
const FADE_MS = 720

/** Крупные блоки: четыре зоны вместо пятнадцати плиток.
 *  Смещения по вертикали и разные пропорции ломают шаблонную сетку. */
const BLOCKS: { w: 2 | 3 | 4 | 6; h: number; top?: number; tilt?: number }[] = [
  { w: 6, h: 150 },              // баннер
  { w: 4, h: 300, top: -18 },    // большой график, чуть выше линии
  { w: 2, h: 268, top: 14, tilt: 1.2 }, // узкий блок справа, со своим ритмом
  { w: 3, h: 240, tilt: -0.8 },  // аналитика
  { w: 3, h: 196, top: 22 },     // статусы ниже - лестница ломает ряд
  { w: 2, h: 210 },
  { w: 2, h: 210, top: 10 },
  { w: 2, h: 210 },
  { w: 4, h: 260, top: -12, tilt: 0.7 },
  { w: 2, h: 236, top: 18 },
  { w: 6, h: 200 },
]

export function Preloader({ done, onGone }: { done: boolean; inline?: boolean; onGone?: () => void }) {
  const firstPaint = useRef<number | null>(null)
  const [gone, setGone] = useState(false)
  const [sinking, setSinking] = useState(false)

  useEffect(() => {
    if (firstPaint.current === null) firstPaint.current = performance.now()
  }, [])

  useEffect(() => {
    if (!done || gone) return
    const shownFor = performance.now() - (firstPaint.current ?? performance.now())
    const wait = Math.max(0, MIN_MS - shownFor)
    // Сигнал идёт ЗАРАНЕЕ: контент начинает всплывать, пока каркас ещё
    // только уходит вглубь. Так камера идёт одним движением, без паузы.
    const lead = 140
    const t0 = window.setTimeout(() => onGone?.(), Math.max(0, wait - lead))
    const t1 = window.setTimeout(() => setSinking(true), wait)
    const t2 = window.setTimeout(() => setGone(true), wait + FADE_MS)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2) }
  }, [done, gone, onGone])

  if (gone) return null

  return (
    <div
      className={'preloader' + (sinking ? ' out' : '')}
      role="status"
      aria-live="polite"
      aria-label="Загрузка пульта"
    >
      <div className="pl-aurora" aria-hidden>
        <i /><i /><i />
      </div>

      {/* Каркас: перспектива задаёт проваливание в глубину */}
      <div className="pl-frame" aria-hidden>
        <div className="pl-island">
          <i /><i /><i /><i /><i /><i /><i />
        </div>

        <div className="pl-grid">
          {BLOCKS.map((b, i) => (
            <div
              className={'pl-card w-' + b.w}
              key={i}
              style={{
                '--i': i,
                height: b.h,
                marginTop: b.top ?? 0,
                '--tilt': (b.tilt ?? 0) + 'deg',
              } as CSSProperties}
            >
              <span className="pl-card-glow" />
            </div>
          ))}
        </div>
      </div>

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
