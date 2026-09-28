-- Автоматика v1.2 (28.09): черновики напоминаний HR, подготовка к собесу, недельный отчёт.

-- 1. Черновики напоминаний HR: отклик без живого ответа 7+ дней, до 3 в день, не чаще раза в 14 дней на вакансию.
create function private.queue_followups() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  insert into public.agent_request (owner_id, vacancy_id, kind, prompt)
  select v.owner_id, v.id, 'followup',
    'Напиши короткое вежливое напоминание HR ' || coalesce(c.name, 'компании') || ' про мой отклик на «' || v.title || '» от '
      || to_char(v.applied_on, 'DD.MM') || '. Черновик для чата hh, 3-4 предложения, одна конкретика из моего опыта под эту вакансию. Ничего не отправляй.'
  from public.vacancy v left join public.company c on c.id = v.company_id
  where v.status = 'applied' and v.applied_on <= current_date - 7
    and (v.followed_up_on is null or v.followed_up_on < current_date - 7)
    and not exists (select 1 from public.message m where m.vacancy_id = v.id and m.kind in ('invite', 'test', 'offer', 'reject', 'question'))
    and not exists (select 1 from public.agent_request r where r.vacancy_id = v.id and r.kind = 'followup' and r.created_at > now() - interval '14 days')
  order by v.applied_on
  limit 3;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.queue_followups() from public, anon, authenticated;
select cron.schedule('queue-followups', '0 7 * * *', $cron$ select private.queue_followups() $cron$);

-- 2. Вакансия перешла в собеседование или тестовое: сразу просим Claude подготовить разбор.
create function private.vacancy_prep_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare co text;
begin
  if new.status in ('interview', 'test') and old.status is distinct from new.status
     and not exists (select 1 from public.agent_request r where r.vacancy_id = new.id and r.kind = 'prep') then
    select name into co from public.company where id = new.company_id;
    insert into public.agent_request (owner_id, vacancy_id, kind, prompt)
    values (new.owner_id, new.id, 'prep',
      'Подготовь меня к ' || case when new.status = 'test' then 'тестовому заданию' else 'собеседованию' end || ' в ' || coalesce(co, 'компании')
      || ' на «' || new.title || '»: вероятные вопросы с короткими ответами на моих примерах, что повторить, 2-3 вопроса работодателю.');
  end if;
  return new;
end;
$$;
revoke execute on function private.vacancy_prep_request() from public, anon, authenticated;
create trigger vacancy_prep_request after update of status on public.vacancy
  for each row execute function private.vacancy_prep_request();

-- 3. Недельный отчёт: воскресенье 19:00 по Москве. Команда как у утренней сводки, другой адрес.
select cron.schedule('notify-weekly', '0 16 * * 0',
  (select replace(command, '/notify/digest', '/notify/weekly') from cron.job where jobname = 'notify-digest'));
