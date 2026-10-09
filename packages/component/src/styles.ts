// SR-6: styles are Lit `static styles`. Lit puts them in constructed stylesheets
// (`adoptedStyleSheets`). The component has no <style> element and no style attribute.
// FR-73: the rules use logical properties (inline-size, margin-inline, padding-block, ...).
import { css, unsafeCSS, type CSSResultGroup } from "lit";
import themeCss from "virtual:hekate-theme";
import { DARK, LIGHT, TOKEN_FONT_WEIGHT, WORD_FONT_WEIGHT } from "./theme-colors.ts";

function palette(colors: typeof LIGHT) {
  return unsafeCSS(`
    --_surface: ${colors.surface};
    --_text: ${colors.text};
    --_separator: ${colors.separator};
    --_number: ${colors.number};
    --_symbol: ${colors.symbol};
    --_digit: ${colors.digit};
  `);
}

const component = css`
  :host {
    /* Values that the page sets on a parent element must not reach the component (FR-41). */
    all: initial;
    display: block;
    line-height: 1.4;
  }

  :host([hidden]) {
    display: none;
  }

  .light {
    ${palette(LIGHT)}
    --_brand-default: var(--wa-color-indigo-40, #4945cb);
  }

  .dark {
    ${palette(DARK)}
    --_brand-default: var(--wa-color-indigo-50, #6163f2);
  }

  .root {
    position: relative;
    container-type: inline-size;
    container-name: hekate;
    box-sizing: border-box;
    display: grid;
    gap: var(--hekate-gap, 1rem);
    font-family: var(--hekate-font-family, var(--wa-font-family-body));
    color: var(--hekate-color-text, var(--_text));
    background-color: var(--hekate-color-surface, var(--_surface));
    --_brand: var(--hekate-color-brand, var(--_brand-default));
    --_on-brand: var(--hekate-color-on-brand, #ffffff);
    --_wash: color-mix(in srgb, var(--_brand) 8%, var(--hekate-color-surface, var(--_surface)));
    --_surface-ui: var(--hekate-color-surface, var(--_surface));
    --wa-color-brand-fill-loud: var(--_brand);
    --wa-color-brand-on-loud: var(--_on-brand);
    --wa-color-brand-fill-quiet: var(--_wash);
    --wa-form-control-activated-color: var(--_brand);
    --strength-weak: var(--hekate-color-strength-weak, var(--wa-color-danger-fill-loud));
    --strength-fair: var(--hekate-color-strength-fair, var(--wa-color-warning-fill-loud));
    --strength-strong: var(--hekate-color-strength-strong, var(--wa-color-success-fill-loud));
    --strength-very-strong: var(--hekate-color-strength-very-strong, var(--_brand));
  }

  .root *,
  .root *::before,
  .root *::after {
    box-sizing: border-box;
  }

  /* The "base" part holds the whole UI, but not the footer: a page cannot hide the Credits link (FR-30). */
  .base {
    display: grid;
    gap: var(--hekate-gap, 1rem);
    min-inline-size: 0;
    padding: var(--hekate-gap, 1rem) var(--hekate-gap, 1rem) 0;
  }

  .main {
    display: grid;
    gap: var(--hekate-gap, 1rem);
    min-inline-size: 0;
  }

  /* The live region. It is as wide as the component, so its text never overflows its box. */
  .visually-hidden {
    position: absolute;
    inset-inline-start: 0;
    inline-size: 100%;
    block-size: 1px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: normal;
    border: 0;
  }

  /* The password */
  .password-block {
    display: grid;
    gap: 0.25rem;
    min-inline-size: 0;
  }

  .field-label {
    font-size: var(--wa-font-size-s, 0.875rem);
    color: var(--hekate-color-text-quiet, var(--wa-color-text-quiet));
  }

  .password {
    min-inline-size: 0;
    min-block-size: 3.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--hekate-color-border, var(--wa-color-surface-border));
    border-inline-start: 4px solid var(--_brand);
    border-radius: var(--hekate-radius, 1rem);
    box-shadow: 0 3px 0 color-mix(in srgb, var(--_brand) 16%, transparent);
    font-family: var(
      --hekate-password-font-family,
      ui-monospace,
      "SF Mono",
      Menlo,
      Consolas,
      monospace
    );
    font-size: var(--hekate-password-font-size, 1.25rem);
    font-weight: ${unsafeCSS(WORD_FONT_WEIGHT)};
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    user-select: all;
    -webkit-user-select: all;
    cursor: text;
  }

  .password:focus-visible {
    outline: var(--wa-focus-ring, 3px solid var(--wa-color-focus));
    outline-offset: var(--wa-focus-ring-offset, 2px);
  }

  .password[aria-busy="true"] {
    opacity: 0.6;
  }

  .token-separator,
  .token-number,
  .token-symbol,
  .token-digit {
    font-weight: ${unsafeCSS(TOKEN_FONT_WEIGHT)};
  }

  .token-separator {
    color: var(--hekate-color-separator, var(--_separator));
  }

  .token-number {
    color: var(--hekate-color-number, var(--_number));
  }

  .token-symbol {
    color: var(--hekate-color-symbol, var(--_symbol));
  }

  .token-digit {
    color: var(--hekate-color-digit, var(--_digit));
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: center;
    gap: 0.5rem;
  }

  .actions hekate-wa-button::part(base) {
    min-block-size: 3rem;
    padding-inline: 0.75rem;
    border-radius: var(--hekate-radius, 0.875rem);
    font-size: var(--wa-font-size-s, 0.875rem);
    font-weight: 700;
    white-space: normal;
    overflow-wrap: anywhere;
    transition:
      transform 120ms ease-out,
      box-shadow 120ms ease-out;
  }

  .actions hekate-wa-icon {
    transition: transform 160ms ease-out;
  }

  @media (hover: hover) {
    .actions hekate-wa-button:not([disabled]):hover::part(base) {
      transform: translateY(-1px);
      box-shadow: 0 3px 0 color-mix(in srgb, var(--_brand) 30%, transparent);
    }

    .actions hekate-wa-button:not([disabled]):hover hekate-wa-icon[name="refresh"] {
      transform: rotate(90deg);
    }
  }

  .actions hekate-wa-button:not([disabled]):active::part(base) {
    transform: translateY(1px);
    box-shadow: none;
  }

  .copy-status {
    grid-column: 1 / -1;
    display: inline-block;
    min-block-size: 1.4em;
    min-inline-size: 0;
    font-size: var(--wa-font-size-s, 0.875rem);
    overflow-wrap: anywhere;
  }

  /* The strength estimate */
  .strength {
    display: grid;
    gap: 0.5rem;
    min-inline-size: 0;
  }

  .strength[aria-busy="true"] {
    opacity: 0.6;
  }

  .strength-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 0.5rem;
  }

  .strength-title {
    font-size: var(--wa-font-size-s, 0.875rem);
    font-weight: 700;
  }

  .strength-head hekate-wa-badge::part(base) {
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: var(--wa-font-size-s, 0.875rem);
    font-weight: 700;
  }

  /* Four steps on the bar. The cuts are decoration. The label and the bar length say the strength. */
  .strength-track {
    position: relative;
    border-radius: 999px;
    overflow: hidden;
  }

  .strength-track::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      to right,
      transparent calc(25% - 1.5px),
      var(--_surface-ui) calc(25% - 1.5px) calc(25% + 1.5px),
      transparent calc(25% + 1.5px) calc(50% - 1.5px),
      var(--_surface-ui) calc(50% - 1.5px) calc(50% + 1.5px),
      transparent calc(50% + 1.5px) calc(75% - 1.5px),
      var(--_surface-ui) calc(75% - 1.5px) calc(75% + 1.5px),
      transparent calc(75% + 1.5px)
    );
  }

  .strength hekate-wa-progress-bar {
    --track-height: 0.75rem;
    --track-color: var(--_wash);
  }

  .entropy-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-inline-size: 0;
    min-block-size: 2.75rem;
  }

  .entropy-row .facts {
    min-inline-size: 0;
    font-variant-numeric: tabular-nums;
  }

  .strength-popup {
    flex: 0 0 2.75rem;
  }

  .info-button {
    display: inline-grid;
    place-items: center;
    inline-size: 2.75rem;
    block-size: 2.75rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: inherit;
    font: inherit;
    cursor: help;
    transition: background-color 120ms ease-out;
  }

  .info-button hekate-wa-icon {
    font-size: 1.25rem;
  }

  .info-button:hover,
  .info-button[aria-expanded="true"] {
    background-color: var(--_wash);
  }

  .info-button[aria-expanded="true"] {
    box-shadow: inset 0 0 0 2px var(--_brand);
  }

  .info-button:focus-visible {
    outline: var(--wa-focus-ring, 3px solid var(--wa-color-focus));
    outline-offset: 2px;
  }

  .strength-details {
    box-sizing: border-box;
    display: grid;
    gap: 0.75rem;
    inline-size: min(24rem, calc(100cqi - 2rem), calc(100dvw - 1rem));
    max-block-size: min(calc(100dvh - 1rem), var(--auto-size-available-height, 100dvh));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.75rem;
    border: 1px solid var(--hekate-color-border, var(--wa-color-surface-border));
    border-radius: var(--hekate-radius, 1rem);
    background-color: var(--hekate-color-surface, var(--_surface));
    color: var(--hekate-color-text, var(--_text));
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
  }

  .strength-details[hidden] {
    display: none;
  }

  .strength-details-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
  }

  .strength-details-title {
    margin: 0;
    font-size: var(--wa-font-size-m, 1rem);
    overflow-wrap: anywhere;
  }

  .strength-details-title:focus {
    outline: none;
  }

  .strength-weak hekate-wa-progress-bar {
    --indicator-color: var(--strength-weak);
  }

  .strength-fair hekate-wa-progress-bar {
    --indicator-color: var(--strength-fair);
  }

  .strength-strong hekate-wa-progress-bar {
    --indicator-color: var(--strength-strong);
  }

  .strength-very-strong hekate-wa-progress-bar {
    --indicator-color: var(--strength-very-strong);
  }

  .note,
  .facts {
    margin: 0;
    font-size: var(--wa-font-size-s, 0.875rem);
    overflow-wrap: anywhere;
  }

  .note {
    color: var(--hekate-color-text-quiet, var(--wa-color-text-quiet));
  }

  /* The options */
  .options {
    display: grid;
    gap: var(--hekate-gap, 1rem);
    grid-template-columns: minmax(0, 1fr);
    min-inline-size: 0;
  }

  .option-group {
    display: grid;
    gap: 0.5rem;
    min-inline-size: 0;
  }

  .switches,
  .checks {
    display: grid;
    gap: 0.5rem;
  }

  .slider-value {
    justify-self: end;
    font-size: var(--wa-font-size-s, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  hekate-wa-select,
  hekate-wa-slider,
  hekate-wa-radio-group,
  hekate-wa-progress-bar,
  hekate-wa-callout {
    inline-size: 100%;
    min-inline-size: 0;
  }

  /* The mode switch: a segmented control. */
  hekate-wa-radio-group[part="mode"]::part(form-control-input) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--_wash);
    border-radius: var(--hekate-radius, 1rem);
  }

  hekate-wa-radio-group[part="mode"] hekate-wa-radio {
    min-inline-size: 0;
    justify-content: center;
    font-weight: 700;
  }

  hekate-wa-radio-group[part="mode"] hekate-wa-radio::part(label) {
    justify-content: center;
    border-radius: var(--hekate-radius, 0.75rem);
    transition:
      background-color 120ms ease-out,
      color 120ms ease-out;
  }

  hekate-wa-select::part(combobox) {
    min-block-size: 2.75rem;
    border-radius: var(--hekate-radius, 0.875rem);
  }

  hekate-wa-option {
    min-block-size: 2.75rem;
  }

  hekate-wa-radio-group[part="mode"] hekate-wa-radio[aria-checked="true"] {
    background: var(--_brand);
    color: var(--_on-brand);
    border-color: var(--_brand);
    box-shadow: inset 0 -2px 0 currentColor;
  }

  /* Separator and capital letters: one row of buttons that show the effect. */
  .word-segments {
    --wa-form-control-height: 44px;
  }

  .word-segments::part(form-control-input) {
    display: grid;
    gap: 4px;
    padding: 0;
  }

  .separator-segments::part(form-control-input) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .capitalization-segments::part(form-control-input) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .word-segments hekate-wa-radio {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 44px;
    min-block-size: 44px;
    margin: 0;
    padding: 4px;
    justify-content: center;
    border: 1px solid var(--hekate-color-border, var(--wa-color-surface-border));
    border-radius: var(--hekate-radius, 0.5rem);
    background: var(--_surface-ui);
    color: inherit;
  }

  .word-segments hekate-wa-radio::part(label) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 0;
  }

  .option-example {
    font:
      400 0.875rem/1.4 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
    white-space: pre;
  }

  .word-segments hekate-wa-radio[aria-checked="true"] {
    background: var(--_brand);
    color: var(--_on-brand);
    border-color: var(--_brand);
    box-shadow: inset 0 -2px 0 currentColor;
  }

  .word-segments hekate-wa-radio:focus-visible {
    outline: var(--wa-focus-ring, 3px solid var(--wa-color-focus));
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .word-segments hekate-wa-radio[aria-checked="false"]:not([aria-disabled="true"]):hover {
      background: var(--_wash);
    }
  }

  /* All names share one grid cell. The longest name sets the height, so the caption never moves the next setting. */
  .option-caption {
    display: grid;
    margin: 0;
    min-inline-size: 0;
    font-size: var(--wa-font-size-s, 0.875rem);
    line-height: 1.4;
  }

  .caption-choice {
    grid-area: 1 / 1;
    overflow-wrap: anywhere;
    visibility: hidden;
  }

  .caption-choice[data-selected="true"] {
    visibility: visible;
  }

  /* The words slider: a 44 px thumb and numbered positions. */
  hekate-wa-slider[part="words"] {
    --thumb-width: 44px;
    --thumb-height: 44px;
    --track-size: 8px;
  }

  hekate-wa-slider[part="words"]::part(slider) {
    box-sizing: border-box;
    padding: 18px 22px 0;
    min-block-size: 66px;
  }

  hekate-wa-slider[part="words"]::part(references) {
    margin-block-start: 22px;
    min-block-size: 18px;
  }

  .word-reference {
    inline-size: 0;
    display: flex;
    justify-content: center;
    font-size: 0.75rem;
    line-height: 14px;
    font-variant-numeric: tabular-nums;
  }

  @media (forced-colors: active) {
    .word-segments hekate-wa-radio[aria-checked="true"] {
      border: 3px solid Highlight;
      padding: 2px;
      background: Canvas;
      color: CanvasText;
    }
  }

  hekate-wa-callout::part(message) {
    overflow-wrap: anywhere;
  }

  .callout-actions {
    margin-block-start: 0.5rem;
  }

  /* Touch targets of 44 px (NFR-3) */
  hekate-wa-button::part(base) {
    min-block-size: 2.75rem;
  }

  hekate-wa-switch::part(base),
  hekate-wa-checkbox::part(base) {
    min-block-size: 2.75rem;
    align-items: center;
  }

  hekate-wa-radio[appearance="button"] {
    min-block-size: 2.75rem;
    min-inline-size: 2.75rem;
  }

  .group-label {
    font-size: var(--wa-form-control-label-font-size, var(--wa-font-size-m, 1rem));
    font-weight: var(--wa-form-control-label-font-weight, 600);
    color: var(--wa-form-control-label-color, inherit);
  }

  .group-hint {
    font-size: var(--wa-form-control-hint-font-size, var(--wa-font-size-s, 0.875rem));
    color: var(--hekate-color-text-quiet, var(--wa-color-text-quiet));
  }

  .credits-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-block-end: 0.75rem;
  }

  .credits-title {
    margin: 0;
    font-size: var(--wa-font-size-l, 1.125rem);
    overflow-wrap: anywhere;
  }

  /* The Credits link. It is not a part, so a page cannot style it away (FR-30). */
  .footer {
    display: flex !important;
    justify-content: flex-end;
    padding: 0 var(--hekate-gap, 1rem) var(--hekate-gap, 1rem);
  }

  .credits-link {
    display: inline-block !important;
    visibility: visible !important;
    opacity: 1 !important;
    padding: 0.25rem 0.5rem;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--wa-font-size-s, 0.875rem);
    color: var(--wa-color-text-link);
    text-decoration: underline;
    cursor: pointer;
  }

  .credits-link:focus-visible {
    outline: var(--wa-focus-ring, 3px solid var(--wa-color-focus));
    outline-offset: 2px;
  }

  /* The Credits dialog */
  .credits {
    display: grid;
    gap: 1rem;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .credits h3,
  .credits h4,
  .credits p,
  .credits ul {
    margin: 0;
  }

  .credits h3 {
    font-size: var(--wa-font-size-l, 1.125rem);
  }

  .credits h4 {
    font-size: var(--wa-font-size-m, 1rem);
  }

  .credits ul {
    padding-inline-start: 1.25rem;
    display: grid;
    gap: 0.75rem;
  }

  .credits a {
    color: var(--wa-color-text-link);
  }

  .credits details {
    border: 1px solid var(--wa-color-surface-border);
    border-radius: var(--wa-border-radius-m);
    padding: 0.5rem 0.75rem;
  }

  .credits summary {
    cursor: pointer;
    font-weight: 600;
  }

  .credits .hash {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: var(--wa-font-size-xs, 0.75rem);
  }

  /* Wider parents: a container query reads the width of the parent, not of the screen (FR-49). */
  @container hekate (min-width: 30rem) {
    .options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .options > .wide {
      grid-column: 1 / -1;
    }
  }

  @container hekate (min-width: 40rem) {
    .password {
      font-size: var(--hekate-password-font-size, 1.5rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }

    .actions hekate-wa-button:not([disabled]):hover::part(base),
    .actions hekate-wa-button:not([disabled]):active::part(base),
    .actions hekate-wa-button:not([disabled]):hover hekate-wa-icon[name="refresh"] {
      transform: none;
    }

    .root {
      --wa-transition-fast: 0ms;
      --wa-transition-normal: 0ms;
      --wa-transition-slow: 0ms;
    }
  }
`;

export const styles: CSSResultGroup = [unsafeCSS(themeCss), component];
