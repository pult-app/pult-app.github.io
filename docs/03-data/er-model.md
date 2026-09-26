# ER-модель

Логическая модель данных пульта. Физическая схема с типами, ограничениями, триггерами и RLS лежит в [schema.sql](schema.sql). Схема проверена на PostgreSQL 18.6, тесты в [tests/](tests/).

```mermaid
erDiagram
  USERS ||--o{ COMPANY : "владеет"
  USERS ||--o{ DISCIPLINE : "владеет"
  USERS ||--o{ TASK : "владеет"
  USERS ||--o{ FLASHCARD : "владеет"
  USERS ||--o{ SCHEDULE_SNAPSHOT : "владеет"
  USERS ||--o{ AGENT_CLIENT : "выдаёт токены"
  USERS ||--o{ PUSH_SUBSCRIPTION : "подписан"
  COMPANY ||--o{ VACANCY : "публикует"
  COMPANY |o--o{ MESSAGE : "пишет"
  VACANCY |o--o{ MESSAGE : "касается"
  VACANCY ||--o{ VACANCY_STATUS_HISTORY : "меняет статус"
  MESSAGE |o--o{ NOTIFICATION : "порождает"
  DISCIPLINE ||--o{ STUDY_WORK : "включает"
  FLASHCARD ||--o{ CARD_REVIEW : "повторяется"
  AGENT_CLIENT ||--o{ SYNC_RUN : "запускает"
  AGENT_CLIENT ||--o{ IDEMPOTENCY_KEY : "хранит"

  USERS {
    uuid id PK "auth.users в Supabase"
  }
  COMPANY {
    uuid id PK
    uuid owner_id FK
    text name UK "уникально у владельца"
    text site
  }
  VACANCY {
    uuid id PK
    uuid owner_id FK
    uuid company_id FK
    text external_ref UK "например hh-100000001"
    text title
    vacancy_status status
    date applied_on
    date deadline
    date followed_up_on
    text next_step
    text prep
    actor_kind updated_by
    int row_version "для If-Match"
  }
  VACANCY_STATUS_HISTORY {
    bigint id PK
    uuid vacancy_id FK
    vacancy_status from_status
    vacancy_status to_status
    actor_kind changed_by
    timestamptz changed_at
  }
  MESSAGE {
    uuid id PK
    uuid owner_id FK
    uuid company_id FK
    uuid vacancy_id FK
    message_source source UK "вместе с external_id"
    text external_id UK
    message_kind kind
    timestamptz received_at
    text summary "до 500 символов"
    text action
    date deadline
    bool is_done
  }
  NOTIFICATION {
    uuid id PK
    uuid owner_id FK
    uuid message_id FK
    notify_channel channel
    text body
    notify_status status
    timestamptz sent_at
  }
  DISCIPLINE {
    uuid id PK
    uuid owner_id FK
    text name UK
    text teacher
  }
  STUDY_WORK {
    uuid id PK
    uuid owner_id FK
    uuid discipline_id FK
    text code UK
    text title
    work_status status
    date deadline
    text local_path
    int row_version
  }
  TASK {
    uuid id PK
    uuid owner_id FK
    text external_id UK
    text title
    date due_date
    time due_time
    task_kind kind
    bool is_done
  }
  FLASHCARD {
    uuid id PK
    uuid owner_id FK
    text topic
    text question
    text answer
    smallint box "0-4"
    date due_on
  }
  CARD_REVIEW {
    bigint id PK
    uuid flashcard_id FK
    bool knew
    smallint box_before
    smallint box_after
    timestamptz reviewed_at
  }
  SCHEDULE_SNAPSHOT {
    uuid id PK
    uuid owner_id FK
    text group_code
    text source_hash UK
    jsonb payload
    bool is_current "один текущий на группу"
  }
  AGENT_CLIENT {
    uuid id PK
    uuid owner_id FK
    text name UK
    bytea token_sha256 UK
    text_array scopes
    bool is_active
    timestamptz expires_at
  }
  SYNC_RUN {
    uuid id PK
    uuid agent_client_id FK
    text job
    run_status status
    timestamptz started_at
    timestamptz finished_at
    jsonb stats
  }
  IDEMPOTENCY_KEY {
    uuid agent_client_id PK
    text key PK
    bytea request_sha256
    smallint response_status
    jsonb response_body
  }
  PUSH_SUBSCRIPTION {
    uuid id PK
    uuid owner_id FK
    text endpoint UK
    text p256dh
    text auth_secret
  }
```

Картинка: [img/er-model.png](../img/er-model.png).

## Сущности

| Таблица | Что хранит | Ключ для агентов | Особенности |
| --- | --- | --- | --- |
| `company` | Компании-работодатели | `name` у владельца | Создаётся автоматически при записи вакансии или письма |
| `vacancy` | Вакансии и этап отбора | `external_ref`, например `hh-100000001` | `row_version` для If-Match, `updated_by` кто менял последним. Для всех статусов, кроме `found` и `skip`, обязательна дата подачи |
| `vacancy_status_history` | История смены статусов | нет | Пишется триггером, по ней считается скорость ответа компаний |
| `message` | Ответы компаний: суть, действие, срок | `source` + `external_id` | Полный текст письма не хранится, `summary` до 500 символов |
| `notification` | Очередь и журнал пушей | нет | Строку ставит триггер на `message` для типов invite, test, offer, question |
| `discipline` | Учебные предметы и преподаватели | `name` | |
| `study_work` | Лабы, курсовые, ДЗ | `code`, например `ib-lr2` | `row_version`, статусы todo, doing, ready, submitted |
| `task` | Дела со сроком: платежи, записи, личное | `external_id` | Дела, созданные вручную, живут без ключа |
| `flashcard` | Карточки тренажёра | нет, повтор через `Idempotency-Key` | Коробка 0-4 и дата следующего повтора |
| `card_review` | История ответов «знаю» и «не знаю» | нет | По ней считается метрика K6 |
| `schedule_snapshot` | Снимки расписания из ЛАД | `group_code` + `source_hash` | Один текущий снимок на группу (частичный уникальный индекс) |
| `agent_client` | Агенты и их токены | `name` | Хранится только SHA-256 токена, права в `scopes` |
| `sync_run` | Журнал запусков агентов | нет | По нему шапка показывает «обновлено ЧЧ:ММ» |
| `idempotency_key` | Сохранённые ответы на повторные POST | `agent_client_id` + `key` | Живёт 24 часа, чистится `pg_cron` |
| `push_subscription` | Подписки устройств на Web Push | `endpoint` | |

## Решения по модели

1. **`owner_id` во всех бизнес-таблицах.** Пользователь сейчас один, но RLS строится по этому полю. Когда появится многопользовательский режим (v2.0), схема не меняется.
2. **Естественные ключи для идемпотентности.** Агент повторяет запрос после сбоя, и дубль не появляется: уникальность на `(owner_id, source, external_id)` у писем и `(owner_id, external_ref)` у вакансий.
3. **Версия строки вместо сравнения по времени.** `row_version` растёт на каждый UPDATE (триггер `touch_row`). API отдаёт её как ETag, агент присылает в `If-Match`.
4. **История статусов триггером.** Логику нельзя обойти ни из PWA, ни из API. Триггер работает как `security definer`: у пользователя есть право только читать историю.
5. **Расписание снимком JSON.** Структура пар (числитель, знаменатель, диапазоны недель, подгруппы) целиком приходит из ЛАД, и нормализовать её в таблицы нет смысла, см. [ADR-004](../06-decisions/ADR-004-schedule-snapshot.md).

## Что проверено на реальной базе

Тесты запускались на временном кластере PostgreSQL 18.6 с заглушкой схемы `auth` из Supabase.

| Проверка | Результат |
| --- | --- |
| Схема применяется без ошибок | да |
| История статусов пишется при вставке и смене статуса, с автором | да |
| `row_version` растёт на UPDATE | да |
| Письмо-приглашение ставит пуш в очередь, автоответ не ставит | да |
| Вакансия в статусе applied без даты подачи отклоняется | да |
| Дубль письма по `source` + `external_id` отклоняется | да |
| Коробка карточки вне 0-4 отклоняется | да |
| Второй текущий снимок расписания группы отклоняется | да |
| Пользователь B не видит данных A и не может писать от имени A | да |
| Герман меняет статус и добавляет письмо под своей ролью | да, после исправления: первая версия падала на RLS в триггере истории |

Как повторить:

```bash
psql -d pult -f tests/00_supabase_stub.sql -f schema.sql
psql -d pult -f tests/10_constraints_triggers_rls.sql
psql -d pult -f tests/20_owner_flow.sql
```
