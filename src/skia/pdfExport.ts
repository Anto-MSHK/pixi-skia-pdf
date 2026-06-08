/**
 * Экспорт сцены в PDF через Skia PDF backend.
 *
 * Использует ту же обёртку convertPixiContainerToSkia, что и экранный рендер,
 * но рисует на canvas PDF-страницы. Благодаря этому графика в PDF получается
 * ВЕКТОРНОЙ (пути, заливки, обводки), а не вставленным изображением. Спрайты —
 * по ТЗ — остаются bitmap (Skia встраивает их как растровые объекты).
 */
import type { CanvasKit } from 'canvaskit-wasm';
import type { Container } from 'pixi.js-legacy';
import { convertPixiContainerToSkia } from './pixiToSkia';
import { isPdfSupported } from './canvaskitLoader';

export interface PdfExportOptions {
  /** Ширина страницы в PDF-точках (1 pt = 1/72"). По умолчанию = размеру сцены. */
  width: number;
  /** Высота страницы в PDF-точках. */
  height: number;
  title?: string;
  /** Уровень сжатия содержимого PDF (по умолчанию — сжатие Skia). */
  compressionLevel?: object;
}

/** Создаёт PDF-документ Skia с корректными метаданными. */
function makePdfDocument(ck: CanvasKit, title: string, compressionLevel?: object) {
  if (!isPdfSupported(ck)) {
    throw new Error(
      'Текущая сборка CanvasKit без PDF backend. Соберите кастомную сборку: npm run build:canvaskit',
    );
  }
  return ck.MakePDFDocument({
    title,
    creator: 'pixi-skia-pdf',
    producer: 'Skia PDF backend (CanvasKit)',
    // rootTag обязателен: обёртка MakePDFDocument в этой сборке заполняет
    // поле _rootTag метаданных только при наличии rootTag, иначе embind падает
    // с "Missing field: _rootTag". Корневой тег Document также делает PDF
    // структурированным (тегированным).
    rootTag: { type: 'Document' },
    ...(compressionLevel ? { compressionLevel } : {}),
  });
}

/** Рисует контейнер на странице PDF (одна страница). */
function drawPage(ck: CanvasKit, doc: ReturnType<typeof makePdfDocument>, container: Container, width: number, height: number): void {
  const canvas = doc.beginPage(width, height);
  canvas.clear(ck.WHITE);
  // pixelRatio = 1: PDF меряется в точках, без масштабирования под экран.
  convertPixiContainerToSkia(ck, canvas, container, { pixelRatio: 1 });
  doc.endPage();
}

/**
 * Рендерит контейнер в PDF и возвращает байты документа.
 * @throws если текущая сборка CanvasKit собрана без PDF backend.
 */
export function exportContainerToPdf(
  ck: CanvasKit,
  container: Container,
  options: PdfExportOptions,
): Uint8Array {
  const doc = makePdfDocument(ck, options.title ?? 'Pixi → Skia scene', options.compressionLevel);
  drawPage(ck, doc, container, options.width, options.height);
  const bytes = doc.close();
  doc.delete();
  return bytes;
}

/**
 * Экспортирует несколько сцен в один многостраничный PDF (каждая сцена —
 * отдельная страница). Та же векторная обёртка рисует каждую страницу.
 */
export function exportScenesToPdf(
  ck: CanvasKit,
  scenes: Array<{ name: string; container: Container }>,
  options: PdfExportOptions,
): Uint8Array {
  const doc = makePdfDocument(ck, options.title ?? 'Pixi → Skia scenes', options.compressionLevel);
  for (const scene of scenes) {
    drawPage(ck, doc, scene.container, options.width, options.height);
  }
  const bytes = doc.close();
  doc.delete();
  return bytes;
}

/** Инициирует скачивание PDF в браузере. */
export function downloadPdf(bytes: Uint8Array, filename = 'scene.pdf'): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
