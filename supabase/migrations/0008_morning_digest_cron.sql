-- Утренняя сводка в 8:00 по Москве вместо простой отправки отложенного: сводка сама будит send.
select cron.unschedule('notify-morning');
select cron.schedule('notify-digest', '0 5 * * *',
  $cron$ select net.http_post(
    url := 'https://wvqaulqriwvlaufqmhcq.supabase.co/functions/v1/notify/digest',
    headers := jsonb_build_object('content-type', 'application/json',
      'authorization', 'Bearer ' || '<anon-key>'),
    body := '{}'::jsonb) $cron$);
