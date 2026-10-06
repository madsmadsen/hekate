import { describe, expect, test } from "vitest";
import { PREFIX, makeRenamer, webAwesomeTags } from "../build/wa-rename.ts";

const rename = makeRenamer(webAwesomeTags());

describe("FR-50 Web Awesome names", () => {
  test("FR-50 the prefix is hekate-wa-", () => {
    expect(PREFIX).toBe("hekate-wa-");
  });

  test("FR-50 the tag list comes from the package and has the components that Hekate uses", () => {
    const tags = webAwesomeTags();
    for (const name of [
      "button",
      "callout",
      "checkbox",
      "dialog",
      "icon",
      "option",
      "progress-bar",
      "radio",
      "radio-group",
      "select",
      "slider",
      "switch",
      "badge",
    ]) {
      expect(tags).toContain(`wa-${name}`);
    }
  });

  test("FR-50 element definitions, templates and CSS selectors are renamed", () => {
    expect(rename('customElement("wa-button")')).toBe('customElement("hekate-wa-button")');
    expect(rename("html`<wa-icon name=x></wa-icon>`")).toBe(
      "html`<hekate-wa-icon name=x></hekate-wa-icon>`",
    );
    expect(rename("::slotted(wa-icon) { color: red; }")).toBe(
      "::slotted(hekate-wa-icon) { color: red; }",
    );
    expect(rename('this.closest("wa-radio-group")')).toBe('this.closest("hekate-wa-radio-group")');
    expect(rename('localName === "wa-input"')).toBe('localName === "hekate-wa-input"');
  });

  test("FR-50 the longest name wins", () => {
    expect(rename("<wa-radio-group><wa-radio>")).toBe("<hekate-wa-radio-group><hekate-wa-radio>");
  });

  test("FR-50 CSS custom properties, classes, events and unknown names are not changed", () => {
    for (const text of [
      "var(--wa-color-brand-50)",
      ".wa-button",
      "#wa-button",
      "wa-after-hide",
      "wa-hide",
      "wa-stack",
      "data-wa-button",
      "--wa-button",
    ]) {
      expect(rename(text), text).toBe(text);
    }
  });

  test("FR-50 a name that is renamed is not renamed again", () => {
    expect(rename(rename("<wa-button>"))).toBe("<hekate-wa-button>");
  });
});
