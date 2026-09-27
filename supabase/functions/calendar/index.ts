// calendar: подписка на календарь (iPhone «Календарь», Google). GET /calendar/<секрет>.ics
// Пары на 14 дней вперёд, собеседования и сроки вакансий, сроки писем, учёбы и дела.
// Секрет в ссылке: ics_token из private.app_secret, выдаётся владельцу в пульте, можно сменить.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { lessonsFor, LESSON_TYPES, type SchedulePayload } from './schedule.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const fold = (line: string) => { const out: string[] = []; let rest = line; while (new TextEncoder().encode(rest).length > 73) { let n = 70; while (new TextEncoder().encode(rest.slice(0, n)).length > 73) n--; out.push(rest.slice(0, n)); rest = ' ' + rest.slice(n) } out.push(rest); return out.join('\r\n') }
const ymd = (d: string) => d.replaceAll('-', '')
const nextDay = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) }
/** Москва = UTC+3 круглый год: переводим ЧЧ:ММ в UTC без VTIMEZONE. */
const utc = (d: string, hm: string) => { const x = new Date(`${d}T${hm}:00+03:00`); return x.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z' }

function event(uid: string, summary: string, start: string, end: string, allDay: boolean, desc = '') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  return ['BEGIN:VEVENT', `UID:${uid}@pult-app`, `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`, allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${esc(summary)}`, ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []), 'END:VEVENT'].map(fold)
}

Deno.serve(async req => {
  const m = new URL(req.url).pathname.match(/\/calendar\/([A-Za-z0-9_\-=]{16,64})\.ics$/)
  const secret = (await db.rpc('secret_get', { p_name: 'ics_token' })).data as string | null
  if (!m || !secret || m[1] !== secret) return new Response('not found', { status: 404 })
  const users = await db.auth.admin.listUsers({ perPage: 2 })
  const owner = users.data?.users[0]?.id
  if (!owner) return new Response('not found', { status: 404 })

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })
  const [vac, msg, work, task, sched] = await Promise.all([
    db.from('vacancy').select('id, title, status, deadline, next_step, company(name)').eq('owner_id', owner).not('deadline', 'is', null),
    db.from('message').select('id, action, summary, deadline, is_done, company(name)').eq('owner_id', owner).eq('is_done', false).not('deadline', 'is', null),
    db.from('study_work').select('id, title, status, deadline, discipline(name)').eq('owner_id', owner).neq('status', 'submitted').not('deadline', 'is', null),
    db.from('task').select('id, title, due_date, due_time, is_done').eq('owner_id', owner).eq('is_done', false),
    db.from('schedule_snapshot').select('payload').eq('owner_id', owner).eq('is_current', true).maybeSingle(),
  ])
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pult-app//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Пульт', 'X-WR-TIMEZONE:Europe/Moscow', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H']
  const co = (x: { company?: { name: string } | null }) => x.company?.name ?? ''

  for (const v of vac.data ?? []) if (!['reject', 'skip'].includes(v.status))
    lines.push(...event('v-' + v.id, `${co(v)}: ${v.next_step?.slice(0, 60) || 'срок по вакансии'}`, ymd(v.deadline!), ymd(nextDay(v.deadline!)), true, v.title))
  for (const x of msg.data ?? [])
    lines.push(...event('m-' + x.id, `${co(x)}: ${(x.action || x.summary).slice(0, 70)}`, ymd(x.deadline!), ymd(nextDay(x.deadline!)), true))
  for (const w of work.data ?? [])
    lines.push(...event('w-' + w.id, `Сдать: ${w.title}`.slice(0, 90), ymd(w.deadline!), ymd(nextDay(w.deadline!)), true, (w.discipline as { name: string } | null)?.name ?? ''))
  for (const k of task.data ?? []) {
    if (k.due_time) { const hm = k.due_time.slice(0, 5); const end = new Date(`${k.due_date}T${hm}:00+03:00`); end.setMinutes(end.getMinutes() + 30)
      lines.push(...event('t-' + k.id, k.title, utc(k.due_date, hm), end.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', false)) }
    else lines.push(...event('t-' + k.id, k.title, ymd(k.due_date), ymd(nextDay(k.due_date)), true))
  }
  const payload = sched.data?.payload as SchedulePayload | undefined
  if (payload) {
    let d = today
    for (let i = 0; i < 14; i++) {
      const [y, mo, dd] = d.split('-').map(Number)
      for (const s of lessonsFor(payload, new Date(y, mo - 1, dd)).slots) {
        const l = s.lessons[0]
        const where = [LESSON_TYPES[l.type] || l.type, l.room].filter(Boolean).join(', ')
        lines.push(...event(`l-${d}-${s.index}`, `${l.subject}${where ? ' (' + where + ')' : ''}`, utc(d, s.time[0]), utc(d, s.time[1]), false,
          s.lessons.map(x => [x.subject, x.teacher, x.room].filter(Boolean).join(', ')).join('\n')))
      }
      d = nextDay(d)
    }
  }
  lines.push('END:VCALENDAR')
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-cache' } })
})
