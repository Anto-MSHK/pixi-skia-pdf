# Pixi → Skia → векторный PDF

Приложение на TypeScript, которое объединяет pixi.js и Skia (CanvasKit/WASM):
обёртка рендерит произвольный `PIXI.Container` средствами Skia и экспортирует
сцену в векторный PDF через Skia PDF backend.

Live demo: https://anto-mshk.github.io/pixi-skia-pdf/

Слева на странице — рендер средствами Pixi (canvas, `forceCanvas`), справа — та
же сцена, нарисованная обёрткой `convertPixiContainerToSkia` через Skia.

## Что реализовано

1. Обёртка для Skia — `convertPixiContainerToSkia(ck, canvas, container)`
   (`src/skia/pixiToSkia.ts`). Рекурсивно обходит дерево `PIXI.Container`,
   компонует мировые матрицы (translate / rotate / scale / pivot / skew) и рисует:
   - `PIXI.Graphics` — векторно: `drawRect`, `drawShape`, `drawCircle`,
     `drawEllipse`, `drawRoundedRect`, `moveTo` / `lineTo` (заливки и обводки
     с цветом, толщиной, cap/join, прозрачностью);
   - `PIXI.Sprite` — как bitmap (PNG → `SkImage`).
2. Экспорт в PDF — `src/skia/pdfExport.ts`. Через `CanvasKit.MakePDFDocument`
   та же обёртка рисует на canvas PDF-страницы, поэтому графика получается
   векторной (пути/заливки/обводки), а спрайты остаются bitmap (как требует ТЗ).
   PDF API нет в стоковом `canvaskit-wasm` — нужна кастомная WASM-сборка (см. ниже).
3. События `pointerdown` / `pointerup` для `PIXI.DisplayObject` работают на обоих
   канвасах. На Pixi их диспатчит сам Pixi; для Skia-канваса сделан hit-test по
   дереву с обратными матрицами (`src/events/SkiaPointerBridge.ts`), который
   вызывает те же обработчики. Линии без заливки ловятся по обводке (расстояние
   до отрезков), общий код для обоих канвасов — `src/pixi/graphicsHit.ts`.
4. Интерактивность: кнопка «случайная фигура/линия» и переключение
   подготовленных сцен (кнопкой и по таймеру — чекбокс автопереключения).

Дополнительно: обе панели рисуют одну сцену рядом для сравнения; клик по фигуре
подсвечивает её рамкой на Skia-канвасе; есть экспорт всех сцен в один
многостраничный PDF; на векторность экспорта написаны e2e-тесты (см. «Тесты»).

### Технические требования

- TypeScript, модульная архитектура, комментарии.
- `pixi.js` версии `7.2.4-legacy` (пакет `pixi.js-legacy@7.2.4`),
  `PIXI.Application` создаётся с `forceCanvas: true`.

## Запуск

```bash
npm install
npm run dev      # http://localhost:5173
```

Без кастомной сборки CanvasKit приложение работает на стоковой сборке (грузится
с CDN): рендер и события доступны, а кнопка «Экспорт в PDF» неактивна (как
включить — в подсказке к кнопке). После сборки кастомного CanvasKit (ниже)
кнопка становится активной.

Прод-сборка:

```bash
npm run build    # tsc + vite build → dist/
npm run preview
```

## Тесты

E2E-тесты на Playwright проверяют, что экспорт в PDF действительно векторный:

```bash
npm run test:install   # один раз: скачать браузер chromium
npm test               # поднимет dev-сервер и прогонит tests/pdf-vector.spec.ts
```

Тест разбирает байты сгенерированного PDF: считает операторы путей/кривых Безье
и растровые изображения (`/Subtype /Image`). Проверяется, что Сцена 1 без
растров, Сцена 2 ровно с одним bitmap (спрайт), а «Экспорт всех сцен» даёт PDF
на три страницы.

## Кастомная WASM-сборка CanvasKit с PDF backend

Стандартный `canvaskit-wasm` собран без PDF. Нужна своя сборка с
`skia_enable_pdf=true` и Emscripten-биндингами для `SkPDF`. Сборка идёт в Docker
(нужен Docker; качается и компилируется Skia, 30–90 минут):

```bash
npm run build:canvaskit
# или: bash build-canvaskit/run-build.sh
```

Скрипт (`build-canvaskit/build.sh`) собирается под `linux/amd64` и:

1. клонирует Skia с готовыми PDF-биндингами (ветка `canvas-kit-pdf`);
2. `git-sync-deps --deep` + `activate-emsdk` (нужная версия Emscripten);
3. `compile.sh release` с включённым PDF;
4. кладёт `canvaskit.js` / `canvaskit.wasm` в `build-canvaskit/out/`.

Несколько неочевидных моментов, из-за которых сборка может падать (учтены в
скриптах):

- `git-sync-deps --deep` — часть зеркал Skia (`libavif`, `libjxl`) отдаёт
  «remote transport reported error» на shallow-клон (`--depth=1`); полный клон
  работает.
- `--platform=linux/amd64` — `emsdk 3.1.44` не имеет сборки под `arm64`, и на
  Apple Silicon `activate-emsdk` молча пропускается, после чего линковка падает
  с `emcc: not found`. Поэтому образ собирается как x86_64 (на ARM — под
  эмуляцией qemu).
- `default-jre-headless` — финальная линковка минифицирует JS через Google
  Closure Compiler, которому нужна Java.
- персистентный том `/work` и ретраи `git-sync-deps` позволяют возобновлять
  сборку после сетевых сбоев.

Затем артефакты копируются в проект (они раздаются статикой и коммитятся для
деплоя):

```bash
cp build-canvaskit/out/canvaskit.js   public/canvaskit/canvaskit.js
cp build-canvaskit/out/canvaskit.wasm public/canvaskit/canvaskit.wasm
```

Загрузчик (`src/skia/canvaskitLoader.ts`) сначала пробует локальную сборку из
`public/canvaskit/`, при её отсутствии откатывается на CDN.

## Структура

```
src/
├── main.ts                     точка входа: Pixi + Skia + UI + события
├── pixi/
│   ├── scenes.ts               подготовленные сцены (вкл. пример из ТЗ) + случайные фигуры
│   └── graphicsHit.ts          hit-test по обводке линий
├── skia/
│   ├── canvaskitLoader.ts      загрузка CanvasKit (кастомная сборка / CDN fallback)
│   ├── canvaskit-pdf.d.ts      дополнение типов: PDF API
│   ├── pixiToSkia.ts           обёртка convertPixiContainerToSkia
│   ├── SkiaStage.ts            экранный Skia Surface
│   └── pdfExport.ts            экспорт сцены в векторный PDF
├── events/
│   └── SkiaPointerBridge.ts    pointer-события для Skia-канваса (hit-test)
└── ui/styles.css
tests/pdf-vector.spec.ts        e2e-проверка векторности PDF
build-canvaskit/                Docker-сборка CanvasKit+PDF + генератор тестового PNG
.github/workflows/deploy.yml    деплой на GitHub Pages
```

## Деплой на GitHub Pages

В репозитории настроен workflow (`.github/workflows/deploy.yml`): на push в `main`
он собирает проект (`VITE_BASE=/<repo>/`) и публикует `dist/` на GitHub Pages.
Pages включается в Settings → Pages → Source: GitHub Actions.

## Лицензия

MIT (код проекта). CanvasKit/Skia — под лицензией BSD (Google).
