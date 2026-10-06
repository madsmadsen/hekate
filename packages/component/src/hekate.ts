// The entry point of hekate.js. It defines <hekate-generator> one time (FR-45).
import { HekateGenerator } from "./element.ts";

export { HekateGenerator };

if (typeof customElements !== "undefined" && !customElements.get("hekate-generator")) {
  customElements.define("hekate-generator", HekateGenerator);
}
