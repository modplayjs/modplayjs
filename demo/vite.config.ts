import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Workspace packages ship no dist (source-of-truth is packages/*/src), so
// the demo resolves @modplayjs/* straight to TypeScript sources.
export default defineConfig({
  // AudioWorklet modules load as ES module scripts — emit worker assets
  // as ES modules so audioWorklet.addModule can fetch them.
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      // Enable crossOriginIsolated → SharedArrayBuffer ring transport
      // (out-webaudio uses the SAB ring with hardware-paced backpressure
      // instead of message-chunk copy mode).
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: {
    alias: [
      { find: '@modplayjs/core', replacement: resolve(__dirname, '../packages/core/src/index.ts') },
      { find: '@modplayjs/effects-shared', replacement: resolve(__dirname, '../packages/effects-shared/src/index.ts') },
      { find: '@modplayjs/fmt-mod', replacement: resolve(__dirname, '../packages/fmt-mod/src/index.ts') },
      { find: '@modplayjs/fmt-s3m', replacement: resolve(__dirname, '../packages/fmt-s3m/src/index.ts') },
      { find: '@modplayjs/fmt-xm', replacement: resolve(__dirname, '../packages/fmt-xm/src/index.ts') },
      { find: '@modplayjs/fmt-it', replacement: resolve(__dirname, '../packages/fmt-it/src/index.ts') },
      { find: '@modplayjs/dsp-paula', replacement: resolve(__dirname, '../packages/dsp-paula/src/index.ts') },
      { find: '@modplayjs/dsp-softmixer', replacement: resolve(__dirname, '../packages/dsp-softmixer/src/index.ts') },
      { find: '@modplayjs/out-webaudio', replacement: resolve(__dirname, '../packages/out-webaudio/src/index.ts') },
      { find: '@modplayjs/out-pcm', replacement: resolve(__dirname, '../packages/out-pcm/src/index.ts') },
      { find: 'worklet-url-impl', replacement: resolve(__dirname, 'src/worklet-url-impl.ts') },
    ],
  },
});
