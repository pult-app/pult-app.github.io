export type ThemeMode = 'light' | 'dark'
const KEY = 'pult-theme'

/** Сохранённая тема; при первом запуске берём тему системы. Режима «как в системе» больше нет (решение Германа 29.09). */
export function readTheme(): ThemeMode {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v } catch { /* пусто */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Проставить data-theme до первого рендера, чтобы не мигало. */
export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', mode === 'dark' ? '#0B0B0C' : '#F1F0EE'))
}
