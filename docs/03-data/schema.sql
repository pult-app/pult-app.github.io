-- Пульт Германа: схема базы данных (PostgreSQL в Supabase)
-- Версия 1.0, 27.09.2026. Источник правды для ER-модели (er-model.md).
-- Все бизнес-таблицы содержат owner_id: сейчас пользователь один, но RLS и будущий
-- многопользовательский режим работают по этому полю.

create extension if not exists pgcrypto;

-- ---------- Перечисления ----------

create type vacancy_status as enum
  ('found', 'applied', 'test', 'interview', 'offer', 'reserve', 'reject', 'skip');
create type message_kind as enum
  ('invite', 'test', 'offer', 'reject', 'question', 'ack', 'info');
create type message_source as enum ('gmail', 'hh_chat', 'telegram', 'manual');
create type work_status as enum ('todo', 'doing', 'ready', 'submitted');
create type task_kind as enum ('study', 'career', 'money', 'life');
create type actor_kind as enum ('owner', 'agent', 'system');
create type run_status as enum ('running', 'success', 'partial', 'failed');
create type notify_channel as enum ('webpush', 'telegram');
create type notify_status as enum ('queued', 'held', 'sent', 'failed');

-- ---------- Общая функция для updated_at и версии строки ----------

create function touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

-- ---------- Воронка стажировок ----------

create table company (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  site        text,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

create table vacancy (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_id      uuid not null references company (id) on delete restrict,
  external_ref    text not null check (external_ref ~ '^[a-z0-9-]{2,80}$'),
  title           text not null check (char_length(title) between 1 and 200),
  status          vacancy_status not null default 'found',
  work_format     text check (char_length(work_format) <= 120),
  channel         text check (char_length(channel) <= 80),
  url             text,
  applied_on      date,
  deadline        date,
  followed_up_on  date,
  next_step       text check (char_length(next_step) <= 500),
  prep            text check (char_length(prep) <= 2000),
  notes           text check (char_length(notes) <= 4000),
  updated_by      actor_kind not null default 'owner',
  row_version     integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, external_ref),
  check (status in ('found', 'skip') or applied_on is not null)
);

create table vacancy_status_history (
  id           bigint generated always as identity primary key,
  vacancy_id   uuid not null references vacancy (id) on delete cascade,
  from_status  vacancy_status,
  to_status    vacancy_status not null,
  changed_by   actor_kind not null,
  changed_at   timestamptz not null default now()
);

create table message (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_id   uuid references company (id) on delete set null,
  vacancy_id   uuid references vacancy (id) on delete set null,
  source       message_source not null,
  external_id  text not null check (char_length(external_id) <= 200),
  kind         message_kind not null,
  received_at  timestamptz not null,
  sender       text check (char_length(sender) <= 200),
  subject      text check (char_length(subject) <= 300),
  summary      text not null check (char_length(summary) between 1 and 500),
  action       text check (char_length(action) <= 200),
  deadline     date,
  is_done      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (owner_id, source, external_id)
);

-- ---------- Учёба ----------

create table discipline (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 200),
  teacher   text check (char_length(teacher) <= 200),
  unique (owner_id, name)
);

create table study_work (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  discipline_id  uuid not null references discipline (id) on delete restrict,
  code           text not null check (code ~ '^[a-z0-9-]{2,60}$'),
  title          text not null check (char_length(title) between 1 and 300),
  status         work_status not null default 'todo',
  deadline       date,
  notes          text check (char_length(notes) <= 2000),
  local_path     text check (char_length(local_path) <= 300),
  updated_by     actor_kind not null default 'owner',
  row_version    integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, code)
);

create table schedule_snapshot (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_code   text not null check (char_length(group_code) <= 40),
  source_hash  text not null,
  captured_at  timestamptz not null,
  payload      jsonb not null,
  is_current   boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (owner_id, group_code, source_hash)
);
-- У группы ровно один текущий снимок.
create unique index schedule_one_current
  on schedule_snapshot (owner_id, group_code) where is_current;

-- ---------- Дела ----------

create table task (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  external_id  text check (char_length(external_id) <= 120),
  title        text not null check (char_length(title) between 1 and 200),
  due_date     date not null,
  due_time     time,
  kind         task_kind not null default 'life',
  is_done      boolean not null default false,
  notes        text check (char_length(notes) <= 1000),
  created_by   actor_kind not null default 'owner',
  created_at   timestamptz not null default now(),
  unique (owner_id, external_id)
);

-- ---------- Тренажёр ----------

create table flashcard (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic       text not null check (char_length(topic) <= 60),
  question    text not null check (char_length(question) between 1 and 500),
  answer      text not null check (char_length(answer) between 1 and 2000),
  box         smallint not null default 0 check (box between 0 and 4),
  due_on      date not null default current_date,
  source      text check (char_length(source) <= 200),
  created_at  timestamptz not null default now()
);

create table card_review (
  id            bigint generated always as identity primary key,
  flashcard_id  uuid not null references flashcard (id) on delete cascade,
  knew          boolean not null,
  box_before    smallint not null check (box_before between 0 and 4),
  box_after     smallint not null check (box_after between 0 and 4),
  reviewed_at   timestamptz not null default now()
);

-- ---------- Агенты, уведомления, журналы ----------

create table agent_client (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (name ~ '^[a-z0-9-]{3,40}$'),
  token_sha256  bytea not null unique,
  scopes        text[] not null,
  is_active     boolean not null default true,
  expires_at    timestamptz not null,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (owner_id, name)
);

create table sync_run (
  id               uuid primary key default gen_random_uuid(),
  agent_client_id  uuid not null references agent_client (id) on delete cascade,
  job              text not null check (char_length(job) <= 60),
  status           run_status not null default 'running',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  stats            jsonb not null default '{}'::jsonb,
  error            text check (char_length(error) <= 2000),
  check (finished_at is null or finished_at >= started_at)
);

create table idempotency_key (
  agent_client_id  uuid not null references agent_client (id) on delete cascade,
  key              text not null check (char_length(key) between 8 and 100),
  request_sha256   bytea not null,
  response_status  smallint not null,
  response_body    jsonb not null,
  created_at       timestamptz not null default now(),
  primary key (agent_client_id, key)
);

create table push_subscription (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth_secret      text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz
);

create table notification (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id   uuid references message (id) on delete set null,
  channel      notify_channel not null default 'webpush',
  title        text not null check (char_length(title) <= 120),
  body         text not null check (char_length(body) <= 300),
  status       notify_status not null default 'queued',
  queued_at    timestamptz not null default now(),
  sent_at      timestamptz,
  error        text
);

-- ---------- Индексы под экраны ----------

create index vacancy_status_idx   on vacancy (owner_id, status);
create index vacancy_deadline_idx on vacancy (owner_id, deadline) where deadline is not null;
create index message_open_idx     on message (owner_id, received_at desc) where not is_done;
create index message_vacancy_idx  on message (vacancy_id);
create index study_deadline_idx   on study_work (owner_id, deadline) where status <> 'submitted';
create index task_due_idx         on task (owner_id, due_date) where not is_done;
create index flashcard_due_idx    on flashcard (owner_id, due_on);
create index sync_run_recent_idx  on sync_run (agent_client_id, started_at desc);

-- ---------- Триггеры ----------

create trigger vacancy_touch before update on vacancy
  for each row execute function touch_row();
create trigger study_work_touch before update on study_work
  for each row execute function touch_row();

-- История статусов вакансии пишется автоматически.
-- security definer: у пользователя нет права insert в историю (RLS только на чтение),
-- поэтому функция пишет от имени владельца схемы. search_path зафиксирован от подмены.
create function log_vacancy_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into vacancy_status_history (vacancy_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, new.updated_by);
  end if;
  return new;
end;
$$;

create trigger vacancy_status_log after insert or update of status on vacancy
  for each row execute function log_vacancy_status();

-- Письмо, которое требует действия, ставит пуш в очередь.
create function queue_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  company_name text;
begin
  if new.kind in ('invite', 'test', 'offer', 'question') then
    select name into company_name from company where id = new.company_id;
    insert into notification (owner_id, message_id, title, body)
    values (new.owner_id, new.id,
            coalesce(company_name, 'Новое письмо'),
            left(coalesce(new.action, new.summary), 300));
  end if;
  return new;
end;
$$;

create trigger message_notify after insert on message
  for each row execute function queue_notification();

-- ---------- Row Level Security ----------

alter table company            enable row level security;
alter table vacancy            enable row level security;
alter table message            enable row level security;
alter table discipline         enable row level security;
alter table study_work         enable row level security;
alter table schedule_snapshot  enable row level security;
alter table task               enable row level security;
alter table flashcard          enable row level security;
alter table push_subscription  enable row level security;
alter table notification       enable row level security;
alter table agent_client       enable row level security;
alter table vacancy_status_history enable row level security;
alter table card_review        enable row level security;
alter table sync_run           enable row level security;
alter table idempotency_key    enable row level security;

create policy owner_all on company           for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on vacancy           for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on message           for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on discipline        for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on study_work        for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_read on schedule_snapshot for select using (owner_id = auth.uid());
create policy owner_all on task              for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on flashcard         for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on push_subscription for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_read on notification     for select using (owner_id = auth.uid());
create policy owner_read on agent_client     for select using (owner_id = auth.uid());

-- Дочерние таблицы проверяются через родителя.
create policy owner_read on vacancy_status_history for select
  using (exists (select 1 from vacancy v where v.id = vacancy_id and v.owner_id = auth.uid()));
create policy owner_all on card_review for all
  using (exists (select 1 from flashcard f where f.id = flashcard_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from flashcard f where f.id = flashcard_id and f.owner_id = auth.uid()));
create policy owner_read on sync_run for select
  using (exists (select 1 from agent_client a where a.id = agent_client_id and a.owner_id = auth.uid()));
-- idempotency_key: политик нет, доступ только у Edge Function с service_role.
