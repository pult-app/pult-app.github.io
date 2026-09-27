// agent-requests: очередь «Спросить Claude» для агента (US-19). Авторизация как в ingest: токен агента.
//   GET   /agent-requests?status=queued   запросы с контекстом вакансии        право requests:read
//   PATCH /agent-requests/{id}            {status: working|done|failed, result?, error?}   requests:write
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('')

async function agent(req: Request) {
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)
  if (!m) return null
  const hash = '\\x' + hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m[1])))
  const { data } = await db.from('agent_client').select('id, owner_id, scopes, is_active, expires_at').eq('token_sha256', hash).maybeSingle()
  if (!data || !data.is_active || Date.parse(data.expires_at) < Date.now()) return null
  return data as { id: string; owner_id: string; scopes: string[] }
}

Deno.serve(async req => {
  const a = await agent(req)
  if (!a) return json(401, { title: 'Токен неверный, отозван или истёк', status: 401 })
  const url = new URL(req.url)
  const parts = url.pathname.replace(/^.*?\/agent-requests/, '').split('/').filter(Boolean)
  try {
    if (req.method === 'GET' && parts.length === 0) {
      if (!a.scopes.includes('requests:read')) return json(403, { title: 'Нет права requests:read', status: 403 })
      const status = url.searchParams.get('status') ?? 'queued'
      const { data, error } = await db.from('agent_request')
        .select('id, kind, prompt, status, created_at, vacancy:vacancy_id(external_ref, title, status, next_step, prep, notes, url, company(name))')
        .eq('owner_id', a.owner_id).eq('status', status).order('created_at').limit(20)
      if (error) throw error
      return json(200, { items: data })
    }
    if (req.method === 'PATCH' && parts.length === 1) {
      if (!a.scopes.includes('requests:write')) return json(403, { title: 'Нет права requests:write', status: 403 })
      const b = await req.json().catch(() => null) as { status?: string; result?: string; error?: string } | null
      const errors: string[] = []
      if (!b || !['working', 'done', 'failed'].includes(String(b.status))) errors.push('status: working, done или failed')
      if (b?.result && b.result.length > 20000) errors.push('result: не длиннее 20000')
      if (b?.error && b.error.length > 1000) errors.push('error: не длиннее 1000')
      if (b && Object.keys(b).some(k => !['status', 'result', 'error'].includes(k))) errors.push('неизвестное поле')
      if (errors.length) return json(422, { title: 'Ошибка валидации', status: 422, errors })
      const now = new Date().toISOString()
      const patch: Record<string, unknown> = { status: b!.status }
      if (b!.status === 'working') patch.started_at = now
      if (b!.status === 'done' || b!.status === 'failed') { patch.done_at = now; patch.result = b!.result ?? null; patch.error = b!.error ?? null }
      const { data, error } = await db.from('agent_request').update(patch).eq('id', parts[0]).eq('owner_id', a.owner_id).select('id, status').maybeSingle()
      if (error) throw error
      if (!data) return json(404, { title: 'Запрос не найден', status: 404 })
      return json(200, data)
    }
    return json(404, { title: 'Маршрут не найден', status: 404 })
  } catch (e) {
    console.error(e)
    return json(500, { title: 'Внутренняя ошибка', status: 500 })
  }
})
