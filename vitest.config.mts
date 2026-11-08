import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/links-dashboard/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
});
