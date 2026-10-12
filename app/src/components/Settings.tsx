import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/api'
import { fmtDate } from '../lib/dates'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'
import type { PultData } from '../lib/types'
import { applyTheme, readTheme, type ThemeMode } from './ThemeToggle'
import { CalendarLink } from './CalendarLink'
import { Fold, ListRow } from './kit'
import { Icons } from './icons'
import { Title } from './native'

const PUSH_TEXT: Record<PushState, { title: string; sub: string }> = {
  unsupported: { title: 'Пуши недоступны', sub: 'Этот браузер их не поддерживает' },
  'need-install': { title: 'Пуши на iPhone', sub: 'Добавь пульт на экран «Домой» и открой с иконки' },
  denied: { title: 'Пуши запрещены', sub: 'Разреши уведомления для пульта в настройках браузера' },
  off: { title: 'Пуши выключены', sub: 'Включить: письма с действием, утренняя сводка, списания, итоги недели' },
  on: { title: 'Пуши включены', sub: 'Письма с действием, утренняя сводка, списания, итоги недели' },
}

function ThemeRow() {
  const [mode, setMode] = useState<ThemeMode>(readTheme)
  const flip = () => {
    const m: ThemeMode = mode === 'dark' ? 'light' : 'dark'
    // Цвета перетекают за 0,3 с: резкая смена яркости режет глаз.
    const root = document.documentElement
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-fade')
      window.setTimeout(() => root.classList.remove('theme-fade'), 350)
    }
    setMode(m); applyTheme(m)
    try { localStorage.setItem('pult-theme', m) } catch { /* память недоступна */ }
  }
  return <ListRow title="Тема" sub={mode === 'dark' ? 'Тёмная' : 'Светлая'} trail={<span className="spill wait">Сменить</span>} onOpen={flip} />
}

function PushRow() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')) }, [])
  if (!state) return null
  const t = PUSH_TEXT[state]
  const clickable = state === 'off' || state === 'on'
  const toggle = async () => {
    setBusy(true); setErr('')
    try { setState(state === 'on' ? await disablePush() : await enablePush()) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  return <ListRow title={t.title} sub={err ? 'Ошибка: ' + err : t.sub} trail={clickable ? <span className={'spill ' + (state === 'on' ? 'win' : 'action')}>{busy ? '...' : state === 'on' ? 'Выключить' : 'Включить'}</span> : undefined}
    onOpen={clickable && !busy ? toggle : undefined} />
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
    <form className="form card-form" onSubmit={submit}>
      <label>Новый пароль<input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
      <label>Ещё раз<input type="password" required minLength={10} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
      <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" type="submit">Сохранить пароль</button><span className="note">{msg}</span>
      </div>
      <p className="note full">Не короче 10 символов. Пароль хранится в Supabase только в виде хэша.</p>
    </form>
  )
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })

/** Что делает автоматика и когда сработала в последний раз. Расписание сервера лежит в supabase/migrations. */
function Automation({ data }: { data: PultData }) {
  const run = data.lastRun
  const runAt = run ? run.finished_at ?? run.started_at : null
  const queued = data.requests.filter(r => r.status === 'queued')
  const oldest = queued.length ? Math.min(...queued.map(r => Date.parse(r.created_at))) : null
  const waitH = oldest ? Math.round((Date.parse(data.loadedAt) - oldest) / 36e5) : 0
  const queueText = queued.length
    ? `В очереди ${queued.length}, старейший ждёт ${waitH < 1 ? 'меньше часа' : waitH < 48 ? waitH + ' ч' : Math.round(waitH / 24) + ' дн.'}${waitH >= 3 ? ': задача pult-ask-claude на ПК сейчас не запущена' : ''}`
    : 'Очередь пуста'
  return (
    <div className="rows">
      <ListRow lead="9:05" title="Почта и hh.ru" sub={'Задача funnel-sync в Claude на ПК, каждый день. ' + (runAt ? 'Последний прогон: ' + (runAt.slice(0, 10) === data.loadedAt.slice(0, 10) ? 'сегодня' : fmtDate(runAt.slice(0, 10))) + ' в ' + hhmm(runAt) + (run!.status === 'success' ? '' : ', ' + (run!.status === 'partial' ? 'частично' : run!.status === 'failed' ? 'с ошибкой' : 'идёт')) : 'прогонов ещё не было')} />
      <ListRow lead="·" title="Ответы на «Спросить Claude»" sub={'Разбирает задача pult-ask-claude на ПК. ' + queueText} leadTone={waitH >= 3 ? 'warn' : undefined} />
      <ListRow lead="6:05" title="Расписание пар" sub="Сервер забирает его из ВлГУ каждый день" />
      <ListRow lead="8:00" title="Утренняя сводка" sub="Пуш: пары, что горит, письма, карточки" />
      <ListRow lead="9:00" title="Списания подписок" sub="Пуш за сколько-то дней до платежа, срок задаётся у каждой подписки" />
      <ListRow lead="10:00" title="Черновики напоминаний HR" sub="До 3 в день для откликов через hh без ответа 7+ дней" />
      <ListRow lead="вс 19:00" title="Итоги недели" sub="Пуш: сколько подано, ответов, отказов" />
    </div>
  )
}

export function Settings({ data, backLabel, onBack, onLogout }: { data: PultData; backLabel: string; onBack: () => void; onLogout: () => void }) {
  return (
    <section className="scr">
      <Title title="Настройки" back={{ label: backLabel, onClick: onBack }} />
      <div className="rows"><ThemeRow /><PushRow /></div>
      <Fold id="set-auto" title="Автоматика" meta="что и когда делает пульт" defaultOpen={false}><Automation data={data} /></Fold>
      <Fold id="set-cal" title="Календарь и ярлык iPhone" defaultOpen={false}><CalendarLink /></Fold>
      <Fold id="set-pass" title="Вход на других устройствах" defaultOpen={false}><PasswordBox /></Fold>
      <button className="btn ghost" style={{ justifySelf: 'start', display: 'inline-flex', gap: 8, alignItems: 'center' }} onClick={onLogout}>
        <span style={{ width: 18, height: 18, display: 'inline-grid' }}>{Icons.logout}</span>Выйти</button>
    </section>
  )
}

