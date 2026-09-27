// ingest API для ИИ-агентов (ADR-003, docs/05-api/openapi.yaml).
// Адрес: https://<project>.supabase.co/functions/v1/ingest/v1/...
// Функция развёрнута с verify_jwt = false: авторизация своя, по токену агента.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  fromDb, isDowngrade, needsAppliedOn, problem, route, SCHEMAS, toDb, validate, validateSchedule, validateStats,
  type FieldError,
} from './rules.ts'

type Agent = { id: string; owner_id: string; scopes: string[] }
type Ctx = { db: SupabaseClient; agent: Agent; req: Request; url: URL; params: string[] }

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
const fail = (status: number, title: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(problem(status, title, extra)), {
    status, headers: { 'content-type': 'application/problem+json; charset=utf-8', ...headers },
  })
const invalid = (errors: FieldError[], code?: string) => fail(422, 'Ошибка валидации', { errors, ...(code ? { code } : {}) })
const etag = (v: number) => `"${v}"`

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('')

async function readJson(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return undefined }
}

async function authenticate(req: Request): Promise<Agent | Response> {
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)
  if (!m) return fail(401, 'Нужен токен агента')
  const hash = '\\x' + hex(await sha256(m[1]))
  const { data, error } = await db.from('agent_client')
    .select('id, owner_id, scopes, is_active, expires_at').eq('token_sha256', hash).maybeSingle()
  if (error) return fail(500, 'Ошибка базы')
  if (!data || !data.is_active || Date.parse(data.expires_at) < Date.now()) return fail(401, 'Токен неверный, отозван или истёк')
  await db.from('agent_client').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  return { id: data.id, owner_id: data.owner_id, scopes: data.scopes }
}

async function companyId(c: Ctx, name: string | null | undefined): Promise<string | null> {
  if (!name) return null
  const { data } = await c.db.from('company').select('id').eq('owner_id', c.agent.owner_id).eq('name', name).maybeSingle()
  if (data) return data.id
  const ins = await c.db.from('company').insert({ owner_id: c.agent.owner_id, name }).select('id').single()
  if (ins.error) throw ins.error
  return ins.data.id
}

async function vacancyByRef(c: Ctx, ref: string) {
  return await c.db.from('vacancy').select('*, company(name)').eq('owner_id', c.agent.owner_id).eq('external_ref', ref).maybeSingle()
}

function vacancyOut(v: Record<string, unknown>) {
  const { company, row_version, id: _id, company_id: _c, created_at: _ca, ...rest } = v as Record<string, unknown> & { company: { name: string } | null }
  return { ...fromDb(rest), ref: v.external_ref, company: company?.name ?? null, version: row_version }
}

// ---------- обработчики ----------

const handlers: Record<string, (c: Ctx) => Promise<Response>> = {
  async startRun(c) {
    const b = await readJson(c.req)
    const e = validate(b, SCHEMAS.syncRunStart)
    if (e.length) return invalid(e)
    const { data, error } = await c.db.from('sync_run').insert({ agent_client_id: c.agent.id, job: (b as { job: string }).job })
      .select().single()
    if (error) throw error
    return json(201, fromDb(data))
  },

  async finishRun(c) {
    const b = await readJson(c.req) as Record<string, unknown> | undefined
    const e = [...validate(b ? { ...b, stats: undefined } : b, SCHEMAS.syncRunFinish), ...validateStats(b?.stats)]
    if (e.length) return invalid(e)
    const cur = await c.db.from('sync_run').select('id, status').eq('id', c.params[0]).eq('agent_client_id', c.agent.id).maybeSingle()
    if (!cur.data) return fail(404, 'Запуск не найден')
    if (cur.data.status !== 'running') return fail(409, 'Запуск уже закрыт')
    const { data, error } = await c.db.from('sync_run')
      .update({ status: b!.status, stats: b!.stats ?? {}, error: b!.error ?? null, finished_at: new Date().toISOString() })
      .eq('id', c.params[0]).select().single()
    if (error) throw error
    return json(200, fromDb(data))
  },

  async listVacancies(c) {
    const limit = Math.min(Math.max(Number(c.url.searchParams.get('limit') ?? 50) || 50, 1), 200)
    const offset = Math.max(Number(c.url.searchParams.get('cursor') ?? 0) || 0, 0)
    let q = c.db.from('vacancy').select('*, company(name)').eq('owner_id', c.agent.owner_id).order('updated_at', { ascending: false })
    const status = c.url.searchParams.get('status')
    const since = c.url.searchParams.get('updatedSince')
    if (status) q = q.eq('status', status)
    if (since) q = q.gt('updated_at', since)
    const { data, error } = await q.range(offset, offset + limit)
    if (error) throw error
    const more = data.length > limit
    return json(200, { items: data.slice(0, limit).map(vacancyOut), nextCursor: more ? String(offset + limit) : null })
  },

  async getVacancy(c) {
    const { data } = await vacancyByRef(c, c.params[0])
    if (!data) return fail(404, 'Вакансия не найдена')
    return json(200, vacancyOut(data), { etag: etag(data.row_version) })
  },

  async putVacancy(c) {
    const ref = c.params[0]
    if (!/^[a-z0-9-]{2,80}$/.test(ref)) return invalid([{ field: 'ref', message: 'латиница, цифры, дефис' }])
    const b = await readJson(c.req) as Record<string, unknown>
    const e = validate(b, SCHEMAS.vacancyInput)
    if (e.length) return invalid(e)
    if (needsAppliedOn(String(b.status)) && !b.appliedOn) return invalid([{ field: 'appliedOn', message: 'обязательно для этого статуса' }])
    const cid = await companyId(c, String(b.company))
    const cur = await vacancyByRef(c, ref)
    const row = toDb(b, ['company'])
    if (!cur.data) {
      const ins = await c.db.from('vacancy').insert({ ...row, owner_id: c.agent.owner_id, company_id: cid, external_ref: ref, updated_by: 'agent' })
        .select('*, company(name)').single()
      if (ins.error) throw ins.error
      return json(201, vacancyOut(ins.data), { etag: etag(ins.data.row_version), location: `/ingest/v1/vacancies/${ref}` })
    }
    if (isDowngrade(cur.data.status, String(b.status))) return invalid([{ field: 'status', message: 'агент не возвращает вакансию на более ранний этап' }], 'status-downgrade')
    // Поля, которые Герман правил руками, агент через PUT не трогает.
    if (cur.data.updated_by === 'owner') { delete row.next_step; delete row.prep }
    const upd = await c.db.from('vacancy').update({ ...row, company_id: cid, updated_by: 'agent' }).eq('id', cur.data.id)
      .select('*, company(name)').single()
    if (upd.error) throw upd.error
    return json(200, vacancyOut(upd.data), { etag: etag(upd.data.row_version) })
  },

  async patchVacancy(c) {
    const ifMatch = c.req.headers.get('if-match')
    if (!ifMatch) return fail(428, 'Нужен заголовок If-Match')
    const b = await readJson(c.req) as Record<string, unknown>
    const e = validate(b, SCHEMAS.vacancyPatch, { partial: true })
    if (e.length) return invalid(e)
    const cur = await vacancyByRef(c, c.params[0])
    if (!cur.data) return fail(404, 'Вакансия не найдена')
    if (ifMatch.replace(/^W\//, '') !== etag(cur.data.row_version))
      return fail(412, 'Версия устарела, перечитайте запись', {}, { etag: etag(cur.data.row_version) })
    if (b.status && isDowngrade(cur.data.status, String(b.status)))
      return invalid([{ field: 'status', message: 'агент не возвращает вакансию на более ранний этап' }], 'status-downgrade')
    const row = toDb(b)
    if (b.status && needsAppliedOn(String(b.status)) && !cur.data.applied_on && !row.applied_on) row.applied_on = new Date().toISOString().slice(0, 10)
    // Условие по версии в самом UPDATE закрывает гонку между чтением и записью.
    const upd = await c.db.from('vacancy').update({ ...row, updated_by: 'agent' })
      .eq('id', cur.data.id).eq('row_version', cur.data.row_version).select('*, company(name)').maybeSingle()
    if (upd.error) throw upd.error
    if (!upd.data) return fail(412, 'Версия устарела, перечитайте запись')
    return json(200, vacancyOut(upd.data), { etag: etag(upd.data.row_version) })
  },

  async listMessages(c) {
    const since = c.url.searchParams.get('since')
    if (!since || Number.isNaN(Date.parse(since))) return invalid([{ field: 'since', message: 'дата и время ISO 8601' }])
    const limit = Math.min(Math.max(Number(c.url.searchParams.get('limit') ?? 50) || 50, 1), 200)
    const offset = Math.max(Number(c.url.searchParams.get('cursor') ?? 0) || 0, 0)
    const { data, error } = await c.db.from('message').select('*, company(name), vacancy(external_ref)')
      .eq('owner_id', c.agent.owner_id).gte('received_at', since).order('received_at').range(offset, offset + limit)
    if (error) throw error
    const items = data.slice(0, limit).map(m => {
      const { company, vacancy, company_id: _c, vacancy_id: _v, ...rest } = m
      return { ...fromDb(rest), company: company?.name ?? null, vacancyRef: vacancy?.external_ref ?? null }
    })
    return json(200, { items, nextCursor: data.length > limit ? String(offset + limit) : null })
  },

  async putMessage(c) {
    const [source, externalId] = c.params
    if (!['gmail', 'hh_chat', 'telegram', 'manual'].includes(source)) return fail(404, 'Неизвестный источник')
    if (externalId.length > 200) return invalid([{ field: 'externalId', message: 'не длиннее 200 символов' }])
    const b = await readJson(c.req) as Record<string, unknown>
    const e = validate(b, SCHEMAS.messageInput)
    if (e.length) return invalid(e)
    let vacancyId: string | null = null
    let cid = await companyId(c, b.company as string | null)
    if (b.vacancyRef) {
      const v = await vacancyByRef(c, String(b.vacancyRef))
      if (!v.data) return invalid([{ field: 'vacancyRef', message: 'вакансия не найдена' }])
      vacancyId = v.data.id
      cid ??= v.data.company_id
    }
    const row = { ...toDb(b, ['company', 'vacancyRef']), owner_id: c.agent.owner_id, source, external_id: externalId, company_id: cid, vacancy_id: vacancyId }
    const exists = await c.db.from('message').select('id').eq('owner_id', c.agent.owner_id).eq('source', source).eq('external_id', externalId).maybeSingle()
    // is_done ведёт Герман: при повторной записи он не меняется.
    const res = exists.data
      ? await c.db.from('message').update(row).eq('id', exists.data.id).select().single()
      : await c.db.from('message').insert(row).select().single()
    if (res.error) throw res.error
    return json(exists.data ? 200 : 201, fromDb(res.data), exists.data ? {} : { location: `/ingest/v1/messages/${source}/${encodeURIComponent(externalId)}` })
  },

  async putStudyWork(c) {
    const code = c.params[0]
    if (!/^[a-z0-9-]{2,60}$/.test(code)) return invalid([{ field: 'code', message: 'латиница, цифры, дефис' }])
    const b = await readJson(c.req) as Record<string, unknown>
    const e = validate(b, SCHEMAS.studyWorkInput)
    if (e.length) return invalid(e)
    const disc = await c.db.from('discipline').upsert({ owner_id: c.agent.owner_id, name: b.discipline, ...(b.teacher ? { teacher: b.teacher } : {}) },
      { onConflict: 'owner_id,name' }).select('id').single()
    if (disc.error) throw disc.error
    const cur = await c.db.from('study_work').select('id, updated_by').eq('owner_id', c.agent.owner_id).eq('code', code).maybeSingle()
    const row = { ...toDb(b, ['discipline', 'teacher']), discipline_id: disc.data.id, updated_by: 'agent' }
    if (cur.data?.updated_by === 'owner') delete (row as Record<string, unknown>).status // статус Германа не откатываем
    const res = cur.data
      ? await c.db.from('study_work').update(row).eq('id', cur.data.id).select().single()
      : await c.db.from('study_work').insert({ ...row, owner_id: c.agent.owner_id, code }).select().single()
    if (res.error) throw res.error
    return json(cur.data ? 200 : 201, fromDb(res.data))
  },

  async putTask(c) {
    const externalId = c.params[0]
    if (externalId.length > 120) return invalid([{ field: 'externalId', message: 'не длиннее 120 символов' }])
    const b = await readJson(c.req) as Record<string, unknown>
    const e = validate(b, SCHEMAS.taskInput)
    if (e.length) return invalid(e)
    const cur = await c.db.from('task').select('id').eq('owner_id', c.agent.owner_id).eq('external_id', externalId).maybeSingle()
    const row = toDb(b)
    const res = cur.data
      ? await c.db.from('task').update(row).eq('id', cur.data.id).select().single()
      : await c.db.from('task').insert({ ...row, owner_id: c.agent.owner_id, external_id: externalId, created_by: 'agent' }).select().single()
    if (res.error) throw res.error
    return json(cur.data ? 200 : 201, fromDb(res.data))
  },

  async createFlashcard(c) {
    const key = c.req.headers.get('idempotency-key')
    if (!key || key.length < 8 || key.length > 100) return invalid([{ field: 'Idempotency-Key', message: 'заголовок 8-100 символов' }])
    const raw = await c.req.text()
    let b: unknown
    try { b = JSON.parse(raw) } catch { b = undefined }
    const e = validate(b, SCHEMAS.flashcardInput)
    if (e.length) return invalid(e)
    const reqHash = '\\x' + hex(await sha256(raw))
    const prev = await c.db.from('idempotency_key').select('request_sha256, response_status, response_body, created_at')
      .eq('agent_client_id', c.agent.id).eq('key', key).maybeSingle()
    if (prev.data && Date.parse(prev.data.created_at) > Date.now() - 864e5) {
      if (prev.data.request_sha256 !== reqHash) return invalid([{ field: 'Idempotency-Key', message: 'ключ уже использован с другим телом' }], 'idempotency-key-reused')
      return json(prev.data.response_status, prev.data.response_body)
    }
    const ins = await c.db.from('flashcard').insert({ ...(b as Record<string, unknown>), owner_id: c.agent.owner_id }).select().single()
    if (ins.error) throw ins.error
    const body = fromDb(ins.data)
    await c.db.from('idempotency_key').upsert({ agent_client_id: c.agent.id, key, request_sha256: reqHash, response_status: 201, response_body: body, created_at: new Date().toISOString() })
    return json(201, body)
  },

  async putSchedule(c) {
    const group = c.params[0]
    if (group.length > 40) return invalid([{ field: 'groupCode', message: 'не длиннее 40 символов' }])
    const b = await readJson(c.req) as Record<string, unknown>
    const e = validateSchedule(b)
    if (e.length) return invalid(e)
    const cur = await c.db.from('schedule_snapshot').select('id, source_hash').eq('owner_id', c.agent.owner_id).eq('group_code', group).eq('is_current', true).maybeSingle()
    if (cur.data?.source_hash === b.sourceHash) return json(200, { groupCode: group, sourceHash: b.sourceHash, changed: false })
    if (cur.data) await c.db.from('schedule_snapshot').update({ is_current: false }).eq('id', cur.data.id)
    const ins = await c.db.from('schedule_snapshot').upsert({
      owner_id: c.agent.owner_id, group_code: group, source_hash: b.sourceHash, captured_at: b.capturedAt,
      payload: { times: b.times, days: b.days }, is_current: true,
    }, { onConflict: 'owner_id,group_code,source_hash' })
    if (ins.error) throw ins.error
    return json(201, { groupCode: group, sourceHash: b.sourceHash, changed: true })
  },
}

Deno.serve(async req => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^.*?\/ingest\/v1/, '')
  if (!url.pathname.includes('/ingest/v1')) return fail(404, 'Маршрут не найден')
  const r = route(req.method, path)
  if (!r) return fail(404, 'Маршрут не найден')
  const agent = await authenticate(req)
  if (agent instanceof Response) return agent
  if (!agent.scopes.includes(r.scope)) return fail(403, 'У токена нет права ' + r.scope)
  try {
    return await handlers[r.name]({ db, agent, req, url, params: r.params })
  } catch (err) {
    console.error(r.name, err)
    return fail(500, 'Внутренняя ошибка')
  }
})
