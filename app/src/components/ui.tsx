import type { CSSProperties, ReactNode } from 'react'

export function Chip<T extends string>(p: { id: T; value: T; onPick: (v: T) => void; children: ReactNode }) {
  return <button className="chip" aria-pressed={p.id === p.value} onClick={() => p.onPick(p.id)}>{p.children}</button>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

/** Цветная «таблетка» статуса как выпадающий список. */
export function PillSelect<T extends string>(p: {
  value: T; options: { id: T; label: string; c: string }[]; disabled?: boolean; label: string; onChange: (v: T) => void
}) {
  const cur = p.options.find(o => o.id === p.value) ?? p.options[0]
  const style = { '--pbg': `var(${cur.c}-bg)`, '--pc': `var(${cur.c})` } as CSSProperties
  return (
    <select className="pill" aria-label={p.label} style={style} value={p.value} disabled={p.disabled}
      onChange={e => p.onChange(e.target.value as T)}>
      {p.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
}

export function Tag({ c, children }: { c?: string; children: ReactNode }) {
  const style = c ? ({ '--pbg': `var(${c}-bg)`, '--pc': `var(${c})` } as CSSProperties) : undefined
  return <span className="tag" style={style}>{children}</span>
}
