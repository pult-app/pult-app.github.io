import { useMemo, useState } from 'react'
import { today } from '../lib/dates'
import type { Flashcard, PultData } from '../lib/types'
import { Chip, Empty } from './ui'

export function Trainer({ data, canWrite, onGrade }: { data: PultData; canWrite: boolean; onGrade: (c: Flashcard, knew: boolean) => Promise<void> }) {
  const t = today()
  const [topic, setTopic] = useState('all')
  const [reveal, setReveal] = useState(false)
  const [pick, setPick] = useState(0)
  const due = data.cards.filter(c => c.due_on <= t)
  const list = useMemo(() => due.filter(c => topic === 'all' || c.topic === topic), [due, topic])
  const card = list.length ? list[pick % list.length] : null
  const topics = [...new Set(data.cards.map(c => c.topic))]

  const answer = async (knew: boolean) => {
    if (!card) return
    setReveal(false)
    setPick(Math.floor(Math.random() * 1000))
    await onGrade(card, knew)
  }

  return (
    <section className="panel">
      <div className="filters">
        <Chip id="all" value={topic} onPick={v => { setTopic(v); setReveal(false) }}>Все темы <span className="mono">{due.length}</span></Chip>
        {topics.map(x => <Chip key={x} id={x} value={topic} onPick={v => { setTopic(v); setReveal(false) }}>{x} <span className="mono">{due.filter(c => c.topic === x).length}</span></Chip>)}
      </div>
      <div className="flash">
        {!card ? <Empty>{data.cards.length ? 'На сегодня всё пройдено. Карточки вернутся по расписанию.' : 'Карточек пока нет.'}</Empty> : <>
          <span className="tag">{card.topic}</span>
          <div className="q">{card.question}</div>
          {reveal ? <>
            <div className="a">{card.answer}</div>
            <div className="acts">
              <button className="btn ok" disabled={!canWrite} onClick={() => answer(true)}>Знаю</button>
              <button className="btn bad" disabled={!canWrite} onClick={() => answer(false)}>Не знаю</button>
            </div>
          </> : <div className="acts"><button className="btn" onClick={() => setReveal(true)}>Показать ответ</button><span className="note">Сначала ответь вслух</span></div>}
        </>}
      </div>
      <div className="boxes">
        {[0, 1, 2, 3, 4].map(b => <span key={b}>{b === 0 ? 'новые' : 'уровень ' + b}: {data.cards.filter(c => c.box === b).length}</span>)}
        <span>осталось сегодня: {list.length}</span>
      </div>
      <p className="note">«Знаю» отодвигает вопрос на 1, 3, 7, 14 дней, «Не знаю» возвращает его завтра.</p>
    </section>
  )
}
