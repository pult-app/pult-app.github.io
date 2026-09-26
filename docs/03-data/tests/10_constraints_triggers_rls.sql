\set ON_ERROR_STOP on
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

-- данные владельца A (как Edge Function с service_role, RLS не действует на суперпользователя)
insert into company (id, owner_id, name) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Компания N');
insert into vacancy (id, owner_id, company_id, external_ref, title, status, applied_on, updated_by)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'n-sa-intern', 'Стажёр SA', 'applied', '2026-09-23', 'agent');
update vacancy set status = 'interview', updated_by = 'owner' where external_ref = 'n-sa-intern';
select 'history' as check, from_status, to_status, changed_by from vacancy_status_history order by id;
select 'version' as check, row_version from vacancy;

insert into message (owner_id, company_id, vacancy_id, source, external_id, kind, received_at, summary, action)
values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        'gmail', 'msg-1', 'invite', '2026-09-25 10:00+03', 'Приглашение на техсобес', 'Выбрать слот до 27.09');
insert into message (owner_id, source, external_id, kind, received_at, summary)
values ('00000000-0000-0000-0000-00000000000a', 'gmail', 'msg-2', 'ack', '2026-09-25 11:00+03', 'Заявка получена');
select 'notify' as check, title, body, status from notification;

-- ограничения
do $$ begin
  begin insert into vacancy (owner_id, company_id, external_ref, title, status)
        values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'x-1', 'Без даты', 'applied');
        raise exception 'FAIL: applied без applied_on прошёл';
  exception when check_violation then raise notice 'OK: applied без даты подачи отклонён'; end;
  begin insert into message (owner_id, source, external_id, kind, received_at, summary)
        values ('00000000-0000-0000-0000-00000000000a', 'gmail', 'msg-1', 'info', now(), 'дубль');
        raise exception 'FAIL: дубль письма прошёл';
  exception when unique_violation then raise notice 'OK: дубль письма по source+external_id отклонён'; end;
  begin insert into flashcard (owner_id, topic, question, answer, box)
        values ('00000000-0000-0000-0000-00000000000a', 'SQL', 'q', 'a', 7);
        raise exception 'FAIL: box=7 прошёл';
  exception when check_violation then raise notice 'OK: коробка вне 0-4 отклонена'; end;
end $$;

insert into schedule_snapshot (owner_id, group_code, source_hash, captured_at, payload)
values ('00000000-0000-0000-0000-00000000000a', 'ПИ-124', 'h1', now(), '{}');
do $$ begin
  insert into schedule_snapshot (owner_id, group_code, source_hash, captured_at, payload)
  values ('00000000-0000-0000-0000-00000000000a', 'ПИ-124', 'h2', now(), '{}');
  raise exception 'FAIL: два текущих снимка';
exception when unique_violation then raise notice 'OK: второй текущий снимок группы отклонён'; end $$;

-- RLS: пользователь B не видит данные A, A видит свои
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'rls as B' as check, (select count(*) from vacancy) vacancies, (select count(*) from message) messages, (select count(*) from vacancy_status_history) history;
do $$ begin
  insert into company (owner_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Чужая');
  raise exception 'FAIL: B записал строку от имени A';
exception when insufficient_privilege then raise notice 'OK: B не может писать от имени A'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'rls as A' as check, (select count(*) from vacancy) vacancies, (select count(*) from message) messages, (select count(*) from vacancy_status_history) history;
reset role;
