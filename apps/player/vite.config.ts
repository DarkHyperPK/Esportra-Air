import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
  // The shared look (fonts and styles) comes from the Air app.
  server: { port: 5311, strictPort: true, fs: { allow: ['../../..'] } },
});
