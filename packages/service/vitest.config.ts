import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  test: {
    deps: {
      // TODO: fix this for vscode-uri
      interopDefault: true,
    },
    environment: "node",
    include: ["tests/**/*.{test,spec}.{js,ts}"],
  },
  esbuild: {
    target: "node14",
  },
  resolve: {
    alias: {
      "@vsc-ts": r("src/typescript-language-features/src"),
      vscode: r("src/shims"),
    },
  },
});
