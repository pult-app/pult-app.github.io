import { useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react'
import { days, fmtDate, fmtDow, today } from '../lib/dates'
import {
  CATEGORY_LABEL, chargesBetween, dayStrip, fmtMoney, fmtTotals, groupSubs, guessCategory, inLabel, isLive, nextCharge, PERIODS, periodLabel, perMonth,
  SUB_CATEGORIES, SUB_STATUSES, summarize, upcoming, type SubCategory, type SubStatus, type Subscription, type Totals,
} from '../lib/billing'
import type { PultData } from '../lib/types'
import { Empty } from './ui'
import { Avatar, Fold, ListRow } from './kit'
import { Icons } from './icons'
import { Title } from './native'
import { toast, transition } from '../lib/ux'
import type { NewRequest } from './AskClaude'

export interface NewSub {
  name: string; amount: number; currency: string; unit: string; every: number; next_charge_on: string
  status: SubStatus; category: SubCategory; method: string | null; url: string | null; notes: string | null; remind_days: number
}

interface Props {
  data: PultData
  canWrite: boolean
  open: string | null
  setOpen: (id: string | null) => void
  onAdd: (s: NewSub) => Promise<void>
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>
  onAsk: (r: NewRequest) => Promise<void>
}

const CURRENCIES = ['RUB', 'USD', 'EUR']
const REMIND = [{ v: 0, l: 'В день списания' }, { v: 1, l: 'За 1 день' }, { v: 3, l: 'За 3 дня' }, { v: 7, l: 'За 7 дней' }]
const SUGGEST = ['iCloud+', 'Яндекс Плюс', 'Telegram Premium', 'ChatGPT Plus', 'Claude Pro', 'Spotify', 'YouTube Premium', 'Кинопоиск', 'VK Музыка', 'СберПрайм', 'Т-Банк Pro', 'Google One', 'Netflix', 'JetBrains', 'Discord Nitro', 'VPN']
const SCAN_PROMPT = 'Найди в моей почте подписки и регулярные списания: сервис, сумма, валюта, период, дата ближайшего списания и ссылка на управление. Ответ списком, чтобы я добавил нужные в пульт. Ничего не меняй и не отправляй.'
const STATUS_TONE: Record<SubStatus, string> = { active: 'win', trial: 'action', paused: 'wait', cancelled: 'closed' }
const statusLabel = (s: SubStatus) => SUB_STATUSES.find(x => x.id === s)!.label
const periodId = (s: { unit: string; every: number }) => PERIODS.find(p => p.unit === s.unit && p.every === s.every)?.id ?? 'custom'

/** Для немесячных периодов: во сколько это выходит в месяц, чтобы подписки сравнивались между собой. */
function monthlyHint(s: Subscription) {
  return s.unit === 'month' && s.every === 1 ? '' : 'это ' + fmtMoney(perMonth(s.amount, s.unit, s.every), s.currency) + ' в месяц'
}

/** 30 дней вперёд: высота столбика = сумма списаний дня, касание открывает, что именно спишется. */
function Strip({ subs, t, primary, onOpen }: { subs: Subscription[]; t: string; primary: string; onOpen: (id: string) => void }) {
  const strip = useMemo(() => dayStrip(subs, t, primary, 30), [subs, t, primary])
  const first = strip.findIndex(x => x.items.length)
  const [sel, setSel] = useState(first)
  const max = Math.max(1, ...strip.map(x => x.total))
  const cur = sel >= 0 ? strip[sel] : null
  const box = useRef<HTMLDivElement>(null)
  // Столбики узкие (30 штук в ряд): день выбирается и касанием, и проведением пальца вдоль полосы, как на графиках iOS.
  const pick = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    setSel(Math.max(0, Math.min(strip.length - 1, Math.floor((e.clientX - r.left) / r.width * strip.length))))
  }
  return (
    <div className="ins-card">
      <div className="ins-readout" aria-live="polite">
        {cur ? <><b className="num">{cur.items.length}</b> {cur.date === t ? 'сегодня' : fmtDow(cur.date) + ', ' + fmtDate(cur.date)}: {cur.items.map(u => u.sub.name).join(', ')}</>
          : 'Выбери день со столбиком, чтобы увидеть списания.'}
      </div>
      <div className="strip" role="list" ref={box}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pick(e) }}
        onPointerMove={e => { if (e.buttons) pick(e) }}>
        {strip.map((x, i) => (
          <button key={x.date} role="listitem" className={'strip-col' + (i === sel ? ' on' : '') + (x.date === t ? ' today' : '')}
            aria-label={`${fmtDate(x.date)}: ${x.items.length ? x.items.map(u => u.sub.name + ' ' + fmtMoney(u.sub.amount, u.sub.currency)).join(', ') : 'нет списаний'}`}
            onClick={() => setSel(i)}>
            <i className={x.items.length ? '' : 'zero'} style={{ height: x.items.length ? Math.max(8, x.total / max * 100) + '%' : '3px', '--i': i } as CSSProperties} />
          </button>))}
      </div>
      <div className="bars-axis"><span>сегодня</span><span>{fmtDate(strip[14].date)}</span><span>{fmtDate(strip[29].date)}</span></div>
      {cur && cur.items.length > 0 && (
        <div className="rows">
          {cur.items.map(u => <ListRow key={u.sub.id} lead={<Avatar name={u.sub.name} tone="action" />} title={u.sub.name} sub={periodLabel(u.sub.unit, u.sub.every)}
            trail={<span className="num">{fmtMoney(u.sub.amount, u.sub.currency)}</span>} onOpen={() => onOpen(u.sub.id)} />)}
        </div>)}
    </div>
  )
}

/** Доля категорий в месячных расходах основной валюты. */
function Categories({ cats, primary }: { cats: ReturnType<typeof summarize>['byCategory']; primary: string }) {
  if (!cats.length) return <div className="rows"><Empty>Активных подписок в {primary} пока нет.</Empty></div>
  return (
    <div className="ins-card">
      <div className="catbar" aria-hidden>{cats.map(c => <i key={c.category} data-c={c.category} style={{ flexGrow: c.share }} />)}</div>
      <div className="catlist">
        {cats.map(c => (
          <div key={c.category} className="catline"><i data-c={c.category} /><span>{CATEGORY_LABEL[c.category]}</span>
            <span className="num">{Math.round(c.share * 100)}%</span><span className="num">{fmtMoney(c.month, primary)}</span></div>))}
      </div>
    </div>
  )
}

function SubFields({ v, set, hideStatus }: { v: FormState; set: (p: Partial<FormState>) => void; hideStatus?: boolean }) {
  return (
    <>
      <label className="full">Название<input required maxLength={120} list="sub-names" value={v.name} placeholder="например, iCloud+"
        onChange={e => set({ name: e.target.value, ...(v.catTouched ? {} : { category: guessCategory(e.target.value) }) })} /></label>
      <datalist id="sub-names">{SUGGEST.map(s => <option key={s} value={s} />)}</datalist>
      <label>Сумма<input required inputMode="decimal" value={v.amount} placeholder="299" onChange={e => set({ amount: e.target.value })} /></label>
      <label>Валюта<select value={v.currency} onChange={e => set({ currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Как часто<select value={v.period} onChange={e => set({ period: e.target.value })}>
        {v.period === 'custom' && <option value="custom">{v.customLabel}</option>}
        {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label>Следующее списание<input type="date" required value={v.date} onChange={e => set({ date: e.target.value })} /></label>
      {!hideStatus && <label>Состояние<select value={v.status} onChange={e => set({ status: e.target.value as SubStatus })}>
        {SUB_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
      <label>Категория<select value={v.category} onChange={e => set({ category: e.target.value as SubCategory, catTouched: true })}>
        {SUB_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label>Напомнить<select value={v.remind} onChange={e => set({ remind: +e.target.value })}>
        {REMIND.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></label>
      <label>Чем платишь<input maxLength={60} value={v.method} placeholder="карта Т-Банк, Apple ID" onChange={e => set({ method: e.target.value })} /></label>
      <label className="full">Ссылка, где управлять<input type="url" maxLength={500} value={v.url} placeholder="https://" onChange={e => set({ url: e.target.value })} /></label>
      <label className="full">Заметки<input maxLength={1000} value={v.notes} onChange={e => set({ notes: e.target.value })} /></label>
      <p className="note full">Номер карты не вписывай: хватит названия или последних цифр.</p>
    </>
  )
}

interface FormState {
  name: string; amount: string; currency: string; period: string; date: string; status: SubStatus; category: SubCategory
  remind: number; method: string; url: string; notes: string; catTouched: boolean; customLabel: string
}

function toRow(v: FormState, fallback?: { unit: string; every: number }): NewSub | string {
  const amount = Number(v.amount.replace(',', '.').replace(/\s/g, ''))
  if (!v.name.trim()) return 'Впиши название'
  if (!Number.isFinite(amount) || amount < 0) return 'Сумма: число, например 299 или 1299,90'
  if (!v.date) return 'Выбери дату следующего списания'
  const p = PERIODS.find(x => x.id === v.period)
  return {
    name: v.name.trim(), amount, currency: v.currency, unit: p?.unit ?? fallback?.unit ?? 'month', every: p?.every ?? fallback?.every ?? 1, next_charge_on: v.date,
    status: v.status, category: v.category, method: v.method.trim() || null, url: v.url.trim() || null, notes: v.notes.trim() || null, remind_days: v.remind,
  }
}

function AddForm({ onAdd, t }: { onAdd: Props['onAdd']; t: string }) {
  const blank: FormState = { name: '', amount: '', currency: 'RUB', period: 'month', date: t, status: 'active', category: 'other', remind: 1, method: '', url: '', notes: '', catTouched: false, customLabel: '' }
  const [v, setV] = useState(blank)
  const [msg, setMsg] = useState('')
  const set = (p: Partial<FormState>) => setV(x => ({ ...x, ...p }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const row = toRow(v)
    if (typeof row === 'string') { setMsg(row); return }
    try { await onAdd(row); setMsg(''); setV({ ...blank, currency: v.currency }); toast('Подписка добавлена: ' + row.name) }
    catch (err) { setMsg('Не сохранилось: ' + (err as Error).message) }
  }
  return (
    <form className="form card-form" onSubmit={submit}>
      <SubFields v={v} set={set} />
      <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" type="submit">Добавить</button><span className="note">{msg}</span>
      </div>
    </form>
  )
}

/** Карточка подписки: что, сколько, когда следующее, быстрые решения и правка. */
function SubScreen({ s, canWrite, onBack, onUpdate }: { s: Subscription; canWrite: boolean; onBack: () => void; onUpdate: Props['onUpdate'] }) {
  const t = today()
  const nxt = isLive(s) ? nextCharge(s, t) : null
  const [v, setV] = useState<FormState>(() => ({
    name: s.name, amount: String(s.amount).replace('.', ','), currency: s.currency, period: periodId(s), date: nxt ?? s.next_charge_on, status: s.status,
    category: s.category, remind: s.remind_days, method: s.method ?? '', url: s.url ?? '', notes: s.notes ?? '', catTouched: true, customLabel: periodLabel(s.unit, s.every),
  }))
  const [msg, setMsg] = useState('')
  const set = (p: Partial<FormState>) => setV(x => ({ ...x, ...p }))
  const next4 = nxt ? chargesBetween(s, t, '9999-12-31').slice(0, 4) : []
  const setStatus = (status: SubStatus, text: string) => onUpdate(s.id, { status, updated_by: 'owner' })
    .then(() => toast({ text, action: { label: 'Вернуть', run: () => { onUpdate(s.id, { status: s.status, updated_by: 'owner' }) } } }))
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const row = toRow(v, s)
    if (typeof row === 'string') { setMsg(row); return }
    // Якорь меняем, только если Герман сам поправил дату: иначе сохраняется исходный день месяца (31-е не превращается в 28-е).
    const patch: Record<string, unknown> = { ...row, updated_by: 'owner' }
    if (nxt && v.date === nxt && v.period === periodId(s)) delete patch.next_charge_on
    try { await onUpdate(s.id, patch); setMsg(''); toast('Сохранено') } catch { setMsg('Не сохранилось') }
  }
  const state = isLive(s) ? `${s.status === 'trial' ? 'Пробный период закончится' : 'Следующее списание'} ${fmtDate(nxt!)}, ${inLabel(days(t, nxt!))}` : s.status === 'paused' ? 'Списания приостановлены' : 'Подписка отменена, списаний не будет'
  return (
    <section className="scr">
      <Title title={s.name} back={{ label: 'Деньги', onClick: onBack }}
        sub={<span className={'spill ' + STATUS_TONE[s.status]} style={{ justifySelf: 'start', marginTop: 6, display: 'inline-block' }}>{statusLabel(s.status)}</span>} />
      <div className="hero-card">
        <div className="kicker"><i className={isLive(s) ? '' : 'calm'} />{CATEGORY_LABEL[s.category].toUpperCase()}</div>
        <div className="title">{fmtMoney(s.amount, s.currency)} <span className="per">{periodLabel(s.unit, s.every)}</span></div>
        <div className="text">{[state, monthlyHint(s), s.method ? 'Оплата: ' + s.method : ''].filter(Boolean).join('. ')}</div>
        <div className="acts">
          {s.url && <a className="hbtn" href={s.url} target="_blank" rel="noopener">Управлять в сервисе{Icons.external}</a>}
        </div>
      </div>
      {next4.length > 0 && (
        <Fold id="sub-next" title="Ближайшие списания" meta={fmtMoney(s.amount * next4.length, s.currency)}>
          <div className="rows">{next4.map(d => <ListRow key={d} lead={fmtDate(d)} title={fmtMoney(s.amount, s.currency)} sub={fmtDow(d) + ' · ' + inLabel(days(t, d))} />)}</div>
        </Fold>)}
      {canWrite && (
        <div className="vbar">
          {s.status === 'trial' && <button className="btn" onClick={() => setStatus('active', 'Теперь подписка платная')}>Оформил платную</button>}
          {(s.status === 'active' || s.status === 'trial') && <button className="btn ghost" onClick={() => setStatus('paused', 'Подписка на паузе')}>На паузу</button>}
          {s.status === 'paused' && <button className="btn" onClick={() => setStatus('active', 'Подписка снова активна')}>Возобновить</button>}
          {s.status === 'cancelled' && <button className="btn" onClick={() => setStatus('active', 'Подписка снова активна')}>Вернуть в активные</button>}
          {s.status !== 'cancelled' && <button className="btn ghost" onClick={() => setStatus('cancelled', 'Подписка отмечена отменённой')}>Отметить отменённой</button>}
        </div>)}
      {canWrite && s.status !== 'cancelled' && <p className="foot-note">Пометки в пульте не отменяют подписку в сервисе: саму отмену делай там, по кнопке «Управлять в сервисе».</p>}
      <Fold id="sub-edit" title="Править" defaultOpen={false}>
        <form className="form card-form" onSubmit={save}>
          <SubFields v={v} set={set} />
          {canWrite && <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="btn" type="submit">Сохранить</button><span className="note">{msg}</span></div>}
        </form>
      </Fold>
      {s.updated_by === 'agent' && <p className="foot-note">Запись добавил Claude из почты. Если что-то неверно, поправь выше: твои правки он не затирает.</p>}
    </section>
  )
}

export function Money({ data, canWrite, open, setOpen, onAdd, onUpdate, onAsk }: Props) {
  const t = today()
  const subs = data.subscriptions
  const sum = useMemo(() => summarize(subs, t), [subs, t])
  const groups = useMemo(() => groupSubs(subs, t), [subs, t])
  const [scan, setScan] = useState('')
  const openSub = open ? subs.find(s => s.id === open) : null
  if (openSub) return <SubScreen key={openSub.id} s={openSub} canWrite={canWrite} onBack={() => transition(() => setOpen(null), 'back')} onUpdate={onUpdate} />

  if (!data.moneyReady) return (
    <section className="scr">
      <Title title="Деньги" />
      <div className="hero-card">
        <div className="kicker"><i className="calm" />ПОДПИСКИ</div>
        <div className="title">Для подписок в базе пока нет таблицы</div>
        <div className="text">Приложение обновилось раньше базы. Нужно применить миграцию supabase/migrations/0011_subscriptions.sql, после этого вкладка заработает сама.</div>
      </div>
    </section>)

  const find = async () => {
    try { await onAsk({ kind: 'custom', prompt: SCAN_PROMPT, vacancy_id: null }); setScan('Отправил Claude, список придёт пушем') }
    catch { setScan('Не отправилось, попробуй ещё раз') }
  }
  const open1 = (id: string) => { transition(() => setOpen(id), 'fwd') }
  const nc = sum.nextCharge
  // В плитке крупно сумма в основной валюте, остальные валюты мелко рядом с подписью.
  const main = (x: Totals) => fmtMoney(x[sum.primary] ?? 0, sum.primary)
  const rest = (x: Totals) => { const o = Object.keys(x).filter(k => k !== sum.primary && x[k] > 0).map(k => fmtMoney(x[k], k)); return o.length ? ' + ' + o.join(' + ') : '' }
  const trialSum = subs.filter(s => s.status === 'trial').reduce<Record<string, number>>((a, s) => { a[s.currency] = (a[s.currency] ?? 0) + s.amount; return a }, {})
  const row = (x: { sub: Subscription; next: string | null }) => {
    const n = x.next ? days(t, x.next) : null
    return (
      <ListRow key={x.sub.id} lead={x.next ? fmtDate(x.next) : '·'} leadTone={n !== null && n <= 1 ? 'warn' : undefined}
        title={x.sub.name} sub={[periodLabel(x.sub.unit, x.sub.every), x.sub.status === 'trial' ? 'пробный период' : CATEGORY_LABEL[x.sub.category]].join(' · ')}
        trail={<span className="num amt">{fmtMoney(x.sub.amount, x.sub.currency)}</span>} past={!x.next} onOpen={() => open1(x.sub.id)} />)
  }
  const soonSum: Record<string, number> = {}
  for (const x of groups.soon) soonSum[x.sub.currency] = (soonSum[x.sub.currency] ?? 0) + x.sub.amount

  return (
    <section className="scr">
      <Title title="Деньги" />

      {subs.length === 0 ? (
        <div className="hero-card">
          <div className="kicker"><i className="calm" />ПОДПИСКИ</div>
          <div className="title">Пока ни одной подписки</div>
          <div className="text">Добавь подписки, и пульт заранее напомнит о списании, посчитает расходы в месяц и положит платежи в календарь.</div>
          <div className="acts">
            {canWrite && <button className="hbtn" onClick={() => document.getElementById('money-add')?.scrollIntoView({ behavior: 'smooth' })}>{Icons.plus}Добавить</button>}
            {canWrite && !scan && <button className="hbtn ghost" onClick={find}>{Icons.spark}Найти в почте</button>}
            {scan && <span className="sent">{scan}</span>}
          </div>
        </div>
      ) : (
        <>
          {nc ? (
            <div className="hero-card">
              <div className="kicker"><i className={nc.in <= 3 ? '' : 'calm'} />БЛИЖАЙШЕЕ СПИСАНИЕ</div>
              <div className="title">{nc.sub.name}: {fmtMoney(nc.sub.amount, nc.sub.currency)}</div>
              <div className="text">{fmtDate(nc.date)}, {fmtDow(nc.date)}, {inLabel(nc.in)}. За 30 дней спишется {fmtTotals(sum.next30, sum.primary)}.</div>
              <div className="acts"><button className="hbtn ghost" onClick={() => open1(nc.sub.id)}>Открыть</button></div>
            </div>
          ) : (
            <div className="hero-card">
              <div className="kicker"><i className="calm" />БЛИЖАЙШЕЕ СПИСАНИЕ</div>
              <div className="title">В ближайшие 30 дней ничего не спишется</div>
              <div className="text">Живых подписок нет или все на паузе.</div>
            </div>)}

          <div className="tiles money-tiles">
            <div className="tile plain"><b>{main(sum.month)}</b><span>в месяц{rest(sum.month)}</span></div>
            <div className="tile plain"><b>{main(sum.year)}</b><span>в год{rest(sum.year)}</span></div>
            {sum.trialCount > 0 && <div className="tile act"><b>{sum.trialCount}</b><span>пробных, спишется {fmtTotals(trialSum, sum.primary)}</span></div>}
          </div>

          <Fold id="money-strip" title="Ближайшие 30 дней" meta={'платежей: ' + upcoming(subs, t, 30).length}>
            <Strip subs={subs} t={t} primary={sum.primary} onOpen={open1} />
          </Fold>

          {groups.soon.length > 0 && <Fold id="money-soon" title="Скоро, 7 дней" meta={fmtTotals(soonSum, sum.primary)}><div className="rows">{groups.soon.map(row)}</div></Fold>}
          {groups.later.length > 0 && <Fold id="money-later" title="Позже" meta={groups.later.length}><div className="rows">{groups.later.map(row)}</div></Fold>}
          {groups.paused.length > 0 && <Fold id="money-paused" title="На паузе" meta={groups.paused.length} defaultOpen={false}><div className="rows">{groups.paused.map(row)}</div></Fold>}
          {groups.cancelled.length > 0 && <Fold id="money-cancelled" title="Отменены" meta={groups.cancelled.length} defaultOpen={false}><div className="rows">{groups.cancelled.map(row)}</div></Fold>}
          <Fold id="money-cats" title="По категориям" meta={sum.byCategory[0] ? CATEGORY_LABEL[sum.byCategory[0].category] + ' ' + Math.round(sum.byCategory[0].share * 100) + '%' : ''} defaultOpen={false}>
            <Categories cats={sum.byCategory} primary={sum.primary} />
          </Fold>
        </>)}

      {canWrite && (
        <div id="money-add">
          <Fold id="money-add-fold" title="Добавить подписку" defaultOpen={subs.length === 0}>
            <AddForm onAdd={onAdd} t={t} />
          </Fold>
        </div>)}
      {canWrite && subs.length > 0 && (
        <div className="askline-row">
          {!scan ? <button className="btn ghost" onClick={find}>{Icons.spark}Найти новые подписки в почте</button> : <p className="ask-note">{scan}</p>}
        </div>)}
    </section>
  )
}
