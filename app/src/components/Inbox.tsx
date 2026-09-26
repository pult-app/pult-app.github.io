import { useState } from 'react'
import { fmtDate } from '../lib/dates'
import { companyName, KINDS } from '../lib/domain'
import type { PultData } from '../lib/types'
import { Chip, Empty, Tag } from './ui'

export function Inbox({ data, canWrite, onDone }: { data: PultData; canWrite: boolean; onDone: (id: string, done: boolean) => Promise<void> }) {
  const [filter, setFilter] = useState<'open' | 'all' | 'ack'>('open')
  const rows = data.messages
    .filter(m => filter === 'all' ? true : filter === 'ack' ? m.kind === 'ack' : !m.is_done && m.kind !== 'ack')
    .sort((a, b) => b.received_at.localeCompare(a.received_at))
  return (
    <section className="panel">
      <div className="filters">
        <Chip id="open" value={filter} onPick={setFilter}>Ждут действия</Chip>
        <Chip id="all" value={filter} onPick={setFilter}>Все письма</Chip>
        <Chip id="ack" value={filter} onPick={setFilter}>Автоответы</Chip>
      </div>
      <section className="list">
        {rows.length === 0 ? <Empty>{filter === 'open' ? 'Всё разобрано.' : 'Писем пока нет.'}</Empty> : rows.map(m => {
          const k = KINDS[m.kind] ?? KINDS.info
          return (
            <div key={m.id} className={'mail' + (m.is_done ? ' done' : '')}>
              <span className="d">{fmtDate(m.received_at.slice(0, 10))}</span>
              <div className="body">
                <div className="top"><b>{companyName(m)}</b><Tag c={k.c}>{k.label}</Tag>{m.deadline && !m.is_done && <span className="flag">до {fmtDate(m.deadline)}</span>}</div>
                <div className="subj">{m.sender ?? ''}{m.subject ? ' · «' + m.subject + '»' : ''}</div>
                <div className="sum">{m.summary}</div>
                {m.action && <div className="act">{m.action}</div>}
              </div>
              {canWrite && m.kind !== 'ack'
                ? <button className="btn ghost small" onClick={() => onDone(m.id, !m.is_done)}>{m.is_done ? 'Вернуть' : 'Сделано'}</button>
                : <span />}
            </div>)
        })}
      </section>
      <p className="note">Сюда Claude кладёт ответы компаний с почты и hh.ru: кто написал, суть и что сделать.</p>
    </section>
  )
}
