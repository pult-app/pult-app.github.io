import { createClient } from '@supabase/supabase-js'
import type { PultData } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const configured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

const CACHE = 'pult-cache-v1'

export function readCache(): PultData | null {
  try { const raw = localStorage.getItem(CACHE); return raw ? JSON.parse(raw) as PultData : null } catch { return null }
}
function writeCache(d: PultData) {
  try { localStorage.setItem(CACHE, JSON.stringify(d)) } catch { /* кэш необязателен */ }
}
export function clearCache() {
  try { localStorage.removeItem(CACHE) } catch { /* пусто */ }
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export async function loadAll(): Promise<PultData> {
  const [vacancies, messages, works, tasks, cards, schedule, runs] = await Promise.all([
    supabase.from('vacancy').select('*, company(name)'),
    supabase.from('message').select('id, vacancy_id, source, kind, received_at, sender, subject, summary, action, deadline, is_done, company(name)'),
    supabase.from('study_work').select('*, discipline(name, teacher)'),
    supabase.from('task').select('id, title, due_date, due_time, kind, is_done, notes'),
    supabase.from('flashcard').select('id, topic, question, answer, box, due_on'),
    supabase.from('schedule_snapshot').select('id, group_code, captured_at, payload').eq('is_current', true).limit(1),
    supabase.from('sync_run').select('id, job, status, started_at, finished_at').order('started_at', { ascending: false }).limit(1),
  ])
  const data: PultData = {
    vacancies: must(vacancies) as unknown as PultData['vacancies'],
    messages: must(messages) as unknown as PultData['messages'],
    works: must(works) as unknown as PultData['works'],
    tasks: must(tasks),
    cards: must(cards),
    schedule: (must(schedule) as unknown as PultData['schedule'][])[0] ?? null,
    lastRun: (must(runs) as PultData['lastRun'][])[0] ?? null,
    loadedAt: new Date().toISOString(),
  }
  writeCache(data)
  return data
}

/** Обновление одной строки. RLS в базе пропускает только строки владельца. */
export async function update(table: string, id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await supabase.from(table).insert(row).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}

/** Найти или создать строку справочника по имени (компания, предмет). */
export async function ensureByName(table: 'company' | 'discipline', name: string, extra: Record<string, unknown> = {}) {
  const found = await supabase.from(table).select('id').eq('name', name).maybeSingle()
  if (found.error) throw new Error(found.error.message)
  if (found.data) return found.data.id as string
  return insert(table, { name, ...extra })
}

export const slug = (prefix: string) => prefix + '-' + Date.now().toString(36)
