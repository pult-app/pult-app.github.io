// Строки таблиц, как их отдаёт Data API (docs/03-data/schema.sql).

export type VacancyStatus = 'found' | 'applied' | 'test' | 'interview' | 'offer' | 'reserve' | 'reject' | 'skip'
export type MessageKind = 'invite' | 'test' | 'offer' | 'reject' | 'question' | 'ack' | 'info'
export type WorkStatus = 'todo' | 'doing' | 'ready' | 'submitted'
export type TaskKind = 'study' | 'career' | 'money' | 'life'

export interface Vacancy {
  id: string
  company_id: string
  external_ref: string
  title: string
  status: VacancyStatus
  work_format: string | null
  channel: string | null
  url: string | null
  applied_on: string | null
  deadline: string | null
  followed_up_on: string | null
  next_step: string | null
  prep: string | null
  notes: string | null
  updated_at: string
  company: { name: string } | null
}

export interface Message {
  id: string
  vacancy_id: string | null
  source: string
  kind: MessageKind
  received_at: string
  sender: string | null
  subject: string | null
  summary: string
  action: string | null
  deadline: string | null
  is_done: boolean
  company: { name: string } | null
}

export interface StudyWork {
  id: string
  code: string
  title: string
  status: WorkStatus
  deadline: string | null
  notes: string | null
  local_path: string | null
  updated_at: string
  discipline: { name: string; teacher: string | null } | null
}

export interface Task {
  id: string
  title: string
  due_date: string
  due_time: string | null
  kind: TaskKind
  is_done: boolean
  notes: string | null
}

export interface Flashcard {
  id: string
  topic: string
  question: string
  answer: string
  box: number
  due_on: string
}

export interface ScheduleSnapshot {
  id: string
  group_code: string
  captured_at: string
  payload: import('./schedule').SchedulePayload
}

export interface SyncRun {
  id: string
  job: string
  status: 'running' | 'success' | 'partial' | 'failed'
  started_at: string
  finished_at: string | null
}

export interface AgentRequest {
  id: string
  vacancy_id: string | null
  kind: 'prep' | 'followup' | 'analyze' | 'custom'
  prompt: string
  status: 'queued' | 'working' | 'done' | 'failed' | 'cancelled'
  result: string | null
  error: string | null
  created_at: string
  done_at: string | null
}

export interface PultData {
  vacancies: Vacancy[]
  messages: Message[]
  works: StudyWork[]
  tasks: Task[]
  cards: Flashcard[]
  schedule: ScheduleSnapshot | null
  lastRun: SyncRun | null
  requests: AgentRequest[]
  loadedAt: string
}
