import { defineConfig } from "vitest/config";
import { hekateAssets } from "./build/hekate-assets.ts";

export default defineConfig({
  plugins: [
    hekateAssets({
      root: import.meta.dirname,
      strict: false,
      wordlists: `${import.meta.dirname}/test/fixtures/wordlists`,
      pseudo: true,
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^@awesome\.me\/webawesome\/dist\/components\/.*$/,
        replacement: `${import.meta.dirname}/test/stubs/web-awesome.ts`,
      },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
