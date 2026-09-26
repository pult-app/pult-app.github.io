\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update vacancy set status = 'offer', updated_by = 'owner' where external_ref = 'n-sa-intern';
insert into message (owner_id, source, external_id, kind, received_at, summary)
values ('00000000-0000-0000-0000-00000000000a', 'manual', 'm-3', 'invite', now(), 'ручное приглашение');
select 'owner flow' as check,
  (select to_status from vacancy_status_history order by id desc limit 1) last_status,
  (select count(*) from notification) notifications;
reset role;
