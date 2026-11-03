import { useMemo } from 'react'
import { fmtDate, today } from '../../lib/dates'
import { funnelTab } from '../../lib/domain'
import { fmtMoney, summarize } from '../../lib/billing'
import { weekCount, WEEK_GOAL } from '../../lib/insights'
import { useCountUp } from '../../lib/motion'
import type { PultData } from '../../lib/types'
import type { Go } from '../../App'

interface Props {
  data: PultData
  goto: Go
}

export function PulseWidget({ data, goto }: Props) {
  const t = today()
  const week = weekCount(data, t)
  const sel = data.vacancies.filter(v => funnelTab(v) === 'sel').length
  const wait = data.vacancies.filter(v => funnelTab(v) === 'wait').length
  const sum = useMemo(() => summarize(data.subscriptions, t), [data.subscriptions, t])
  const nc = sum.nextCharge

  const weekN = useCountUp(week)
  const selN = useCountUp(sel, 620)
  const waitN = useCountUp(wait, 620)

  return (
    <div className="widget-pulse">
      <button className={'ptile ' + (week >= WEEK_GOAL ? 'win' : '')} onClick={() => goto('insights')}>
        <b>{weekN}<em>/{WEEK_GOAL}</em></b>
        <span>откликов за неделю</span>
      </button>
      <button className="ptile wait" onClick={() => goto('funnel', { ftab: sel ? 'sel' : 'wait' })}>
        <b>{selN}<em> · {waitN}</em></b>
        <span>в отборе · ждём</span>
      </button>
      {data.moneyReady && (nc
        ? <button className="ptile act" onClick={() => goto('money')}>
          <b>{fmtDate(nc.date)}</b>
          <span>{nc.sub.name} · {fmtMoney(nc.sub.amount, nc.sub.currency)}</span>
        </button>
        : <button className="ptile" onClick={() => goto('money')}>
          <b>+</b>
          <span>подписки</span>
        </button>)}
    </div>
  )
}