-- Черновики напоминаний только для откликов через hh: туда Claude может отправить сам (решение Германа 29.09).
create or replace function private.queue_followups() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  insert into public.agent_request (owner_id, vacancy_id, kind, prompt)
  select v.owner_id, v.id, 'followup',
    'Напиши короткое вежливое напоминание HR ' || coalesce(c.name, 'компании') || ' про мой отклик на «' || v.title || '» от '
      || to_char(v.applied_on, 'DD.MM') || ' (hh.ru, ' || coalesce(v.url, v.external_ref) || '). Текст для чата hh, 3-4 предложения, одна конкретика из моего опыта под эту вакансию. Claude отправит его сам.'
  from public.vacancy v left join public.company c on c.id = v.company_id
  where v.status = 'applied' and v.applied_on <= current_date - 7
    and coalesce(v.channel, '') ilike '%hh%'
    and (v.followed_up_on is null or v.followed_up_on < current_date - 7)
    and not exists (select 1 from public.message m where m.vacancy_id = v.id and m.kind in ('invite', 'test', 'offer', 'reject', 'question'))
    and not exists (select 1 from public.agent_request r where r.vacancy_id = v.id and r.kind = 'followup' and r.created_at > now() - interval '14 days')
  order by v.applied_on
  limit 3;
  get diagnostics n = row_count;
  return n;
end;
$$;
