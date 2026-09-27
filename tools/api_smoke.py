"""Боевая проверка граничных случаев ingest API на тестовой вакансии zz-api-test.

Запуск: python tools/api_smoke.py. После прогона тестовую вакансию и карточку нужно удалить в SQL
(в API удаления нет намеренно): delete from vacancy where external_ref = 'zz-api-test'; и карточку по source.
"""
import json, os, sys, uuid
sys.path.insert(0, os.path.dirname(__file__))
from pult import call  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
results = []


def check(name, cond, detail=''):
    results.append(cond)
    print(('OK   ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''))


def etag(h):
    return next((v for k, v in h.items() if k.lower() == 'etag'), None)


REF = 'vacancies/zz-api-test'
base = {'company': 'Тестовая компания', 'title': 'Проверка API', 'status': 'applied', 'appliedOn': '2026-09-27', 'nextStep': 'от агента'}

s, h, r = call('PUT', REF, base)
check('PUT создаёт вакансию: 201 и ETag', s in (200, 201) and etag(h) is not None, f'{s} {r}')
s2, _, _ = call('PUT', REF, base)
check('повторный PUT идемпотентен: 200', s2 == 200, str(s2))

s, _, r = call('PATCH', REF, {'status': 'interview'})
check('PATCH без If-Match: 428', s == 428, f'{s} {r}')

s, h, r = call('GET', REF)
v = etag(h)
s, _, r = call('PATCH', REF, {'status': 'interview'}, {'if-match': '"999"'})
check('PATCH с устаревшей версией: 412', s == 412, f'{s} {r}')

s, h, r = call('PATCH', REF, {'status': 'interview'}, {'if-match': v})
check('PATCH с верной версией: 200 и новая версия', s == 200 and etag(h) != v, f'{s} {r}')

s, h2, _ = call('GET', REF)
s, _, r = call('PATCH', REF, {'status': 'applied'}, {'if-match': etag(h2)})
check('понижение статуса агентом: 422 status-downgrade', s == 422 and r.get('code') == 'status-downgrade', f'{s} {r}')

s, _, r = call('PATCH', REF, {'status': 'reject'}, {'if-match': etag(h2)})
check('отказ с любого этапа: 200', s == 200, f'{s} {r}')

s, _, r = call('PUT', REF, {**base, 'status': 'hired', 'salary': 1})
check('неизвестное поле и неверный статус: 422 с полями', s == 422 and {e['field'] for e in r.get('errors', [])} >= {'status', 'salary'}, f'{s} {r}')

s, _, r = call('PUT', 'messages/fax/1', {'kind': 'info', 'receivedAt': '2026-09-27T10:00:00+03:00', 'summary': 'x'})
check('неизвестный источник письма: 404', s == 404, f'{s} {r}')

s, _, r = call('PUT', 'messages/gmail/zz-api-test', {'kind': 'info', 'receivedAt': '2026-09-27T10:00:00', 'summary': 'x', 'vacancyRef': 'zz-api-test'})
check('время без часового пояса: 422', s == 422, f'{s} {r}')

key = 'smoke-' + uuid.uuid4().hex[:12]
card = {'topic': 'HTTP', 'question': 'Чем 412 отличается от 409?', 'answer': '412: не выполнено условие запроса (If-Match). 409: конфликт с состоянием ресурса.', 'source': 'api_smoke'}
s1, _, r1 = call('POST', 'flashcards', card, {'idempotency-key': key})
s2, _, r2 = call('POST', 'flashcards', card, {'idempotency-key': key})
check('повтор POST с тем же ключом возвращает ту же карточку', s1 == 201 and s2 == 201 and r1.get('id') == r2.get('id'), f'{s1} {s2}')
s3, _, r3 = call('POST', 'flashcards', {**card, 'question': 'другой вопрос'}, {'idempotency-key': key})
check('тот же ключ с другим телом: 422 idempotency-key-reused', s3 == 422 and r3.get('code') == 'idempotency-key-reused', f'{s3} {r3}')

s, _, r = call('DELETE', REF)
check('удаления в API нет: 404', s == 404, f'{s} {r}')

print(f'\n{sum(results)} из {len(results)} проверок прошли')
sys.exit(0 if all(results) else 1)
