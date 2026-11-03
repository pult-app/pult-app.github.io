import { today } from '../../lib/dates'
import { companyName, nextStep } from '../../lib/domain'
import type { PultData } from '../../lib/types'
import type { Go } from '../../App'
import { Icons } from '../icons'

interface Props {
  data: PultData
  goto: Go
  onOpenVacancy: (id: string) => void
}

export function HeroWidget({ data, goto, onOpenVacancy }: Props) {
  const t = today()
  const x = nextStep(data, t)

  if (!x) {
    const waiting = data.vacancies.filter(v => v.status === 'applied' && !data.messages.some(m => m.vacancy_id === v.id && m.kind !== 'ack' && m.kind !== 'reject')).length
    return (
      <div className="widget-hero span2">
        <div className="kicker"><i className="calm" />СЛЕДУЮЩИЙ ШАГ</div>
        <div className="title">По поиску работы ничего не горит</div>
        <div className="text">Ждём ответов по {waiting} откликам. Новые письма Claude разберёт сам.</div>
        <div className="acts">
          <button className="hbtn ghost" onClick={() => goto('funnel')}>Открыть воронку</button>
        </div>
      </div>
    )
  }

  const { v, st } = x
  const co = companyName(v)

  return (
    <div className="widget-hero span2">
      <div className="kicker"><i className="pulse-dot" />СЛЕДУЮЩИЙ ШАГ</div>
      <div className="title">{co}: {st.label.charAt(0).toLowerCase() + st.label.slice(1)}</div>
      <div className="text">{v.next_step || st.hint}</div>
      <div className="acts">
        <button className="hbtn" onClick={() => onOpenVacancy(v.id)}>
          Открыть вакансию
          <span className="bicon">{Icons.arrow}</span>
        </button>
      </div>
    </div>
  )
}