-- Пульт Германа: схема базы данных (PostgreSQL в Supabase)
-- Версия 1.0, 27.09.2026. Источник правды для ER-модели (er-model.md).
-- Все бизнес-таблицы содержат owner_id: сейчас пользователь один, но RLS и будущий
-- многопользовательский режим работают по этому полю.

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
language plpgsql set search_path = public as $$
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
-- Индексы на внешние ключи: ускоряют join и каскадное удаление.
create index vacancy_company_idx    on vacancy (company_id);
create index message_company_idx    on message (company_id);
create index history_vacancy_idx    on vacancy_status_history (vacancy_id);
create index study_discipline_idx   on study_work (discipline_id);
create index card_review_card_idx   on card_review (flashcard_id);
create index notification_msg_idx   on notification (message_id);
create index notification_owner_idx on notification (owner_id, status);

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

create policy owner_all on company           for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_all on vacancy           for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_all on message           for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_all on discipline        for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_all on study_work        for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_read on schedule_snapshot for select using (owner_id = (select auth.uid()));
create policy owner_all on task              for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_all on flashcard         for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_all on push_subscription for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_read on notification     for select using (owner_id = (select auth.uid()));
create policy owner_read on agent_client     for select using (owner_id = (select auth.uid()));

-- Дочерние таблицы проверяются через родителя.
create policy owner_read on vacancy_status_history for select
  using (exists (select 1 from vacancy v where v.id = vacancy_id and v.owner_id = (select auth.uid())));
create policy owner_all on card_review for all
  using (exists (select 1 from flashcard f where f.id = flashcard_id and f.owner_id = (select auth.uid())))
  with check (exists (select 1 from flashcard f where f.id = flashcard_id and f.owner_id = (select auth.uid())));
create policy owner_read on sync_run for select
  using (exists (select 1 from agent_client a where a.id = agent_client_id and a.owner_id = (select auth.uid())));
-- idempotency_key: политик нет, доступ только у Edge Function с service_role.

-- ---------- Права на функции и доп. индексы (по советнику Supabase) ----------
-- Триггерные функции не должны вызываться через /rest/v1/rpc. Триггеры при этом работают:
-- право EXECUTE проверяется при создании триггера, а не при срабатывании.
revoke execute on function public.log_vacancy_status() from public, anon, authenticated;
revoke execute on function public.queue_notification() from public, anon, authenticated;
revoke execute on function public.touch_row() from public, anon, authenticated;
create index push_subscription_owner_idx on push_subscription (owner_id);

-- ---------- Закрытая регистрация (US-15) ----------
-- Первый вход по ссылке создаёт пользователя, но только для адресов из списка.
-- Сам адрес вносится в базу отдельно и в репозиторий не попадает.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.allowed_signup (
  email text primary key check (email = lower(email))
);

create function private.guard_signup() returns trigger
language plpgsql security definer set search_path = private, pg_temp as $$
begin
  if not exists (select 1 from private.allowed_signup where email = lower(new.email)) then
    raise exception 'Регистрация закрыта' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_signup() from public, anon, authenticated;

create trigger guard_signup before insert on auth.users
  for each row execute function private.guard_signup();

-- ---------- Подписки (US-20, ADR-006) ----------
-- Расписание рассылки напоминаний (pg_cron) лежит в supabase/migrations/0011_subscriptions.sql: в облаке нужен cron, в локальной проверке нет.

create table public.subscription (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  external_id     text check (external_id ~ '^[a-z0-9-]{2,80}$'),
  name            text not null check (char_length(name) between 1 and 120),
  amount          numeric(12, 2) not null check (amount >= 0),
  currency        text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  -- Периодичность: раз в every единиц (unit). «Раз в 3 месяца» = month и 3, «раз в год» = year и 1.
  unit            text not null default 'month' check (unit in ('week', 'month', 'year')),
  every           smallint not null default 1 check (every between 1 and 36),
  -- Якорь: дата одного из списаний. Следующие считаются от неё (private.next_charge), поэтому дата не устаревает.
  next_charge_on  date not null,
  status          text not null default 'active' check (status in ('active', 'trial', 'paused', 'cancelled')),
  category        text not null default 'other' check (category in ('ai', 'cloud', 'media', 'software', 'telecom', 'education', 'games', 'other')),
  method          text check (char_length(method) <= 60),
  url             text check (char_length(url) <= 500),
  notes           text check (char_length(notes) <= 1000),
  remind_days     smallint not null default 1 check (remind_days between 0 and 14),
  updated_by      actor_kind not null default 'owner',
  row_version     integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, external_id)
);
create index subscription_owner_idx on public.subscription (owner_id, status);

create trigger subscription_touch before update on public.subscription
  for each row execute function public.touch_row();

alter table public.subscription enable row level security;
create policy owner_all on public.subscription for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Журнал напоминаний: на одно списание одно напоминание. Отдельная таблица, чтобы не трогать версию строки подписки.
create table public.subscription_reminder (
  subscription_id  uuid not null references public.subscription (id) on delete cascade,
  charge_on        date not null,
  queued_at        timestamptz not null default now(),
  primary key (subscription_id, charge_on)
);
alter table public.subscription_reminder enable row level security;
-- Политик нет: пишет и читает только security definer функция ниже.

-- Первое списание не раньше from_d. Месяцы и годы считаются от якоря (31 января -> 28 февраля -> 31 марта).
create function private.next_charge(a date, unit text, every integer, from_d date) returns date
language plpgsql immutable set search_path = pg_temp as $$
declare k integer; step integer; d date;
begin
  if a >= from_d then return a; end if;
  if unit = 'week' then
    return a + ceil((from_d - a)::numeric / (7 * every))::integer * 7 * every;
  end if;
  step := case when unit = 'year' then 12 * every else every end;
  k := greatest(0, (((extract(year from from_d) - extract(year from a)) * 12 + extract(month from from_d) - extract(month from a))::integer) / step);
  d := (a + make_interval(months => k * step))::date;
  while d < from_d loop
    k := k + 1;
    d := (a + make_interval(months => k * step))::date;
  end loop;
  return d;
end;
$$;
revoke execute on function private.next_charge(date, text, integer, date) from public, anon, authenticated;

-- Пуш о списании за remind_days дней (0 = в день списания). Возвращает, сколько напоминаний поставлено в очередь.
-- Новая строка notification будит функцию notify (триггер notification_wake), тихие часы она соблюдает сама.
create function private.queue_charge_reminders() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer := 0;
  r record;
  t date := (now() at time zone 'Europe/Moscow')::date;
begin
  for r in
    select s.id, s.owner_id, s.name, s.amount, s.currency, s.status, s.nc, s.nc - t as left_days
    from (
      select x.*, private.next_charge(x.next_charge_on, x.unit, x.every, t) as nc
      from public.subscription x
      where x.status in ('active', 'trial')
    ) s
    where s.nc - t <= s.remind_days
      and not exists (select 1 from public.subscription_reminder q where q.subscription_id = s.id and q.charge_on = s.nc)
    order by s.nc, s.name
  loop
    insert into public.subscription_reminder (subscription_id, charge_on) values (r.id, r.nc);
    insert into public.notification (owner_id, title, body) values (
      r.owner_id,
      case r.left_days when 0 then 'Списание сегодня' when 1 then 'Списание завтра' else 'Списание через ' || r.left_days || ' дн.' end,
      left(r.name || ': ' || regexp_replace(r.amount::text, '\.00$', '') || ' '
        || case r.currency when 'RUB' then '₽' when 'USD' then '$' when 'EUR' then '€' else r.currency end
        || case when r.status = 'trial' then ' (пробный период заканчивается)' else '' end, 300));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function private.queue_charge_reminders() from public, anon, authenticated;
