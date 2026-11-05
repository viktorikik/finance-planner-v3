/* ==========================================================================
   Конфигурация Vitest.
   Окружение — node. Для тестов, требующих DOM (fake-indexeddb, jsdom),
   соответствующие файлы будут использовать `// @vitest-environment` директиву.
   ========================================================================== */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: false,
    reporters: ['default'],
  },
});
