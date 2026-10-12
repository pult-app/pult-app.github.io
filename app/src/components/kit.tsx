import { useId, useState, type ReactNode } from 'react'
import { Icons } from './icons'

// Общие кирпичики экранов: сворачиваемый блок, строка списка, переключатель.
// Правила (редизайн 12.10): один факт живёт в одном месте, всё, что показано строкой, нажимается и ведёт дальше,
// второстепенное сворачивается, а в свёрнутом заголовке остаётся короткая сводка.

const FOLD_KEY = 'pult-fold:'
const readFold = (id: string, fallback: boolean) => {
  try { const v = localStorage.getItem(FOLD_KEY + id); return v === null ? fallback : v === '1' } catch { return fallback }
}

/** Сворачиваемый блок. Состояние помнится на устройстве; в свёрнутом заголовке остаётся `meta` (число, сумма, статус). */
export function Fold({ id, title, meta, defaultOpen = true, card = false, children }: {
  id: string; title: string; meta?: ReactNode; defaultOpen?: boolean; card?: boolean; children: ReactNode
}) {
  const [open, setOpen] = useState(() => readFold(id, defaultOpen))
  const rid = useId()
  const toggle = () => setOpen(o => {
    try { localStorage.setItem(FOLD_KEY + id, o ? '0' : '1') } catch { /* память недоступна: состояние живёт до перезагрузки */ }
    return !o
  })
  return (
    <section className={'fold' + (card ? ' card' : '') + (open ? ' open' : '')}>
      <h2 className="fold-h">
        <button type="button" className="fold-head" aria-expanded={open} aria-controls={rid} onClick={toggle}>
          <span className="fold-title">{title}</span>
          {meta !== undefined && meta !== '' && <span className="fold-meta">{meta}</span>}
          <i className="fold-chev" aria-hidden>{Icons.chev}</i>
        </button>
      </h2>
      <div id={rid} className="fold-body" inert={!open}>
        <div className="fold-in">{children}</div>
      </div>
    </section>
  )
}

/** Строка списка: нажимается целиком (отдельная кнопка-действие справа не вложена в основную). */
export function ListRow({ avatar, lead, leadTone, title, sub, trail, onOpen, action, past, className }: {
  avatar?: ReactNode; lead?: ReactNode; leadTone?: 'hot' | 'warn' | 'ok'; title: ReactNode; sub?: ReactNode; trail?: ReactNode
  onOpen?: () => void; action?: ReactNode; past?: boolean; className?: string
}) {
  const body = (
    <>
      {avatar}
      {lead !== undefined && <span className={'lead' + (leadTone ? ' ' + leadTone : '')}>{lead}</span>}
      <span className="tx"><b>{title}</b>{sub && <span>{sub}</span>}</span>
      {trail !== undefined && <span className="trail">{trail}</span>}
      {onOpen && <i className="chev" aria-hidden>{Icons.chev}</i>}
    </>
  )
  return (
    <div className={'lrow' + (avatar ? ' has-av' : '') + (past ? ' past' : '') + (className ? ' ' + className : '')}>
      {onOpen ? <button type="button" className="hit" onClick={onOpen}>{body}</button> : <div className="hit">{body}</div>}
      {action}
    </div>
  )
}

/** Переключатель режимов внутри экрана или карточки. */
export function Segmented<T extends string>({ value, options, onPick, label }: {
  value: T; options: { id: T; label: ReactNode }[]; onPick: (v: T) => void; label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => <button key={o.id} type="button" className="chip" aria-pressed={value === o.id} onClick={() => onPick(o.id)}>{o.label}</button>)}
    </div>
  )
}

/** Круг с первой буквой названия: опорная точка для глаза в списках компаний и сервисов. */
export function Avatar({ name, tone = 'wait' }: { name: string; tone?: 'wait' | 'action' | 'win' | 'closed' }) {
  return <span className={'av ' + tone} aria-hidden>{(name.trim().charAt(0) || '·').toUpperCase()}</span>
}
