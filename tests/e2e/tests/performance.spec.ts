// NFR-1: speed of one call to generate. Only Chromium can slow the CPU down (Chrome DevTools Protocol).
import { expect, test } from "@playwright/test";
import { instrumentWasm, wasmCalls } from "../support/browser.ts";
import { openPlayground, part } from "../support/component.ts";
import { percentile } from "../support/maths.ts";

test.describe("NFR-1 speed", () => {
  for (const mode of ["words", "characters"] as const) {
    test(`NFR-1 1,000 calls to generate in ${mode} mode with the CPU 4 times slower: the 95th percentile is 5 ms or less`, async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(
        browserName !== "chromium",
        "CPU throttling uses the Chrome DevTools Protocol (Emulation.setCPUThrottlingRate). Only Chromium has it.",
      );
      test.setTimeout(180_000);
      await instrumentWasm(page);
      await openPlayground(page, mode === "words" ? { language: "en-US" } : { mode: "characters" });
      const session = await context.newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      try {
        const start = (await wasmCalls(page)).length;
        // Each click calls generate one time. The loop runs in the page.
        await part(page, "new-password-button").evaluate(async (button) => {
          const element = button.getRootNode() as ShadowRoot;
          const host = element.host as HTMLElement & { updateComplete: Promise<boolean> };
          for (let i = 0; i < 1000; i++) {
            (button as HTMLElement).click();
            if (i % 50 === 49) await host.updateComplete;
          }
          await host.updateComplete;
        });
        const calls = (await wasmCalls(page)).slice(start);
        expect(calls).toHaveLength(1000);
        const name = mode === "words" ? "generateWords" : "generateCharacters";
        expect(calls.every((call) => call.name === name)).toBe(true);
        const times = calls.map((call) => call.ms);
        const p95 = percentile(times, 95);
        test.info().annotations.push({
          type: "p95",
          description: `${mode}: p95 ${p95.toFixed(2)} ms, max ${Math.max(...times).toFixed(2)} ms`,
        });
        expect(p95, `p95 of 1,000 calls in ${mode} mode`).toBeLessThanOrEqual(5);
      } finally {
        await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      }
    });
  }
});
