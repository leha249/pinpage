/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages отдаёт сайт из /<repo-name>/ — воркфлоу подставляет
// реальное имя репозитория в переменную BASE_PATH при сборке.
// Локально (`npm run dev`) просто используется "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
  test: {
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
