import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://nexus:nexus@localhost:5432/nexus_marine_test?schema=public',
      JWT_SECRET: 'test-secret',
      STORAGE_DIR: './storage-test',
    },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
