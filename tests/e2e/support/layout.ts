// Layout checks that run in the page (FR-49, FR-73).
import type { Page } from "@playwright/test";

export interface LayoutReport {
  documentOverflow: boolean;
  parentOverflow: boolean;
  textOverflow: string[];
  outside: string[];
  /** Pairs of controls whose boxes overlap. */
  overlaps: string[];
  columns: number;
}

/** Checks the layout of the first component. It runs in the page. */
export async function layoutReport(page: Page): Promise<LayoutReport> {
  return page
    .locator("hekate-generator")
    .first()
    .evaluate((node) => {
      const host = node as HTMLElement;
      const root = host.shadowRoot as ShadowRoot;
      const base = root.querySelector("[part=base]") as HTMLElement;
      const box = base.getBoundingClientRect();
      const textOverflow: string[] = [];
      const outside: string[] = [];
      const visit = (scope: ShadowRoot | Element): void => {
        for (const element of scope.querySelectorAll("*")) {
          if (element.closest("[part=live-region]")) continue;
          const html = element as HTMLElement;
          const style = getComputedStyle(html);
          const rect = html.getBoundingClientRect();
          if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0) {
            const hasText = Array.from(html.childNodes).some(
              (child) =>
                child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "",
            );
            if (hasText && html.clientWidth > 0 && html.scrollWidth > html.clientWidth + 1) {
              textOverflow.push(
                `${html.tagName.toLowerCase()}: ${(html.textContent ?? "").trim().slice(0, 40)}`,
              );
            }
            if (rect.left < box.left - 1 || rect.right > box.right + 1) {
              outside.push(`${html.tagName.toLowerCase()}[${html.getAttribute("part") ?? ""}]`);
            }
          }
          if (element.shadowRoot) visit(element.shadowRoot);
        }
      };
      visit(root);
      const selectors = [
        "[part=new-password-button]",
        "[part=copy-button]",
        "[part=mode] hekate-wa-radio",
        "[part=language]",
        "[part=words]",
        "[part=separator] hekate-wa-radio",
        "[part=capitalization] hekate-wa-radio",
        "[part=number]",
        "[part=symbol]",
        "[part=ascii-only]",
        "[part=length]",
        "[part=charset]",
        "[part=avoid-similar]",
        "#credits-link",
        "#password",
      ];
      const controls = selectors.flatMap((selector, group) =>
        Array.from(root.querySelectorAll(selector)).map((element, index) => ({
          name: `${selector}#${index}`,
          group,
          rect: element.getBoundingClientRect(),
        })),
      );
      const overlaps: string[] = [];
      controls.forEach((first, i) => {
        for (const second of controls.slice(i + 1)) {
          const width =
            Math.min(first.rect.right, second.rect.right) -
            Math.max(first.rect.left, second.rect.left);
          const height =
            Math.min(first.rect.bottom, second.rect.bottom) -
            Math.max(first.rect.top, second.rect.top);
          if (width > 2 && height > 2) overlaps.push(`${first.name} / ${second.name}`);
        }
      });
      const options = root.querySelector("[part=options]") as HTMLElement;
      const parent = host.parentElement as HTMLElement;
      return {
        documentOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
        parentOverflow: parent.scrollWidth > parent.clientWidth,
        textOverflow,
        outside,
        overlaps,
        columns: getComputedStyle(options).gridTemplateColumns.split(" ").length,
      };
    });
}
