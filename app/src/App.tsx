import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { clearCache, configured, ensureByName, insert, loadAll, readCache, slug, supabase, update } from './lib/api'
import { days, fmtDate, today } from './lib/dates'
import { grade, statusPatch, type FunnelTab } from './lib/domain'
import type { Flashcard, PultData, Vacancy, VacancyStatus } from './lib/types'
import { Today } from './components/Today'
import { Funnel, type NewVacancy } from './components/Funnel'
import { Inbox } from './components/Inbox'
import { Study } from './components/Study'
import { Trainer } from './components/Trainer'
import { Insights } from './components/Insights'
import { PushToggle } from './components/PushToggle'
import { ThemeToggle } from './components/ThemeToggle'
import { Icons } from './components/icons'
import { CalendarLink } from './components/CalendarLink'
import { PullToRefresh, Skeleton, TabBar, Title, Toaster } from './components/native'
import { toast } from './lib/ux'
import type { NewRequest } from './components/AskClaude'

export type Tab = 'today' | 'funnel' | 'inbox' | 'study' | 'more'
export type Go = (t: Tab, o?: { vacancy?: string; ftab?: FunnelTab; cards?: boolean }) => void
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Сегодня' }, { id: 'funnel', label: 'Воронка' }, { id: 'inbox', label: 'Письма' },
  { id: 'study', label: 'Учёба' }, { id: 'more', label: 'Ещё' },
]
/** Старые адреса вкладок (закладки, пуши): #train и #stats. */
const LEGACY: Record<string, Tab> = { train: 'study', stats: 'more' }

/** Демо только в dev-сборке: снимок данных из public/demo.json (файл в .gitignore), без входа. */
const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')

function hashTab(): Tab | null {
  const h = location.hash.slice(1)
  if (TABS.some(t => t.id === h)) return h as Tab
  return LEGACY[h] ?? null
}
function initialTab(): Tab {
  const h = hashTab()
  if (h) return h
  try { const s = localStorage.getItem('pult-tab') as Tab | null; if (s && TABS.some(t => t.id === s)) return s } catch { /* пусто */ }
  return 'today'
}

function Login() {
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setState('busy')
    // Регистрация закрыта дважды: в настройках Auth и триггером по private.allowed_signup (US-15).
    const { error } = mode === 'password'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin + import.meta.env.BASE_URL } })
    if (error) { setState('error'); setErr(error.message === 'Invalid login credentials' ? 'неверная почта или пароль' : error.message) }
    else setState(mode === 'link' ? 'sent' : 'idle')
  }
  return (
    <form className="login" onSubmit={submit}>
      <h1>Пульт</h1>
      <div className="filters" role="group" aria-label="Способ входа">
        <button type="button" className="chip" aria-pressed={mode === 'password'} onClick={() => setMode('password')}>По паролю</button>
        <button type="button" className="chip" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Ссылкой на почту</button>
      </div>
      <input type="email" required autoComplete="username" placeholder="почта" value={email} onChange={e => setEmail(e.target.value)} aria-label="Почта" />
      {mode === 'password' && <input type="password" required minLength={8} autoComplete="current-password" placeholder="пароль" value={password} onChange={e => setPassword(e.target.value)} aria-label="Пароль" />}
      <button className="btn" type="submit" disabled={state === 'busy'}>{mode === 'password' ? 'Войти' : 'Прислать ссылку'}</button>
      {mode === 'password' && <p className="note">Пароль задаётся в пульте на уже вошедшем устройстве: внизу, «Вход на других устройствах».</p>}
      {mode === 'link' && <p className="note">На iPhone ссылка открывается в Safari, а не в приложении с экрана «Домой». Для него удобнее вход по паролю.</p>}
      {state === 'sent' && <p className="note">Ссылка отправлена, открой письмо на этом устройстве.</p>}
      {state === 'error' && <p className="note">Не получилось: {err}</p>}
    </form>
  )
}

/** Пароль для входа на устройствах, где ссылка из письма не подходит (приложение на iPhone). */
function PasswordBox() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) { setMsg('Пароли не совпадают'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setMsg('Не получилось: ' + error.message)
    else { setMsg('Пароль сохранён. На телефоне войди по почте и этому паролю.'); setPw(''); setPw2('') }
  }
  return (
    <details className="add">
      <summary>Вход на других устройствах</summary>
      <form className="form" onSubmit={submit}>
        <label>Новый пароль<input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
        <label>Ещё раз<input type="password" required minLength={10} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
        <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" type="submit">Сохранить пароль</button><span className="note">{msg}</span>
        </div>
        <p className="note full">Не короче 10 символов. Пароль хранится в Supabase только в виде хэша.</p>
      </form>
    </details>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [data, setData] = useState<PultData | null>(() => DEMO ? null : readCache())
  const [offline, setOffline] = useState(!navigator.onLine)
  const [error, setError] = useState('')
  const [tab, setTabState] = useState<Tab>(initialTab)
  const [openVacancy, setOpenVacancy] = useState<string | null>(() => DEMO ? new URLSearchParams(location.search).get('open') : null)
  const [ftab, setFtab] = useState<FunnelTab | null>(null)
  const [cards, setCards] = useState(location.hash === '#train')

  const setTab = (t: Tab) => {
    setTabState(t)
    history.replaceState(null, '', '#' + t)
    try { localStorage.setItem('pult-tab', t) } catch { /* пусто */ }
    window.scrollTo({ top: 0 })
  }
  const go: Go = (t, o = {}) => {
    if (t === 'funnel') { setOpenVacancy(o.vacancy ?? null); if (o.ftab) setFtab(o.ftab) }
    if (t === 'study') setCards(!!o.cards)
    setTab(t)
  }

  // Переход по #вкладке в адресе (из пуша или закладки) переключает экран без перезагрузки.
  useEffect(() => {
    const onHash = () => { const h = hashTab(); if (h) setTabState(h) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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
    if (DEMO) { fetch(import.meta.env.BASE_URL + 'demo.json').then(r => r.json()).then(setData); return }
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
  if (!authReady && !DEMO) return null
  if (!session && !DEMO) return <div className="wrap"><Login /></div>

  const canWrite = !offline
  const t = today()
  const run = data?.lastRun
  const runAt = run ? run.finished_at ?? run.started_at : null
  const runAgeH = runAt && data ? (Date.parse(data.loadedAt) - Date.parse(runAt)) / 36e5 : null
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })
  const loaded = data ? hhmm(data.loadedAt) : ''
  const status = offline
    ? { text: `офлайн, данные на ${loaded}`, cls: 'off' }
    : runAt
      ? { text: `агент обновил ${runAt.slice(0, 10) === t ? 'в' : fmtDate(runAt.slice(0, 10)) + ','} ${hhmm(runAt)}`, cls: runAgeH !== null && runAgeH > 12 ? 'warn' : 'muted' }
      : { text: loaded ? `данные на ${loaded}` : 'загрузка', cls: 'muted' }

  const badges: Partial<Record<Tab, { n: number; hot: boolean }>> = data ? {
    inbox: { n: data.messages.filter(m => !m.is_done && ['invite', 'test', 'offer', 'question'].includes(m.kind)).length, hot: true },
    study: { n: data.works.filter(w => w.status !== 'submitted' && w.deadline && days(t, w.deadline) <= 3).length, hot: data.works.some(w => w.status !== 'submitted' && !!w.deadline && days(t, w.deadline) < 0) },
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
  const onAsk = (r: NewRequest) => act(() => insert('agent_request', r))
  const onGrade = (c: Flashcard, knew: boolean) => act(async () => {
    const next = grade(c.box, knew, t)
    await update('flashcard', c.id, next)
    await insert('card_review', { flashcard_id: c.id, knew, box_before: c.box, box_after: next.box })
  })

  const dueCards = data ? data.cards.filter(c => c.due_on <= t).length : 0
  const topActions = <><ThemeToggle /><PushToggle /></>

  return (
    <div className="wrap">
      {error && <div className="banner" role="alert">Ошибка: {error} <button className="linkbtn" onClick={() => setError('')}>скрыть</button></div>}

      {!data ? <Skeleton /> : <>
        {tab === 'today' && <Today data={data} canWrite={canWrite} goto={go} status={status} actions={topActions}
          onTaskDone={(id, done) => act(() => update('task', id, { is_done: done })).then(() => { if (done) toast({ text: 'Дело закрыто', action: { label: 'Вернуть', run: () => { act(() => update('task', id, { is_done: false })) } } }) })}
          onAddTask={row => act(() => insert('task', { ...row, created_by: 'owner' }))} onAsk={onAsk} />}
        {tab === 'funnel' && <Funnel data={data} canWrite={canWrite} open={openVacancy} setOpen={setOpenVacancy} tab={ftab} setTab={setFtab}
          onStatus={onStatus} onSave={onSave} onFollowed={onFollowed} onAdd={onAddVacancy} onAsk={onAsk} onTrain={() => go('study', { cards: true })} />}
        {tab === 'inbox' && <Inbox data={data} canWrite={canWrite} onDone={(id, done) => act(() => update('message', id, { is_done: done })).then(() => { if (done) toast({ text: 'Письмо разобрано', action: { label: 'Вернуть', run: () => { act(() => update('message', id, { is_done: false })) } } }) })} />}
        {tab === 'study' && <section className="scr">
          <Title title="Учёба" />
          <div className="seg">
            <button className="chip" aria-pressed={!cards} onClick={() => setCards(false)}>Работы</button>
            <button className="chip" aria-pressed={cards} onClick={() => setCards(true)}>Карточки{dueCards ? ' ' + dueCards : ''}</button>
          </div>
          {cards ? <Trainer data={data} canWrite={canWrite} onGrade={onGrade} /> : <Study data={data} canWrite={canWrite}
            onStatus={(id, s) => act(() => update('study_work', id, { status: s, updated_by: 'owner' }))}
            onAdd={w => act(async () => {
              const discipline_id = await ensureByName('discipline', w.discipline.trim())
              await insert('study_work', { discipline_id, code: slug('w'), title: w.title.trim(), status: w.status, deadline: w.deadline || null })
            })} />}
        </section>}
        {tab === 'more' && <section className="scr">
          <Title title="Ещё" sub={'Цифры поиска работы · ' + status.text} />
          <Insights data={data} />
          <div className="sec-head" style={{ marginTop: 8 }}><h2>Настройки</h2></div>
          <CalendarLink />
          <PasswordBox />
          <button className="btn ghost" style={{ justifySelf: 'start', display: 'inline-flex', gap: 8, alignItems: 'center' }} onClick={() => { clearCache(); supabase.auth.signOut() }}>
            <span style={{ width: 18, height: 18, display: 'inline-grid' }}>{Icons.logout}</span>Выйти</button>
          <p className="foot-note">Данные приносит Claude: почта и hh.ru в 9:00, 14:00 и 20:00. Статусы и отметки можно менять здесь.</p>
        </section>}
      </>}

      <TabBar items={TABS.map(x => ({ ...x, icon: Icons[x.id] }))} value={tab} onPick={t => go(t)}
        badges={Object.fromEntries(Object.entries(badges).map(([k, b]) => [k, b?.n ?? 0]))} />
      <Toaster />
      <PullToRefresh refresh={refresh} />

    </div>
  )
}
