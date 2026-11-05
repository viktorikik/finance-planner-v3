/* ==========================================================================
   Vite-конфигурация.
   base — критично для GitHub Pages: если приложение раздаётся из подпапки
   репозитория, все абсолютные пути должны начинаться с /<repo>/.
   BASE_PATH переопределяется CI-переменной (см. .github/workflows/deploy.yml).
   ========================================================================== */
import { defineConfig } from 'vite';

const base = process.env.BASE_PATH || '/finance-planner-v3/';

export default defineConfig({
  base,

  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },

  server: {
    port: 5173,
    host: true,           // доступ с телефона в локальной сети
    strictPort: false,
  },

  preview: {
    port: 4173,
    host: true,
  },
});
