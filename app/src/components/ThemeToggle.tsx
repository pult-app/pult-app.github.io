import { useState, type ReactElement } from 'react'

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

const ICON: Record<ThemeMode, ReactElement> = {
  light: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  dark: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>,
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(readTheme)
  const next = () => {
    const m: ThemeMode = mode === 'dark' ? 'light' : 'dark'
    // Смена темы без резкой вспышки: цвета перетекают за 0,3 с (Apple: избегать резких скачков яркости).
    const root = document.documentElement
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-fade')
      window.setTimeout(() => root.classList.remove('theme-fade'), 350)
    }
    setMode(m); applyTheme(m)
    try { localStorage.setItem(KEY, m) } catch { /* пусто */ }
  }
  const label = mode === 'dark' ? 'Тёмная тема. Нажми для светлой' : 'Светлая тема. Нажми для тёмной'
  return <button className="icon-btn" onClick={next} title={label} aria-label={label}>{ICON[mode]}</button>
}
