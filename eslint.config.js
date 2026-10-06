import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "apps/demo/out/**",
      ".smoke/**",
      "**/node_modules/**",
      "target/**",
      "packages/component/wasm/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "tests/e2e/__screenshots__/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // SR-1: password code never uses Math.random.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use Rust and Web Crypto (SR-1)." },
      ],
    },
  },
  {
    // SR-1, SR-8: the component code uses no storage and no Math.random.
    files: ["packages/component/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["localStorage", "sessionStorage", "indexedDB", "caches"].map((name) => ({
          name,
          message: "Hekate writes no data to the device (SR-8).",
        })),
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use Rust and Web Crypto (SR-1)." },
        { object: "document", property: "cookie", message: "Hekate sets no cookie (SR-8)." },
        {
          object: "navigator",
          property: "serviceWorker",
          message: "Hekate uses no service worker (SR-8).",
        },
        {
          object: "window",
          property: "localStorage",
          message: "Hekate writes no data to the device (SR-8).",
        },
        {
          object: "window",
          property: "sessionStorage",
          message: "Hekate writes no data to the device (SR-8).",
        },
      ],
    },
  },
);
