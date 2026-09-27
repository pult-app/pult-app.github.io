"""Перенос прототипа v0 в пульт через ingest API (US-18). Одновременно боевой прогон API.

Запуск: python tools/migrate_v0_api.py <папка выгрузки v0> <hash расписания>
Выгрузка: по JSON-файлу на документ в подпапках apps, inbox, study, tasks, cards, schedule.
Поля, которых нет в API (отметки «сделано», прогресс карточек), печатаются как SQL для ручного применения.
"""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from pult import call  # noqa: E402

src, schedule_hash = sys.argv[1], sys.argv[2]
sys.stdout.reconfigure(encoding='utf-8')


def load(coll):
    return {os.path.basename(f)[:-5]: json.load(open(f, encoding='utf-8')) for f in sorted(glob.glob(os.path.join(src, coll, '*.json')))}


def ref(s):
    s = re.sub(r'[^a-z0-9-]+', '-', s.lower()).strip('-')
    return s[:80] if len(s) >= 2 else 'v0-' + s


def cut(s, n):
    return (s or '')[:n] or None


def ok(status, what, res):
    if status >= 300:
        errors.append(f'{what}: HTTP {status} {json.dumps(res, ensure_ascii=False)[:300]}')
        return False
    return True


errors, fixups = [], []
stats = {k: 0 for k in ('vacancies', 'messages', 'study', 'tasks', 'cards', 'schedule', 'patched')}
_, _, run = call('POST', 'sync-runs', {'job': 'migration-v0'})

for key, a in load('apps').items():
    status, applied = a['status'], a.get('applied') or None
    if status == 'reserve' and not applied:
        status = 'found'  # в v0 «резерв» без подачи значил «набор закрыт, подать позже»
    if status not in ('found', 'skip') and not applied:
        applied = a.get('updated')
    body = {'company': cut(a['company'], 120), 'title': cut(a['role'], 200), 'status': status, 'appliedOn': applied,
            'deadline': a.get('deadline') or None, 'workFormat': cut(a.get('format'), 120), 'channel': cut(a.get('channel'), 80),
            'url': a.get('link') or None, 'nextStep': cut(a.get('next'), 500), 'prep': cut(a.get('prep'), 2000)}
    s, h, res = call('PUT', f'vacancies/{ref(key)}', body)
    if not ok(s, f'vacancy {key}', res):
        continue
    stats['vacancies'] += 1
    if a.get('notes'):
        etag = next((v for k, v in h.items() if k.lower() == 'etag'), None)
        s2, _, res2 = call('PATCH', f'vacancies/{ref(key)}', {'notes': cut(a['notes'], 4000)}, {'if-match': etag or ''})
        if ok(s2, f'vacancy notes {key}', res2):
            stats['patched'] += 1

for key, m in load('inbox').items():
    source = 'hh_chat' if 'hh' in (m.get('from') or '').lower() else 'gmail'
    body = {'kind': m['kind'], 'receivedAt': m['date'] + 'T12:00:00+03:00', 'company': cut(m.get('company'), 120),
            'vacancyRef': ref(m['app']) if m.get('app') else None, 'sender': cut(m.get('from'), 200),
            'subject': cut(m.get('subject'), 300), 'summary': cut(m['summary'], 500), 'action': cut(m.get('action'), 200),
            'deadline': m.get('deadline') or None}
    s, _, res = call('PUT', f'messages/{source}/v0-{key}', body)
    if ok(s, f'message {key}', res):
        stats['messages'] += 1
        if m.get('done'):
            fixups.append(f"update message set is_done = true where external_id = 'v0-{key}';")

for key, w in load('study').items():
    body = {'discipline': cut(w['subject'], 200), 'teacher': cut(w.get('teacher'), 200), 'title': cut(w['title'], 300),
            'status': w['status'], 'deadline': w.get('deadline') or None, 'notes': cut(w.get('notes'), 2000), 'localPath': cut(w.get('path'), 300)}
    s, _, res = call('PUT', f'study-works/{ref(key)}', body)
    if ok(s, f'study {key}', res):
        stats['study'] += 1

for key, t in load('tasks').items():
    body = {'title': cut(t['title'], 200), 'dueDate': t['date'], 'dueTime': t.get('time') or None, 'kind': t.get('kind') or 'life', 'notes': cut(t.get('notes'), 1000)}
    s, _, res = call('PUT', f'tasks/{key}', body)
    if ok(s, f'task {key}', res):
        stats['tasks'] += 1
        if t.get('done'):
            fixups.append(f"update task set is_done = true where external_id = '{key}';")

for key, c in load('cards').items():
    body = {'topic': cut(c['topic'], 60), 'question': cut(c['q'], 500), 'answer': cut(c['a'], 2000), 'source': cut(c.get('source'), 200)}
    s, _, res = call('POST', 'flashcards', body, {'idempotency-key': f'migration-v0-{key}'})
    if ok(s, f'card {key}', res):
        stats['cards'] += 1
        if int(c.get('box') or 0) or (c.get('due') and c['due'] != '2026-09-26'):
            fixups.append(f"update flashcard set box = {int(c.get('box') or 0)}, due_on = '{c.get('due')}' where id = '{res['id']}';")

for key, sc in load('schedule').items():
    body = {'sourceHash': schedule_hash, 'capturedAt': sc['capturedAt'], 'times': sc['times'], 'days': sc['days']}
    s, _, res = call('PUT', f"schedules/{sc['group']}", body)
    if ok(s, f'schedule {key}', res):
        stats['schedule'] += 1

call('PATCH', f"sync-runs/{run['id']}", {'status': 'partial' if errors else 'success', 'stats': stats,
                                          **({'error': '; '.join(errors)[:2000]} if errors else {})})
print(json.dumps(stats, ensure_ascii=False))
for e in errors:
    print('ОШИБКА', e)
print('-- SQL для полей вне API:')
print('\n'.join(fixups))
