# Spec: Десктоп-дашборд «Пульт Германа»

Создан: 2026-11-02. На основе [intent.md](intent.md). Статус: черновик.

## 1. Обзор архитектуры

Один код, две раскладки. `App.tsx` определяет ширину экрана через CSS `matchMedia('(min-width: 1024px)')` и рендерит либо `<Dashboard />` (десктоп), либо текущий `<div className="wrap">` с вкладками (мобилка). Данные (`PultData`) и все функции (`act`, `go`, `onStatus`, ...) общие — виджеты и мобильные вкладки потребляют одно и то же.

```
App
├─ [≥1024px] Dashboard
│   ├─ Sidebar
│   ├─ WidgetGrid
│   │   ├─ HeroWidget
│   │   ├─ PulseWidget
│   │   ├─ LessonsWidget
│   │   ├─ HotWidget
│   │   ├─ FunnelWidget
│   │   ├─ InboxWidget
│   │   ├─ StudyWidget
│   │   ├─ MoneyWidget
│   │   ├─ WeekRingWidget
│   │   └─ HeatWidget
│   └─ DetailPane (split-pane справа)
└─ [<1024px] MobileWrap
    ├─ Today / Funnel / Inbox / Study / Money (вкладки)
    ├─ Insights / Settings (поверх)
    └─ TabBar
```

## 2. Компоненты

### 2.1 Dashboard.tsx

Корневой десктоп-компонент. Получает те же props, что и мобильный App: `data`, `canWrite`, `goto`, все `on*`-колбэки.

- Слева `<Sidebar>` (72 px)
- Справа: прокручиваемая область с `<WidgetGrid>` внутри
- При клике на строку виджета: `<DetailPane>` выезжает справа (ширина ~420 px), WidgetGrid сжимается

Состояния:
- **Загрузка**: `<Skeleton>` на весь экран
- **Данные загружены**: сетка виджетов с анимацией лесенкой
- **Офлайн**: как данные, но статус-строка в Sidebar показывает «офлайн»
- **Ошибка**: баннер в верхней части WidgetGrid

### 2.2 Sidebar.tsx

Левая панель, фиксированная. Стеклянный фон.

- **Верх**: 7 иконок-кнопок:
  1. Дашборд (домик) — по умолчанию активно
  2. Воронка — открывает полноэкранную воронку
  3. Письма — полноэкранные письма
  4. Учёба — полноэкранная учёба
  5. Деньги — полноэкранные деньги
  6. Цифры — Insights
  7. Настройки — Settings

- **Низ**: статус агента (иконка + цветной индикатор), время последнего обновления

Активная иконка подсвечена сигналом (`--accent`). При наведении иконка чуть увеличивается и показывает tooltip с названием.

Ширина: 72px. При наведении на панель — раскрывается до 200px с подписями.

### 2.3 WidgetGrid

CSS Grid: `grid-template-columns: repeat(3, minmax(0, 1fr))`. Виджеты занимают 1 или 2 колонки через `grid-column: span N`. Высота строк — `auto`.

Раскладка:

| colspan 2 | colspan 1 | colspan 1 |
|-----------|---|-----------|
| HeroWidget | PulseWidget | LessonsWidget |
| HotWidget (×2) | MoneyWidget |
| FunnelWidget | InboxWidget | StudyWidget |
| WeekRingWidget | HeatWidget (×2) |

При открытом DetailPane: Grid сжимается, правая колонка уходит под панель.

### 2.4 DetailPane

Панель деталей справа. Ширина ~420px. Стеклянный фон. Выезжает анимацией `transform: translateX`.

**Что открывается:**
- Письмо → карточка письма (как `mcard4` в мобильной версии)
- Вакансия → карточка вакансии (`vc` + stepper)
- Подписка → карточка подписки
- Учебная работа → детали работы

**Закрытие:** кнопка «×» в углу, клик по затемнению слева, Escape.

Панель не модальная: дашборд слева виден и с ним можно взаимодействовать.

### 2.5 Виджеты (widgets/*.tsx)

Каждый виджет — тонкая обёртка над существующей логикой. Не дублирует код, а переиспользует функции из `lib/` и куски JSX из компонентов вкладок.

| Виджет | Данные | Ключевой элемент | Клик |
|--------|--------|-----------------|------|
| HeroWidget | `nextStep(data, t)` | hero-card | Открыть вакансию в DetailPane |
| PulseWidget | `weekCount`, `funnelTab`, `summarize` | 3 плитки | Переход в Insights / Funnel / Money |
| LessonsWidget | `lessonsFor(schedule, dt)` | Список пар | — |
| HotWidget | `agenda(data, t)`, первые 6 | Список горящего | DetailPane |
| FunnelWidget | Статусы вакансий | stagebar + 5 счётчиков | Полноэкранная воронка |
| InboxWidget | `messages`, первые 3 | Карточки писем | DetailPane |
| StudyWidget | `works`, первые 3 | Строки работ | DetailPane |
| MoneyWidget | `summarize()`, `upcoming()` | Ближайшее списание + полоса 30 дн | DetailPane |
| WeekRingWidget | `insights(data, t)` | Кольцо + мини-статистика | Полноэкранные Insights |
| HeatWidget | `insights(data, t).heat` | Календарь активности | — |

## 3. CSS-архитектура

### 3.1 Новые файлы

```
app/src/
├── glass.css        ← glassmorphism-утилиты
├── dashboard.css    ← десктоп-раскладка (Sidebar, WidgetGrid, DetailPane)
└── widgets.css      ← общие стили виджетов (рамки, заголовки, анимации)
```

### 3.2 glass.css

```css
.glass {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 
    0 8px 32px rgba(15, 23, 32, 0.08),
    0 1px 0 rgba(255, 255, 255, 0.7) inset;
}

[data-theme="dark"] .glass {
  background: rgba(22, 24, 28, 0.65);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.35),
    0 1px 0 rgba(255, 255, 255, 0.04) inset;
}

/* Fallback: без backdrop-filter */
@supports not (backdrop-filter: blur(1px)) {
  .glass { background: rgba(255, 255, 255, 0.92); }
  [data-theme="dark"] .glass { background: rgba(22, 24, 28, 0.92); }
}
```

### 3.3 dashboard.css — раскладка

```css
.dash {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
}

.dash-main {
  overflow-y: auto;
  padding: 24px;
}

.widget-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  max-width: 1400px;
}

.widget-grid.col2 { grid-column: span 2; }
.widget-grid.col1 { grid-column: span 1; }
```

### 3.4 Медиа-запрос

```css
/* Мобилка: скрываем всё десктопное */
@media (max-width: 1023px) {
  .dash { display: none; }
}

/* Десктоп: скрываем мобильный wrap */
@media (min-width: 1024px) {
  body > .wrap { display: none; }
}
```

### 3.5 Десктопный фон

```css
body.dash-body {
  background:
    radial-gradient(ellipse 70% 50% at 15% 5%, rgba(238, 127, 31, 0.05), transparent),
    radial-gradient(ellipse 50% 60% at 85% 90%, rgba(238, 127, 31, 0.04), transparent),
    var(--ground);
}
```

### 3.6 Микро-правки мобильной версии

- Таб-бар: добавить `backdrop-filter` если поддерживается (уже есть `.glass` переменные, но не blur везде)
- Карточки: лёгкое стекло на `.vc`, `.mcard4`, `.tile` через CSS-переменную `--glass-bg`

## 4. Состояния

| Состояние | Что видит пользователь |
|-----------|----------------------|
| Загрузка | 10 скелетонов-прямоугольников в сетке (sk-классы с glass-стилем) |
| Данные загружены | Сетка виджетов, анимация Rise лесенкой |
| Офлайн | Данные из кэша, иконка в Sidebar красная, подпись «офлайн, данные на ЧЧ:ММ» |
| Ошибка | Баннер вверху dash-main с текстом ошибки и кнопкой «скрыть» |
| Пустые данные | Виджет показывает Empty-состояние («Срочного нет», «Подписок нет») |
| DetailPane открыта | Grid сжимается, панель выезжает справа |
| Полноэкранная вкладка | Как мобильная, но на всю ширину (max-width: 1080px по центру) |

## 5. Удаление «Спросить Claude»

По решению Германа, функциональность «Спросить Claude» убирается полностью:

- Из `Today.tsx`: удалить `AskLine`, `RequestList`, блок «Спросить Claude»
- Из `Funnel.tsx`: удалить кнопку «Подготовь меня» и связанную логику
- Из `App.tsx`: удалить `onAsk`, `AskClaude`-импорты
- Типы `AgentRequest` и `NewRequest` остаются в типах (данные в базе), но UI их не показывает
- API-методы не удаляются (агенты могут ещё использовать)

## 6. Спорные и противоречивые моменты

- **Удаление «Спросить Claude»**: функциональность пропадёт и из мобильной версии. Если понадобится позже — можно вернуть как отдельный виджет.
- **Split-pane vs модалка**: split-pane сложнее в реализации (ресайз дашборда), но выглядит дороже. Если возникнут проблемы с производительностью — fallback на модалку.
- **Дублирование между виджетами и вкладками**: виджеты — тонкие обёртки, но некоторое дублирование JSX неизбежно. Контролировать через code review.

## 7. Критерии приёмки

| Код | Критерий |
|-----|----------|
| AC1 | `matchMedia('(min-width: 1024px)')` возвращает `true` → рендерится `<Dashboard />` |
| AC2 | `matchMedia('(min-width: 1024px)')` возвращает `false` → рендерится текущий `<div className="wrap">` |
| AC3 | Все 10 виджетов отображаются на дашборде, данные соответствуют мобильным вкладкам |
| AC4 | Sidebar: 7 иконок, активная подсвечена, клик переключает экран |
| AC5 | Карточки имеют стеклянный эффект (`backdrop-filter: blur()`) |
| AC6 | Клик по письму/вакансии в виджете открывает DetailPane справа |
| AC7 | DetailPane закрывается: кнопкой ×, Escape, кликом вне панели |
| AC8 | Тёмная тема: стекло адаптируется, контраст читаемый |
| AC9 | Офлайн: данные из кэша, индикатор в Sidebar |
| AC10 | Ресайз с десктопа на мобилку: плавный переход (CSS, без перезагрузки) |
| AC11 | Lighthouse desktop: Accessibility ≥95, Performance ≥90 |
| AC12 | `npx vitest run` — все 78 тестов зелёные |
| AC13 | Сборка `npm run build` без ошибок |
| AC14 | «Спросить Claude» отсутствует в интерфейсе (и мобильном, и десктопном) |