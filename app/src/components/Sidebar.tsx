import { type ReactNode } from 'react'
import { Icons } from './icons'
import type { Tab, Screen } from '../App'

interface Props {
  tab: Tab | Screen | 'dashboard'
  badges: Partial<Record<string, number>>
  statusCls: string
  statusText: string
  loaded: string
  onPick: (id: Tab | Screen | 'dashboard') => void
}

const ITEMS: { id: Tab | Screen | 'dashboard'; icon: ReactNode; label: string }[] = [
  { id: 'dashboard', icon: Icons.today, label: 'Дашборд' },
  { id: 'funnel', icon: Icons.funnel, label: 'Воронка' },
  { id: 'inbox', icon: Icons.inbox, label: 'Письма' },
  { id: 'study', icon: Icons.study, label: 'Учёба' },
  { id: 'money', icon: Icons.money, label: 'Деньги' },
  { id: 'insights', icon: Icons.chart, label: 'Цифры' },
  { id: 'settings', icon: Icons.settings, label: 'Настройки' },
]

export function Sidebar({ tab, badges, statusCls, statusText, loaded, onPick }: Props) {
  const activeIndex = Math.max(0, ITEMS.findIndex(x => x.id === tab))

  return (
    <nav className="sidebar glass-sidebar">
      <div className="sidebar-top">
        <span className="sidebar-lens" aria-hidden style={{ transform: `translateY(${activeIndex * 52}px)` }} />
        {ITEMS.map(item => (
          <button
            key={item.id}
            className={'sidebar-btn' + (tab === item.id ? ' active' : '')}
            onClick={() => onPick(item.id)}
            aria-label={item.label}
            aria-current={tab === item.id ? 'page' : undefined}
            title={item.label}
          >
            {item.icon}
            <span className="sb-label" aria-hidden>{item.label}</span>
            {badges[item.id] ? <span className="sb-badge">{badges[item.id]}</span> : null}
          </button>
        ))}
      </div>

      <div className="sidebar-status">
        <div className={'sidebar-dot' + (statusCls ? ' ' + statusCls : '')} />
        <div className="sidebar-time">{loaded}</div>
        <div className="sidebar-time">{statusText}</div>
      </div>
    </nav>
  )
}