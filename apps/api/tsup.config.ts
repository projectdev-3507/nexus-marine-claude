import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // Ortak paket TypeScript kaynağı olarak tüketildiği için pakete gömülür
  noExternal: ['@nexus/shared'],
});
