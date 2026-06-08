import { defineConfig } from 'vite';

// Базовый путь. На GitHub Pages проект публикуется по /<repo>/, поэтому
// для прод-сборки берём имя репозитория из переменной окружения (её задаёт
// workflow деплоя). Локально base = '/'.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  server: {
    port: 5173,
    open: false,
    // Не следим за гигантским чекаутом Skia из персистентной сборки.
    watch: { ignored: ['**/build-canvaskit/work/**'] },
  },
  // Ограничиваем скан зависимостей единственной точкой входа — иначе esbuild
  // обходит все .html в дереве (включая тестовые HTML Skia/Dawn в
  // build-canvaskit/work/) и сыплет предупреждениями о неразрешённых импортах.
  optimizeDeps: { entries: ['index.html'] },
});
