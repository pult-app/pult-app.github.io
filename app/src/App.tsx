import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { clearCache, configured, ensureByName, insert, loadAll, readCache, slug, supabase, update } from './lib/api'
import { days, fmtDate, today } from './lib/dates'
import { grade, statusPatch, type FunnelTab } from './lib/domain'
import { upcoming } from './lib/billing'
import type { Flashcard, PultData, Vacancy, VacancyStatus } from './lib/types'
import { Today } from './components/Today'
import { Funnel, type NewVacancy } from './components/Funnel'
import { Inbox } from './components/Inbox'
import { Study } from './components/Study'
import { Trainer } from './components/Trainer'
import { Insights } from './components/Insights'
import { Money, type NewSub } from './components/Money'
import { Settings } from './components/Settings'
import { Icons } from './components/icons'
import { PullToRefresh, Skeleton, TabBar, Title, Toaster } from './components/native'
import { scrollToTop, toast, transition } from './lib/ux'
import type { NewRequest } from './components/AskClaude'

/** Пять вкладок внизу; «Цифры» и «Настройки» открываются поверх вкладки и возвращают назад (как экран внутри навигации iOS). */
export type Tab = 'today' | 'funnel' | 'inbox' | 'study' | 'money'
export type Screen = 'insights' | 'settings'
export interface GoOpts { vacancy?: string; ftab?: FunnelTab; cards?: boolean; sub?: string; work?: string }
export type Go = (to: Tab | Screen, o?: GoOpts) => void
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Сегодня' }, { id: 'funnel', label: 'Воронка' }, { id: 'inbox', label: 'Письма' },
  { id: 'study', label: 'Учёба' }, { id: 'money', label: 'Деньги' },
]
const SCREENS: Screen[] = ['insights', 'settings']
/** Старые адреса (закладки, пуши): #train открывал карточки, #stats и #more были страницей «Ещё». */
const LEGACY: Record<string, { tab?: Tab; screen?: Screen }> = { train: { tab: 'study' }, stats: { screen: 'insights' }, more: { screen: 'settings' } }

/** Демо только в dev-сборке: снимок данных из public/demo.json (файл в .gitignore), без входа. */
const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')

function parseHash(): { tab?: Tab; screen?: Screen } | null {
  const h = location.hash.slice(1)
  if (TABS.some(t => t.id === h)) return { tab: h as Tab }
  if (SCREENS.includes(h as Screen)) return { screen: h as Screen }
  return LEGACY[h] ?? null
}
function initialTab(): Tab {
  const h = parseHash()
  if (h?.tab) return h.tab
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [data, setData] = useState<PultData | null>(() => DEMO ? null : readCache())
  const [offline, setOffline] = useState(!navigator.onLine)
  const [error, setError] = useState('')
  const [tab, setTabState] = useState<Tab>(initialTab)
  const [screen, setScreenState] = useState<Screen | null>(() => parseHash()?.screen ?? null)
  const [openVacancy, setOpenVacancy] = useState<string | null>(() => DEMO ? new URLSearchParams(location.search).get('open') : null)
  const [ftab, setFtab] = useState<FunnelTab | null>(null)
  const [cards, setCards] = useState(location.hash === '#train')
  const [openSub, setOpenSub] = useState<string | null>(() => DEMO ? new URLSearchParams(location.search).get('sub') : null)
  const [openWork, setOpenWork] = useState<string | null>(null)

  // Каждый экран помнит, где его оставили (как в iOS); переход по ссылке внутри приложения открывает экран сверху.
  const scrollMemo = useRef<Record<string, number>>({})
  const pendingScroll = useRef<number | null>(null)
  const setView = (nextTab: Tab, nextScreen: Screen | null, fromTop = false) => {
    scrollMemo.current[screen ?? tab] = window.scrollY
    const key = nextScreen ?? nextTab
    pendingScroll.current = fromTop ? 0 : (scrollMemo.current[key] ?? 0)
    setTabState(nextTab)
    setScreenState(nextScreen)
    history.replaceState(null, '', '#' + key)
    try { localStorage.setItem('pult-tab', nextTab) } catch { /* пусто */ }
  }
  useLayoutEffect(() => {
    if (pendingScroll.current === null) return
    window.scrollTo(0, pendingScroll.current)
    pendingScroll.current = null
  }, [tab, screen])
  // Первое появление данных: карточки проявляются лесенкой один раз за запуск (класс снимается после анимации).
  const painted = useRef(false)
  useEffect(() => {
    if (!data || painted.current) return
    painted.current = true
    const r = document.documentElement
    r.classList.add('first-paint')
    window.setTimeout(() => r.classList.remove('first-paint'), 800)
  }, [data])
  const go: Go = (to, o = {}) => {
    if (to === 'insights' || to === 'settings') { setView(tab, to, true); return }
    if (to === 'funnel') { setOpenVacancy(o.vacancy ?? null); if (o.ftab) setFtab(o.ftab) }
    if (to === 'study') { setCards(!!o.cards); setOpenWork(o.work ?? null) }
    if (to === 'money') setOpenSub(o.sub ?? null)
    setView(to, null, true)
  }
  /** Нажатие на вкладку: открытый экран закрывается; чужая вкладка открывается там, где её оставили;
   *  активная сначала закрывает вложенный экран, потом плавно едет наверх. */
  const pressTab = (t: Tab) => {
    if (screen) { transition(() => setView(t, null, false), 'back'); return }
    if (t !== tab) { setView(t, null); return }
    if (t === 'funnel' && openVacancy) { transition(() => setOpenVacancy(null), 'back'); return }
    if (t === 'money' && openSub) { transition(() => setOpenSub(null), 'back'); return }
    scrollToTop()
  }

  // Переход по #вкладке в адресе (из пуша или закладки) переключает экран без перезагрузки.
  useEffect(() => {
    const onHash = () => {
      const h = parseHash()
      if (h?.tab) { setTabState(h.tab); setScreenState(null) } else if (h?.screen) setScreenState(h.screen)
    }
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
    if (DEMO) { fetch(import.meta.env.BASE_URL + 'demo.json').then(r => r.json()).then(d => setData({ requests: [], subscriptions: [], moneyReady: true, ...d })); return }
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
  // Почту и hh разбирает один прогон в сутки, поэтому «давно» начинается с 30 часов, а не с 12.
  const status = offline
    ? { text: `офлайн, данные на ${loaded}`, cls: 'off' }
    : runAt
      ? { text: `агент обновил ${runAt.slice(0, 10) === t ? 'в' : fmtDate(runAt.slice(0, 10)) + ','} ${hhmm(runAt)}`, cls: runAgeH !== null && runAgeH > 30 ? 'warn' : 'muted' }
      : { text: loaded ? `данные на ${loaded}` : 'загрузка', cls: 'muted' }

  const badges: Partial<Record<Tab, number>> = data ? {
    inbox: data.messages.filter(m => !m.is_done && ['invite', 'test', 'offer', 'question'].includes(m.kind)).length,
    study: data.works.filter(w => w.status !== 'submitted' && w.deadline && days(t, w.deadline) <= 3).length,
    money: upcoming(data.subscriptions, t, 3).length,
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
  const onAddSub = (s: NewSub) => act(() => insert('subscription', { ...s }))
  const onUpdateSub = (id: string, patch: Record<string, unknown>) => act(() => update('subscription', id, patch))

  const dueCards = data ? data.cards.filter(c => c.due_on <= t).length : 0
  const backLabel = TABS.find(x => x.id === tab)!.label
  const closeScreen = () => transition(() => setView(tab, null), 'back')

  return (
    <div className="wrap">
      {error && <div className="banner" role="alert">Ошибка: {error} <button className="linkbtn" onClick={() => setError('')}>скрыть</button></div>}

      {!data ? <Skeleton /> : screen === 'insights' ? <Insights data={data} backLabel={backLabel} onBack={closeScreen} goto={go} />
        : screen === 'settings' ? <Settings data={data} backLabel={backLabel} onBack={closeScreen} onLogout={() => { clearCache(); supabase.auth.signOut() }} />
        : <>
          {tab === 'today' && <Today data={data} canWrite={canWrite} goto={go} status={status}
            onTaskDone={(id, done) => act(() => update('task', id, { is_done: done })).then(() => { if (done) toast({ text: 'Дело закрыто', action: { label: 'Вернуть', run: () => { act(() => update('task', id, { is_done: false })) } } }) })}
            onAddTask={row => act(() => insert('task', { ...row, created_by: 'owner' }))} onAsk={onAsk} />}
          {tab === 'funnel' && <Funnel data={data} canWrite={canWrite} open={openVacancy} setOpen={setOpenVacancy} tab={ftab} setTab={setFtab}
            onStatus={onStatus} onSave={onSave} onFollowed={onFollowed} onAdd={onAddVacancy} onAsk={onAsk} onTrain={() => go('study', { cards: true })} onNumbers={() => go('insights')} />}
          {tab === 'inbox' && <Inbox data={data} canWrite={canWrite} onOpen={id => go('funnel', { vacancy: id })}
            onDone={(id, done) => act(() => update('message', id, { is_done: done })).then(() => { if (done) toast({ text: 'Письмо разобрано', action: { label: 'Вернуть', run: () => { act(() => update('message', id, { is_done: false })) } } }) })} />}
          {tab === 'study' && <section className="scr">
            <Title title="Учёба" />
            <div className="seg">
              <button className="chip" aria-pressed={!cards} onClick={() => setCards(false)}>Работы</button>
              <button className="chip" aria-pressed={cards} onClick={() => setCards(true)}>Карточки{dueCards ? ' ' + dueCards : ''}</button>
            </div>
            {cards ? <Trainer data={data} canWrite={canWrite} onGrade={onGrade} /> : <Study data={data} canWrite={canWrite} focus={openWork}
              onStatus={(id, s) => act(() => update('study_work', id, { status: s, updated_by: 'owner' }))}
              onSave={(id, patch) => act(() => update('study_work', id, { ...patch, updated_by: 'owner' }))}
              onAdd={w => act(async () => {
                const discipline_id = await ensureByName('discipline', w.discipline.trim())
                await insert('study_work', { discipline_id, code: slug('w'), title: w.title.trim(), status: w.status, deadline: w.deadline || null })
              })} />}
          </section>}
          {tab === 'money' && <Money data={data} canWrite={canWrite} open={openSub} setOpen={setOpenSub} onAdd={onAddSub} onUpdate={onUpdateSub} onAsk={onAsk} />}
        </>}

      <TabBar items={TABS.map(x => ({ ...x, icon: Icons[x.id] }))} value={tab} onPick={pressTab} badges={badges} />
      <Toaster />
      <PullToRefresh refresh={refresh} />

    </div>
  )
}
