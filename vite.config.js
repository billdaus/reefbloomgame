import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main:   'index.html',
        mobile: 'mobile/index.html',
      },
    },
  },
  base: './',
});
