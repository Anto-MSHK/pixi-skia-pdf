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
  },
});
