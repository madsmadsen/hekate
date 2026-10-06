declare module "virtual:hekate-build" {
  export const VERSION: string;
  export const COMMIT: string;
  /** `sha384-<base64>` of hekate.wasm. Empty only in unit tests. */
  export const WASM_SRI: string;
  /** `sha384-<base64>` of each translation file, by locale. English is inside the script. */
  export const LOCALE_SRI: Record<string, string>;
}

declare module "virtual:hekate-manifests" {
  import type { Manifest } from "./manifest.ts";
  const manifests: Manifest[];
  export default manifests;
}

declare module "virtual:hekate-theme" {
  const css: string;
  export default css;
}
