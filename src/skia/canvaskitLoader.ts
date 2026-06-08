/**
 * Загрузчик CanvasKit (Skia + WebAssembly).
 *
 * Грузит нашу кастомную сборку из public/canvaskit/canvaskit.js — она
 * содержит PDF backend (CanvasKit.pdf === true). Если кастомной сборки нет
 * (например, локально до её компиляции), откатывается на сток-пакет с CDN,
 * чтобы рендер и события можно было проверить без PDF.
 *
 * Загрузка идёт через <script>: canvaskit.js (Emscripten glue) определяет
 * глобальную функцию CanvasKitInit, которую мы вызываем с locateFile,
 * указывающим, откуда брать .wasm.
 */
import type { CanvasKit, CanvasKitInitOptions } from 'canvaskit-wasm';

type CanvasKitInitFn = (opts: CanvasKitInitOptions) => Promise<CanvasKit>;

/** Версия сток-сборки CanvasKit для fallback (без PDF). */
const FALLBACK_VERSION = '0.39.1';
const FALLBACK_BASE = `https://unpkg.com/canvaskit-wasm@${FALLBACK_VERSION}/bin/`;

let cached: Promise<CanvasKit> | null = null;

/** Динамически подключает внешний скрипт и резолвится после загрузки. */
function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Не удалось загрузить скрипт: ${src}`));
    document.head.appendChild(el);
  });
}

/**
 * Проверяет, есть ли локальная кастомная сборка. Нельзя полагаться на статус:
 * dev-сервер Vite отдаёт index.html (text/html, 200) для несуществующих путей.
 * Поэтому смотрим content-type — у настоящего canvaskit.js это JS.
 */
async function localBuildAvailable(jsUrl: string): Promise<boolean> {
  try {
    const res = await fetch(jsUrl, { method: 'GET' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return /javascript|ecmascript|octet-stream/i.test(ct);
  } catch {
    return false;
  }
}

async function init(): Promise<CanvasKit> {
  const base = import.meta.env.BASE_URL; // '/' локально или '/<repo>/' на Pages
  const localBase = `${base}canvaskit/`;
  const hasCustom = await localBuildAvailable(`${localBase}canvaskit.js`);

  const scriptUrl = hasCustom ? `${localBase}canvaskit.js` : `${FALLBACK_BASE}canvaskit.js`;
  const fileBase = hasCustom ? localBase : FALLBACK_BASE;

  await injectScript(scriptUrl);
  const initFn = (window as unknown as { CanvasKitInit?: CanvasKitInitFn }).CanvasKitInit;
  if (!initFn) {
    throw new Error('CanvasKitInit не найден после загрузки canvaskit.js');
  }

  const ck = await initFn({ locateFile: (file: string) => `${fileBase}${file}` });

  if (!hasCustom) {
    console.warn(
      '[CanvasKit] Используется сток-сборка без PDF backend. ' +
        'Соберите кастомную сборку (npm run build:canvaskit) для экспорта в PDF.',
    );
  }
  return ck;
}

/** Возвращает (кэшированный) инстанс CanvasKit. */
export function loadCanvasKit(): Promise<CanvasKit> {
  if (!cached) cached = init();
  return cached;
}

/**
 * true, если загруженная сборка поддерживает экспорт в PDF.
 *
 * Надёжный признак — наличие функции MakePDFDocument: именно её добавляют
 * PDF-биндинги нашей кастомной сборки. Флаг ck.pdf форк не выставляет, поэтому
 * на него не опираемся (сток-сборка функции не имеет — там вернётся false).
 */
export function isPdfSupported(ck: CanvasKit): boolean {
  return typeof ck.MakePDFDocument === 'function';
}
