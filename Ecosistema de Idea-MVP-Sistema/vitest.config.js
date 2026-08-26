import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['js/test/**/*.test.js'],
    exclude: ['js/test/e2e.spec.js', 'tests/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['js/core/**/*.js'],
      exclude: ['js/core/app-core.js', 'js/core/config-loader.js', 'js/core/discord-notifier.js']
    },
    setupFiles: ['js/test/setup.js'],
    testTimeout: 5000
  }
});