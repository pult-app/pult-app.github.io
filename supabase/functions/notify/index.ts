// notify: Web Push о письмах, которые требуют действия (US-10, ADR-002).
//   GET  /notify/public-key  публичный ключ VAPID для подписки в PWA (пара создаётся при первом вызове)
//   POST /notify/send        разобрать очередь notification; будит триггер на вставку и утренний pg_cron
// Приватный ключ VAPID не покидает сервер: он лежит в private.app_secret, доступ через RPC только у service_role.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { lessonsFor, type SchedulePayload } from './schedule.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const SUBJECT = 'https://pult-app.github.io/'
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } })

async function vapid(): Promise<{ publicKey: string; privateKey: string }> {
  const get = async (n: string) => (await db.rpc('secret_get', { p_name: n })).data as string | null
  let pub = await get('vapid_public'), priv = await get('vapid_private')
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys()
    // secret_put не перезаписывает: при гонке двух вызовов останется первая пара.
    await db.rpc('secret_put', { p_name: 'vapid_public', p_value: k.publicKey })
    await db.rpc('secret_put', { p_name: 'vapid_private', p_value: k.privateKey })
    pub = await get('vapid_public'); priv = await get('vapid_private')
  }
  return { publicKey: pub!, privateKey: priv! }
}

/** Тихие часы 23:00-8:00 по Москве (БП-4). */
function quietNow(d = new Date()): boolean {
  const h = Number(d.toLocaleString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }))
  return h >= 23 || h < 8
}

async function send(): Promise<Response> {
  const keys = await vapid()
  webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey)
  const { data: items, error } = await db.from('notification')
    .select('id, owner_id, title, body, status, message(kind)')
    .in('status', ['queued', 'held']).order('queued_at').limit(50)
  if (error) return json(500, { error: error.message })
  const quiet = quietNow()
  const stats = { sent: 0, held: 0, failed: 0 }
  for (const n of items ?? []) {
    const kind = (n.message as { kind?: string } | null)?.kind
    if (quiet && kind !== 'offer') {
      if (n.status !== 'held') await db.from('notification').update({ status: 'held' }).eq('id', n.id)
      stats.held++
      continue
    }
    const { data: subs } = await db.from('push_subscription').select('id, endpoint, p256dh, auth_secret').eq('owner_id', n.owner_id)
    if (!subs?.length) {
      await db.from('notification').update({ status: 'failed', error: 'нет подписок на устройствах' }).eq('id', n.id)
      stats.failed++
      continue
    }
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.message ? '/#inbox' : '/#today', tag: n.id })
    let ok = 0
    const errors: string[] = []
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } }, payload, { TTL: 24 * 3600, urgency: 'high' })
        ok++
        await db.from('push_subscription').update({ last_success_at: new Date().toISOString() }).eq('id', s.id)
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        // 404 и 410: подписка больше не существует, удаляем (ADR-002).
        if (code === 404 || code === 410) await db.from('push_subscription').delete().eq('id', s.id)
        errors.push(String(code ?? (e as Error).message))
      }
    }
    await db.from('notification').update(ok
      ? { status: 'sent', sent_at: new Date().toISOString(), error: errors.length ? errors.join(', ') : null }
      : { status: 'failed', error: errors.join(', ').slice(0, 500) }).eq('id', n.id)
    if (ok) stats.sent++; else stats.failed++
  }
  return json(200, { quiet, ...stats })
}

/** Утренняя сводка в 8:00 (US-10): пары, что горит, чего ждёт воронка. */
async function digest(): Promise<Response> {
  const users = await db.auth.admin.listUsers({ perPage: 2 })
  const owner = users.data?.users[0]?.id
  if (!owner) return json(200, { skipped: 'нет пользователя' })
  const t = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
  const soon = new Date(Date.parse(t + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10)
  const [sched, tasks, works, msgs, vacs, cards] = await Promise.all([
    db.from('schedule_snapshot').select('payload').eq('owner_id', owner).eq('is_current', true).maybeSingle(),
    db.from('task').select('title, due_date').eq('owner_id', owner).eq('is_done', false).lte('due_date', soon),
    db.from('study_work').select('title, deadline').eq('owner_id', owner).neq('status', 'submitted').lte('deadline', soon),
    db.from('message').select('id').eq('owner_id', owner).eq('is_done', false).in('kind', ['invite', 'test', 'question', 'offer']),
    db.from('vacancy').select('id').eq('owner_id', owner).in('status', ['test', 'interview', 'offer']),
    db.from('flashcard').select('id', { count: 'exact', head: true }).eq('owner_id', owner).lte('due_on', t),
  ])
  const parts: string[] = []
  const payload = sched.data?.payload as SchedulePayload | undefined
  if (payload) {
    const [y, m, d] = t.split('-').map(Number)
    const slots = lessonsFor(payload, new Date(y, m - 1, d)).slots
    parts.push(slots.length ? 'Пары: ' + slots.map(x => x.time[0] + ' ' + x.lessons[0].subject.split(' ').slice(0, 2).join(' ')).join(', ') : 'Пар нет')
  }
  const hot = [...(tasks.data ?? []).map(x => x.title), ...(works.data ?? []).map(x => x.title)]
  if (hot.length) parts.push('Горит: ' + hot.slice(0, 2).join('; ') + (hot.length > 2 ? ` и ещё ${hot.length - 2}` : ''))
  if (msgs.data?.length) parts.push(`Писем с действием: ${msgs.data.length}`)
  if (vacs.data?.length) parts.push(`В отборе: ${vacs.data.length}`)
  if (cards.count) parts.push(`Карточек: ${cards.count}`)
  // Вставка будит send через триггер notification_wake, второй вызов здесь дал бы дубль пуша.
  await db.from('notification').insert({ owner_id: owner, title: 'Доброе утро, Герман', body: parts.join('. ').slice(0, 300) })
  return json(200, { digest: parts })
}

/** Итоги недели по воскресеньям в 19:00: подано, ответы, отказы, отбор. */
async function weekly(): Promise<Response> {
  const users = await db.auth.admin.listUsers({ perPage: 2 })
  const owner = users.data?.users[0]?.id
  if (!owner) return json(200, { skipped: 'нет пользователя' })
  const t = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
  const since = new Date(Date.parse(t + 'T12:00:00Z') - 7 * 864e5).toISOString().slice(0, 10)
  const [applied, msgs, sel] = await Promise.all([
    db.from('vacancy').select('id', { count: 'exact', head: true }).eq('owner_id', owner).gte('applied_on', since),
    db.from('message').select('kind').eq('owner_id', owner).gte('received_at', since),
    db.from('vacancy').select('id', { count: 'exact', head: true }).eq('owner_id', owner).in('status', ['test', 'interview', 'offer']),
  ])
  const kinds = (msgs.data ?? []).map(m => m.kind as string)
  const live = kinds.filter(k => ['invite', 'test', 'question', 'offer'].includes(k)).length
  const rejects = kinds.filter(k => k === 'reject').length
  const a = applied.count ?? 0
  const parts = [`Подано: ${a}`, `живых ответов: ${live}`, `отказов: ${rejects}`, `в отборе: ${sel.count ?? 0}`]
  if (a) parts.push(`ответили на ${Math.round((live + rejects) / a * 100)}% откликов`)
  const body = parts.join(', ') + '. ' + (a < 10 ? 'На неделе стоит подать больше.' : 'Держим темп.')
  await db.from('notification').insert({ owner_id: owner, title: 'Итоги недели', body: body.slice(0, 300) })
  return json(200, { weekly: body, since })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const path = new URL(req.url).pathname.replace(/^.*?\/notify/, '')
  try {
    if (req.method === 'GET' && path === '/public-key') return json(200, { publicKey: (await vapid()).publicKey })
    if (req.method === 'POST' && path === '/send') return await send()
    if (req.method === 'POST' && path === '/digest') return await digest()
    if (req.method === 'POST' && path === '/weekly') return await weekly()
    return json(404, { error: 'маршрут не найден' })
  } catch (e) {
    console.error(e)
    return json(500, { error: 'внутренняя ошибка' })
  }
})
