import { useState, type ReactElement } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
const KEY = 'pult-theme'
const ORDER: ThemeMode[] = ['system', 'light', 'dark']
const LABEL: Record<ThemeMode, string> = { system: 'Тема как в системе', light: 'Светлая тема', dark: 'Тёмная тема' }

export function readTheme(): ThemeMode {
  try { const v = localStorage.getItem(KEY) as ThemeMode | null; return v && ORDER.includes(v) ? v : 'system' } catch { return 'system' }
}

/** Проставить data-theme до первого рендера, чтобы не мигало. */
export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#0A1116' : '#DCE7EC'))
}

const ICON: Record<ThemeMode, ReactElement> = {
  system: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></svg>,
  light: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  dark: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>,
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(readTheme)
  const next = () => {
    const m = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
    setMode(m); applyTheme(m)
    try { localStorage.setItem(KEY, m) } catch { /* пусто */ }
  }
  return <button className="icon-btn" onClick={next} title={LABEL[mode] + '. Нажми, чтобы сменить'} aria-label={LABEL[mode]}>{ICON[mode]}</button>
}
