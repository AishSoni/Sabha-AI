import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    // Match Next.js' automatic JSX runtime so test files need no React plugin.
    jsx: "automatic",
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
