// Init scripts and routes that change the browser or the network. They are the fault injection
// of the tests (`page.route()` for the network, `addInitScript()` for the browser).
import type { Page, Route } from "@playwright/test";
import { ASSET_ORIGIN, DEMO_ORIGIN } from "./env.ts";

/** Sets `navigator.languages` (and `navigator.language`) before any script runs. */
export async function setBrowserLanguages(page: Page, languages: string[]): Promise<void> {
  await page.addInitScript((list) => {
    Object.defineProperty(navigator, "languages", { get: () => list, configurable: true });
    Object.defineProperty(navigator, "language", { get: () => list[0] ?? "", configurable: true });
  }, languages);
}

/** Removes `navigator.clipboard` (FR-84). */
export async function removeClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });
}

/** Replaces the clipboard with a test double. `window.__clipboard` has the last text written. */
export async function fakeClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const writes: string[] = [];
    window.__clipboard = writes;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          writes.push(text);
        },
        readText: async () => writes.at(-1) ?? "",
      },
    });
  });
}

export async function clipboardWrites(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__clipboard ?? []);
}

/** Removes `crypto.getRandomValues` (SR-3). */
export async function removeRandom(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", { value: undefined, configurable: true });
  });
}

/** Removes a global feature (`WebAssembly`, `customElements`) before any script runs. */
export async function removeGlobal(page: Page, name: "WebAssembly" | "customElements") {
  await page.addInitScript((key) => {
    Object.defineProperty(window, key, { value: undefined, configurable: true, writable: true });
  }, name);
}

/**
 * Makes `crypto.getRandomValues` a seeded generator (xoshiro128**), so that a run always gives the
 * same passwords. Only tests use it (PRD 5: statistical tests use a fixed seed).
 */
export async function seedRandom(page: Page, seed = 20261007): Promise<void> {
  await page.addInitScript((start) => {
    let x = start >>> 0;
    const splitmix = (): number => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    let a = splitmix();
    let b = splitmix();
    let c = splitmix();
    let d = splitmix();
    const next = (): number => {
      const t = b << 9;
      let r = Math.imul(b, 5);
      r = Math.imul((r << 7) | (r >>> 25), 9);
      c ^= a;
      d ^= b;
      b ^= c;
      a ^= d;
      c ^= t;
      d = (d << 11) | (d >>> 21);
      return r >>> 0;
    };
    const getRandomValues = (array: ArrayBufferView): ArrayBufferView => {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i += 4) {
        const word = next();
        for (let k = 0; k < 4 && i + k < bytes.length; k++) bytes[i + k] = (word >>> (8 * k)) & 255;
      }
      return array;
    };
    Object.defineProperty(crypto, "getRandomValues", {
      value: getRandomValues,
      configurable: true,
    });
  }, seed);
}

/** Counts the calls of `crypto.getRandomValues` and `Math.random`. Call it after `seedRandom`. */
export async function countRandom(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counts = { crypto: 0, math: 0 };
    window.__random = counts;
    const original = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (array: ArrayBufferView) => {
        counts.crypto++;
        return original(array as Uint8Array);
      },
    });
    // The test wraps Math.random only to count the calls (SR-1: Hekate must make none).
    // eslint-disable-next-line no-restricted-properties
    const math = Math.random;
    // eslint-disable-next-line no-restricted-properties
    Math.random = () => {
      counts.math++;
      return math();
    };
  });
}

export async function randomCounts(page: Page): Promise<{ crypto: number; math: number }> {
  return page.evaluate(() => window.__random ?? { crypto: 0, math: 0 });
}

/**
 * Wraps the WASM exports `generateWords` and `generateCharacters`.
 * `window.__wasm.calls` has one entry for each call, with its duration in milliseconds.
 * `window.__wasm.fail = true` makes the next calls throw (a fault in the password code).
 */
export async function instrumentWasm(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state: NonNullable<Window["__wasm"]> = { calls: [], fail: false };
    window.__wasm = state;
    const watched: Record<string, true> = { generateWords: true, generateCharacters: true };
    const wrapExports = (exports: WebAssembly.Exports): WebAssembly.Exports => {
      const copy: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(exports)) {
        if (watched[key] && typeof value === "function") {
          copy[key] = (...args: unknown[]) => {
            if (state.fail) throw new Error("test: the password code fails");
            const start = performance.now();
            try {
              return (value as (...a: unknown[]) => unknown)(...args);
            } finally {
              state.calls.push({ name: key, ms: performance.now() - start });
            }
          };
        } else {
          copy[key] = value;
        }
      }
      return copy as WebAssembly.Exports;
    };
    const wrapResult = <T>(result: T): T => {
      if (result instanceof WebAssembly.Instance) {
        return { exports: wrapExports(result.exports) } as unknown as T;
      }
      if (typeof result === "object" && result !== null && "instance" in result) {
        const found = result as T & { instance: WebAssembly.Instance };
        return { ...found, instance: { exports: wrapExports(found.instance.exports) } };
      }
      return result;
    };
    const instantiate = WebAssembly.instantiate.bind(WebAssembly) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    (WebAssembly as unknown as { instantiate: unknown }).instantiate = async (...args: unknown[]) =>
      wrapResult(await instantiate(...args));
    if (typeof WebAssembly.instantiateStreaming === "function") {
      const streaming = WebAssembly.instantiateStreaming.bind(WebAssembly) as (
        ...a: unknown[]
      ) => Promise<unknown>;
      (WebAssembly as unknown as { instantiateStreaming: unknown }).instantiateStreaming = async (
        ...args: unknown[]
      ) => wrapResult(await streaming(...args));
    }
  });
}

export async function wasmCalls(page: Page): Promise<Array<{ name: string; ms: number }>> {
  return page.evaluate(() => window.__wasm?.calls ?? []);
}

/** Records `securitypolicyviolation` events and console messages that tell about a CSP. */
export async function watchCsp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    window.__csp = violations;
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__csp ?? []);
}

/** Records the names that are given to `customElements.define`. */
export async function watchDefinedElements(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const names: string[] = [];
    window.__defined = names;
    const define = customElements.define.bind(customElements);
    customElements.define = (
      name: string,
      ...rest: [CustomElementConstructor, ElementDefinitionOptions?]
    ) => {
      names.push(name);
      define(name, ...rest);
    };
  });
}

export async function definedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__defined ?? []);
}

// --- Network faults --------------------------------------------------------------------------

export const WORDLIST_URL = /\/wordlists\/[^/]+\/words(-ascii)?\.txt$/;

/** The request is answered with an HTTP error. */
export async function failWithStatus(route: Route, status: number): Promise<void> {
  await route.fulfill({
    status,
    contentType: "text/plain",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: `error ${status}`,
  });
}

/** The answer of the real server, with one byte changed. The length stays the same. */
export async function changeOneByte(route: Route, mode: "text" | "binary" = "text"): Promise<void> {
  const response = await route.fetch();
  const body = Buffer.from(await response.body());
  let index = Math.floor(body.length / 2);
  if (mode === "text") {
    // Change a letter into another letter: the file is still text.
    const letter = body.findIndex((byte, i) => i > index && byte >= 0x61 && byte <= 0x7a);
    if (letter >= 0) index = letter;
  }
  body[index] = (body[index] ?? 0) ^ 1;
  await route.fulfill({ response, body });
}

/** A page for a test. It is served by `page.route()` from a string, never from the network. */
export async function servePage(
  page: Page,
  url: string,
  html: string,
  headers: Record<string, string> = {},
): Promise<void> {
  await page.route(url, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      headers: { "cache-control": "no-store", ...headers },
      body: html,
    }),
  );
}

/** The two origins of dev/nginx.conf. */
export const ORIGINS = { demo: DEMO_ORIGIN, assets: ASSET_ORIGIN };
