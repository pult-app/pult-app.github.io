# C4, уровень 1: контекст системы

Кто пользуется пультом и с какими внешними системами он связан. Нотация C4: синий человек, синяя наша система, серые внешние системы. На стрелках действие и технология в квадратных скобках.

```mermaid
flowchart LR
  german(["<b>Герман</b><br/>[Person]<br/>Студент ВлГУ, ищет стажировку SA.<br/>iPhone и ПК"])
  agents["<b>ИИ-агенты</b><br/>[External system]<br/>Claude Code,<br/>задачи по расписанию"]
  pult["<b>Пульт Германа</b><br/>[Software system]<br/>PWA: пары, дедлайны, воронка,<br/>учёба, тренажёр"]

  gmail["<b>Gmail</b><br/>[External system]<br/>Ответы компаний и преподавателей"]
  hh["<b>hh.ru</b><br/>[External system]<br/>Отклики и чаты с работодателями"]
  calendar["<b>Google Календарь</b><br/>[External system]<br/>Собеседования и сроки"]
  obsidian["<b>Obsidian</b><br/>[External system]<br/>Шпаргалки и сводки"]
  lad["<b>ЛАД</b><br/>[External system]<br/>Расписание ВлГУ, JSON на GitHub"]
  push["<b>Сервисы Web Push</b><br/>[External system]<br/>Apple, Google"]

  german -- "Смотрит день, меняет статусы<br/>[HTTPS]" --> pult
  agents -- "Читает письма<br/>[коннектор Gmail]" --> gmail
  agents -- "Читает отклики и чаты<br/>[браузер Edge]" --> hh
  agents -- "Создаёт события<br/>[коннектор]" --> calendar
  agents -- "Пишет сводки<br/>[файлы]" --> obsidian
  agents -- "Записывает данные<br/>[ingest API, HTTPS]" --> pult
  pult -- "Забирает расписание раз в сутки<br/>[HTTPS]" --> lad
  pult -- "Отправляет уведомления<br/>[Web Push]" --> push
  push -- "Показывает пуш" --> german

  classDef person fill:#08427B,stroke:#052E56,color:#fff
  classDef system fill:#1168BD,stroke:#0B4884,color:#fff
  classDef ext fill:#8C8C8C,stroke:#6B6B6B,color:#fff
  class german person
  class pult system
  class agents,gmail,hh,calendar,obsidian,lad,push ext
```

Картинка: [img/c4-context.png](../img/c4-context.png).

## Пояснения

| Элемент | Роль | Почему так |
| --- | --- | --- |
| ИИ-агенты | Единственный путь данных из почты и hh.ru в пульт | Пульт не хранит пароли и токены почты. Доступ к Gmail есть только у коннектора Claude, у hh.ru нет открытого API откликов для соискателя |
| Gmail | Один основной ящик | Второй, старый ящик пересылает письма в основной, второй интеграции не нужно |
| ЛАД | Источник расписания | Расписание уже собирается и проверяется в проекте ЛАД, пульт берёт готовый JSON и не парсит сайт ВлГУ сам |
| Web Push | Основной канал уведомлений | Telegram в РФ в 2026 году почти полностью заблокирован, см. [ADR-002](../06-decisions/ADR-002-notifications.md) |
| Google Календарь, Obsidian | Остаются у агентов как раньше | Пульт их не дублирует, в карточке вакансии есть ссылка на заметку |

Чего на схеме нет специально: пульт ничего не отправляет компаниям и преподавателям. Стрелок от пульта к Gmail и hh.ru нет.
