import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const codeCheck = mode === 'code-check';
  return {
    plugins: [react()],
    build: codeCheck ? {
      copyPublicDir: false,
      outDir: '.cache/vite-code-check',
    } : undefined,
  };
});
