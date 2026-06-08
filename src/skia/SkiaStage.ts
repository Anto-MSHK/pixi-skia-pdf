/**
 * Экранный рендерер Skia: оборачивает CanvasKit-Surface поверх <canvas>
 * и перерисовывает PIXI.Container той же обёрткой convertPixiContainerToSkia,
 * что используется и для экспорта в PDF.
 */
import type { CanvasKit, Surface } from 'canvaskit-wasm';
import type { Container as PixiContainer, DisplayObject } from 'pixi.js-legacy';
import { convertPixiContainerToSkia } from './pixiToSkia';

export class SkiaStage {
  private readonly ck: CanvasKit;
  private surface: Surface | null = null;
  private readonly dpr: number;

  /** Логический размер сцены в CSS-пикселях. */
  readonly width: number;
  readonly height: number;

  constructor(ck: CanvasKit, canvasEl: HTMLCanvasElement, width: number, height: number) {
    this.ck = ck;
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvasEl.width = Math.floor(width * this.dpr);
    canvasEl.height = Math.floor(height * this.dpr);
    canvasEl.style.width = `${width}px`;
    canvasEl.style.height = `${height}px`;

    this.surface = ck.MakeCanvasSurface(canvasEl) as Surface | null;
    if (!this.surface) {
      throw new Error('Не удалось создать Skia Surface на canvas');
    }
  }

  /**
   * Перерисовывает сцену на экранный Skia-Canvas.
   * @param highlight — объект, вокруг которого нарисовать рамку выделения
   *   (демонстрация hit-test: клик по фигуре на любом канвасе подсвечивает её
   *   именно здесь — значит наш hit-test нашёл тот же объект).
   */
  render(container: PixiContainer, highlight?: DisplayObject | null): void {
    if (!this.surface) return;
    const ck = this.ck;
    const canvas = this.surface.getCanvas();
    canvas.clear(ck.WHITE);
    convertPixiContainerToSkia(ck, canvas, container, { pixelRatio: this.dpr });

    if (highlight) {
      const b = highlight.getBounds();
      canvas.save();
      canvas.scale(this.dpr, this.dpr);
      const pad = 4;
      const rect = ck.XYWHRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
      const paint = new ck.Paint();
      paint.setAntiAlias(true);
      paint.setStyle(ck.PaintStyle.Stroke);
      paint.setStrokeWidth(3);
      paint.setColor(ck.Color(14, 165, 233, 1)); // accent (#0ea5e9)
      // Пунктирная рамка выделения.
      const dash = ck.PathEffect.MakeDash([8, 6], 0);
      if (dash) paint.setPathEffect(dash);
      canvas.drawRect(rect, paint);
      dash?.delete();
      paint.delete();
      canvas.restore();
    }

    this.surface.flush();
  }

  dispose(): void {
    this.surface?.delete();
    this.surface = null;
  }
}
