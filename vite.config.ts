import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

interface PackageMetadata {
  version: string;
}

const packageMetadata = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as PackageMetadata;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageMetadata.version),
    __BUILD_COMMIT__: JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local').slice(0, 7),
    ),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
