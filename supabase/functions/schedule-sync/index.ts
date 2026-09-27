// schedule-sync: раз в сутки забирает расписание ПИ-124 из проекта ЛАД и пишет снимок (ADR-004).
// Вызывается pg_cron через pg_net. Функция идемпотентна: одинаковый хэш ничего не меняет,
// поэтому её безопасно вызвать публичным ключом.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SOURCE = 'https://raw.githubusercontent.com/Gerakl-ai/vlsu-pi-124-schedule/data/data/schedule/7936a2a43b11b20b01d30f5b00c73166.json'
const GROUP = 'ПИ-124'
const TIMES = [['08:30', '10:00'], ['10:20', '11:50'], ['12:10', '13:40'], ['14:00', '15:30'], ['15:50', '17:20'], ['17:40', '19:10'], ['19:20', '20:50']]

type LadDay = { name: string; type: string } & Record<string, string>

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

Deno.serve(async () => {
  // Пользователь один (US-15): снимок пишется ему.
  const users = await db.auth.admin.listUsers({ perPage: 2 })
  if (users.error) return json(500, { error: users.error.message })
  if (users.data.users.length !== 1) return json(200, { skipped: 'ожидался ровно один пользователь', users: users.data.users.length })
  const owner = users.data.users[0].id

  const res = await fetch(SOURCE, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) return json(502, { error: 'ЛАД ответил ' + res.status })
  const raw = await res.json() as { capturedAt: string; scheduleHash?: string; schedule: LadDay[]; quality?: { valid?: boolean } }
  if (raw.quality && raw.quality.valid === false) return json(200, { skipped: 'ЛАД пометил снимок как невалидный' })
  const days = raw.schedule.filter(d => d.type === 'Lessons').map(d => ({
    name: d.name,
    n: [1, 2, 3, 4, 5, 6, 7].map(i => d['n' + i] ?? ''),
    z: [1, 2, 3, 4, 5, 6, 7].map(i => d['z' + i] ?? ''),
  }))
  if (!days.length || !raw.scheduleHash) return json(422, { error: 'в ответе ЛАД нет пар или хэша' })

  const cur = await db.from('schedule_snapshot').select('id, source_hash').eq('owner_id', owner).eq('group_code', GROUP).eq('is_current', true).maybeSingle()
  if (cur.data?.source_hash === raw.scheduleHash) return json(200, { changed: false, sourceHash: raw.scheduleHash })
  if (cur.data) await db.from('schedule_snapshot').update({ is_current: false }).eq('id', cur.data.id)
  const ins = await db.from('schedule_snapshot').upsert({
    owner_id: owner, group_code: GROUP, source_hash: raw.scheduleHash, captured_at: raw.capturedAt,
    payload: { times: TIMES, days }, is_current: true,
  }, { onConflict: 'owner_id,group_code,source_hash' })
  if (ins.error) return json(500, { error: ins.error.message })
  return json(201, { changed: true, sourceHash: raw.scheduleHash, days: days.length })
})
