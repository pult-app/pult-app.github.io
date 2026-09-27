// Чистая логика ingest API: проверка тел запросов, правило статусов, перевод полей.
// Без зависимостей от Deno и Supabase, поэтому покрывается юнит-тестами (app/src/ingest.test.ts).
// Контракт: docs/05-api/openapi.yaml.

export type FieldError = { field: string; message: string }

type Rule =
  | { t: 'string'; req?: boolean; min?: number; max?: number; pattern?: RegExp; nullable?: boolean }
  | { t: 'enum'; req?: boolean; values: readonly string[] }
  | { t: 'date'; req?: boolean; nullable?: boolean }
  | { t: 'datetime'; req?: boolean }
  | { t: 'uri'; nullable?: boolean }

type Schema = Record<string, Rule>

export const VACANCY_STATUSES = ['found', 'applied', 'test', 'interview', 'offer', 'reserve', 'reject', 'skip'] as const
export const MESSAGE_KINDS = ['invite', 'test', 'offer', 'reject', 'question', 'ack', 'info'] as const
export const MESSAGE_SOURCES = ['gmail', 'hh_chat', 'telegram', 'manual'] as const
export const WORK_STATUSES = ['todo', 'doing', 'ready', 'submitted'] as const
export const TASK_KINDS = ['study', 'career', 'money', 'life'] as const

const REF = /^[a-z0-9-]{2,80}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(s: string): boolean {
  if (!DATE.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Проверка по схеме. Неизвестные поля запрещены (additionalProperties: false). */
export function validate(body: unknown, schema: Schema, opts: { partial?: boolean } = {}): FieldError[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return [{ field: '', message: 'ожидается JSON-объект' }]
  const obj = body as Record<string, unknown>
  const errors: FieldError[] = []
  for (const k of Object.keys(obj)) if (!(k in schema)) errors.push({ field: k, message: 'неизвестное поле' })
  if (opts.partial && Object.keys(obj).length === 0) errors.push({ field: '', message: 'нужно хотя бы одно поле' })
  for (const [k, r] of Object.entries(schema)) {
    const v = obj[k]
    const required = 'req' in r && r.req && !opts.partial
    if (v === undefined) { if (required) errors.push({ field: k, message: 'обязательное поле' }); continue }
    if (v === null) {
      if (('nullable' in r && r.nullable) || (r.t === 'uri')) continue
      errors.push({ field: k, message: 'не может быть null' }); continue
    }
    switch (r.t) {
      case 'string':
        if (typeof v !== 'string') { errors.push({ field: k, message: 'ожидается строка' }); break }
        if (r.min !== undefined && v.length < r.min) errors.push({ field: k, message: `не короче ${r.min} символов` })
        if (r.max !== undefined && v.length > r.max) errors.push({ field: k, message: `не длиннее ${r.max} символов` })
        if (r.pattern && !r.pattern.test(v)) errors.push({ field: k, message: 'неверный формат' })
        break
      case 'enum':
        if (typeof v !== 'string' || !r.values.includes(v)) errors.push({ field: k, message: 'одно из: ' + r.values.join(', ') })
        break
      case 'date':
        if (typeof v !== 'string' || !isValidDate(v)) errors.push({ field: k, message: 'дата ГГГГ-ММ-ДД' })
        break
      case 'datetime':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) || Number.isNaN(Date.parse(v)))
          errors.push({ field: k, message: 'дата и время ISO 8601 с зоной' })
        break
      case 'uri':
        try { new URL(String(v)) } catch { errors.push({ field: k, message: 'ожидается URL' }) }
        break
    }
  }
  return errors
}

export const SCHEMAS = {
  syncRunStart: { job: { t: 'string', req: true, min: 1, max: 60 } },
  syncRunFinish: {
    status: { t: 'enum', req: true, values: ['success', 'partial', 'failed'] },
    stats: { t: 'string', nullable: true }, // проверяется отдельно: объект чисел
    error: { t: 'string', max: 2000, nullable: true },
  },
  vacancyInput: {
    company: { t: 'string', req: true, min: 1, max: 120 },
    title: { t: 'string', req: true, min: 1, max: 200 },
    status: { t: 'enum', req: true, values: VACANCY_STATUSES },
    appliedOn: { t: 'date', nullable: true },
    deadline: { t: 'date', nullable: true },
    workFormat: { t: 'string', max: 120, nullable: true },
    channel: { t: 'string', max: 80, nullable: true },
    url: { t: 'uri', nullable: true },
    nextStep: { t: 'string', max: 500, nullable: true },
    prep: { t: 'string', max: 2000, nullable: true },
  },
  vacancyPatch: {
    status: { t: 'enum', values: VACANCY_STATUSES },
    appliedOn: { t: 'date', nullable: true },
    deadline: { t: 'date', nullable: true },
    nextStep: { t: 'string', max: 500, nullable: true },
    prep: { t: 'string', max: 2000, nullable: true },
    notes: { t: 'string', max: 4000, nullable: true },
  },
  messageInput: {
    kind: { t: 'enum', req: true, values: MESSAGE_KINDS },
    receivedAt: { t: 'datetime', req: true },
    company: { t: 'string', max: 120, nullable: true },
    vacancyRef: { t: 'string', pattern: REF, nullable: true },
    sender: { t: 'string', max: 200, nullable: true },
    subject: { t: 'string', max: 300, nullable: true },
    summary: { t: 'string', req: true, min: 1, max: 500 },
    action: { t: 'string', max: 200, nullable: true },
    deadline: { t: 'date', nullable: true },
  },
  studyWorkInput: {
    discipline: { t: 'string', req: true, min: 1, max: 200 },
    teacher: { t: 'string', max: 200, nullable: true },
    title: { t: 'string', req: true, min: 1, max: 300 },
    status: { t: 'enum', req: true, values: WORK_STATUSES },
    deadline: { t: 'date', nullable: true },
    notes: { t: 'string', max: 2000, nullable: true },
    localPath: { t: 'string', max: 300, nullable: true },
  },
  taskInput: {
    title: { t: 'string', req: true, min: 1, max: 200 },
    dueDate: { t: 'date', req: true },
    dueTime: { t: 'string', pattern: /^([01][0-9]|2[0-3]):[0-5][0-9]$/, nullable: true },
    kind: { t: 'enum', req: true, values: TASK_KINDS },
    notes: { t: 'string', max: 1000, nullable: true },
  },
  flashcardInput: {
    topic: { t: 'string', req: true, min: 1, max: 60 },
    question: { t: 'string', req: true, min: 1, max: 500 },
    answer: { t: 'string', req: true, min: 1, max: 2000 },
    source: { t: 'string', max: 200, nullable: true },
  },
} satisfies Record<string, Schema>

/** stats у запуска: объект с неотрицательными целыми. */
export function validateStats(v: unknown): FieldError[] {
  if (v === undefined || v === null) return []
  if (typeof v !== 'object' || Array.isArray(v)) return [{ field: 'stats', message: 'ожидается объект' }]
  return Object.entries(v as Record<string, unknown>)
    .filter(([, n]) => !Number.isInteger(n) || (n as number) < 0)
    .map(([k]) => ({ field: 'stats.' + k, message: 'неотрицательное целое' }))
}

/** Расписание: 7 пар времени и до 7 дней по 7 ячеек числителя и знаменателя. */
export function validateSchedule(b: unknown): FieldError[] {
  if (typeof b !== 'object' || b === null) return [{ field: '', message: 'ожидается JSON-объект' }]
  const o = b as Record<string, unknown>
  const e: FieldError[] = []
  for (const k of Object.keys(o)) if (!['sourceHash', 'capturedAt', 'times', 'days'].includes(k)) e.push({ field: k, message: 'неизвестное поле' })
  if (typeof o.sourceHash !== 'string' || o.sourceHash.length < 8 || o.sourceHash.length > 128) e.push({ field: 'sourceHash', message: 'строка 8-128 символов' })
  if (typeof o.capturedAt !== 'string' || Number.isNaN(Date.parse(o.capturedAt))) e.push({ field: 'capturedAt', message: 'дата и время ISO 8601' })
  const hm = /^[0-2][0-9]:[0-5][0-9]$/
  if (!Array.isArray(o.times) || o.times.length !== 7 || !o.times.every(t => Array.isArray(t) && t.length === 2 && t.every(x => typeof x === 'string' && hm.test(x))))
    e.push({ field: 'times', message: '7 пар ["ЧЧ:ММ","ЧЧ:ММ"]' })
  const cells = (a: unknown) => Array.isArray(a) && a.length === 7 && a.every(x => typeof x === 'string' && x.length <= 500)
  if (!Array.isArray(o.days) || o.days.length > 7 || !o.days.every(d => d && typeof d === 'object' && typeof (d as { name?: unknown }).name === 'string' && cells((d as { n?: unknown }).n) && cells((d as { z?: unknown }).z)))
    e.push({ field: 'days', message: 'до 7 дней: name, n[7], z[7]' })
  return e
}

// ---------- Правило статусов (US-12, ADR-003) ----------

const STAGE: Record<string, number> = { found: 0, applied: 1, test: 2, interview: 3, offer: 4 }

/** Агент не возвращает вакансию на более ранний этап. Отказ, резерв и «не подходит» ставятся с любого этапа. */
export function isDowngrade(current: string, next: string): boolean {
  if (!(current in STAGE) || !(next in STAGE)) return false
  return STAGE[next] < STAGE[current]
}

/** База требует дату подачи для всех статусов, кроме found и skip. */
export function needsAppliedOn(status: string): boolean {
  return status !== 'found' && status !== 'skip'
}

// ---------- Перевод полей API (camelCase) в колонки базы (snake_case) ----------

const MAP: Record<string, string> = {
  appliedOn: 'applied_on', workFormat: 'work_format', nextStep: 'next_step', receivedAt: 'received_at',
  localPath: 'local_path', dueDate: 'due_date', dueTime: 'due_time', isDone: 'is_done', externalRef: 'external_ref',
  followedUpOn: 'followed_up_on', updatedAt: 'updated_at', updatedBy: 'updated_by', externalId: 'external_id',
}
const BACK = Object.fromEntries(Object.entries(MAP).map(([a, b]) => [b, a]))

export function toDb(o: Record<string, unknown>, skip: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (!skip.includes(k) && v !== undefined) out[MAP[k] ?? k] = v
  return out
}

export function fromDb(o: Record<string, unknown>, skip: string[] = ['owner_id']): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (!skip.includes(k)) out[BACK[k] ?? k] = v
  return out
}

// ---------- Права токенов ----------

export const SCOPES = ['runs:write', 'vacancies:read', 'vacancies:write', 'messages:read', 'messages:write',
  'study:write', 'tasks:write', 'cards:write', 'schedule:write'] as const

/** Маршрут -> нужное право. null означает «маршрута нет». */
export function route(method: string, path: string): { scope: string; name: string; params: string[] } | null {
  const p = path.replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const m = method.toUpperCase()
  const is = (...parts: (string | null)[]) => p.length === parts.length && parts.every((x, i) => x === null || x === p[i])
  if (m === 'POST' && is('sync-runs')) return { scope: 'runs:write', name: 'startRun', params: [] }
  if (m === 'PATCH' && is('sync-runs', null)) return { scope: 'runs:write', name: 'finishRun', params: [p[1]] }
  if (m === 'GET' && is('vacancies')) return { scope: 'vacancies:read', name: 'listVacancies', params: [] }
  if (m === 'GET' && is('vacancies', null)) return { scope: 'vacancies:read', name: 'getVacancy', params: [p[1]] }
  if (m === 'PUT' && is('vacancies', null)) return { scope: 'vacancies:write', name: 'putVacancy', params: [p[1]] }
  if (m === 'PATCH' && is('vacancies', null)) return { scope: 'vacancies:write', name: 'patchVacancy', params: [p[1]] }
  if (m === 'GET' && is('messages')) return { scope: 'messages:read', name: 'listMessages', params: [] }
  if (m === 'PUT' && is('messages', null, null)) return { scope: 'messages:write', name: 'putMessage', params: [p[1], p[2]] }
  if (m === 'PUT' && is('study-works', null)) return { scope: 'study:write', name: 'putStudyWork', params: [p[1]] }
  if (m === 'PUT' && is('tasks', null)) return { scope: 'tasks:write', name: 'putTask', params: [p[1]] }
  if (m === 'POST' && is('flashcards')) return { scope: 'cards:write', name: 'createFlashcard', params: [] }
  if (m === 'PUT' && is('schedules', null)) return { scope: 'schedule:write', name: 'putSchedule', params: [p[1]] }
  return null
}

export function problem(status: number, title: string, extra: Record<string, unknown> = {}) {
  return { type: 'about:blank', title, status, ...extra }
}
