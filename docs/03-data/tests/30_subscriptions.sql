\set ON_ERROR_STOP on
-- Подписки: арифметика дат, ограничения, RLS, напоминания о списании. Запускать после 10_ и 20_.

-- ---------- private.next_charge ----------
do $$
begin
  assert private.next_charge('2026-10-26', 'month', 1, '2026-10-12') = '2026-10-26', 'якорь в будущем возвращается как есть';
  assert private.next_charge('2026-10-12', 'month', 1, '2026-10-12') = '2026-10-12', 'якорь сегодня';
  assert private.next_charge('2026-01-31', 'month', 1, '2026-02-01') = '2026-02-28', '31 января -> 28 февраля';
  assert private.next_charge('2026-01-31', 'month', 1, '2026-03-01') = '2026-03-31', '31 января -> 31 марта (без дрейфа)';
  assert private.next_charge('2026-01-31', 'month', 1, '2026-04-01') = '2026-04-30', '-> 30 апреля';
  assert private.next_charge('2028-01-31', 'month', 1, '2028-02-01') = '2028-02-29', 'високосный февраль';
  assert private.next_charge('2026-05-05', 'month', 1, '2026-10-12') = '2026-11-05', 'прошедшая дата прокручивается';
  assert private.next_charge('2026-05-20', 'month', 1, '2026-10-12') = '2026-10-20', 'в том же месяце';
  assert private.next_charge('2026-01-15', 'month', 3, '2026-10-12') = '2026-10-15', 'раз в 3 месяца';
  assert private.next_charge('2026-01-15', 'month', 3, '2026-10-16') = '2027-01-15', 'раз в 3 месяца, следующее';
  assert private.next_charge('2026-01-10', 'month', 6, '2026-10-12') = '2027-01-10', 'раз в полгода';
  assert private.next_charge('2025-02-28', 'year', 1, '2026-10-12') = '2027-02-28', 'раз в год';
  assert private.next_charge('2024-02-29', 'year', 1, '2026-10-12') = '2027-02-28', '29 февраля -> 28 февраля';
  assert private.next_charge('2024-02-29', 'year', 1, '2027-10-12') = '2028-02-29', '29 февраля в високосный год';
  assert private.next_charge('2026-10-01', 'week', 2, '2026-10-12') = '2026-10-15', 'раз в 2 недели';
  assert private.next_charge('2026-10-01', 'week', 2, '2026-10-15') = '2026-10-15', 'раз в 2 недели, день в день';
  assert private.next_charge('2026-10-01', 'week', 1, '2026-10-12') = '2026-10-15', 'раз в неделю';
  raise notice 'OK: private.next_charge совпадает с TypeScript-версией (billing.test.ts)';
end $$;

-- ---------- ограничения ----------
do $$ begin
  begin insert into subscription (owner_id, name, amount, next_charge_on) values ('00000000-0000-0000-0000-00000000000a', 'Минус', -1, current_date);
        raise exception 'FAIL: отрицательная сумма прошла';
  exception when check_violation then raise notice 'OK: отрицательная сумма отклонена'; end;
  begin insert into subscription (owner_id, name, amount, currency, next_charge_on) values ('00000000-0000-0000-0000-00000000000a', 'Валюта', 1, 'руб', current_date);
        raise exception 'FAIL: валюта «руб» прошла';
  exception when check_violation then raise notice 'OK: валюта не в формате ISO отклонена'; end;
  begin insert into subscription (owner_id, name, amount, unit, next_charge_on) values ('00000000-0000-0000-0000-00000000000a', 'День', 1, 'day', current_date);
        raise exception 'FAIL: период day прошёл';
  exception when check_violation then raise notice 'OK: период вне week, month, year отклонён'; end;
  begin insert into subscription (owner_id, name, amount, every, next_charge_on) values ('00000000-0000-0000-0000-00000000000a', 'Ноль', 1, 0, current_date);
        raise exception 'FAIL: every=0 прошёл';
  exception when check_violation then raise notice 'OK: every=0 отклонён'; end;
  begin insert into subscription (owner_id, external_id, name, amount, next_charge_on) values ('00000000-0000-0000-0000-00000000000a', 'Bad Key', 'Ключ', 1, current_date);
        raise exception 'FAIL: плохой external_id прошёл';
  exception when check_violation then raise notice 'OK: external_id только латиница, цифры, дефис'; end;
end $$;

-- ---------- версия строки ----------
insert into subscription (id, owner_id, external_id, name, amount, next_charge_on, category)
values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'icloud-200', 'iCloud+ 200 ГБ', 299, '2026-10-26', 'cloud');
update subscription set amount = 399 where id = '40000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select row_version from subscription where id = '40000000-0000-0000-0000-000000000001') = 2, 'row_version растёт при правке';
  begin insert into subscription (owner_id, external_id, name, amount, next_charge_on) values ('00000000-0000-0000-0000-00000000000a', 'icloud-200', 'Дубль', 1, current_date);
        raise exception 'FAIL: дубль external_id прошёл';
  exception when unique_violation then raise notice 'OK: дубль external_id отклонён'; end;
end $$;

-- ---------- RLS ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from subscription) = 0, 'B не видит подписки A';
  begin insert into subscription (owner_id, name, amount, next_charge_on) values ('00000000-0000-0000-0000-00000000000a', 'Чужая', 1, current_date);
        raise exception 'FAIL: B записал подписку от имени A';
  exception when insufficient_privilege then raise notice 'OK: B не может писать подписки от имени A'; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from subscription) = 1, 'A видит свою подписку';
  assert (select count(*) from subscription_reminder) = 0, 'журнал напоминаний закрыт политиками';
  raise notice 'OK: RLS подписок: A видит своё, B чужого не видит';
end $$;
reset role;

-- ---------- напоминания о списании ----------
delete from notification;
do $$
declare
  t date := (now() at time zone 'Europe/Moscow')::date;
  n integer;
begin
  -- завтра, напомнить за 1 день: ждём пуш
  insert into subscription (owner_id, external_id, name, amount, next_charge_on, remind_days)
  values ('00000000-0000-0000-0000-00000000000a', 'tomorrow', 'Завтрашняя', 150, t + 1, 1);
  -- через 5 дней, напомнить за 1: пока рано
  insert into subscription (owner_id, external_id, name, amount, next_charge_on, remind_days)
  values ('00000000-0000-0000-0000-00000000000a', 'later', 'Позже', 99, t + 5, 1);
  -- сегодня, напомнить в день списания
  insert into subscription (owner_id, external_id, name, amount, currency, next_charge_on, remind_days)
  values ('00000000-0000-0000-0000-00000000000a', 'today', 'Сегодняшняя', 12.5, 'USD', t, 0);
  -- пробный период кончается через 2 дня, напомнить за 3
  insert into subscription (owner_id, external_id, name, amount, status, next_charge_on, remind_days)
  values ('00000000-0000-0000-0000-00000000000a', 'trial', 'Пробная', 500, 'trial', t + 2, 3);
  -- пауза и отмена не напоминают
  insert into subscription (owner_id, external_id, name, amount, status, next_charge_on, remind_days)
  values ('00000000-0000-0000-0000-00000000000a', 'paused', 'Пауза', 1, 'paused', t + 1, 3),
         ('00000000-0000-0000-0000-00000000000a', 'cancelled', 'Отмена', 1, 'cancelled', t + 1, 3);
  -- прошедшая дата: следующее списание раз в месяц через ~28 дней, напоминать рано
  insert into subscription (owner_id, external_id, name, amount, next_charge_on, remind_days)
  values ('00000000-0000-0000-0000-00000000000a', 'rolled', 'Прокрученная', 10, t - 3, 1);

  n := private.queue_charge_reminders();
  assert n = 3, 'ожидали 3 напоминания (сегодня, завтра, пробный), получили ' || n;
  assert (select count(*) from notification where title = 'Списание завтра' and body = 'Завтрашняя: 150 ₽') = 1, 'текст пуша про завтра';
  assert (select count(*) from notification where title = 'Списание сегодня' and body = 'Сегодняшняя: 12.50 $') = 1, 'текст пуша про сегодня';
  assert (select count(*) from notification where title = 'Списание через 2 дн.' and body like 'Пробная: 500 ₽ (пробный период%') = 1, 'текст пуша про пробный период';
  -- повторный запуск в тот же день дублей не даёт
  assert private.queue_charge_reminders() = 0, 'повторный запуск не должен дублировать напоминания';
  assert (select count(*) from subscription_reminder) = 3, 'журнал напоминаний';
  raise notice 'OK: напоминания о списании: нужные подписки, без дублей, пауза и отмена молчат';
end $$;
