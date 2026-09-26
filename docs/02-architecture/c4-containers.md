# C4, уровень 2: контейнеры

Из каких разворачиваемых частей состоит пульт и как они общаются.

```mermaid
flowchart TB
  german(["<b>Герман</b><br/>[Person]"])
  agents["<b>ИИ-агенты</b><br/>[External system]<br/>Claude Code,<br/>задачи по расписанию"]

  subgraph pult ["Пульт Германа [Software system]"]
    direction TB
    pwa["<b>PWA</b><br/>[Container: React, Vite, TypeScript]<br/>Экраны Сегодня, Воронка, Входящие,<br/>Учёба, Тренажёр, Аналитика"]
    sw["<b>Service Worker</b><br/>[Container: Workbox]<br/>Кэш для офлайна, приём пушей"]
    subgraph supa ["Supabase Cloud"]
      direction TB
      auth["<b>Auth</b><br/>[Container: Supabase Auth]<br/>Вход по ссылке, JWT"]
      rest["<b>Data API</b><br/>[Container: PostgREST]<br/>CRUD для PWA под RLS"]
      ingest["<b>ingest</b><br/>[Container: Edge Function, Deno]<br/>API для агентов: токены,<br/>права, валидация, идемпотентность"]
      notify["<b>notify</b><br/>[Container: Edge Function, Deno]<br/>Отправка Web Push, тихие часы"]
      sched["<b>schedule-sync</b><br/>[Container: Edge Function, Deno]<br/>Импорт расписания из ЛАД"]
      db[("<b>База</b><br/>[Container: PostgreSQL]<br/>Вакансии, письма, учёба, дела,<br/>карточки, расписание, журналы.<br/>RLS, триггеры, pg_cron")]
    end
  end

  lad["<b>ЛАД</b><br/>[External system]<br/>raw JSON на GitHub"]
  push["<b>Web Push</b><br/>[External system]<br/>Apple, Google"]

  german -- "Пользуется<br/>[HTTPS]" --> pwa
  pwa -- "Вход<br/>[HTTPS, JSON]" --> auth
  pwa -- "Читает и меняет данные<br/>[HTTPS, JSON, JWT]" --> rest
  pwa -- "Регистрирует" --> sw
  rest -- "SQL под RLS" --> db
  agents -- "PUT, PATCH, GET /ingest/v1<br/>[HTTPS, JSON, Bearer]" --> ingest
  ingest -- "SQL, service_role" --> db
  db -- "Очередь уведомлений<br/>[pg_net, HTTP]" --> notify
  db -- "Запуск раз в сутки<br/>[pg_cron]" --> sched
  sched -- "GET расписания<br/>[HTTPS]" --> lad
  sched -- "Снимок расписания" --> db
  notify -- "Отправляет пуш<br/>[Web Push, VAPID]" --> push
  push -- "Доставляет" --> sw

  classDef person fill:#08427B,stroke:#052E56,color:#fff
  classDef cont fill:#438DD5,stroke:#2E6295,color:#fff
  classDef ext fill:#8C8C8C,stroke:#6B6B6B,color:#fff
  class german person
  class pwa,sw,auth,rest,ingest,notify,sched,db cont
  class agents,lad,push ext
```

Картинка: [img/c4-containers.png](../img/c4-containers.png).

## Контейнеры

| Контейнер | Технология | Отвечает за | Кто вызывает |
| --- | --- | --- | --- |
| PWA | React, Vite, TypeScript, vite-plugin-pwa | Интерфейс, расчёт недели и пар на клиенте, офлайн-кэш | Герман |
| Service Worker | Workbox | Кэш статики и последних данных, приём и показ пушей | браузер |
| Auth | Supabase Auth | Вход по одноразовой ссылке, выдача JWT, регистрация выключена | PWA |
| Data API | PostgREST (часть Supabase) | Чтение и запись таблиц с JWT пользователя, доступ режет RLS | PWA |
| ingest | Supabase Edge Function (Deno, TypeScript) | API для агентов по [OpenAPI](../05-api/openapi.yaml): токены, права, схемы, идемпотентность, If-Match, журнал запусков | агенты |
| notify | Supabase Edge Function | Выборка очереди `notification`, тихие часы, отправка Web Push, отметка результата | триггер через `pg_net` |
| schedule-sync | Supabase Edge Function | Раз в сутки забирает JSON расписания из ЛАД, сравнивает хэш, пишет снимок | `pg_cron` |
| База | PostgreSQL в Supabase | Данные, ограничения, триггеры истории и очереди, RLS | Data API, функции |

## Почему два входа в базу

PWA ходит через Data API с JWT Германа, и права проверяет Postgres политиками RLS. Агенты ходят через `ingest` со своими токенами. Ключ `service_role`, который обходит RLS, есть только у Edge Functions. Подробности в [ADR-003](../06-decisions/ADR-003-agent-ingest-api.md).

## Расчёт пар на клиенте

Снимок расписания хранится как JSON (`schedule_snapshot.payload`). Какая сейчас неделя, числитель или знаменатель и какие пары активны, считает PWA по тем же правилам, что ЛАД. Так расписание работает офлайн и не нужен отдельный запрос на каждый день. Решение в [ADR-004](../06-decisions/ADR-004-schedule-snapshot.md).
