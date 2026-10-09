// Stable options: FR-48. Touch targets: NFR-3.
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  chooseCapitalization,
  chooseSeparator,
  chooseWords,
  openPlayground,
  part,
  waitForPassword,
} from "../support/component.ts";

const SEGMENT_RADIOS = [
  "[part=separator] hekate-wa-radio",
  "[part=capitalization] hekate-wa-radio",
];
const WORD_SELECTORS = ["[part=number]", "[part=symbol]", "[part=ascii-only]", "[part=no-repeat]"];
const CHARACTER_SELECTORS = ["[part=charset]", "[part=avoid-similar]", "[part=no-repeat]"];

function host(page: Page): Locator {
  return page.locator("hekate-generator").first();
}

async function settle(page: Page): Promise<void> {
  await waitForPassword(page);
  await expect(part(page, "password")).not.toHaveAttribute("aria-busy", "true");
  await page.waitForTimeout(100);
}

async function measure(page: Page): Promise<{ strengthHeight: number; gapBelowPassword: number }> {
  return host(page).evaluate((node) => {
    const root = (node as HTMLElement).shadowRoot as ShadowRoot;
    const rect = (selector: string) =>
      (root.querySelector(selector) as HTMLElement).getBoundingClientRect();
    return {
      strengthHeight: rect("[part=strength]").height,
      gapBelowPassword: rect("[part=options]").top - rect("[part=password]").bottom,
    };
  });
}

/** Every element that a selector finds, as a locator for each one. */
async function each(page: Page, selector: string): Promise<Locator[]> {
  const all = host(page).locator(selector);
  const count = await all.count();
  return Array.from({ length: count }, (_, index) => all.nth(index));
}

type Action = () => Promise<void>;

async function checkStable(page: Page, actions: Action[], label: string): Promise<void> {
  expect(actions.length, `${label}: controls found`).toBeGreaterThan(0);
  const warnings = host(page).locator(
    "#words-warning, #length-warning, #ascii-note, [part=warning]",
  );
  for (const [index, action] of actions.entries()) {
    await settle(page);
    const before = await measure(page);
    await action();
    await settle(page);
    const after = await measure(page);
    const name = `${label} control ${index}`;
    expect(
      Math.abs(after.strengthHeight - before.strengthHeight),
      `${name}: strength`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.gapBelowPassword - before.gapBelowPassword),
      `${name}: gap`,
    ).toBeLessThanOrEqual(1);
    await expect(warnings).toHaveCount(0);
  }
}

/** A click on every switch and check box, and a few values of the three word controls. */
async function wordControls(page: Page): Promise<Action[]> {
  const actions: Action[] = [];
  for (const selector of WORD_SELECTORS) {
    for (const control of await each(page, selector)) actions.push(() => control.click());
  }
  for (const count of [3, 4, 6, 10, 5]) actions.push(() => chooseWords(page, count));
  for (const value of ["-", ".", "_", "space", "none"]) {
    actions.push(() => chooseSeparator(page, value));
  }
  for (const value of ["lower", "random", "title"]) {
    actions.push(() => chooseCapitalization(page, value));
  }
  return actions;
}

async function characterControls(page: Page): Promise<Action[]> {
  const actions: Action[] = [];
  for (const selector of CHARACTER_SELECTORS) {
    for (const control of await each(page, selector)) actions.push(() => control.click());
  }
  return actions;
}

test.describe("FR-48 stable options", () => {
  for (const width of [320, 480, 800]) {
    test(`FR-48 a changed option does not add or remove anything above the options (parent of ${width} px)`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      // The window is wide, so only the width of the parent can change the layout.
      await page.setViewportSize({ width: 1280, height: 900 });
      await openPlayground(page, { width: String(width) });
      await checkStable(page, await wordControls(page), "word mode");
      await openPlayground(page, { width: String(width), mode: "characters" });
      await checkStable(page, await characterControls(page), "character mode");
    });
  }
});

/** The boxes of the elements that a selector finds in the shadow root. */
async function boxes(
  page: Page,
  selector: string,
): Promise<Array<{ top: number; width: number; height: number }>> {
  return host(page).evaluate((node, selector) => {
    const root = (node as HTMLElement).shadowRoot as ShadowRoot;
    return Array.from(root.querySelectorAll(selector)).map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, width: rect.width, height: rect.height };
    });
  }, selector);
}

test.describe("NFR-3 touch targets", () => {
  test("NFR-3 each option control is at least 44 px high", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const targets = ["[part=new-password-button]", "[part=copy-button]", "#strength-info"];
    for (const [mode, selectors] of [
      ["words", [...WORD_SELECTORS, "[part=mode] hekate-wa-radio", ...SEGMENT_RADIOS]],
      ["characters", CHARACTER_SELECTORS],
    ] as const) {
      await openPlayground(page, { width: "480", mode });
      const found = await boxes(page, [...selectors, ...targets].join(", "));
      expect(found.length, `${mode}: controls found`).toBeGreaterThan(targets.length);
      for (const [index, { height }] of found.entries()) {
        expect(Math.round(height), `${mode} control ${index}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  for (const width of [320, 480, 800]) {
    test(`NFR-3 every separator and capital letters radio is 44 x 44 px and the slider thumb is 44 x 44 px (parent of ${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openPlayground(page, { width: String(width) });
      const radios = await boxes(page, SEGMENT_RADIOS.join(", "));
      expect(radios).toHaveLength(8);
      for (const [index, box] of radios.entries()) {
        expect(Math.round(box.width), `radio ${index} width`).toBeGreaterThanOrEqual(44);
        expect(Math.round(box.height), `radio ${index} height`).toBeGreaterThanOrEqual(44);
      }
      const thumb = await part(page, "words").evaluate((element) => {
        const rect = (
          element.shadowRoot?.querySelector("[part~=thumb]") as HTMLElement
        ).getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      expect(Math.round(thumb.width), "thumb width").toBeGreaterThanOrEqual(44);
      expect(Math.round(thumb.height), "thumb height").toBeGreaterThanOrEqual(44);
    });
  }
});

test.describe("FR-3 words, separator and capital letters on a narrow parent", () => {
  for (const width of [320, 480, 800]) {
    test(`FR-3 separator, capital letters and number of words each show on one line (parent of ${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openPlayground(page, { width: String(width) });
      for (const name of ["separator", "capitalization"]) {
        const radios = await boxes(page, `[part=${name}] hekate-wa-radio`);
        expect(radios.length, `${name}: radios`).toBeGreaterThanOrEqual(3);
        const tops = radios.map((box) => box.top);
        expect(Math.max(...tops) - Math.min(...tops), `${name}: one row`).toBeLessThanOrEqual(2);
      }
      const track = await part(page, "words").evaluate(
        (element) =>
          (
            element.shadowRoot?.querySelector("[part~=slider]") as HTMLElement
          ).getBoundingClientRect().height,
      );
      expect(track, "track area height").toBeLessThan(70);
    });
  }

  test("FR-3 a changed caption does not move the next setting", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const width of [320, 480, 800]) {
      await openPlayground(page, { width: String(width) });
      const tops = () =>
        host(page).evaluate((node) => {
          const root = (node as HTMLElement).shadowRoot as ShadowRoot;
          const top = (selector: string) =>
            (root.querySelector(selector) as HTMLElement).getBoundingClientRect().top;
          // Relative to the options, so that a wrapped password does not count.
          const base = top("[part=options]");
          return {
            capitalization: top("[part=capitalization]") - base,
            switches: top("[part=number]") - base,
          };
        });
      const start = await tops();
      for (const value of ["none", "-", ".", "_", "space"]) {
        await chooseSeparator(page, value);
        await settle(page);
        const now = await tops();
        expect(
          Math.abs(now.capitalization - start.capitalization),
          `separator ${value} (${width} px)`,
        ).toBeLessThanOrEqual(1);
      }
      for (const value of ["lower", "title", "random"]) {
        await chooseCapitalization(page, value);
        await settle(page);
        const now = await tops();
        expect(
          Math.abs(now.switches - start.switches),
          `capitalization ${value} (${width} px)`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
