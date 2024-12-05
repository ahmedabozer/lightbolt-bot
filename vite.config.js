import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'webapp',
  base: './',
  
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'webapp/index.html')
      }
    }
  },
  
  server: {
    port: 3000,
    open: true,
    cors: true
  },
  
  preview: {
    port: 4173,
    open: true
  }
}); 