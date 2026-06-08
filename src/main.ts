/**
 * Точка входа приложения.
 *
 * Поднимает PIXI.Application (legacy, forceCanvas:true), инициализирует Skia
 * (CanvasKit), рендерит одну и ту же сцену на обоих канвасах, навешивает
 * события и связывает UI: случайные фигуры, переключение сцен, экспорт в PDF.
 */
import { Application, Container } from 'pixi.js-legacy';
import { loadCanvasKit, isPdfSupported } from './skia/canvaskitLoader';
import { SkiaStage } from './skia/SkiaStage';
import { SkiaPointerBridge } from './events/SkiaPointerBridge';
import { exportContainerToPdf, downloadPdf } from './skia/pdfExport';
import { buildScenes, addRandomShape, type NamedScene } from './pixi/scenes';

const WIDTH = 760;
const HEIGHT = 520;

/** Простой логгер событий в UI. */
function createLogger(): (msg: string) => void {
  const list = document.getElementById('event-log') as HTMLUListElement;
  return (msg: string) => {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    li.textContent = `${time}  ${msg}`;
    list.prepend(li);
    while (list.children.length > 40) list.lastChild?.remove();
  };
}

function setStatus(id: string, text: string, kind: 'ok' | 'warn' | '' = ''): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `badge${kind ? ' ' + kind : ''}`;
}

async function main(): Promise<void> {
  const log = createLogger();

  // 1. Pixi (legacy, forceCanvas — рендер на 2D-canvas, как требует ТЗ).
  const app = new Application({
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: 0xffffff,
    forceCanvas: true,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  const pixiWrap = document.getElementById('pixi-canvas-wrap')!;
  pixiWrap.appendChild(app.view as HTMLCanvasElement);
  app.stage.eventMode = 'static';
  setStatus('pixi-status', 'готово', 'ok');

  // 2. Сцены.
  const scenes: NamedScene[] = await buildScenes(log);
  let sceneIndex = 0;
  let current: Container = scenes[sceneIndex].container;
  app.stage.addChild(current);

  // 3. Skia (CanvasKit).
  let skia: SkiaStage | null = null;
  let pdfReady = false;
  const skiaCanvas = document.getElementById('skia-canvas') as HTMLCanvasElement;
  const bridge = new SkiaPointerBridge(skiaCanvas, current);

  const renderSkia = () => skia?.render(current);

  try {
    const ck = await loadCanvasKit();
    skia = new SkiaStage(ck, skiaCanvas, WIDTH, HEIGHT);
    pdfReady = isPdfSupported(ck);
    setStatus('skia-status', pdfReady ? 'готово · PDF ✓' : 'готово · без PDF', pdfReady ? 'ok' : 'warn');
    renderSkia();

    // Кнопка экспорта в PDF.
    const btnPdf = document.getElementById('btn-export-pdf') as HTMLButtonElement;
    if (!pdfReady) {
      btnPdf.disabled = true;
      btnPdf.title = 'Текущая сборка CanvasKit без PDF. Соберите кастомную: npm run build:canvaskit';
      log('⚠ PDF backend недоступен — загружена сток-сборка CanvasKit.');
    }
    const exportCurrentPdf = (uncompressed = false) =>
      exportContainerToPdf(ck, current, {
        width: WIDTH,
        height: HEIGHT,
        title: scenes[sceneIndex].name,
        compressionLevel: uncompressed ? ck.PDFCompressionLevel.None : undefined,
      });

    btnPdf.addEventListener('click', () => {
      try {
        const bytes = exportCurrentPdf();
        downloadPdf(bytes, `pixi-skia-scene-${sceneIndex + 1}.pdf`);
        log(`⬇ PDF сгенерирован (${(bytes.length / 1024).toFixed(1)} КБ)`);
      } catch (err) {
        log(`✗ Ошибка экспорта PDF: ${(err as Error).message}`);
      }
    });

    // Dev-only хук для e2e-проверки: возвращает байты PDF текущей сцены.
    // В прод-сборку не попадает (вырезается по import.meta.env.DEV).
    if (import.meta.env.DEV) {
      (window as unknown as { __exportPdfBytes?: () => Uint8Array }).__exportPdfBytes =
        exportCurrentPdf;
    }
  } catch (err) {
    setStatus('skia-status', 'ошибка', 'warn');
    log(`✗ CanvasKit не загрузился: ${(err as Error).message}`);
  }

  // 4. Переключение сцены.
  const switchScene = (index: number) => {
    app.stage.removeChild(current);
    sceneIndex = (index + scenes.length) % scenes.length;
    current = scenes[sceneIndex].container;
    app.stage.addChild(current);
    bridge.setContainer(current);
    renderSkia();
    log(`⟳ ${scenes[sceneIndex].name}`);
  };

  // 5. UI.
  document.getElementById('btn-random')!.addEventListener('click', () => {
    addRandomShape(current, log);
    renderSkia();
    log('＋ Добавлена случайная фигура');
  });

  document.getElementById('btn-next-scene')!.addEventListener('click', () => switchScene(sceneIndex + 1));

  let autoTimer: number | undefined;
  const chk = document.getElementById('chk-autoplay') as HTMLInputElement;
  chk.addEventListener('change', () => {
    if (chk.checked) {
      autoTimer = window.setInterval(() => switchScene(sceneIndex + 1), 3000);
    } else if (autoTimer) {
      clearInterval(autoTimer);
    }
  });

  // 6. Pixi рисует сам в ticker; Skia синхронизируем каждый кадр (на случай
  // динамики из событий). Для статичной сцены это дёшево.
  app.ticker.add(() => renderSkia());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
