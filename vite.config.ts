import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const lightweightBuild = mode === 'code-check' || mode === 'bundle-budget';
  return {
    plugins: [react()],
    build: lightweightBuild ? {
      copyPublicDir: false,
      outDir: mode === 'bundle-budget' ? '.cache/vite-bundle-budget' : '.cache/vite-code-check',
    } : undefined,
  };
});
