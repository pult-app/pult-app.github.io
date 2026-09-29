import { flushSync } from 'react-dom'

// Мелкие механики «как в нативном приложении»: тосты, вибро-отклик, переходы между экранами.

export interface ToastMsg { text: string; action?: { label: string; run: () => void } }

/** Показать тост над таб-баром. С действием, например «Вернуть». */
export function toast(t: ToastMsg | string) {
  window.dispatchEvent(new CustomEvent<ToastMsg>('pult-toast', { detail: typeof t === 'string' ? { text: t } : t }))
}

/** Короткий отклик вибрацией там, где он есть (Android). iOS в вебе вибрацию не даёт. */
export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms) } catch { /* нет вибрации */ }
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

let scrollAnim = 0
/** Плавный подъём к началу экрана (как тап по активной вкладке в iOS): быстрый старт, мягкое торможение,
 *  длительность растёт с расстоянием; любое касание, колесо или клавиша сразу отдают управление пальцу. */
export function scrollToTop() {
  cancelAnimationFrame(scrollAnim)
  const from = window.scrollY
  if (from <= 0) return
  if (reduced()) { window.scrollTo(0, 0); return }
  const dur = Math.min(650, 260 + from * 0.18)
  const t0 = performance.now()
  const ease = (x: number) => 1 - Math.pow(1 - x, 4)
  const stop = () => { cancelAnimationFrame(scrollAnim); off() }
  const off = () => ['touchstart', 'wheel', 'keydown'].forEach(e => window.removeEventListener(e, stop))
  ;['touchstart', 'wheel', 'keydown'].forEach(e => window.addEventListener(e, stop, { passive: true, once: true }))
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / dur)
    window.scrollTo(0, Math.round(from * (1 - ease(p))))
    if (p < 1) scrollAnim = requestAnimationFrame(step); else off()
  }
  scrollAnim = requestAnimationFrame(step)
}

let navTimer = 0
/** Смена экрана вперёд или назад. Новый экран въезжает CSS-анимацией при появлении (html[data-nav]).
 *  View Transitions больше не используем: они блокируют касания на время анимации, а Safari
 *  оставлял снимок плавающего таб-бара посреди экрана. Эта анимация не мешает нажимать и прерывается сама. */
export function transition(fn: () => void, dir: 'fwd' | 'back' | 'tab' = 'tab') {
  clearTimeout(navTimer)
  document.documentElement.dataset.nav = dir
  flushSync(fn)
  navTimer = window.setTimeout(() => { delete document.documentElement.dataset.nav }, 450)
}
