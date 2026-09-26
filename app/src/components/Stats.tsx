import { days, fmtDate, today } from '../lib/dates'
import { companyName, followUps, KINDS, LIVE_KINDS, messagesFor } from '../lib/domain'
import type { PultData, Vacancy } from '../lib/types'
import { Empty } from './ui'

function channelOf(v: Vacancy) {
  const c = (v.channel ?? '').toLowerCase()
  if (c.includes('hh')) return 'hh.ru'
  if (c.includes('changellenge') || c.includes('mars-careers')) return 'Changellenge'
  if (c.includes('хабр') || c.includes('habr')) return 'Хабр Карьера'
  if (c.includes('fut')) return 'FutureToday'
  return 'Карьерные сайты компаний'
}

export function Stats({ data }: { data: PultData }) {
  const applied = data.vacancies.filter(v => v.status !== 'found' && v.status !== 'skip')
  const live = (v: Vacancy) => messagesFor(data.messages, v.id).some(m => LIVE_KINDS.has(m.kind))
  const responded = applied.filter(v => ['test', 'interview', 'offer', 'reject'].includes(v.status) || live(v))
  const positive = applied.filter(v => ['test', 'interview', 'offer'].includes(v.status))
  const pct = (a: number, b: number) => b ? Math.round(a * 100 / b) + '%' : '·'
  const by: Record<string, { n: number; r: number; p: number }> = {}
  for (const v of applied) {
    const c = channelOf(v); by[c] ??= { n: 0, r: 0, p: 0 }; by[c].n++
    if (responded.includes(v)) by[c].r++
    if (positive.includes(v)) by[c].p++
  }
  const rows = Object.entries(by).sort((a, b) => b[1].n - a[1].n)
  const max = Math.max(1, ...rows.map(r => r[1].n))
  const speed = applied.map(v => {
    const f = messagesFor(data.messages, v.id).find(m => LIVE_KINDS.has(m.kind))
    return f && v.applied_on ? { v, d: days(v.applied_on, f.received_at.slice(0, 10)), m: f } : null
  }).filter(x => x !== null).sort((a, b) => a.d - b.d)

  return (
    <section className="panel">
      <div className="kpis">
        {([[applied.length, 'подано'], [responded.length, 'живых ответов'], [pct(responded.length, applied.length), 'доля ответов'], [positive.length, 'тест или собес'], [followUps(data, today()).length, 'ждут напоминания']] as const)
          .map(([n, l]) => <div key={l} className="kpi"><span className="n">{n}</span><span className="l">{l}</span></div>)}
      </div>
      <div><h2>Каналы</h2><p className="sub">Откуда приходят ответы. Автоответ «заявка получена» ответом не считается.</p></div>
      <div className="table-wrap">
        {rows.length === 0 ? <Empty>Пока нет поданных откликов.</Empty> :
          <table><thead><tr><th>Канал</th><th className="num">Подано</th><th /><th className="num">Ответили</th><th className="num">Тест/собес</th><th className="num">Доля</th></tr></thead>
            <tbody>{rows.map(([c, v]) => <tr key={c}><td>{c}</td><td className="num">{v.n}</td><td><div className="bar" aria-hidden="true"><i style={{ width: Math.round(v.n * 100 / max) + '%' }} /></div></td><td className="num">{v.r}</td><td className="num">{v.p}</td><td className="num">{pct(v.r, v.n)}</td></tr>)}</tbody></table>}
      </div>
      <div><h2>Скорость</h2><p className="sub">Сколько дней прошло от подачи до первого живого ответа.</p></div>
      <div className="table-wrap">
        {speed.length === 0 ? <Empty>Живых ответов пока не было.</Empty> :
          <table><thead><tr><th>Компания</th><th>Первый ответ</th><th className="num">Дней</th></tr></thead>
            <tbody>{speed.map(x => <tr key={x.v.id}><td>{companyName(x.v)}</td><td>{KINDS[x.m.kind].label} · {fmtDate(x.m.received_at.slice(0, 10))}</td><td className="num">{x.d}</td></tr>)}</tbody></table>}
      </div>
    </section>
  )
}
