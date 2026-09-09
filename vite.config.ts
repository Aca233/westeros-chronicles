import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const MAP_RUNTIME_PACKAGES = [
  '/maplibre-gl/',
  '/@mapbox/',
  '/csscolorparser/',
  '/earcut/',
  '/geojson-vt/',
  '/gl-matrix/',
  '/grid-index/',
  '/kdbush/',
  '/murmurhash-js/',
  '/pbf/',
  '/potpack/',
  '/quickselect/',
  '/supercluster/',
  '/tinyqueue/',
  '/vt-pbf/',
];

function manualChunks(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, '/');

  // These runtimes are large and only needed after the player opens the map.
  if (normalizedId.includes('/node_modules/three/')) return 'vendor-three';
  if (
    normalizedId.includes('/node_modules/')
    && MAP_RUNTIME_PACKAGES.some((packagePath) => normalizedId.includes(packagePath))
  ) return 'vendor-map';

  // Keep common application libraries stable across feature releases.
  if (
    normalizedId.includes('/node_modules/react/')
    || normalizedId.includes('/node_modules/react-dom/')
    || normalizedId.includes('/node_modules/scheduler/')
  ) return 'vendor-react';
  if (
    normalizedId.includes('/node_modules/dexie/')
    || normalizedId.includes('/node_modules/zod/')
    || normalizedId.includes('/node_modules/zustand/')
  ) return 'vendor-state';
  if (
    normalizedId.includes('/node_modules/lucide-react/')
    || normalizedId.includes('/node_modules/react-body-highlighter/')
  ) return 'vendor-ui';

  return undefined;
}

export default defineConfig(({ mode }) => {
  const lightweightBuild = mode === 'code-check' || mode === 'bundle-budget';
  return {
    plugins: [react()],
    build: {
      ...(lightweightBuild ? {
        copyPublicDir: false,
        outDir: mode === 'bundle-budget' ? '.cache/vite-bundle-budget' : '.cache/vite-code-check',
      } : {}),
      // MapLibre is shipped as a single minified runtime. Keep a useful ceiling
      // above that known chunk so new application regressions still stand out.
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: { manualChunks },
      },
    },
  };
});
