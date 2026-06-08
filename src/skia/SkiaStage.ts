/**
 * Экранный рендерер Skia: оборачивает CanvasKit-Surface поверх <canvas>
 * и перерисовывает PIXI.Container той же обёрткой convertPixiContainerToSkia,
 * что используется и для экспорта в PDF.
 */
import type { CanvasKit, Surface } from 'canvaskit-wasm';
import type { Container as PixiContainer } from 'pixi.js-legacy';
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

  /** Перерисовывает сцену на экранный Skia-Canvas. */
  render(container: PixiContainer): void {
    if (!this.surface) return;
    const canvas = this.surface.getCanvas();
    canvas.clear(this.ck.WHITE);
    convertPixiContainerToSkia(this.ck, canvas, container, { pixelRatio: this.dpr });
    this.surface.flush();
  }

  dispose(): void {
    this.surface?.delete();
    this.surface = null;
  }
}
