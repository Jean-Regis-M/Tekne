import { defineConfig } from 'vitest/config';

// Unit tests cover pure modules only; they must not start the IWSDK dev runtime.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
