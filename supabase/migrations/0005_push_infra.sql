-- Web Push (ADR-002): ключи VAPID живут только на сервере, в закрытой схеме.
create table private.app_secret (
  name  text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

-- Доступ к секретам только у Edge Functions (service_role), не у клиентов.
create function public.secret_get(p_name text) returns text
language sql security definer set search_path = private, pg_temp stable as $$
  select value from private.app_secret where name = p_name
$$;
create function public.secret_put(p_name text, p_value text) returns void
language sql security definer set search_path = private, pg_temp as $$
  insert into private.app_secret (name, value) values (p_name, p_value) on conflict (name) do nothing
$$;
revoke execute on function public.secret_get(text) from public, anon, authenticated;
revoke execute on function public.secret_put(text, text) from public, anon, authenticated;
grant execute on function public.secret_get(text) to service_role;
grant execute on function public.secret_put(text, text) to service_role;

-- Новое уведомление сразу будит функцию notify (асинхронно, через pg_net).
create function private.wake_notify() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform net.http_post(
    url := 'https://wvqaulqriwvlaufqmhcq.supabase.co/functions/v1/notify/send',
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || '<anon-key>'),
    body := '{}'::jsonb);
  return null;
end;
$$;
revoke execute on function private.wake_notify() from public, anon, authenticated;
create trigger notification_wake after insert on public.notification
  for each statement execute function private.wake_notify();

-- Утром отправляем отложенное на тихие часы: 05:00 UTC = 08:00 по Москве.
select cron.schedule('notify-morning', '0 5 * * *',
  $cron$ select net.http_post(
    url := 'https://wvqaulqriwvlaufqmhcq.supabase.co/functions/v1/notify/send',
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || '<anon-key>'),
    body := '{}'::jsonb) $cron$);
