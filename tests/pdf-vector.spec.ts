import { test, expect, type Page } from '@playwright/test';

/**
 * E2E-проверка ключевого требования ТЗ: экспорт сцены в PDF должен быть
 * ВЕКТОРНЫМ (пути/кривые), а спрайт — единственным растром (bitmap).
 *
 * Тест гоняет реальный стек в браузере (CanvasKit WASM + обёртка
 * convertPixiContainerToSkia + Skia PDF backend) и анализирует байты PDF:
 *   • Сцена 1 (пример из ТЗ) — 0 растровых изображений, есть кривые Безье;
 *   • Сцена 2 (со спрайтом) — ровно 1 растр + векторное окружение;
 *   • «Экспорт всех сцен» — многостраничный PDF (3 страницы).
 *
 * Анализ делается прямо в странице (несжатый PDF: compressionLevel=None),
 * поэтому операторы контент-потока читаются как текст, без распаковки.
 */

/** Считает операторы рисования и растры в (несжатых) байтах PDF на стороне страницы. */
async function analyzePdf(page: Page, scenes = false) {
  return page.evaluate((multi) => {
    const w = window as unknown as {
      __exportPdfBytes: (uncompressed?: boolean) => Uint8Array;
      __exportScenesBytes: () => Uint8Array;
    };
    const bytes = multi ? w.__exportScenesBytes() : w.__exportPdfBytes(true);
    const txt = new TextDecoder('latin1').decode(bytes);
    const count = (re: RegExp) => (txt.match(re) || []).length;
    return {
      size: bytes.length,
      header: txt.slice(0, 8),
      pages: count(/\/Type\s*\/Page[^s]/g),
      imageXObjects: count(/\/Subtype\s*\/Image/g),
      bezier: count(/(^|\s)c(\s|$)/g),
      rect: count(/(^|\s)re(\s|$)/g),
      moveTo: count(/(^|\s)m(\s|$)/g),
    };
  }, scenes);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Ждём загрузки кастомной сборки CanvasKit с PDF backend.
  await expect(page.getByText('PDF ✓')).toBeVisible({ timeout: 30_000 });
});

test('PDF backend доступен (кастомная сборка CanvasKit загружена)', async ({ page }) => {
  await expect(page.locator('#btn-export-pdf')).toBeEnabled();
});

test('Сцена 1 (пример ТЗ) экспортируется как чистый вектор', async ({ page }) => {
  const r = await analyzePdf(page);
  expect(r.header).toBe('%PDF-1.4');
  expect(r.pages).toBe(1);
  expect(r.imageXObjects).toBe(0); // нет растров — только пути
  expect(r.bezier).toBeGreaterThan(0); // эллипс рисуется кривыми Безье
  expect(r.rect).toBeGreaterThan(0); // прямоугольник
});

test('Сцена 2: спрайт как bitmap, остальное — вектор', async ({ page }) => {
  await page.locator('#btn-next-scene').click(); // → Сцена 2 (спрайт + фигуры)
  const r = await analyzePdf(page);
  expect(r.imageXObjects).toBe(1); // ровно один растр — спрайт
  expect(r.bezier).toBeGreaterThan(0); // круг/треугольник/скругл. прямоуг. — вектор
});

test('Экспорт всех сцен — многостраничный PDF (3 страницы)', async ({ page }) => {
  const r = await analyzePdf(page, true);
  expect(r.header).toBe('%PDF-1.4');
  expect(r.pages).toBe(3);
  expect(r.imageXObjects).toBe(1); // спрайт со Сцены 2
});
