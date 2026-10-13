import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Multi-page build: the game plus the standalone 更新日志 page opened from the version bar.
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        updatelog: fileURLToPath(new URL('./updatelog.html', import.meta.url)),
      },
    },
  },
});
