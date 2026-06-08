/**
 * Ядро обёртки: отрисовка PIXI.Container средствами Skia (CanvasKit).
 *
 * Главная функция — convertPixiContainerToSkia(): рекурсивно обходит дерево
 * Pixi-объектов, для каждого вычисляет мировую матрицу (translate / rotate /
 * scale, скомпонованные по иерархии) и рисует поддерживаемые объекты на
 * переданном Skia-Canvas:
 *   • PIXI.Graphics — векторно (drawRect / drawShape / moveTo / lineTo и пр.);
 *   • PIXI.Sprite   — как bitmap-изображение.
 *
 * Один и тот же код рисует и на экранный surface, и на canvas PDF-страницы —
 * поэтому экспорт в PDF получается векторным «бесплатно».
 */
import type { CanvasKit, Canvas, Image as SkImage, Paint, Path } from 'canvaskit-wasm';
import { SHAPES, Matrix } from 'pixi.js-legacy';
import type {
  Container,
  DisplayObject,
  Graphics,
  GraphicsData,
  Sprite,
} from 'pixi.js-legacy';

/** Опции одного прохода отрисовки. */
export interface DrawOptions {
  /** Множитель плотности пикселей (для чёткости на экране). Для PDF = 1. */
  pixelRatio?: number;
}

/** HTMLImageElement, привязанный к спрайту для создания SkImage (см. scenes.ts). */
interface SpriteWithImage extends Sprite {
  __image?: CanvasImageSource;
}

/**
 * Конвертирует Pixi-матрицу (a, b, c, d, tx, ty) в матрицу 3×3 Skia
 * (row-major: [scaleX, skewX, transX, skewY, scaleY, transY, 0, 0, 1]).
 */
function toSkMatrix(m: Matrix): number[] {
  return [m.a, m.c, m.tx, m.b, m.d, m.ty, 0, 0, 1];
}

/** Раскладывает Pixi-цвет (0xRRGGBB) + alpha в Skia-цвет. */
function toSkColor(ck: CanvasKit, color: number, alpha: number): Float32Array {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return ck.Color(r, g, b, alpha);
}

/** Кэш SkImage по источнику изображения (чтобы не пересоздавать каждый кадр). */
const imageCache = new WeakMap<CanvasImageSource, SkImage>();

function getSkImage(ck: CanvasKit, src: CanvasImageSource): SkImage | null {
  let img = imageCache.get(src);
  if (!img) {
    const created = ck.MakeImageFromCanvasImageSource(src);
    if (!created) return null;
    img = created;
    imageCache.set(src, img);
  }
  return img;
}

/** Строит Skia-Path для одной формы Pixi (GraphicsData.shape). */
function buildPath(ck: CanvasKit, data: GraphicsData): Path {
  const path = new ck.Path();
  const shape = data.shape as unknown as Record<string, number>;

  switch (data.type) {
    case SHAPES.RECT: {
      path.addRect(ck.XYWHRect(shape.x, shape.y, shape.width, shape.height));
      break;
    }
    case SHAPES.RREC: {
      const rect = ck.XYWHRect(shape.x, shape.y, shape.width, shape.height);
      path.addRRect(ck.RRectXY(rect, shape.radius, shape.radius));
      break;
    }
    case SHAPES.CIRC: {
      // PIXI.Circle: x, y — центр, radius — радиус.
      path.addOval(
        ck.XYWHRect(shape.x - shape.radius, shape.y - shape.radius, shape.radius * 2, shape.radius * 2),
      );
      break;
    }
    case SHAPES.ELIP: {
      // PIXI.Ellipse: x, y — центр, width / height — полуоси.
      path.addOval(
        ck.XYWHRect(shape.x - shape.width, shape.y - shape.height, shape.width * 2, shape.height * 2),
      );
      break;
    }
    case SHAPES.POLY:
    default: {
      // Polygon хранит точки в shape.points как [x0, y0, x1, y1, ...].
      // moveTo / lineTo / drawPolygon создают именно Polygon. На всякий
      // случай откатываемся на data.points.
      const polyShape = data.shape as unknown as { points?: number[]; closeStroke?: boolean };
      const pts = polyShape.points && polyShape.points.length ? polyShape.points : data.points;
      if (pts && pts.length >= 2) {
        path.moveTo(pts[0], pts[1]);
        for (let i = 2; i + 1 < pts.length; i += 2) {
          path.lineTo(pts[i], pts[i + 1]);
        }
        if (polyShape.closeStroke) path.close();
      }
      break;
    }
  }
  return path;
}

/** Маппинг стиля линии Pixi → Skia (cap/join). */
function applyLineStyle(ck: CanvasKit, paint: Paint, data: GraphicsData): void {
  const cap = data.lineStyle.cap as unknown as string;
  const join = data.lineStyle.join as unknown as string;
  paint.setStrokeWidth(data.lineStyle.width);
  paint.setStrokeCap(
    cap === 'round' ? ck.StrokeCap.Round : cap === 'square' ? ck.StrokeCap.Square : ck.StrokeCap.Butt,
  );
  paint.setStrokeJoin(
    join === 'round' ? ck.StrokeJoin.Round : join === 'bevel' ? ck.StrokeJoin.Bevel : ck.StrokeJoin.Miter,
  );
}

/** Рисует один PIXI.Graphics на Skia-Canvas (мировая матрица уже применена). */
function drawGraphics(ck: CanvasKit, canvas: Canvas, g: Graphics, worldAlpha: number): void {
  const list = g.geometry.graphicsData;
  for (const data of list) {
    // Матрица уровня формы (если задавалась через .setMatrix / drawShape).
    const hasShapeMatrix = !!data.matrix;
    if (hasShapeMatrix) {
      canvas.save();
      canvas.concat(toSkMatrix(data.matrix));
    }

    const path = buildPath(ck, data);

    // Заливка.
    if (data.fillStyle.visible) {
      const paint = new ck.Paint();
      paint.setAntiAlias(true);
      paint.setStyle(ck.PaintStyle.Fill);
      paint.setColor(toSkColor(ck, data.fillStyle.color, data.fillStyle.alpha * worldAlpha));
      canvas.drawPath(path, paint);
      paint.delete();
    }

    // Обводка / линия.
    if (data.lineStyle.visible && data.lineStyle.width > 0) {
      const paint = new ck.Paint();
      paint.setAntiAlias(true);
      paint.setStyle(ck.PaintStyle.Stroke);
      paint.setColor(toSkColor(ck, data.lineStyle.color, data.lineStyle.alpha * worldAlpha));
      applyLineStyle(ck, paint, data);
      canvas.drawPath(path, paint);
      paint.delete();
    }

    path.delete();
    if (hasShapeMatrix) canvas.restore();
  }
}

/** Рисует PIXI.Sprite как bitmap (в PDF это останется растром — по ТЗ). */
function drawSprite(ck: CanvasKit, canvas: Canvas, sprite: SpriteWithImage, worldAlpha: number): void {
  const source = sprite.__image;
  if (!source) return;
  const img = getSkImage(ck, source);
  if (!img) return;

  const { width, height } = sprite.texture.orig;
  const ax = sprite.anchor.x;
  const ay = sprite.anchor.y;

  const src = ck.XYWHRect(0, 0, img.width(), img.height());
  const dst = ck.XYWHRect(-ax * width, -ay * height, width, height);

  const paint = new ck.Paint();
  paint.setAntiAlias(true);
  if (worldAlpha < 1) paint.setAlphaf(worldAlpha);
  canvas.drawImageRect(img, src, dst, paint, false);
  paint.delete();
}

/** Рекурсивный обход одного узла дерева. */
function renderNode(
  ck: CanvasKit,
  canvas: Canvas,
  node: DisplayObject,
  parentMatrix: Matrix,
  parentAlpha: number,
): void {
  if (!node.visible) return;

  // Локальная матрица узла (учитывает position / rotation / scale / pivot / skew).
  node.transform.updateLocalTransform();
  const world = parentMatrix.clone().append(node.transform.localTransform);
  const worldAlpha = parentAlpha * node.alpha;

  // Рисуем сам узел в его мировой системе координат.
  canvas.save();
  canvas.concat(toSkMatrix(world));
  if (isGraphics(node)) {
    drawGraphics(ck, canvas, node, worldAlpha);
  } else if (isSprite(node)) {
    drawSprite(ck, canvas, node as SpriteWithImage, worldAlpha);
  }
  canvas.restore();

  // Обходим детей (Container / у Graphics и Sprite тоже могут быть дети).
  const children = (node as Container).children;
  if (children) {
    for (const child of children) {
      renderNode(ck, canvas, child, world, worldAlpha);
    }
  }
}

/** Утиная типизация: Graphics определяется по наличию geometry.graphicsData. */
function isGraphics(node: DisplayObject): node is Graphics {
  return !!(node as Graphics).geometry && Array.isArray((node as Graphics).geometry?.graphicsData);
}

/** Утиная типизация: Sprite определяется по наличию texture + anchor. */
function isSprite(node: DisplayObject): node is Sprite {
  const s = node as Sprite;
  return !!s.texture && !!s.anchor && typeof (s.anchor as { x?: number }).x === 'number' && !isGraphics(node);
}

/**
 * Обёртка для Skia: отрисовывает PIXI.Container на переданном Skia-Canvas.
 *
 * @param ck        — инстанс CanvasKit.
 * @param canvas    — целевой Skia-Canvas (экранный surface или PDF-страница).
 * @param container — корневой PIXI.Container со сценой.
 * @param options   — { pixelRatio } для масштабирования под плотность экрана.
 */
export function convertPixiContainerToSkia(
  ck: CanvasKit,
  canvas: Canvas,
  container: Container,
  options: DrawOptions = {},
): void {
  const dpr = options.pixelRatio ?? 1;

  canvas.save();
  if (dpr !== 1) canvas.scale(dpr, dpr);

  // Стартовая матрица — единичная: контейнер рисуется в собственной системе.
  renderNode(ck, canvas, container, new Matrix(), 1);

  canvas.restore();
}
