/**
 * Мост событий для Skia-канваса.
 *
 * На Pixi-канвасе события pointerdown/pointerup диспатчит сам Pixi. У Skia-
 * канваса своей системы событий нет, поэтому мы навешиваем DOM-листенеры,
 * делаем hit-test по дереву PIXI.Container (с учётом мировых матриц) и
 * вызываем emit на найденном объекте — срабатывают те же обработчики, что
 * были навешаны в сцене. Так одни и те же события работают на обоих канвасах.
 */
import { Matrix, Point } from 'pixi.js-legacy';
import type { Container, DisplayObject, Graphics, Sprite } from 'pixi.js-legacy';

function isInteractive(node: DisplayObject): boolean {
  return node.eventMode === 'static' || node.eventMode === 'dynamic';
}

function isGraphics(node: DisplayObject): node is Graphics {
  return Array.isArray((node as Graphics).geometry?.graphicsData);
}

function isSprite(node: DisplayObject): node is Sprite {
  const s = node as Sprite;
  return !!s.texture && !!s.anchor && !isGraphics(node);
}

/** Проверяет попадание точки (в локальных координатах узла) внутрь объекта. */
function hitNode(node: DisplayObject, local: Point): boolean {
  if (isGraphics(node)) {
    for (const data of node.geometry.graphicsData) {
      // Учитываем только видимые заливки (надёжный hit-test «по телу»).
      if (data.fillStyle.visible && data.shape.contains(local.x, local.y)) return true;
    }
    return false;
  }
  if (isSprite(node)) {
    const { width, height } = node.texture.orig;
    const ax = node.anchor.x;
    const ay = node.anchor.y;
    return (
      local.x >= -ax * width &&
      local.x <= (1 - ax) * width &&
      local.y >= -ay * height &&
      local.y <= (1 - ay) * height
    );
  }
  return false;
}

/** Рекурсивно собирает попавшие интерактивные узлы (в порядке отрисовки). */
function collectHits(
  node: DisplayObject,
  parentMatrix: Matrix,
  x: number,
  y: number,
  out: DisplayObject[],
): void {
  if (!node.visible) return;
  node.transform.updateLocalTransform();
  const world = parentMatrix.clone().append(node.transform.localTransform);

  if (isInteractive(node)) {
    const local = world.applyInverse(new Point(x, y));
    if (hitNode(node, local)) out.push(node);
  }

  const children = (node as Container).children;
  if (children) {
    for (const child of children) collectHits(child, world, x, y, out);
  }
}

/** Возвращает верхний (последний нарисованный) интерактивный объект под точкой. */
function hitTest(container: Container, x: number, y: number): DisplayObject | null {
  const hits: DisplayObject[] = [];
  collectHits(container, new Matrix(), x, y, hits);
  return hits.length ? hits[hits.length - 1] : null;
}

export class SkiaPointerBridge {
  private container: Container;
  private readonly canvas: HTMLCanvasElement;
  private readonly onDown: (e: PointerEvent) => void;
  private readonly onUp: (e: PointerEvent) => void;

  constructor(canvas: HTMLCanvasElement, container: Container) {
    this.canvas = canvas;
    this.container = container;

    const dispatch = (type: 'pointerdown' | 'pointerup', e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      // CSS-размер canvas совпадает с логическим размером сцены.
      const x = ((e.clientX - rect.left) / rect.width) * this.logicalWidth();
      const y = ((e.clientY - rect.top) / rect.height) * this.logicalHeight();
      const target = hitTest(this.container, x, y);
      if (target) {
        target.emit(type, {
          type,
          global: new Point(x, y),
          target,
        } as never);
      }
    };

    this.onDown = (e) => dispatch('pointerdown', e);
    this.onUp = (e) => dispatch('pointerup', e);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
  }

  private logicalWidth(): number {
    return parseFloat(this.canvas.style.width) || this.canvas.width;
  }

  private logicalHeight(): number {
    return parseFloat(this.canvas.style.height) || this.canvas.height;
  }

  /** Переключает активный контейнер (при смене сцены). */
  setContainer(container: Container): void {
    this.container = container;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
  }
}
