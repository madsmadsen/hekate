import { defineConfig } from "vite";
import { hekateAssets } from "./build/hekate-assets.ts";
import { waRename } from "./build/wa-rename.ts";

export default defineConfig({
  plugins: [hekateAssets({ root: import.meta.dirname, strict: true }), waRename()],
  build: {
    target: "es2022",
    lib: {
      entry: "src/hekate.ts",
      formats: ["es"],
      fileName: () => "hekate.js",
    },
    // One file, no chunks (SR-13). The SRI value of hekate.js covers all JavaScript.
    rollupOptions: { output: { inlineDynamicImports: true } },
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    sourcemap: false,
    emptyOutDir: true,
  },
});
