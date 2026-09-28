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

/** Смена экрана через View Transitions: вперёд, назад или просто сменой вкладки. */
export function transition(fn: () => void, dir: 'fwd' | 'back' | 'tab' = 'tab') {
  const d = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
  if (!d.startViewTransition || reduced()) { fn(); return }
  document.documentElement.dataset.dir = dir
  const vt = d.startViewTransition(() => flushSync(fn))
  vt.finished.finally(() => { delete document.documentElement.dataset.dir })
}
