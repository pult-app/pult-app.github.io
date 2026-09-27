-- Ежедневный импорт расписания из ЛАД (ADR-004): 03:05 UTC = 06:05 по Москве.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'schedule-sync-daily',
  '5 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://wvqaulqriwvlaufqmhcq.supabase.co/functions/v1/schedule-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      -- публичный anon-ключ (он и так есть в сборке сайта): функция идемпотентна
      'authorization', 'Bearer ' || '<anon-key>'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Чистка просроченных ключей идемпотентности (живут 24 часа).
select cron.schedule('idempotency-cleanup', '15 3 * * *',
  $cron$ delete from public.idempotency_key where created_at < now() - interval '1 day' $cron$);
