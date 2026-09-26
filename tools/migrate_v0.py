"""Перенос данных со страницы v0 (claude.ai) в базу пульта (US-18).

Вход: папка с выгрузкой ArtifactData (apps, inbox, study, tasks, cards, schedule),
по JSON-файлу на документ. Выход: один SQL-файл, который выполняется в Supabase.
Владелец берётся как единственный пользователь auth.users, адрес почты в SQL не пишется.

Запуск: python tools/migrate_v0.py <папка выгрузки> <hash расписания> > migrate.sql
"""
import glob, json, os, re, sys

src, schedule_hash = sys.argv[1], sys.argv[2]


def load(coll):
    out = {}
    for f in sorted(glob.glob(os.path.join(src, coll, "*.json"))):
        out[os.path.basename(f)[:-5]] = json.load(open(f, encoding="utf-8"))
    return out


def q(v):
    """SQL-литерал."""
    if v is None or v == "":
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def ref(s):
    s = re.sub(r"[^a-z0-9-]+", "-", s.lower()).strip("-")
    return s[:80] if len(s) >= 2 else "v0-" + s


def cut(s, n):
    return (s or "")[:n] or None


apps, inbox, study, tasks, cards, sched = (load(c) for c in ("apps", "inbox", "study", "tasks", "cards", "schedule"))
report = []
sql = ["begin;",
       "do $$ begin if (select count(*) from auth.users) <> 1 then raise exception 'ожидался ровно один пользователь'; end if; end $$;",
       "create temp table o as select id from auth.users;"]

companies = sorted({a["company"] for a in apps.values()} | {m["company"] for m in inbox.values()})
for c in companies:
    sql.append(f"insert into company (owner_id, name) select id, {q(cut(c, 120))} from o on conflict (owner_id, name) do nothing;")

for key, a in apps.items():
    status, applied, nxt = a["status"], a.get("applied") or None, a.get("next") or ""
    # В v0 «резерв» без даты подачи значил «набор закрыт, подать позже». В пульте это «найдена».
    if status == "reserve" and not applied:
        status = "found"
        report.append(f"vacancy {key}: reserve без подачи -> found")
    if status not in ("found", "skip") and not applied:
        applied = a.get("updated")
        report.append(f"vacancy {key}: нет даты подачи, взята дата обновления {applied}")
    sql.append(
        "insert into vacancy (owner_id, company_id, external_ref, title, status, work_format, channel, url, applied_on, deadline,"
        " followed_up_on, next_step, prep, notes, updated_by)"
        f" select o.id, c.id, {q(ref(key))}, {q(cut(a['role'], 200))}, {q(status)}, {q(cut(a.get('format'), 120))},"
        f" {q(cut(a.get('channel'), 80))}, {q(a.get('link'))}, {q(applied)}, {q(a.get('deadline'))}, {q(a.get('followed'))},"
        f" {q(cut(nxt, 500))}, {q(cut(a.get('prep'), 2000))}, {q(cut(a.get('notes'), 4000))}, 'agent'"
        f" from o join company c on c.owner_id = o.id and c.name = {q(cut(a['company'], 120))};")
    for field, limit in (("role", 200), ("next", 500), ("prep", 2000), ("notes", 4000)):
        if len(a.get(field) or "") > limit:
            report.append(f"vacancy {key}: поле {field} обрезано до {limit}")

for key, m in inbox.items():
    source = "hh_chat" if "hh" in (m.get("from") or "").lower() else "gmail"
    sql.append(
        "insert into message (owner_id, company_id, vacancy_id, source, external_id, kind, received_at, sender, subject, summary, action, deadline, is_done)"
        f" select o.id, c.id, v.id, {q(source)}, {q('v0-' + key)}, {q(m['kind'])}, {q(m['date'] + 'T12:00:00+03:00')},"
        f" {q(cut(m.get('from'), 200))}, {q(cut(m.get('subject'), 300))}, {q(cut(m['summary'], 500))}, {q(cut(m.get('action'), 200))},"
        f" {q(m.get('deadline'))}, {q(bool(m.get('done')))}"
        f" from o left join company c on c.owner_id = o.id and c.name = {q(cut(m['company'], 120))}"
        f" left join vacancy v on v.owner_id = o.id and v.external_ref = {q(ref(m['app']) if m.get('app') else '')};")

for key, s in study.items():
    sql.append(f"insert into discipline (owner_id, name, teacher) select id, {q(cut(s['subject'], 200))}, {q(cut(s.get('teacher'), 200))} from o"
               " on conflict (owner_id, name) do nothing;")
    sql.append(
        "insert into study_work (owner_id, discipline_id, code, title, status, deadline, notes, local_path, updated_by)"
        f" select o.id, d.id, {q(ref(key))}, {q(cut(s['title'], 300))}, {q(s['status'])}, {q(s.get('deadline'))},"
        f" {q(cut(s.get('notes'), 2000))}, {q(cut(s.get('path'), 300))}, 'agent'"
        f" from o join discipline d on d.owner_id = o.id and d.name = {q(cut(s['subject'], 200))};")

for key, t in tasks.items():
    sql.append(
        "insert into task (owner_id, external_id, title, due_date, due_time, kind, is_done, notes, created_by)"
        f" select id, {q(key)}, {q(cut(t['title'], 200))}, {q(t['date'])}, {q(t.get('time'))}, {q(t.get('kind') or 'life')},"
        f" {q(bool(t.get('done')))}, {q(cut(t.get('notes'), 1000))}, 'agent' from o;")

for key, c in cards.items():
    sql.append(
        "insert into flashcard (owner_id, topic, question, answer, box, due_on, source)"
        f" select id, {q(cut(c['topic'], 60))}, {q(cut(c['q'], 500))}, {q(cut(c['a'], 2000))}, {int(c.get('box') or 0)},"
        f" {q(c.get('due'))}, {q(cut(c.get('source'), 200))} from o;")

for key, s in sched.items():
    payload = json.dumps({"times": s["times"], "days": s["days"]}, ensure_ascii=False)
    sql.append(
        "insert into schedule_snapshot (owner_id, group_code, source_hash, captured_at, payload)"
        f" select id, {q(s['group'])}, {q(schedule_hash)}, {q(s['capturedAt'])}, {q(payload)}::jsonb from o;")

# Письма v0 уже прочитаны Германом: уведомления о них не отправляем.
sql.append("update notification set status = 'failed', error = 'перенос из v0, не отправлялось' where status = 'queued';")
sql.append("commit;")

counts = {"company": len(companies), "vacancy": len(apps), "message": len(inbox), "study_work": len(study),
          "task": len(tasks), "flashcard": len(cards), "schedule_snapshot": len(sched)}
sql.append("-- ожидается: " + json.dumps(counts, ensure_ascii=False))
print("\n".join(sql))
for r in report:
    print("-- " + r)
