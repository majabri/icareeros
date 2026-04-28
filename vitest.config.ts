import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    // Allow __mocks__ manual mocks adjacent to modules
    mockReset: false,
    clearMocks: false,
    restoreMocks: false,
  },
  resolve: {
    alias: {
      // Mirror tsconfig paths so @/* resolves to src/*
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
