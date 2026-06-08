# Pixi → Skia → векторный PDF

Приложение на **TypeScript**, которое объединяет `pixi.js` и **Skia (CanvasKit/WASM)**:
собственная обёртка рендерит произвольный `PIXI.Container` средствами Skia и
экспортирует сцену в **векторный PDF** через Skia PDF backend.

🔗 **Live demo:** _добавьте ссылку на GitHub Pages после первого деплоя_

| PIXI.js (canvas, `forceCanvas`) | Skia (CanvasKit) — та же сцена |
| --- | --- |
| Рендер средствами Pixi | Рендер собственной обёрткой `convertPixiContainerToSkia` |

## Что реализовано (по ТЗ)

1. **Обёртка для Skia** — `convertPixiContainerToSkia(ck, canvas, container)`
   (`src/skia/pixiToSkia.ts`). Рекурсивно обходит дерево `PIXI.Container`,
   компонует мировые матрицы (translate / rotate / scale / pivot / skew) и рисует:
   - `PIXI.Graphics` — векторно: `drawRect`, `drawShape`, `drawCircle`,
     `drawEllipse`, `drawRoundedRect`, `moveTo` / `lineTo` (заливки и обводки
     с цветом, толщиной, cap/join, прозрачностью);
   - `PIXI.Sprite` — как bitmap (PNG → `SkImage`).
2. **Экспорт в PDF** — `src/skia/pdfExport.ts`. Через `CanvasKit.MakePDFDocument`
   та же обёртка рисует на canvas PDF-страницы, поэтому графика **векторная**
   (пути/заливки/обводки), а спрайты — bitmap (как требует ТЗ). PDF API
   отсутствует в стоковом `canvaskit-wasm` — нужна **кастомная WASM-сборка**
   (см. ниже).
3. **События** `pointerdown` / `pointerup` для `PIXI.DisplayObject` — работают
   **на обоих канвасах**. На Pixi их диспатчит сам Pixi; для Skia-канваса
   реализован hit-test по дереву с обратными матрицами
   (`src/events/SkiaPointerBridge.ts`), который вызывает те же обработчики.
4. **Интерактивность**: кнопка «случайная фигура/линия» **и** переключение
   заранее подготовленных сцен (кнопкой и по таймеру — чекбокс автопереключения).

### Технические требования
- TypeScript, модульная архитектура, комментарии.
- `pixi.js` версии `7.2.4-legacy` (пакет `pixi.js-legacy@7.2.4`),
  `PIXI.Application` создаётся с `forceCanvas: true`.

## Быстрый запуск

```bash
npm install
npm run dev      # http://localhost:5173
```

Без кастомной сборки CanvasKit приложение работает на **сток-сборке** (грузится
с CDN): рендер и события доступны, экспорт в PDF — выключен (бейдж «без PDF»).
Чтобы включить PDF, соберите кастомный CanvasKit (ниже) — статус сменится на
«PDF ✓».

Прод-сборка:

```bash
npm run build    # tsc + vite build → dist/
npm run preview
```

## Кастомная WASM-сборка CanvasKit с PDF backend

Стандартный `canvaskit-wasm` собран **без** PDF. Нужна своя сборка с
`skia_enable_pdf=true` и Emscripten-биндингами для `SkPDF`. Сборка идёт в Docker
(требуется Docker; качается и компилируется Skia, 30–90 мин):

```bash
npm run build:canvaskit
# или: bash build-canvaskit/run-build.sh
```

Скрипт (`build-canvaskit/build.sh`):
1. клонирует Skia с готовыми PDF-биндингами (ветка `canvas-kit-pdf`);
2. `git-sync-deps` + `activate-emsdk` (нужная версия Emscripten);
3. `compile.sh release` с включённым PDF;
4. кладёт `canvaskit.js` / `canvaskit.wasm` в `build-canvaskit/out/`.

Затем скопируйте артефакты в проект (они раздаются статикой и коммитятся для
деплоя):

```bash
cp build-canvaskit/out/canvaskit.js   public/canvaskit/canvaskit.js
cp build-canvaskit/out/canvaskit.wasm public/canvaskit/canvaskit.wasm
```

Загрузчик (`src/skia/canvaskitLoader.ts`) автоматически предпочитает локальную
сборку из `public/canvaskit/`, а при её отсутствии откатывается на CDN.

## Архитектура

```
src/
├── main.ts                     # точка входа: Pixi + Skia + UI + события
├── pixi/
│   └── scenes.ts               # подготовленные сцены (вкл. пример из ТЗ) + случайные фигуры
├── skia/
│   ├── canvaskitLoader.ts      # загрузка CanvasKit (кастомная сборка ↔ CDN fallback)
│   ├── canvaskit-pdf.d.ts      # дополнение типов: PDF API
│   ├── pixiToSkia.ts           # ★ обёртка convertPixiContainerToSkia
│   ├── SkiaStage.ts            # экранный Skia Surface
│   └── pdfExport.ts            # экспорт сцены в векторный PDF
├── events/
│   └── SkiaPointerBridge.ts    # pointer-события для Skia-канваса (hit-test)
└── ui/styles.css
build-canvaskit/                # Docker-сборка CanvasKit+PDF + генератор тестового PNG
.github/workflows/deploy.yml    # авто-деплой на GitHub Pages
```

## Деплой на GitHub Pages

В репозитории настроен workflow (`.github/workflows/deploy.yml`): на push в `main`
он собирает проект (`VITE_BASE=/<repo>/`) и публикует `dist/` на GitHub Pages.
Включите Pages: **Settings → Pages → Source: GitHub Actions**.

## Лицензия

MIT (код проекта). CanvasKit/Skia — под лицензией BSD (Google).
