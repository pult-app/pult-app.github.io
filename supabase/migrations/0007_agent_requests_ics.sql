-- Запросы к Claude из пульта: очередь, которую разбирает агент по расписанию (US-19).
create table public.agent_request (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vacancy_id  uuid references public.vacancy (id) on delete set null,
  kind        text not null check (kind in ('prep', 'followup', 'analyze', 'custom')),
  prompt      text not null check (char_length(prompt) between 1 and 2000),
  status      text not null default 'queued' check (status in ('queued', 'working', 'done', 'failed', 'cancelled')),
  result      text check (char_length(result) <= 20000),
  error       text check (char_length(error) <= 1000),
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  done_at     timestamptz
);
create index agent_request_queue_idx on public.agent_request (owner_id, status, created_at);
create index agent_request_vacancy_idx on public.agent_request (vacancy_id);
alter table public.agent_request enable row level security;
create policy owner_all on public.agent_request for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Ответ готов: пуш «Claude ответил».
create function private.agent_request_done() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    insert into public.notification (owner_id, title, body)
    values (new.owner_id, 'Claude ответил', left(coalesce(new.result, 'Готово'), 300));
  end if;
  return new;
end;
$$;
revoke execute on function private.agent_request_done() from public, anon, authenticated;
create trigger agent_request_done after update of status on public.agent_request
  for each row execute function private.agent_request_done();

-- Секрет для ссылки-подписки на календарь. Узнать и сменить может только вошедший владелец.
create function public.ics_token(p_rotate boolean default false) returns text
language plpgsql security definer set search_path = private, pg_temp as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'нужен вход' using errcode = '42501'; end if;
  if p_rotate then delete from private.app_secret where name = 'ics_token'; end if;
  select value into t from private.app_secret where name = 'ics_token';
  if t is null then
    t := replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '/', '_'), '+', '-');
    insert into private.app_secret (name, value) values ('ics_token', t);
  end if;
  return t;
end;
$$;
revoke execute on function public.ics_token(boolean) from public, anon;
grant execute on function public.ics_token(boolean) to authenticated, service_role;
