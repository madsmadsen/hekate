// Records all requests of a page (SR-4, SR-7, FR-44).
import type { Page } from "@playwright/test";
import { ASSET_ORIGIN, DEMO_ORIGIN, version } from "./env.ts";

export interface RecordedRequest {
  url: string;
  method: string;
  resourceType: string;
  postData: string | null;
}

/** The list grows while the page runs. Use `list.length` as a bookmark. */
export function recordRequests(page: Page): RecordedRequest[] {
  const list: RecordedRequest[] = [];
  page.on("request", (request) => {
    list.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      postData: request.postData(),
    });
  });
  return list;
}

/** Console messages of a page, by type. */
export function recordConsole(page: Page): Array<{ type: string; text: string }> {
  const list: Array<{ type: string; text: string }> = [];
  page.on("console", (message) => list.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => list.push({ type: "pageerror", text: error.message }));
  return list;
}

/** `true` for the files that the demo page and the component are allowed to load (SR-4). */
export function isAllowedRequest(url: string): boolean {
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  if (url.startsWith(`${DEMO_ORIGIN}/`)) return true;
  const base = `${ASSET_ORIGIN}/${version}/`;
  if (!url.startsWith(base)) return false;
  const path = url.slice(base.length);
  return (
    path === "hekate.js" ||
    path === "hekate.wasm" ||
    /^wordlists\/[^/]+\/words(-ascii)?\.txt$/.test(path) ||
    /^locales\/[^/]+\.json$/.test(path)
  );
}

export function wordlistRequests(list: RecordedRequest[]): string[] {
  return list
    .map((request) => request.url)
    .filter((url) => /\/wordlists\/[^/]+\/words(-ascii)?\.txt$/.test(url));
}
