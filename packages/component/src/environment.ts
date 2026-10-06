// SR-3, FR-85, FR-86: Hekate makes no password when the browser cannot do it safely.
export type EnvironmentProblem = "insecure" | "unsupported" | "noRandom";

/** Returns the first problem, or `null`. It runs before every password. */
export function checkEnvironment(): EnvironmentProblem | null {
  if (typeof window === "undefined" || window.isSecureContext !== true) return "insecure";
  if (
    typeof WebAssembly !== "object" ||
    typeof WebAssembly.instantiate !== "function" ||
    typeof customElements === "undefined" ||
    typeof Intl === "undefined" ||
    !("adoptedStyleSheets" in Document.prototype)
  ) {
    return "unsupported";
  }
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function")
    return "noRandom";
  return null;
}
