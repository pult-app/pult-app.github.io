import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { clearCache, configured, ensureByName, insert, loadAll, readCache, slug, supabase, update } from './lib/api'
import { days, fmtDate, nowHM, today } from './lib/dates'
import { grade, statusPatch } from './lib/domain'
import type { Flashcard, PultData, Vacancy, VacancyStatus } from './lib/types'
import { Today } from './components/Today'
import { Funnel, type NewVacancy } from './components/Funnel'
import { Inbox } from './components/Inbox'
import { Study } from './components/Study'
import { Trainer } from './components/Trainer'
import { Stats } from './components/Stats'

export type Tab = 'today' | 'funnel' | 'inbox' | 'study' | 'train' | 'stats'
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Сегодня' }, { id: 'funnel', label: 'Воронка' }, { id: 'inbox', label: 'Входящие' },
  { id: 'study', label: 'Учёба' }, { id: 'train', label: 'Тренажёр' }, { id: 'stats', label: 'Аналитика' },
]

function initialTab(): Tab {
  const h = location.hash.slice(1) as Tab
  if (TABS.some(t => t.id === h)) return h
  try { const s = localStorage.getItem('pult-tab') as Tab | null; if (s && TABS.some(t => t.id === s)) return s } catch { /* пусто */ }
  return 'today'
}

function Login() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Регистрации нет: войти может только уже созданный пользователь (US-15).
      options: { shouldCreateUser: false, emailRedirectTo: location.origin + import.meta.env.BASE_URL },
    })
    if (error) { setState('error'); setErr(error.message) } else setState('sent')
  }
  return (
    <form className="login" onSubmit={submit}>
      <h1>Пульт</h1>
      <p className="sub">Вход по одноразовой ссылке на почту.</p>
      <input type="email" required autoComplete="email" placeholder="почта" value={email} onChange={e => setEmail(e.target.value)} aria-label="Почта" />
      <button className="btn" type="submit">Прислать ссылку</button>
      {state === 'sent' && <p className="note">Ссылка отправлена, открой письмо на этом устройстве.</p>}
      {state === 'error' && <p className="note">Не получилось: {err}</p>}
    </form>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [data, setData] = useState<PultData | null>(() => readCache())
  const [offline, setOffline] = useState(!navigator.onLine)
  const [error, setError] = useState('')
  const [tab, setTabState] = useState<Tab>(initialTab)

  const setTab = (t: Tab) => {
    setTabState(t)
    history.replaceState(null, '', '#' + t)
    try { localStorage.setItem('pult-tab', t) } catch { /* пусто */ }
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!navigator.onLine) { setOffline(true); return }
    try { setData(await loadAll()); setOffline(false); setError('') }
    catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => {
    if (!session) return
    refresh()
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    const onOnline = () => { setOffline(false); refresh() }
    const onOffline = () => setOffline(true)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const timer = setInterval(refresh, 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(timer)
    }
  }, [session, refresh])

  // Любое изменение: запись в базу, потом перечитать данные.
  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await refresh() }
    catch (e) { setError((e as Error).message); throw e }
  }

  if (!configured) return <div className="wrap"><p className="banner">Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY.</p></div>
  if (!authReady) return null
  if (!session) return <div className="wrap"><Login /></div>

  const canWrite = !offline
  const t = today()
  const h = +nowHM().slice(0, 2)
  const greet = (h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер') + ', Герман. ' +
    new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' })
  const run = data?.lastRun
  const runAt = run ? run.finished_at ?? run.started_at : null
  const runAgeH = runAt && data ? (Date.parse(data.loadedAt) - Date.parse(runAt)) / 36e5 : null
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })
  const loaded = data ? hhmm(data.loadedAt) : ''

  const badges: Partial<Record<Tab, { n: number; hot: boolean }>> = data ? {
    inbox: { n: data.messages.filter(m => !m.is_done && m.kind !== 'ack').length, hot: data.messages.some(m => !m.is_done && ['invite', 'test', 'offer', 'question'].includes(m.kind)) },
    study: { n: data.works.filter(w => w.status !== 'submitted' && w.deadline && days(t, w.deadline) <= 3).length, hot: data.works.some(w => w.status !== 'submitted' && !!w.deadline && days(t, w.deadline) < 0) },
    train: { n: data.cards.filter(c => c.due_on <= t).length, hot: false },
  } : {}

  const onStatus = (v: Vacancy, s: VacancyStatus) => act(() => update('vacancy', v.id, statusPatch(v, s, t)))
  const onSave = (id: string, patch: Partial<Vacancy>) => act(() => update('vacancy', id, { ...patch, updated_by: 'owner' }))
  const onFollowed = (id: string) => act(() => update('vacancy', id, { followed_up_on: t, updated_by: 'owner' }))
  const onAddVacancy = (f: NewVacancy) => act(async () => {
    const company_id = await ensureByName('company', f.company.trim())
    const needsDate = f.status !== 'found' && f.status !== 'skip'
    await insert('vacancy', {
      company_id, external_ref: slug('m'), title: f.title.trim(), status: f.status, work_format: f.work_format || null,
      channel: f.channel || null, url: f.url || null, deadline: f.deadline || null,
      applied_on: f.applied_on || (needsDate ? t : null),
    })
  })
  const onGrade = (c: Flashcard, knew: boolean) => act(async () => {
    const next = grade(c.box, knew, t)
    await update('flashcard', c.id, next)
    await insert('card_review', { flashcard_id: c.id, knew, box_before: c.box, box_after: next.box })
  })

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Пульт</h1>
          <p className="sub">{greet}</p>
        </div>
        <div className="hdr-right">
          <span className={'status-line' + (offline ? ' off' : runAgeH !== null && runAgeH > 12 ? ' stale' : '')}>
            {offline ? `офлайн, данные на ${loaded}` : runAt ? `агент обновил ${fmtDate(runAt.slice(0, 10))} в ${hhmm(runAt)}` : loaded ? `данные на ${loaded}` : ''}
          </span>
          <button className="linkbtn" onClick={() => { clearCache(); supabase.auth.signOut() }}>выйти</button>
        </div>
      </header>

      {error && <div className="banner" role="alert">Ошибка: {error} <button className="linkbtn" onClick={() => setError('')}>скрыть</button></div>}

      <nav className="tabs" role="tablist">
        {TABS.map(x => {
          const b = badges[x.id]
          return (
            <button key={x.id} className="tab" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
              {x.label}{b && b.n > 0 && <span className={'badge' + (b.hot ? ' hot' : '')}>{b.n}</span>}
            </button>)
        })}
      </nav>

      {!data ? <div className="empty">Загружаю…</div> : <>
        {tab === 'today' && <Today data={data} canWrite={canWrite} goto={setTab}
          onTaskDone={(id, done) => act(() => update('task', id, { is_done: done }))}
          onAddTask={row => act(() => insert('task', { ...row, created_by: 'owner' }))} />}
        {tab === 'funnel' && <Funnel data={data} canWrite={canWrite} onStatus={onStatus} onSave={onSave} onFollowed={onFollowed} onAdd={onAddVacancy} />}
        {tab === 'inbox' && <Inbox data={data} canWrite={canWrite} onDone={(id, done) => act(() => update('message', id, { is_done: done }))} />}
        {tab === 'study' && <Study data={data} canWrite={canWrite}
          onStatus={(id, s) => act(() => update('study_work', id, { status: s, updated_by: 'owner' }))}
          onAdd={w => act(async () => {
            const discipline_id = await ensureByName('discipline', w.discipline.trim())
            await insert('study_work', { discipline_id, code: slug('w'), title: w.title.trim(), status: w.status, deadline: w.deadline || null })
          })} />}
        {tab === 'train' && <Trainer data={data} canWrite={canWrite} onGrade={onGrade} />}
        {tab === 'stats' && <Stats data={data} />}
      </>}

      <p className="note">Данные приносит Claude: почта и hh.ru в 9:00, 14:00 и 20:00. Статусы и отметки можно менять здесь.</p>
    </div>
  )
}
