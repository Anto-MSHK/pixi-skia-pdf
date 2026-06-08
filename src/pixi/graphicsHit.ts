/**
 * Hit-test по обводке (линии) PIXI.Graphics.
 *
 * Заливку фигуры можно проверить через shape.contains(), но у линий
 * (lineStyle + moveTo/lineTo, без заливки) площади нет — клик по ним так не
 * ловится. Здесь — проверка «точка рядом с ломаной»: расстояние до любого из
 * отрезков ≤ полширины линии + небольшой допуск. Один и тот же код используют
 * и Skia-мост (hit-test на Skia-канвасе), и Pixi (через node.hitArea), поэтому
 * линии одинаково кликабельны на обоих канвасах.
 */
import type { Graphics } from 'pixi.js-legacy';

/** Квадрат расстояния от точки (px,py) до отрезка (x1,y1)-(x2,y2). */
function distSqToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/** Есть ли у Graphics хотя бы одна видимая заливка. */
export function hasVisibleFill(g: Graphics): boolean {
  return g.geometry.graphicsData.some((d) => d.fillStyle.visible);
}

/**
 * true, если точка (в ЛОКАЛЬНЫХ координатах объекта) попадает в обводку любой
 * ломаной этого Graphics (с учётом толщины линии).
 */
export function strokeContains(g: Graphics, x: number, y: number): boolean {
  for (const data of g.geometry.graphicsData) {
    const ls = data.lineStyle;
    if (!ls.visible || ls.width <= 0) continue;
    const poly = data.shape as unknown as { points?: number[] };
    const pts = poly.points && poly.points.length ? poly.points : data.points;
    if (!pts || pts.length < 4) continue;
    const tol = ls.width / 2 + 4; // допуск, чтобы по тонким линиям было легко попасть
    const tolSq = tol * tol;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      if (distSqToSegment(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= tolSq) {
        return true;
      }
    }
  }
  return false;
}
