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
  if (!isPdfSupported(ck)) {
    throw new Error(
      'Текущая сборка CanvasKit без PDF backend. Соберите кастомную сборку: npm run build:canvaskit',
    );
  }

  const doc = ck.MakePDFDocument({
    title: options.title ?? 'Pixi → Skia scene',
    creator: 'pixi-skia-pdf',
    producer: 'Skia PDF backend (CanvasKit)',
  });

  const canvas = doc.beginPage(options.width, options.height);
  canvas.clear(ck.WHITE);
  // pixelRatio = 1: PDF меряется в точках, без масштабирования под экран.
  convertPixiContainerToSkia(ck, canvas, container, { pixelRatio: 1 });
  doc.endPage();

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
