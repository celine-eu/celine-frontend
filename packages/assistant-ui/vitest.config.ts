import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DOMPurify needs a DOM; jsdom is the one its own test suite runs on.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
