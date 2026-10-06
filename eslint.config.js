import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "target/**", "packages/component/wasm/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // SR-1: password code never uses Math.random.
      "no-restricted-properties": ["error", { object: "Math", property: "random", message: "Use Rust and Web Crypto (SR-1)." }],
    },
  },
);
