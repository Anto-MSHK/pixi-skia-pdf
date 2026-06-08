/**
 * Заранее подготовленные сцены (PIXI.Container) для демонстрации.
 *
 * Сцена 1 повторяет пример из ТЗ (эллипс/прямоугольник с поворотом и
 * масштабом + две линии во вложенном контейнере). Остальные сцены
 * показывают спрайт (bitmap) и разнообразные фигуры. Интерактивные объекты
 * помечаются eventMode='static' и вешают обработчики pointerdown/pointerup —
 * эти же обработчики переиспользуются для событий на Skia-канвасе.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js-legacy';
import type { DisplayObject } from 'pixi.js-legacy';
import { hasVisibleFill, strokeContains } from './graphicsHit';

/** Колбэк логирования событий (общий для обоих канвасов). */
export type EventLogger = (message: string) => void;

/** Колбэк выбора объекта (для подсветки выделения на Skia-канвасе). */
export type PickHandler = (node: DisplayObject) => void;

interface SpriteWithImage extends Sprite {
  __image?: CanvasImageSource;
}

export interface NamedScene {
  name: string;
  container: Container;
}

/** Загружает изображение как HTMLImageElement. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Не удалось загрузить изображение: ${url}`));
    img.src = url;
  });
}

/** Делает объект интерактивным и логирует pointerdown/pointerup. */
function makeInteractive(
  node: Graphics | Sprite,
  label: string,
  log: EventLogger,
  onPick?: PickHandler,
): void {
  node.eventMode = 'static';
  node.cursor = 'pointer';
  // Линии (Graphics без заливки) Pixi не ловит по умолчанию — задаём hitArea
  // с проверкой попадания по обводке (тот же критерий, что у Skia-моста).
  if (node instanceof Graphics && !hasVisibleFill(node)) {
    node.hitArea = { contains: (x: number, y: number) => strokeContains(node, x, y) };
  }
  node.on('pointerdown', () => {
    log(`▼ pointerdown → ${label}`);
    onPick?.(node);
  });
  node.on('pointerup', () => log(`▲ pointerup → ${label}`));
}

/** Сцена 1 — точный пример из технического задания. */
function buildScene1(log: EventLogger, onPick?: PickHandler): Container {
  const mainContainer = new Container();
  const subContainer = new Container();

  const g1 = new Graphics();
  const g2 = new Graphics();
  const g3 = new Graphics();
  const g4 = new Graphics();

  g1.beginFill(0xff0000).drawEllipse(0, 0, 200, 100).endFill();
  g1.position.set(260, 160);
  g1.angle = 30;
  makeInteractive(g1, 'g1 (эллипс)', log, onPick);

  g2.beginFill(0x0000ff).drawRect(-50, -75, 100, 150).endFill();
  g2.position.set(180, 120);
  g2.angle = 15;
  g2.scale.set(1.5, 1.7);
  makeInteractive(g2, 'g2 (прямоугольник)', log, onPick);

  g3.lineStyle(10, 0xffffff, 1).moveTo(0, 0).lineTo(150, 100);
  g3.angle = -20;
  makeInteractive(g3, 'g3 (линия)', log, onPick);

  g4.lineStyle(10, 0xffff00, 1).moveTo(0, 70).lineTo(150, -30);
  g4.angle = 20;
  makeInteractive(g4, 'g4 (линия)', log, onPick);

  subContainer.position.set(135, 110);
  subContainer.addChild(g3, g4);
  mainContainer.addChild(subContainer, g1, g2);

  return mainContainer;
}

/** Сцена 2 — спрайт (bitmap) + векторные фигуры вокруг. */
function buildScene2(
  log: EventLogger,
  spriteTexture: Texture,
  spriteImage: CanvasImageSource,
  onPick?: PickHandler,
): Container {
  const root = new Container();

  const sprite = new Sprite(spriteTexture) as SpriteWithImage;
  sprite.__image = spriteImage;
  sprite.anchor.set(0.5);
  sprite.position.set(380, 260);
  sprite.angle = 12;
  sprite.scale.set(1.2);
  makeInteractive(sprite, 'sprite (bitmap)', log, onPick);

  const ring = new Graphics();
  ring.lineStyle(8, 0x16a34a, 1).drawCircle(380, 260, 150);

  const tri = new Graphics();
  tri
    .beginFill(0xf59e0b, 0.85)
    .moveTo(120, 120)
    .lineTo(220, 120)
    .lineTo(170, 40)
    .closePath()
    .endFill();
  tri.position.set(60, 60);
  makeInteractive(tri, 'tri (треугольник)', log, onPick);

  const rrect = new Graphics();
  rrect.beginFill(0x8b5cf6).drawRoundedRect(540, 360, 160, 110, 24).endFill();
  rrect.angle = -8;
  makeInteractive(rrect, 'rrect (скругл. прямоуг.)', log, onPick);

  root.addChild(ring, sprite, tri, rrect);
  return root;
}

/** Сцена 3 — набор разных фигур и линий. */
function buildScene3(log: EventLogger, onPick?: PickHandler): Container {
  const root = new Container();

  const c1 = new Graphics();
  c1.beginFill(0xef4444).drawCircle(0, 0, 70).endFill();
  c1.position.set(160, 160);
  makeInteractive(c1, 'circle красный', log, onPick);

  const c2 = new Graphics();
  c2.beginFill(0x3b82f6, 0.7).drawCircle(0, 0, 90).endFill();
  c2.position.set(260, 220);
  makeInteractive(c2, 'circle синий', log, onPick);

  const star = new Graphics();
  star.beginFill(0xfacc15);
  const cx = 0;
  const cy = 0;
  const spikes = 5;
  const outer = 80;
  const inner = 34;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) star.moveTo(x, y);
    else star.lineTo(x, y);
  }
  star.closePath().endFill();
  star.position.set(540, 300);
  star.angle = 10;
  makeInteractive(star, 'звезда', log, onPick);

  const wave = new Graphics();
  wave.lineStyle(6, 0x0ea5e9, 1).moveTo(40, 440);
  for (let x = 40; x <= 720; x += 20) {
    wave.lineTo(x, 440 + Math.sin(x / 40) * 30);
  }
  makeInteractive(wave, 'волна (линия)', log, onPick);

  root.addChild(c1, c2, star, wave);
  return root;
}

/** Собирает все сцены. Асинхронно — из-за загрузки PNG для спрайта. */
export async function buildScenes(log: EventLogger, onPick?: PickHandler): Promise<NamedScene[]> {
  const pngUrl = `${import.meta.env.BASE_URL}assets/sample.png`;
  const image = await loadImage(pngUrl);
  const texture = Texture.from(image);

  return [
    { name: 'Сцена 1 — пример из ТЗ', container: buildScene1(log, onPick) },
    { name: 'Сцена 2 — спрайт + фигуры', container: buildScene2(log, texture, image, onPick) },
    { name: 'Сцена 3 — фигуры и линии', container: buildScene3(log, onPick) },
  ];
}

/**
 * Добавляет в контейнер случайную фигуру или линию (для кнопки в UI).
 * Возвращает созданный объект (его тоже делаем интерактивным).
 */
export function addRandomShape(container: Container, log: EventLogger, onPick?: PickHandler): Graphics {
  const g = new Graphics();
  const rnd = (min: number, max: number) => min + Math.random() * (max - min);
  const color = Math.floor(Math.random() * 0xffffff);
  const kind = Math.floor(Math.random() * 4);

  switch (kind) {
    case 0:
      g.beginFill(color, 0.85).drawCircle(0, 0, rnd(20, 60)).endFill();
      break;
    case 1:
      g.beginFill(color, 0.85).drawRect(-rnd(20, 60), -rnd(20, 60), rnd(40, 120), rnd(40, 120)).endFill();
      break;
    case 2:
      g.beginFill(color, 0.85)
        .drawRoundedRect(-50, -35, rnd(70, 140), rnd(50, 90), rnd(8, 24))
        .endFill();
      break;
    default:
      g.lineStyle(rnd(3, 12), color, 1)
        .moveTo(0, 0)
        .lineTo(rnd(-80, 80), rnd(-80, 80))
        .lineTo(rnd(-80, 80), rnd(-80, 80));
      break;
  }

  g.position.set(rnd(80, 680), rnd(80, 440));
  g.angle = rnd(0, 360);
  makeInteractive(g, `random#${container.children.length + 1}`, log, onPick);
  container.addChild(g);
  return g;
}
