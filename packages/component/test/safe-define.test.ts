// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest";
import { customElement } from "../src/safe-define.ts";

describe("FR-45 safe registration of Web Awesome elements", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  test("FR-45 a name that is already defined stays as it is and raises no error", () => {
    class First extends HTMLElement {}
    class Second extends HTMLElement {}
    customElements.define("hekate-wa-test-one", First);
    expect(() => customElement("hekate-wa-test-one")(Second)).not.toThrow();
    expect(customElements.get("hekate-wa-test-one")).toBe(First);
  });

  test("FR-45 a name that is free gets defined", () => {
    class Third extends HTMLElement {}
    customElement("hekate-wa-test-two")(Third);
    expect(customElements.get("hekate-wa-test-two")).toBe(Third);
  });

  test("FR-45 with a standard decorator the definition runs in the class initializer", () => {
    class Fourth extends HTMLElement {}
    const initializers: Array<() => void> = [];
    customElement("hekate-wa-test-three")(Fourth, {
      addInitializer: (fn: () => void) => initializers.push(fn),
    } as unknown as ClassDecoratorContext);
    expect(customElements.get("hekate-wa-test-three")).toBeUndefined();
    initializers.forEach((fn) => fn());
    initializers.forEach((fn) => fn());
    expect(customElements.get("hekate-wa-test-three")).toBe(Fourth);
  });
});
