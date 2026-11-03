import { today, toLocalDate, nowHM } from '../../lib/dates'
import { LESSON_TYPES, lessonsFor, nextStudyDay } from '../../lib/schedule'
import type { PultData } from '../../lib/types'

// «Пары»: таймлайн дня. Текущая пара подсвечена и показывает остаток,
// прошедшие приглушены, у следующей видно, сколько ждать.

interface Props {
  data: PultData
}

/** Минуты из «ЧЧ:ММ». */
const mins = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

const human = (m: number) => (m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч ' + (m % 60 ? (m % 60) + ' мин' : '').trim())

export function LessonsWidget({ data }: Props) {
  const t = today()
  const hm = nowHM()
  const dt = toLocalDate(t)
  if (!data.schedule) {
    return (
      <div className="chart-empty small">
        <div className="ce-ring"><i /><i /><i /></div>
        <div className="ce-text"><b>Расписание не загружено</b><span>агент подтянет его при следующем прогоне</span></div>
      </div>
    )
  }

  const { slots } = lessonsFor(data.schedule.payload, dt)

  if (!slots.length) {
    const nx = nextStudyDay(data.schedule.payload, dt)
    const away = nx ? Math.max(0, Math.round((nx.date.getTime() - dt.getTime()) / 864e5)) : 0
    return (
      <div className="tl-empty">
        <div className="tl-dot" />
        <div className="tl-text">
          <b>Пар сегодня нет</b>
          <span>
            {nx
              ? (away === 0 ? 'следующая сегодня' : 'следующая ' + nx.date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })) + ', в ' + nx.first
              : 'дальше расписания в базе нет'}
          </span>
        </div>
      </div>
    )
  }

  const now = mins(hm)
  const total = slots.length

  return (
    <div className="timeline">
      {slots.map(s => {
        const from = mins(s.time[0])
        const to = mins(s.time[1])
        const cur = now >= from && now <= to
        const past = now > to
        const soon = !cur && !past && from - now <= 60
        const left = cur ? to - now : !cur && !past ? from - now : 0
        return (
          <div key={s.index} className={'tl-row' + (cur ? ' now' : past ? ' past' : soon ? ' soon' : '')}>
            <div className="tl-rail">
              <span className="tl-time">{s.time[0]}</span>
              <span className="tl-line"><i /></span>
            </div>
            <div className="tl-body">
              {s.lessons.map((l, k) => (
                <div className="tl-item" key={k}>
                  <span className="tl-subj">{l.subject}</span>
                  <span className="tl-meta">
                    {[LESSON_TYPES[l.type] || l.type, l.room ? 'ауд. ' + l.room : '', s.lessons.length > 1 ? 'подгр. ' + (k + 1) : ''].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
              {(cur || soon) && left > 0 && (
                <span className={'tl-badge' + (cur ? ' now' : ' soon')}>
                  {cur ? 'идёт · ' + human(left) : 'через ' + human(left)}
                </span>
              )}
            </div>
          </div>
        )
      })}
      <div className="tl-foot">
        <span>{total} {total === 1 ? 'пара' : total < 5 ? 'пары' : 'пар'}</span>
        <span>{slots[0].time[0]} - {slots[slots.length - 1].time[1]}</span>
      </div>
    </div>
  )
}
