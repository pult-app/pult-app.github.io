import { useState } from 'react'
import { days, fmtDate, fmtDow, leftLabel, today } from '../../lib/dates'
import { agenda, companyName, nextStep, staleCount, TASK_KINDS, type AgendaItem } from '../../lib/domain'
import type { PultData } from '../../lib/types'
import type { Go } from '../../App'

interface Props {
  data: PultData
  goto: Go
  onOpenItem: (x: AgendaItem) => void
}

const HOT_CAP = 6

function when(x: AgendaItem, t: string): { text: string; tone?: 'hot' | 'warn' } {
  const n = days(t, x.date)
  if (n < 0) return { text: '−' + -n + ' дн', tone: 'hot' }
  if (n === 0) return { text: x.time ?? 'день', tone: 'warn' }
  if (n === 1) return { text: 'завтра', tone: 'warn' }
  return { text: fmtDate(x.date) }
}

export function HotWidget({ data, goto, onOpenItem }: Props) {
  const t = today()
  const items = agenda(data, t)
  // Событие, которое уже стоит в Hero, здесь не повторяем: два блока про одну
  // и ту же вакансию с одинаковым текстом читались как ошибка вёрстки.
  const hero = nextStep(data, t)
  const heroId = hero?.v.id
  const heroCo = hero ? companyName(hero.v) : ''
  const isHero = (x: AgendaItem) =>
    !!hero && (x.ref === heroId || (x.kind === 'career' && x.title.startsWith(heroCo + ':')))

  // Просрочку ограничиваем неделей. Всё старше - архив: оно заваливало «Горит»
  // строками на −40 и −48 дней, и блок читался как свалка, а не как «что горит».
  const LATE_DAYS = 7
  const isRecent = (x: AgendaItem) => days(t, x.date) >= -LATE_DAYS
  const hot = items.filter(x => days(t, x.date) <= 3 && isRecent(x) && !isHero(x))
  const oldLate = items.filter(x => days(t, x.date) < -LATE_DAYS && !isHero(x)).length
  const later = items.filter(x => { const n = days(t, x.date); return n > 3 && n <= 14 })
  const stale = staleCount(data, t)
  const dueCards = data.cards.filter(c => c.due_on <= t).length
  const [all, setAll] = useState(false)
  const shown = all ? hot : hot.slice(0, HOT_CAP)
  const hotCount = hot.length + (stale ? 1 : 0) + (dueCards ? 1 : 0)

  return (
    <div className="widget-rows">
      {stale > 0 && (
        <div className="widget-row" onClick={() => goto('funnel', { ftab: 'wait' })}>
          <span className="wlead hot">7+ дн</span>
          <div className="wbody"><div className="wtitle">Пора напомнить о себе</div><div className="wsub">{stale} {stale === 1 ? 'отклик' : 'откликов'} без ответа</div></div>
        </div>
      )}
      {shown.map((x, i) => {
        const w = when(x, t)
        return (
          <div key={'wh' + i} className={'widget-row' + (days(t, x.date) < 0 ? ' is-late' : '')} onClick={() => { if (x.goto) onOpenItem(x) }}>
            <span className={'wlead' + (w.tone ? ' ' + w.tone : '')}>{w.text}</span>
            <div className="wbody">
              <div className="wtitle">{x.title}</div>
              <div className="wsub">{[days(t, x.date) < 0 ? 'просрочено' : days(t, x.date) >= 2 ? leftLabel(days(t, x.date)) : '', TASK_KINDS[x.kind]].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        )
      })}
      {dueCards > 0 && (
        <div className="widget-row" onClick={() => goto('study', { cards: true })}>
          <span className="wlead warn">день</span>
          <div className="wbody"><div className="wtitle">{dueCards} карточек на повтор</div><div className="wsub">5 минут, пока едешь</div></div>
        </div>
      )}
      {hotCount === 0 && <div className="widget-empty">Срочного нет.</div>}
      {!all && hot.length > HOT_CAP && (
        <button className="linkbtn" onClick={() => setAll(true)} style={{ padding: '4px 8px', marginTop: 4 }}>Показать ещё ({hot.length - HOT_CAP})</button>
      )}

      {later.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="widget-head" style={{ marginBottom: 4 }}>
            <h3>Дальше, 14 дней</h3>
            <span className="meta">{later.length}</span>
          </div>
          {later.slice(0, 3).map((x, i) => (
            <div key={'wl' + i} className="widget-row" onClick={() => { if (x.goto) onOpenItem(x) }}>
              <span className="wlead">{fmtDate(x.date)}</span>
              <div className="wbody"><div className="wtitle">{x.title}</div><div className="wsub">{fmtDow(x.date)} · {TASK_KINDS[x.kind]}</div></div>
            </div>
          ))}
          {later.length > 3 && <div className="widget-row"><div className="wbody"><div className="wsub">…и ещё {later.length - 3}</div></div></div>}
        </div>
      )}

      {/* Старая просрочка не в «Горит»: это архив, он только мешает смотреть на срочное */}
      {oldLate > 0 && (
        <div className="hot-archive" onClick={() => goto('funnel', { ftab: 'wait' })}>
          <span>{oldLate} {oldLate === 1 ? 'старое' : 'старых'} просрочено больше недели</span>
          <span className="hot-archive-go">в воронку</span>
        </div>
      )}
    </div>
  )
}