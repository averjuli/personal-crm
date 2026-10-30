import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Same "@/" alias as in tsconfig.json
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./testing/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Logic tests run against a real database, see testing/database.ts
    globalSetup: ["./testing/vitest-global-setup.ts"],
    setupFiles: ["./testing/vitest-setup.ts"],
    // Test files share one database, so they run one by one
    fileParallelism: false,
  },
});
