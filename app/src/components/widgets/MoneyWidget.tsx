import { useMemo, type CSSProperties } from 'react'
import { days, fmtDate, fmtDow, today } from '../../lib/dates'
import { fmtMoney, groupSubs, summarize, upcoming } from '../../lib/billing'
import type { PultData } from '../../lib/types'

// «Деньги»: ближайшие списания как прогресс-бары (референс Savings & Goals).
// Полоса = сколько осталось до списания внутри периода напоминания.

interface Props {
  data: PultData
  onOpenSub: (id: string) => void
}

const CAT_COLOR: Record<string, string> = {
  ai: '#8E7CF0', cloud: '#3FA7D6', media: '#E26A8D', software: '#4FBF9F',
  telecom: '#E0A63A', education: '#6C8BEF', games: '#B86AE0', other: '#9A9A9F',
}

export function MoneyWidget({ data, onOpenSub }: Props) {
  const t = today()
  const sum = useMemo(() => summarize(data.subscriptions, t), [data.subscriptions, t])
  const groups = useMemo(() => groupSubs(data.subscriptions, t), [data.subscriptions, t])
  const soon = useMemo(() => upcoming(data.subscriptions, t, 30).slice(0, 4), [data.subscriptions, t])

  if (!data.moneyReady) {
    return (
      <div className="chart-empty small">
        <div className="ce-ring"><i /><i /><i /></div>
        <div className="ce-text"><b>Подписки не подключены</b><span>нужна миграция базы</span></div>
      </div>
    )
  }

  if (!data.subscriptions.length) {
    return (
      <div className="chart-empty small">
        <div className="ce-ring"><i /><i /><i /></div>
        <div className="ce-text"><b>Подписок нет</b><span>добавь, и пульт напомнит о списании</span></div>
      </div>
    )
  }

  const nc = sum.nextCharge
  const monthly = sum.month?.[sum.primary] ?? 0
  const soonTotal = groups.soon.reduce((a, x) => a + x.sub.amount, 0)

  return (
    <div className="money2">
      <div className="chart-head">
        <div className="chart-figure">
          <b>{nc ? fmtDate(nc.date) : '—'}</b>
          <span>{nc ? nc.sub.name : 'ближайшее списание'}</span>
        </div>
        <div className="chart-side">
          <div className="chart-delta">{nc ? fmtMoney(nc.sub.amount, nc.sub.currency) : '—'}</div>
          <div className="chart-delta-note">
            {nc ? 'через ' + days(t, nc.date) + ' дн' : 'нет'}
          </div>
        </div>
      </div>

      <div className="sub-list">
        {soon.map((s, i) => {
          const d = days(t, s.date)
          // Чем ближе списание, тем полнее полоса
          const fill = Math.max(6, Math.min(100, ((30 - d) / 30) * 100))
          const col = CAT_COLOR[s.sub.category] ?? '#9A9A9F'
          return (
            <button key={s.sub.id} type="button" className="sub-row" onClick={() => onOpenSub(s.sub.id)}>
              <span className="sr-dot" style={{ background: col }} />
              <span className="sr-body">
                <span className="sr-top">
                  <span className="sr-name">{s.sub.name}</span>
                  <span className="sr-amt">{fmtMoney(s.sub.amount, s.sub.currency)}</span>
                </span>
                <span className="sr-track">
                  <i style={{ width: fill + '%', background: col, '--i': i } as CSSProperties} />
                </span>
              </span>
              <span className={'sr-day' + (d <= 3 ? ' hot' : d <= 7 ? ' warn' : '')}>
                {d === 0 ? 'сегодня' : fmtDow(s.date) + ' ' + fmtDate(s.date)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="chart-foot">
        <span className="cf-item">в месяц <b>{fmtMoney(monthly, sum.primary)}</b></span>
        <span className="cf-day">за 30 дней {fmtMoney(soonTotal, sum.primary)}</span>
      </div>
    </div>
  )
}
