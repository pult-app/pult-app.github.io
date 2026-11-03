import { days, today } from '../../lib/dates'
import type { PultData } from '../../lib/types'

interface Props {
  data: PultData
  onOpenWork: (id: string) => void
}

export function StudyWidget({ data, onOpenWork }: Props) {
  const t = today()
  const works = data.works
    .filter(w => w.status !== 'submitted')
    .sort((a, b) => {
      const da = a.deadline ? days(t, a.deadline) : 999
      const db = b.deadline ? days(t, b.deadline) : 999
      return da - db
    })
    .slice(0, 3)

  if (!works.length) {
    return <div className="widget-empty">Работ нет.</div>
  }

  return (
    <div className="widget-rows">
      {works.map(w => {
        const n = w.deadline ? days(t, w.deadline) : null
        const tone = n !== null && n <= 0 ? 'hot' : n !== null && n <= 3 ? 'warn' : undefined
        return (
          <div key={w.id} className="widget-row" onClick={() => onOpenWork(w.id)}>
            <span className={'wlead' + (tone ? ' ' + tone : '')}>
              {n !== null ? (n < 0 ? '−' + -n + ' дн' : n === 0 ? 'сегодня' : n + ' дн') : '—'}
            </span>
            <div className="wbody">
              <div className="wtitle">{w.title}</div>
              <div className="wsub">{w.discipline?.name}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}