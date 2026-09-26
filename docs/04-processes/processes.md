# Процессы

## 1. Жизненный цикл вакансии

```mermaid
stateDiagram-v2
  direction LR
  [*] --> found : агент нашёл вакансию
  found --> applied : Герман подал отклик
  found --> skip : не подходит
  applied --> test : пришло тестовое
  applied --> interview : приглашение
  applied --> reject : отказ
  applied --> reserve : кадровый резерв
  test --> interview : тест пройден
  test --> reject : тест не пройден
  interview --> interview : следующий этап
  interview --> offer : оффер
  interview --> reject : отказ
  interview --> reserve : резерв
  reserve --> interview : вернулись с приглашением
  offer --> [*]
  reject --> [*]
  skip --> [*]

  note right of applied
    Агент не возвращает вакансию на более ранний этап.
    Отказ и резерв ставятся с любого этапа.
  end note
```

Картинка: [img/vacancy-states.png](../img/vacancy-states.png).

| Переход | Кто делает | Откуда узнаём |
| --- | --- | --- |
| found → applied | Герман | подал отклик сам |
| applied → test, interview, reject, reserve | агент или Герман | письмо, статус на hh.ru, сообщение Германа |
| test → interview, reject | агент или Герман | письмо с результатом теста |
| interview → offer, reject, reserve | агент или Герман | письмо |
| любой → более ранний этап | только Герман | ручная правка, API отвечает агенту 422 `status-downgrade` |

## 2. Обработка ответа работодателя

Схема процесса по дорожкам: агент, сервер пульта, Герман. Нарисована в Mermaid в стиле BPMN: круги это события, ромбы это шлюзы «или», пунктир это сообщения между участниками.

```mermaid
flowchart TB
  subgraph A ["Дорожка 1. Агент funnel-sync"]
    a0((Старт по расписанию<br/>9:00, 14:00, 20:00)) --> a1[Открыть запуск<br/>POST /sync-runs]
    a1 --> a2[Прочитать новые письма<br/>и чаты hh.ru]
    a2 --> g1{Письмо от компании<br/>или преподавателя?}
    g1 -- "нет" --> a9[Пропустить]
    g1 -- "да" --> a3[Определить тип, суть,<br/>действие и срок]
    a3 --> g2{Вакансия есть<br/>в пульте?}
    g2 -- "нет" --> a4[Создать вакансию<br/>PUT /vacancies/ref]
    g2 -- "да" --> a5[Записать письмо<br/>PUT /messages/source/id]
    a4 --> a5
    a5 --> g3{Тип меняет<br/>статус вакансии?}
    g3 -- "да" --> a6[Обновить статус<br/>PATCH с If-Match]
    g3 -- "нет" --> a7[Закрыть запуск<br/>PATCH /sync-runs/id]
    a6 --> a7
    a9 --> a7
    a7 --> a8((Конец))
  end

  subgraph S ["Дорожка 2. Пульт, сервер"]
    s1[Проверить токен,<br/>права и схему] --> g4{Запрос<br/>корректен?}
    g4 -- "нет" --> s2[Ответ 401, 403, 412 или 422]
    g4 -- "да" --> s3[Записать в базу<br/>и в историю статусов]
    s3 --> g5{Тип invite, test,<br/>offer или question?}
    g5 -- "да" --> s4[Поставить пуш в очередь]
    g5 -- "нет" --> s7((Конец))
    s4 --> g6{Тихие часы 23:00-8:00<br/>и не оффер?}
    g6 -- "да" --> s5[Отложить до 8:00]
    g6 -- "нет" --> s6[Отправить Web Push]
    s5 --> s6
  end

  subgraph G ["Дорожка 3. Герман"]
    h1[Получить пуш] --> h2[Открыть письмо в пульте] --> h3[Сделать действие:<br/>ответить, выбрать слот] --> h4[Отметить «Сделано»]
  end

  a5 -. "HTTPS" .-> s1
  a6 -. "HTTPS" .-> s1
  s6 -. "Web Push" .-> h1
```

Картинка: [img/process-message.png](../img/process-message.png).

Бизнес-правила процесса:

- **БП-1.** Письмо относится к поиску работы, если отправитель это компания из воронки, HR-платформа (hh.ru, Хабр Карьера, FutureToday) или в письме есть название вакансии.
- **БП-2.** Тип `reject` ставится только при явном отказе. При сомнении ставится `info` (см. PRD, раздел 3.2).
- **БП-3.** Письмо без найденной вакансии создаёт вакансию со статусом `applied`, если в письме видно, что отклик был, иначе письмо сохраняется без привязки.
- **БП-4.** Тихие часы 23:00-8:00 по Москве. Оффер приходит сразу, остальное утром.
- **БП-5.** Агент ничего не отвечает компании. Действие в поле `action` делает Герман.

## 3. Последовательность: запись письма агентом

```mermaid
sequenceDiagram
  autonumber
  participant Ag as Агент funnel-sync
  participant In as ingest (Edge Function)
  participant DB as PostgreSQL
  participant No as notify (Edge Function)
  participant WP as Web Push (Apple)
  participant Ph as iPhone Германа

  Ag->>In: POST /ingest/v1/sync-runs {job: "funnel-sync"}
  In->>DB: проверить SHA-256 токена, scopes, срок
  In-->>Ag: 201 {id: run}
  Ag->>In: PUT /ingest/v1/messages/gmail/{id}<br/>{kind: invite, vacancyRef, summary, action, deadline}
  In->>In: валидация по схеме
  alt нет права messages:write
    In-->>Ag: 403 problem+json
  else тело не прошло схему
    In-->>Ag: 422 problem+json с полями
  else всё верно
    In->>DB: INSERT ... ON CONFLICT (source, external_id) DO UPDATE
    DB->>DB: триггер message_notify: notification(queued)
    In-->>Ag: 201 Created (или 200, если письмо уже было)
  end
  DB-)No: pg_net: новая запись в очереди
  No->>DB: подписки, тихие часы
  No->>WP: Web Push, VAPID, шифрование aes128gcm
  WP-->>No: 201
  No->>DB: notification.status = sent, sent_at
  WP-)Ph: «Компания N: приглашение на техсобес, выбрать слот до 27.09»
  Ag->>In: GET /ingest/v1/vacancies/n-sa-intern
  In-->>Ag: 200, ETag: "7"
  Ag->>In: PATCH /ingest/v1/vacancies/n-sa-intern<br/>If-Match: "7" {status: interview}
  alt Герман изменил вакансию после чтения
    In-->>Ag: 412 Precondition Failed, ETag: "8"
    Ag->>In: GET, пересчитать, PATCH с If-Match: "8"
  else версия совпала
    In->>DB: UPDATE, триггер истории статусов
    In-->>Ag: 200, ETag: "8"
  end
  Ag->>In: PATCH /ingest/v1/sync-runs/{id} {status: success, stats}
  In-->>Ag: 200
```

Картинка: [img/sequence-message.png](../img/sequence-message.png).

Что показывает диаграмма:

- шаги 1-3: агент открывает запуск, сервер проверяет токен по SHA-256, права и срок;
- ветки `alt`: 403 без права, 422 при ошибке схемы, иначе upsert по естественному ключу;
- асинхронная часть: триггер ставит уведомление, `pg_net` будит `notify`, пуш уходит через сервис Apple;
- оптимистичная блокировка: если Герман поменял вакансию после чтения агентом, агент получает 412 и повторяет с новой версией.
