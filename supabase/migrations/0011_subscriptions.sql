-- Трекер подписок (US-20, ADR-006): что и когда списывается, сколько это в месяц, напоминание перед списанием.
-- Тот же код лежит в docs/03-data/schema.sql (источник правды для ER-модели); здесь он нужен облачному проекту вместе с cron.

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

-- Каждый день в 9:00 по Москве (06:00 UTC), после утренней сводки в 8:00.
select cron.schedule('queue-charge-reminders', '0 6 * * *', $cron$ select private.queue_charge_reminders() $cron$);
