"""Клиент ingest API пульта для ИИ-агентов (ADR-003, docs/05-api/openapi.yaml).

Токен агента читается из файла, путь в переменной PULT_TOKEN_FILE
(по умолчанию ~/.claude/secrets/pult-agent.token). Токен в репозиторий не кладётся.

Примеры:
  python tools/pult.py run-start funnel-sync                     -> печатает id запуска
  python tools/pult.py run-finish <id> success '{"messages":2}'
  python tools/pult.py get vacancies/t1-sa-intern                -> JSON и ETag
  python tools/pult.py put vacancies/hh-123 body.json
  python tools/pult.py patch vacancies/hh-123 body.json --if-match 7
  python tools/pult.py put messages/gmail/<id> body.json
  python tools/pult.py card body.json --key <idempotency-key>
Тело можно передать файлом или строкой JSON. Выход: код 0 при 2xx, иначе 1 и problem+json в stderr.
"""
import json, os, sys, urllib.error, urllib.request
from pathlib import Path

BASE = os.environ.get('PULT_API', 'https://wvqaulqriwvlaufqmhcq.supabase.co/functions/v1/ingest/v1')
TOKEN_FILE = Path(os.environ.get('PULT_TOKEN_FILE', Path.home() / '.claude' / 'secrets' / 'pult-agent.token'))


def token() -> str:
    try:
        return TOKEN_FILE.read_text(encoding='utf-8').strip()
    except FileNotFoundError:
        sys.exit(f'нет файла токена: {TOKEN_FILE}')


def body(arg: str | None):
    if arg is None:
        return None
    p = Path(arg)
    text = p.read_text(encoding='utf-8') if p.is_file() else arg
    return json.loads(text)


def call(method: str, path: str, data=None, headers: dict | None = None):
    req = urllib.request.Request(BASE + '/' + path.lstrip('/'), method=method,
                                 data=None if data is None else json.dumps(data, ensure_ascii=False).encode('utf-8'),
                                 headers={'authorization': 'Bearer ' + token(), 'content-type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, dict(r.headers), json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw)
        except ValueError:
            payload = raw.decode('utf-8', 'replace')
        return e.code, dict(e.headers), payload


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    if not argv:
        print(__doc__); return 2
    cmd, rest = argv[0], argv[1:]
    opt = lambda name: rest[rest.index(name) + 1] if name in rest else None
    pos = [a for i, a in enumerate(rest) if not a.startswith('--') and (i == 0 or not rest[i - 1].startswith('--'))]
    if cmd == 'run-start':
        status, _, res = call('POST', 'sync-runs', {'job': pos[0]})
        out = res.get('id') if isinstance(res, dict) and status < 300 else res
    elif cmd == 'run-finish':
        payload = {'status': pos[1]}
        if len(pos) > 2: payload['stats'] = body(pos[2])
        if opt('--error'): payload['error'] = opt('--error')
        status, _, out = call('PATCH', f'sync-runs/{pos[0]}', payload)
    elif cmd in ('get', 'put', 'patch'):
        headers = {'if-match': f'"{opt("--if-match")}"'} if opt('--if-match') else {}
        status, h, out = call(cmd.upper(), pos[0], body(pos[1]) if len(pos) > 1 else None, headers)
        if 'etag' in {k.lower() for k in h}:
            print('ETag:', next(v for k, v in h.items() if k.lower() == 'etag'), file=sys.stderr)
    elif cmd == 'card':
        status, _, out = call('POST', 'flashcards', body(pos[0]), {'idempotency-key': opt('--key') or ''})
    else:
        print(__doc__); return 2
    stream = sys.stdout if status < 300 else sys.stderr
    print(json.dumps(out, ensure_ascii=False, indent=1) if not isinstance(out, str) else out, file=stream)
    if status >= 300:
        print(f'HTTP {status}', file=sys.stderr)
    return 0 if status < 300 else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
