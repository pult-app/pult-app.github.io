# Plan: Десктоп-дашборд «Пульт Германа»

Создан: 2026-11-02. На основе [intent.md](intent.md) и [spec.md](spec.md).

## Файлы

### Новые (создать)

| Файл | Роль |
|------|------|
| `app/src/glass.css` | Утилиты glassmorphism: `.glass`, фолбек, тёмная тема |
| `app/src/dashboard.css` | Десктоп-раскладка: `.dash`, `.dash-main`, `.widget-grid`, `.sidebar`, `.detail-pane` |
| `app/src/widgets.css` | Общие стили виджетов: `.widget`, заголовки, анимации появления |
| `app/src/components/Sidebar.tsx` | Боковая панель: иконки, статус, навигация |
| `app/src/components/Dashboard.tsx` | Корневой десктоп: сетка, DetailPane, управление |
| `app/src/components/widgets/HeroWidget.tsx` | Следующий шаг (из Today/NextStepCard) |
| `app/src/components/widgets/PulseWidget.tsx` | 3 плитки темпа (из Today/Pulse) |
| `app/src/components/widgets/LessonsWidget.tsx` | Пары сегодня (из Today/Lessons) |
| `app/src/components/widgets/HotWidget.tsx` | Горящее (из Today/agenda) |
| `app/src/components/widgets/FunnelWidget.tsx` | Счётчики воронки (из Funnel) |
| `app/src/components/widgets/InboxWidget.tsx` | Последние письма (из Inbox) |
| `app/src/components/widgets/StudyWidget.tsx` | Ближайшие работы (из Study) |
| `app/src/components/widgets/MoneyWidget.tsx` | Списания (из Money) |
| `app/src/components/widgets/WeekRingWidget.tsx` | Кольцо недели (из Insights/Ring) |
| `app/src/components/widgets/HeatWidget.tsx` | Календарь активности (из Insights/Heat) |

### Существующие (изменить)

| Файл | Что меняется |
|------|-------------|
| `app/src/App.tsx` | Добавить `useMediaQuery`, условие рендера Dashboard vs Mobile; убрать onAsk/AskClaude |
| `app/src/components/Today.tsx` | Убрать блок «Спросить Claude», AskLine, RequestList |
| `app/src/components/Funnel.tsx` | Убрать кнопку «Подготовь меня», prepPrompt, onAsk |
| `app/src/main.tsx` | Импортировать glass.css, dashboard.css, widgets.css |
| `app/src/v4.css` | Микро-правки: убрать мобильные ограничения ширины на десктопе |

## Порядок

### Этап 1: CSS-фундамент (без разрыва сборки)

1. **glass.css** — `.glass` с backdrop-filter, тёмная тема, fallback
2. **dashboard.css** — `.dash`, `.dash-main`, `.widget-grid` (сетка 3 колонки)
3. **widgets.css** — `.widget` (общий контейнер), `.widget-head` (заголовок), анимации
4. **Импорт в main.tsx** — три новых CSS
5. **Сборка** — `npm run build` должен проходить

### Этап 2: Боковая панель и корневой дашборд

6. **Sidebar.tsx** — иконки (7 шт.), индикатор статуса, навигация
7. **Dashboard.tsx** — логика: рендер виджетов, управление DetailPane, обработка кликов
8. **App.tsx** — `useMediaQuery('(min-width: 1024px)')`, рендер Dashboard или Mobile

### Этап 3: Виджеты (извлечение из существующих компонентов)

9. **HeroWidget.tsx** — из `Today.tsx` → `NextStepCard`
10. **PulseWidget.tsx** — из `Today.tsx` → `Pulse`
11. **LessonsWidget.tsx** — из `Today.tsx` → `Lessons`
12. **HotWidget.tsx** — из `Today.tsx` → `agenda()`
13. **FunnelWidget.tsx** — из `Funnel.tsx` → stagebar + счётчики
14. **InboxWidget.tsx** — из `Inbox.tsx` → первые 3 письма
15. **StudyWidget.tsx** — из `Study.tsx` → первые 3 работы
16. **MoneyWidget.tsx** — из `Money.tsx` → ближайшее списание + полоса
17. **WeekRingWidget.tsx** — из `Insights.tsx` → `Ring`
18. **HeatWidget.tsx** — из `Insights.tsx` → `Heat`

### Этап 4: DetailPane (split-pane)

19. **DetailPane** внутри Dashboard.tsx — панель справа, анимация выезда
20. **Карточки деталей** — переиспользовать существующие: вакансия, письмо, подписка, работа

### Этап 5: Удаление «Спросить Claude»

21. **Today.tsx** — удалить AskLine, RequestList, блок Fold
22. **Funnel.tsx** — удалить кнопку «Подготовь меня», prepPrompt, onAsk
23. **App.tsx** — удалить onAsk, импорт AskClaude

### Этап 6: Микро-правки мобильной версии

24. **v4.css** — `@media (min-width: 1024px) { .wrap { display: none; } }`
25. Стекло на таб-баре и карточках — где уместно

### Этап 7: Проверки

26. Сборка (`npm run build`)
27. Тесты (`npx vitest run`)
28. Lighthouse (десктоп и мобилка)
29. Визуальная проверка: светлая + тёмная тема, офлайн

## Риски

| Риск | Вероятность | Что делаем |
|------|------------|------------|
| `backdrop-filter` лагает на слабых ПК | Низкая | Fallback: плотный фон без blur через `@supports` |
| Дублирование кода между виджетами и вкладками | Средняя | Виджеты используют те же функции из lib/, изолируют только JSX |
| DetailPane конфликтует с Grid-раскладкой | Средняя | При открытии: `widget-grid` получает `margin-right: 420px` через CSS-переменную |
| Ресайз с десктопа на мобилку рендерит не тот компонент | Низкая | `useMediaQuery` реагирует на `resize`, перемонтирует |
| Удаление «Спросить Claude» ломает импорты | Низкая | Проверяется сборкой на этапе 5 |

## Проверка

Каждая проверка ссылается на пункт intent.md:

| № | Что проверяем | Как |
|---|--------------|-----|
| I1 | Десктопная сетка на ≥1024px | Открыть 1920×1080, визуально: 3 колонки, карточки заполняют экран |
| I2 | Все виджеты на экране | Посчитать: Hero, Pulse, Lessons, Hot, Funnel, Inbox, Study, Money, WeekRing, Heat = 10 |
| I3 | Glassmorphism | Скриншот: видно blur и полупрозрачность карточек на градиентном фоне |
| I4 | Sidebar навигация | Клик по иконке «Воронка» → полноэкранная воронка |
| I5 | DetailPane | Клик по письму → панель справа с карточкой |
| I6 | Оранжевый сигнал | DevTools: `--accent` = `#EE7F1F` |
| I7 | Мобилка не сломана | 390×844: 5 вкладок, таб-бар, всё работает |
| I8 | Тёмная тема | Переключить: стекло темнеет, контраст OK |
| I9 | Lighthouse | Accessibility ≥95, Performance ≥90 |
| I10 | Тесты | `npx vitest run` → 78 passed |
| I14 | «Спросить Claude» убран | Поиск по коду: нет AskLine, RequestList, onAsk в интерфейсе |