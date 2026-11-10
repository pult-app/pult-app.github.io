import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PultData, Vacancy, VacancyStatus } from '../lib/types'
import { days, fmtDate, today } from '../lib/dates'
import { companyName, KINDS, messagesFor, type AgendaItem } from '../lib/domain'
import { startDashboardMotion } from '../lib/motion'
import { morph } from '../lib/ux'
import type { Go, Tab, Screen } from '../App'
import { Sidebar } from './Sidebar'
import { Preloader } from './Preloader'
import { HeroWidget } from './widgets/HeroWidget'
import { PulseWidget } from './widgets/PulseWidget'
import { LessonsWidget } from './widgets/LessonsWidget'
import { HotWidget } from './widgets/HotWidget'
import { FunnelWidget } from './widgets/FunnelWidget'
import { InboxWidget } from './widgets/InboxWidget'
import { StudyWidget } from './widgets/StudyWidget'
import { MoneyWidget } from './widgets/MoneyWidget'
import { WeekRingWidget } from './widgets/WeekRingWidget'
import { HeatWidget } from './widgets/HeatWidget'
import { AreaChartWidget } from './widgets/AreaChartWidget'
import { OutcomesWidget } from './widgets/OutcomesWidget'
import { ChannelsWidget } from './widgets/ChannelsWidget'
import { SpeedWidget } from './widgets/SpeedWidget'

interface Props {
  data: PultData | null
  canWrite: boolean
  goto: Go
  status: { text: string; cls: string }
  loaded: string
  error: string
  onDismissError: () => void
  // Колбэки из App
  onStatus: (v: Vacancy, s: VacancyStatus) => Promise<void>
  onTaskDone: (id: string, done: boolean) => Promise<void>
  /** Разобрать письмо прямо из панели деталей, не уходя с дашборда. */
  onMessageDone?: (id: string, done: boolean) => void
  /** Отметить «напомнил HR» прямо из панели вакансии. */
  onFollowed?: (id: string) => void
  badges: Partial<Record<Tab, number>>
  // Для полноэкранных вкладок
  renderTab: (tab: Tab) => ReactNode
  renderScreen: (screen: Screen) => ReactNode
}

type View = 'dashboard' | Tab | Screen

/** Фоновый слой: четыре медленных цветовых орба, зерно и прожектор за курсором. */
const Backdrop = () => (
  <>
    <div className="dash-bg" aria-hidden><i /><i /><i /><i /><i /><i /></div>
    <span className="dash-spot" aria-hidden />
  </>
)

/** Деталь, открытая в DetailPane */
interface Detail {
  type: 'vacancy' | 'message' | 'work' | 'sub' | 'agenda'
  id: string
}

/** Панель с деталями вакансии (упрощённая версия для split-pane). */
function VacancyDetail({ data, id }: { data: PultData; id: string }) {
  const v = data.vacancies.find(x => x.id === id)
  if (!v) return null
  const co = companyName(v)
  const msgs = messagesFor(data.messages, v.id)
  const t = today()
  return (
    <div className="detail-inner">
      <div className="widget-head"><h3>{co}</h3></div>
      <div className="wsub" style={{ marginTop: -8 }}>{v.title}</div>
      {v.next_step && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink)' }}>{v.next_step}</p>}
      {v.url && <a href={v.url} target="_blank" rel="noopener" style={{ fontSize: 13, color: 'var(--accent-text)', overflowWrap: 'anywhere' }}>{v.url}</a>}
      {v.channel && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Канал: {v.channel}</div>}
      {v.deadline && <div style={{ fontSize: 13, color: days(t, v.deadline) <= 0 ? 'var(--hot)' : 'var(--muted)' }}>Дедлайн: {fmtDate(v.deadline)}</div>}
      {v.applied_on && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Подано: {fmtDate(v.applied_on)}</div>}
      {msgs.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="widget-head"><h3>Письма</h3></div>
          {msgs.map(m => (
            <div key={m.id} style={{ fontSize: 13, padding: '8px 12px', borderRadius: 10, background: 'var(--sunk)', display: 'grid', gap: 2 }}>
              <span style={{ fontWeight: 500 }}>{KINDS[m.kind]?.label || m.kind}</span>
              <span style={{ color: 'var(--muted)' }}>{m.summary}</span>
              {m.action && <span style={{ color: 'var(--accent-text)', fontSize: 12 }}>Действие: {m.action}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Панель с деталями письма: просмотр плюс действие прямо здесь. */
function MessageDetail({ data, id, onDone }: { data: PultData; id: string; onDone?: (id: string, done: boolean) => void }) {
  const m = data.messages.find(x => x.id === id)
  if (!m) return null
  return (
    <div className="detail-inner">
      <div className="widget-head"><h3>{m.company?.name || m.sender || 'Письмо'}</h3></div>
      <span className="wtag action" style={{ justifySelf: 'start' }}>{KINDS[m.kind]?.label || m.kind}</span>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{m.summary}</p>
      {m.action && <div style={{ fontSize: 13, color: 'var(--accent-text)' }}>Действие: {m.action}</div>}
      {m.deadline && <div style={{ fontSize: 13, color: days(today(), m.deadline) <= 0 ? 'var(--tone-hot)' : 'var(--muted)' }}>Дедлайн: {fmtDate(m.deadline)}</div>}
      {m.subject && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Тема: {m.subject}</div>}

      {/* Быстрое действие: разобрать письмо, не уходя с дашборда */}
      {onDone && !m.is_done && (
        <button className="detail-action" onClick={() => onDone(m.id, true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12l5 5 9-10" />
          </svg>
          Разобрано
        </button>
      )}
    </div>
  )
}

/** Панель с деталями учебной работы. */
function WorkDetail({ data, id }: { data: PultData; id: string }) {
  const w = data.works.find(x => x.id === id)
  if (!w) return null
  const t = today()
  const n = w.deadline ? days(t, w.deadline) : null
  return (
    <div className="detail-inner">
      <div className="widget-head"><h3>{w.discipline?.name || 'Работа'}</h3></div>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{w.title}</p>
      {w.deadline && (
        <div style={{ fontSize: 13, color: n !== null && n <= 0 ? 'var(--hot)' : n !== null && n <= 3 ? 'var(--warn)' : 'var(--muted)' }}>
          Дедлайн: {fmtDate(w.deadline)}
        </div>
      )}
      {w.notes && <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>{w.notes}</p>}
      {w.local_path && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{w.local_path}</div>}
    </div>
  )
}

/** Панель с деталями подписки. */
function SubDetail({ data, id }: { data: PultData; id: string }) {
  const s = data.subscriptions.find(x => x.id === id)
  if (!s) return null
  const t = today()
  const n = s.next_charge_on ? days(t, s.next_charge_on) : null
  return (
    <div className="detail-inner">
      <div className="widget-head"><h3>{s.name}</h3></div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 500 }}>{s.amount} {s.currency}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{s.unit === 'month' && s.every === 1 ? 'в месяц' : `раз в ${s.every} ${s.unit === 'month' ? 'мес' : s.unit === 'week' ? 'нед' : s.unit === 'year' ? 'год' : s.unit}`}</span>
      </div>
      {s.next_charge_on && (
        <div style={{ fontSize: 13, color: n !== null && n <= 3 ? 'var(--warn)' : 'var(--muted)' }}>
          Спишется: {fmtDate(s.next_charge_on)}
        </div>
      )}
      {s.url && <a href={s.url} target="_blank" rel="noopener" style={{ fontSize: 13, color: 'var(--accent-text)', overflowWrap: 'anywhere' }}>Управлять</a>}
    </div>
  )
}

export function Dashboard({ data, canWrite: _canWrite, goto, status, loaded, error, onDismissError, onMessageDone, badges, renderTab, renderScreen }: Props) {
  const [view, setView] = useState<View>('dashboard')
  const [detail, setDetail] = useState<Detail | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Живой слой: прожектор за курсором, параллакс фона, наклон карточек, появление по скроллу.
  useEffect(() => {
    const el = rootRef.current
    if (!el || !data) return
    const off = startDashboardMotion(el)
    const spot = el.querySelector('.dash-spot')
    const t = window.setTimeout(() => spot?.classList.add('on'), 280)
    return () => { off(); clearTimeout(t) }
  }, [data, view])

  // Закрыть панель: раскладка перестраивается плавно, снимок делает браузер
  const closeDetail = useCallback(() => { morph(() => setDetail(null)) }, [])

  // Escape
  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDetail() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail, closeDetail])

  // Данных ещё нет: показываем каркас из того же прелоадера.
  // Раньше здесь был серый скелетон - он спорил с прелоадером и переход
  // выглядел как две разные сцены. Теперь это один непрерывный экран:
  // каркас уже в геометрии дашборда, живой контент проявляется на его месте.
  if (!data) {
    return (
      <div className="dash dash-loading">
        <Backdrop />
        <Preloader done={false} inline />
      </div>
    )
  }

  // Полноэкранная вкладка
  if (view !== 'dashboard' && view !== 'insights' && view !== 'settings') {
    const tab = view as Tab
    return (
      <div className="dash" ref={rootRef}><Backdrop />
        <Sidebar tab={tab} badges={badges} statusCls={status.cls} statusText={status.text} loaded={loaded} onPick={setView} />
        <div className="dash-tab" key={tab}>
          <div className="tab-content">{renderTab(tab)}</div>
        </div>
      </div>
    )
  }

  // Полноэкранный экран (Цифры / Настройки)
  if (view === 'insights' || view === 'settings') {
    return (
      <div className="dash" ref={rootRef}><Backdrop />
        <Sidebar tab={view} badges={badges} statusCls={status.cls} statusText={status.text} loaded={loaded} onPick={setView} />
        <div className="dash-tab" key={view}>
          <div className="tab-content">{renderScreen(view)}</div>
        </div>
      </div>
    )
  }

  // Основной дашборд
  const openDetail = (d: Detail) => { morph(() => setDetail(d)) }

  const openAgenda = (x: AgendaItem) => {
    if (x.goto === 'funnel' && x.ref) openDetail({ type: 'vacancy', id: x.ref })
    else if (x.goto === 'money' && x.ref) openDetail({ type: 'sub', id: x.ref })
    else if (x.goto === 'inbox' && x.ref) openDetail({ type: 'vacancy', id: x.ref })
    else if (x.goto === 'study' && x.ref) openDetail({ type: 'work', id: x.ref })
    else if (x.goto) goto(x.goto)
  }

  return (
    <>
    <div className="dash dash-born" ref={rootRef}><Backdrop />
      <Sidebar tab="dashboard" badges={badges} statusCls={status.cls} statusText={status.text} loaded={loaded} onPick={setView} />

      <div className={'dash-main' + (detail ? ' pane-open' : '')} key="dash">
        {error && (
          <div className="banner" role="alert" style={{ marginBottom: 16 }}>
            Ошибка: {error} <button className="linkbtn" onClick={onDismissError}>скрыть</button>
          </div>
        )}

        <div className="widget-grid" ref={gridRef}>
          {/* Баннер: срочное сейчас, во всю ширину */}
          <HeroWidget data={data} goto={goto} onOpenVacancy={id => openDetail({ type: 'vacancy', id })} />

          {/* Главный график тоже во всю ширину: ему нужен простор */}
          <div className="glass widget tier-2">
            <div className="widget-head"><h3>Динамика откликов</h3><span className="meta">по датам</span></div>
            <AreaChartWidget data={data} />
          </div>

          {/* Bento: широкие аналитические плашки вперемешку с узкими статусами.
              6 колонок: w-2 это треть ряда, w-3 половина, w-4 две трети. */}
          <div className="masonry">
            <div className="glass widget tier-1 w-2">
              <div className="widget-head"><h3>Пульс</h3></div>
              <PulseWidget data={data} goto={goto} />
            </div>

            <div className="glass widget tier-1 w-2">
              <div className="widget-head"><h3>Пары</h3><span className="meta">{data.schedule ? 'сегодня' : ''}</span></div>
              <LessonsWidget data={data} />
            </div>

            <div className="glass widget tier-1 w-2">
              <div className="widget-head"><h3>Цель недели</h3></div>
              <WeekRingWidget data={data} goto={goto} />
            </div>

            <div className="glass widget tier-1 w-3">
              <div className="widget-head"><h3>Горит</h3><span className="meta">ближайшие 3 дня</span></div>
              <HotWidget data={data} goto={goto} onOpenItem={openAgenda} />
            </div>

            <div className="glass widget tier-2 w-3">
              <div className="widget-head"><h3>Каналы</h3><span className="meta">откуда ответы</span></div>
              <ChannelsWidget data={data} />
            </div>

            <div className="glass widget tier-2 w-3">
              <div className="widget-head"><h3>Воронка</h3><span className="meta">конверсия</span></div>
              <FunnelWidget data={data} goto={goto} />
            </div>

            <div className="glass widget tier-2 w-3">
              <div className="widget-head"><h3>Чем отвечают</h3></div>
              <OutcomesWidget data={data} />
            </div>

            <div className="glass widget tier-3 w-3">
              <div className="widget-head"><h3>Деньги</h3><span className="meta">ближайшие списания</span></div>
              <MoneyWidget data={data} onOpenSub={id => openDetail({ type: 'sub', id })} />
            </div>

            <div className="glass widget tier-3 w-3">
              <div className="widget-head"><h3>Письма</h3></div>
              <InboxWidget data={data} onOpenMessage={id => openDetail({ type: 'message', id })} />
            </div>

            <div className="glass widget tier-2 w-2">
              <div className="widget-head"><h3>Скорость</h3><span className="meta">медиана</span></div>
              <SpeedWidget data={data} />
            </div>

            <div className="glass widget tier-3 w-2">
              <div className="widget-head"><h3>Учёба</h3></div>
              <StudyWidget data={data} onOpenWork={id => openDetail({ type: 'work', id })} />
            </div>

            <div className="glass widget tier-3 w-2">
              <div className="widget-head"><h3>Активность</h3><span className="meta">12 недель</span></div>
              <HeatWidget data={data} />
            </div>
          </div>
        </div>
      </div>

      {/* Модалка вне .dash: внутри grid с колонками 96px + 1fr она падала
          в узкую колонку сайдбара и сжималась до 96px. */}
    </div>

    {detail && (
      <div className="detail-overlay" onClick={closeDetail} role="dialog" aria-modal="true">
        <div className="detail-pane glass-deep" onClick={e => e.stopPropagation()}>
          <button className="detail-close" onClick={closeDetail} aria-label="Закрыть">×</button>
          {detail.type === 'vacancy' && <VacancyDetail data={data} id={detail.id} />}
          {detail.type === 'message' && <MessageDetail data={data} id={detail.id} onDone={onMessageDone} />}
          {detail.type === 'work' && <WorkDetail data={data} id={detail.id} />}
          {detail.type === 'sub' && <SubDetail data={data} id={detail.id} />}
        </div>
      </div>
    )}
    </>
  )
}
