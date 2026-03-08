import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  resolve: {
    alias: {
      '@noble/hashes/_assert': path.resolve(__dirname, 'node_modules/@noble/hashes/_assert.js'),
      '@noble/hashes': path.resolve(__dirname, 'node_modules/@noble/hashes'),
      '@noble/curves': path.resolve(__dirname, 'node_modules/@noble/curves'),
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      include: [
        'buffer',
        'process',
        'global',
        'stream',
        'url',
        'util',
        'events',
        'crypto',
        'vm',
        'http',
        'https',
        'zlib',
      ],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@noble/hashes'],
    exclude: ['ethereum-cryptography'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
