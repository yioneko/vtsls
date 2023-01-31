import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    deps: {
      // TODO: fix this for vscode-uri
      interopDefault: true,
    },
    environment: "node",
    include: ["tests/**/*.{test,spec}.{js,ts}"],
  },
});
