import { KINDS } from '../../lib/domain'
import { fmtDate } from '../../lib/dates'
import type { Message, PultData } from '../../lib/types'

// «Письма»: карточки-превью как в референсе Pipeline. Аватар компании,
// тип письма цветом, суть, действие и дата. Строка целиком открывает письмо.

const TONE: Record<string, string> = {
  invite: 'win',
  test: 'action',
  offer: 'win',
  question: 'action',
  reject: 'closed',
  ack: 'wait',
  info: 'wait',
}

interface Props {
  data: PultData
  onOpenMessage: (id: string) => void
  onDone?: (id: string, done: boolean) => void
}

export function InboxWidget({ data, onOpenMessage, onDone }: Props) {
  const active = data.messages
    .filter(m => !m.is_done && ['invite', 'test', 'offer', 'question'].includes(m.kind))
    .slice(0, 3)

  if (!active.length) {
    return (
      <div className="chart-empty small">
        <div className="ce-ring"><i /><i /><i /></div>
        <div className="ce-text">
          <b>Разобрано всё</b>
          <span>новых писем, ждущих действия, нет</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mail-list">
      {active.map(m => (
        <MailCard key={m.id} m={m} onOpen={() => onOpenMessage(m.id)}
          onDone={onDone ? () => onDone(m.id, true) : undefined} />
      ))}
    </div>
  )
}

function MailCard({ m, onOpen, onDone }: { m: Message; onOpen: () => void; onDone?: () => void }) {
  const name = m.company?.name || m.sender || 'Без компании'
  const initial = (name.trim().charAt(0) || '·').toUpperCase()
  const tone = TONE[m.kind] ?? 'wait'
  const kind = KINDS[m.kind]?.label || m.kind

  return (
    <div className="mail-card" data-tone={tone}>
      <button type="button" className="mc-hit" onClick={onOpen} aria-label={`Письмо: ${name}, ${kind}`}>
        <span className="mc-av" aria-hidden>{initial}</span>
        <span className="mc-body">
          <span className="mc-top">
            <span className="mc-name">{name}</span>
            <span className="mc-date">{fmtDate(m.received_at.slice(0, 10))}</span>
          </span>
          <span className="mc-sum">{m.summary}</span>
          <span className="mc-foot">
            <span className="mc-kind">{kind}</span>
            {m.action && <span className="mc-act">{m.action}</span>}
          </span>
        </span>
      </button>
      {onDone && (
        <button type="button" className="mc-done" onClick={onDone} title="Разобрано" aria-label={`Разобрано: ${name}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12l5 5 9-10" />
          </svg>
        </button>
      )}
    </div>
  )
}
