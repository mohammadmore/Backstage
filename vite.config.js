import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// خروجی در پوشه dist ساخته می‌شود و فایل‌های PHP نیز توسط اسکریپت package-backend کنار آن کپی می‌شوند.
export default defineConfig({
  root: 'frontend',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    // در حالت توسعه، درخواست‌های api.php به سرور PHP محلی ارسال می‌شوند
    proxy: { '/api.php': 'http://127.0.0.1:8080' },
  },
});
