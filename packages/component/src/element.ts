import {
  LitElement,
  html,
  nothing,
  type ComplexAttributeConverter,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { COMMIT, LOCALE_SRI, VERSION } from "virtual:hekate-build";
import MANIFESTS from "virtual:hekate-manifests";
import "@awesome.me/webawesome/dist/components/badge/badge.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js";
import "@awesome.me/webawesome/dist/components/radio/radio.js";
import "@awesome.me/webawesome/dist/components/radio-group/radio-group.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/slider/slider.js";
import "@awesome.me/webawesome/dist/components/switch/switch.js";
import en from "../locales/en.json";
import {
  AssetError,
  TranslationIntegrityError,
  assetsFolder,
  loadLocale,
  fetchWordlist,
  wordlistUrl,
} from "./assets.ts";
import {
  CAPITALIZATIONS,
  CHARSETS,
  DEFAULTS,
  LENGTH_MAX,
  LENGTH_MIN,
  MODES,
  SEPARATORS,
  THEMES,
  WORDS_MAX,
  WORDS_MIN,
  intRange,
  languageParser,
  oneOf,
  parseAssetsUrl,
  parseBoolean,
  parseCharsets,
  readAttribute,
  type Capitalization,
  type Charset,
  type Mode,
  type Parser,
  type Separator,
  type Theme,
} from "./attributes.ts";
import { formatCrackTime } from "./crack-time.ts";
import { checkEnvironment } from "./environment.ts";
import {
  getEngine,
  isWordlistLoaded,
  markWordlistLoaded,
  type Engine,
  type Generated,
  type Strength,
} from "./engine.ts";
import { defaultLanguage } from "./language.ts";
import type { Manifest } from "./manifest.ts";
import {
  createTranslator,
  defaultUiLocale,
  matchLocale,
  type Catalog,
  type Translator,
} from "./messages.ts";
import { styles } from "./styles.ts";
import { tokenRuns } from "./tokens.ts";

export type ErrorKind =
  | "insecure"
  | "unsupported"
  | "noRandom"
  | "wasm"
  | "wordlist"
  | "wordlistHash"
  | "translation"
  | "noWordlists"
  | "generate";

/** After these errors the component shows only the error and the Credits link. */
const FATAL: ReadonlySet<ErrorKind> = new Set([
  "insecure",
  "unsupported",
  "noRandom",
  "wasm",
  "translation",
  "noWordlists",
]);

const ERROR_MESSAGE: Record<ErrorKind, string> = {
  insecure: "error.insecure",
  unsupported: "error.unsupported",
  noRandom: "error.noRandom",
  wasm: "error.wasm",
  wordlist: "error.wordlist",
  wordlistHash: "error.wordlistHash",
  translation: "error.translation",
  noWordlists: "error.noWordlists",
  generate: "error.generate",
};

const ENGLISH = en as Catalog;
const LANGUAGE_NAMES_AVAILABLE = MANIFESTS.map((m) => m.code);
const LOCALES = ["en", ...Object.keys(LOCALE_SRI)];

const SEPARATOR_MESSAGE: Record<Separator, string> = {
  none: "separator.none",
  "-": "separator.dash",
  ".": "separator.dot",
  _: "separator.underscore",
  space: "separator.space",
};

const STRENGTH_PERCENT: Record<Strength, number> = {
  weak: 25,
  fair: 50,
  strong: 75,
  "very-strong": 100,
};
const STRENGTH_VARIANT: Record<Strength, "danger" | "warning" | "success" | "brand"> = {
  weak: "danger",
  fair: "warning",
  strong: "success",
  "very-strong": "brand",
};

/** The word counts and lengths below these numbers get a warning (FR-3, FR-61). */
const SHORT_WORDS = 4;
const SHORT_LENGTH = 12;

const COPIED_MS = 1500;
const ANNOUNCE_GAP_MS = 250;

/** The locale for `Intl`. The test pseudo-locale uses English rules. */
function intlLocale(locale: string): string {
  return locale === "qps" ? "en" : locale;
}

function converter<T>(
  name: string,
  parse: Parser<T>,
  fallback: () => T,
): ComplexAttributeConverter<T> {
  return { fromAttribute: (value: string | null) => readAttribute(name, value, parse, fallback()) };
}

const parseLanguage = languageParser(LANGUAGE_NAMES_AVAILABLE);
const parseUiLanguage: Parser<string> = (text) =>
  LOCALES.find((locale) => locale.toLowerCase() === text.toLowerCase());

function safeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

interface ValueEvent extends Event {
  target: (EventTarget & { value?: unknown; checked?: boolean }) | null;
}

export class HekateGenerator extends LitElement {
  static override styles = styles;

  // Attributes of table 5.2. They are the start values. The user can change all of them.
  @property({ converter: converter("mode", oneOf(MODES), () => DEFAULTS.mode) })
  mode: Mode = DEFAULTS.mode;

  /** `undefined` means: use the language of the browser (FR-2). */
  @property({
    converter: converter<string | undefined>("language", parseLanguage, () => undefined),
  })
  language: string | undefined = undefined;

  @property({ converter: converter("words", intRange(WORDS_MIN, WORDS_MAX), () => DEFAULTS.words) })
  words = DEFAULTS.words;

  @property({ converter: converter("separator", oneOf(SEPARATORS), () => DEFAULTS.separator) })
  separator: Separator = DEFAULTS.separator;

  @property({
    converter: converter("capitalization", oneOf(CAPITALIZATIONS), () => DEFAULTS.capitalization),
  })
  capitalization: Capitalization = DEFAULTS.capitalization;

  @property({ converter: converter("number", parseBoolean, () => DEFAULTS.number) })
  number = DEFAULTS.number;

  @property({ converter: converter("symbol", parseBoolean, () => DEFAULTS.symbol) })
  symbol = DEFAULTS.symbol;

  @property({
    attribute: "ascii-only",
    converter: converter("ascii-only", parseBoolean, () => DEFAULTS.asciiOnly),
  })
  asciiOnly = DEFAULTS.asciiOnly;

  @property({
    converter: converter("length", intRange(LENGTH_MIN, LENGTH_MAX), () => DEFAULTS.length),
  })
  length = DEFAULTS.length;

  @property({ converter: converter("charsets", parseCharsets, () => DEFAULTS.charsets) })
  charsets: readonly Charset[] = DEFAULTS.charsets;

  @property({
    attribute: "avoid-similar",
    converter: converter("avoid-similar", parseBoolean, () => DEFAULTS.avoidSimilar),
  })
  avoidSimilar = DEFAULTS.avoidSimilar;

  @property({
    attribute: "ui-language",
    converter: converter<string | undefined>("ui-language", parseUiLanguage, () => undefined),
  })
  uiLanguage: string | undefined = undefined;

  @property({ converter: converter("theme", oneOf(THEMES), () => DEFAULTS.theme) })
  theme: Theme = DEFAULTS.theme;

  @property({
    attribute: "assets-url",
    converter: converter<string | undefined>("assets-url", parseAssetsUrl, () => undefined),
  })
  assetsUrl: string | undefined = undefined;

  @state() private result: Generated | undefined;
  @state() private error: ErrorKind | undefined;
  @state() private busy = true;
  @state() private copyState: "copied" | "failed" | undefined;
  @state() private liveText = "";
  @state() private catalog: Catalog = ENGLISH;
  @state() private locale = "en";
  @state() private systemDark = false;
  @state() private creditsOpen = false;
  @state() private creditsShown = false;
  /** The value of a slider while the user moves it. It becomes an option when the user lets go. */
  @state() private wordsDraft: number | undefined;
  @state() private lengthDraft: number | undefined;

  #engine: Engine | undefined;
  #started = false;
  #generation = 0;
  #generated = false;
  #copyTimer: ReturnType<typeof setTimeout> | undefined;
  #announcements: string[] = [];
  #announcing = false;
  #activeWarnings = "";
  #dark: MediaQueryList | undefined;
  readonly #onSchemeChange = (event: MediaQueryListEvent): void => {
    this.systemDark = event.matches;
  };

  // --- Lifecycle ---------------------------------------------------------------------------

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof matchMedia === "function") {
      this.#dark = matchMedia("(prefers-color-scheme: dark)");
      this.systemDark = this.#dark.matches;
      this.#dark.addEventListener("change", this.#onSchemeChange);
    }
    if (!this.#started) {
      this.#started = true;
      void this.#boot();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#dark?.removeEventListener("change", this.#onSchemeChange);
    clearTimeout(this.#copyTimer);
  }

  override willUpdate(changed: PropertyValues<this>): void {
    // The UI language can change after the start. The first load is part of #boot.
    if (changed.has("uiLanguage") && this.#generated) {
      void this.#loadUiLanguage().catch(() => this.#fail("translation"));
    }
  }

  override updated(changed: PropertyValues<this>): void {
    // FR-8: a change of an option makes a new password.
    if (this.#engine !== undefined && this.#generated && this.#affectsPassword(changed)) {
      void this.#generate();
    }
    this.#announceWarnings();
  }

  #affectsPassword(changed: PropertyValues<this>): boolean {
    const common = ["mode"];
    const wordKeys = [
      "language",
      "words",
      "separator",
      "capitalization",
      "number",
      "symbol",
      "asciiOnly",
    ];
    const characterKeys = ["length", "charsets", "avoidSimilar"];
    const keys = [...common, ...(this.mode === "words" ? wordKeys : characterKeys)];
    return keys.some((key) => changed.has(key as keyof HekateGenerator));
  }

  // --- Start -------------------------------------------------------------------------------

  async #boot(): Promise<void> {
    const problem = checkEnvironment();
    if (problem !== null) {
      this.#fail(problem);
      return;
    }
    try {
      await this.#loadUiLanguage();
    } catch (error) {
      if (!(error instanceof TranslationIntegrityError)) throw error;
      console.error(error.message);
      this.#fail("translation");
      return;
    }
    if (MANIFESTS.length === 0) {
      this.#fail("noWordlists");
      return;
    }
    try {
      this.#engine = await getEngine(assetsFolder(this.assetsUrl));
    } catch (error) {
      console.error("Hekate: the WASM module did not load.", error);
      this.#fail("wasm");
      return;
    }
    this.#generated = true;
    await this.#generate(false);
  }

  /** FR-71, FR-83: reads the message file of the UI language. English is inside the script. */
  async #loadUiLanguage(): Promise<void> {
    const wanted = this.uiLanguage ?? defaultUiLocale(navigator.languages ?? [], LOCALES);
    const locale = matchLocale(wanted, LOCALES) ?? "en";
    if (locale === "en") {
      this.catalog = ENGLISH;
      this.locale = "en";
      return;
    }
    const catalog = await loadLocale(assetsFolder(this.assetsUrl), locale);
    // FR-83: when the file does not load, the UI is in English.
    this.catalog = catalog ?? ENGLISH;
    this.locale = catalog === null ? "en" : locale;
  }

  // --- Passwords ---------------------------------------------------------------------------

  get #wordLanguage(): string {
    return this.language ?? defaultLanguage(navigator.languages ?? [], LANGUAGE_NAMES_AVAILABLE);
  }

  #fail(kind: ErrorKind): void {
    this.error = kind;
    this.result = undefined;
    this.busy = false;
    this.#announce(this.#t(ERROR_MESSAGE[kind]));
  }

  async #generate(announce = true): Promise<void> {
    const problem = checkEnvironment();
    if (problem !== null) {
      this.#fail(problem);
      return;
    }
    const engine = this.#engine;
    if (engine === undefined) return;
    const ticket = ++this.#generation;
    const wordMode = this.mode === "words";
    const language = this.#wordLanguage;
    const ascii = this.asciiOnly;
    this.copyState = undefined;
    try {
      if (wordMode && !isWordlistLoaded(language, ascii)) {
        this.busy = true;
        const bytes = await fetchWordlist(
          wordlistUrl(assetsFolder(this.assetsUrl), language, ascii),
        );
        if (ticket !== this.#generation) return;
        try {
          engine.loadWordlist(language, ascii, bytes);
        } catch (error) {
          console.error("Hekate: the word list was refused.", error);
          this.#fail("wordlistHash");
          return;
        }
        markWordlistLoaded(language, ascii);
      }
      if (ticket !== this.#generation) return;
      const generated = wordMode
        ? engine.generateWords({
            language,
            ascii,
            words: this.words,
            separator: this.separator,
            capitalization: this.capitalization,
            number: this.number,
            symbol: this.symbol,
          })
        : engine.generateCharacters({
            length: this.length,
            charsets: this.charsets,
            avoidSimilar: this.avoidSimilar,
          });
      this.result = generated;
      this.error = undefined;
      this.busy = false;
      if (announce) this.#announce(this.#t("announce.newPassword"));
    } catch (error) {
      if (ticket !== this.#generation) return;
      if (error instanceof AssetError) {
        console.error(error.message);
        this.#fail("wordlist");
      } else {
        console.error("Hekate: no password was made.", error);
        this.#fail(
          /secure random/i.test(String((error as Error)?.message)) ? "noRandom" : "generate",
        );
      }
    }
  }

  // --- Live region (SR-9) ------------------------------------------------------------------

  /** Only fixed texts go here. The password never does. */
  #announce(text: string): void {
    this.#announcements.push(text);
    if (!this.#announcing) void this.#flushAnnouncements();
  }

  async #flushAnnouncements(): Promise<void> {
    this.#announcing = true;
    while (this.#announcements.length > 0) {
      const text = this.#announcements.shift() as string;
      // An empty region first, so a repeated text is read again.
      this.liveText = "";
      await this.updateComplete;
      await new Promise((resolve) => setTimeout(resolve, 30));
      this.liveText = text;
      await this.updateComplete;
      if (this.#announcements.length > 0)
        await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_GAP_MS));
    }
    this.#announcing = false;
  }

  get #warnings(): { words: boolean; length: boolean; ascii: boolean } {
    const password = this.result?.password ?? "";
    return {
      words:
        this.mode === "words" && this.words < SHORT_WORDS && !FATAL.has(this.error as ErrorKind),
      length:
        this.mode === "characters" &&
        this.length < SHORT_LENGTH &&
        !FATAL.has(this.error as ErrorKind),
      // eslint-disable-next-line no-control-regex
      ascii: this.mode === "words" && !this.asciiOnly && /[^\u0000-\u007f]/.test(password),
    };
  }

  /** FR-3, FR-61, 8.3: a new warning goes to the live region. */
  #announceWarnings(): void {
    // Before the start has finished, the message file of the UI language may not be loaded.
    // A warning that is announced now would be in English (FR-70, SR-9).
    if (!this.#generated) return;
    const now = this.#warnings;
    const active = (Object.keys(now) as Array<keyof typeof now>)
      .filter((key) => now[key])
      .join(",");
    if (active === this.#activeWarnings) return;
    const before = new Set(this.#activeWarnings.split(",").filter(Boolean));
    this.#activeWarnings = active;
    const messages = {
      words: "words.warning",
      length: "length.warning",
      ascii: "ascii.note",
    } as const;
    for (const key of active.split(",").filter(Boolean) as Array<keyof typeof messages>) {
      if (!before.has(key)) this.#announce(this.#t(messages[key]));
    }
  }

  // --- Actions -----------------------------------------------------------------------------

  async #copy(): Promise<void> {
    clearTimeout(this.#copyTimer);
    const password = this.result?.password;
    if (password === undefined) return;
    try {
      if (typeof navigator.clipboard?.writeText !== "function") throw new Error("no clipboard");
      await navigator.clipboard.writeText(password);
      this.copyState = "copied";
      this.#announce(this.#t("action.copied"));
      // FR-9: the message shows for 2 seconds or less.
      this.#copyTimer = setTimeout(() => (this.copyState = undefined), COPIED_MS);
    } catch {
      this.copyState = "failed";
      this.#announce(this.#t("action.copyFailed"));
      this.#selectPassword();
    }
  }

  /** FR-84: the user can copy the text by hand. */
  #selectPassword(): void {
    const field = this.renderRoot.querySelector("#password");
    const selection = field?.getRootNode() instanceof ShadowRoot ? window.getSelection() : null;
    if (!field || !selection) return;
    // WebKit ignores addRange() with a range inside a shadow root, but not this call.
    selection.selectAllChildren(field);
  }

  #retry(): void {
    void this.#generate();
  }

  #openCredits(): void {
    this.creditsShown = true;
    this.creditsOpen = true;
  }

  #onDialogHide(event: Event): void {
    if (event.target !== event.currentTarget) return;
    this.creditsOpen = false;
  }

  #onDialogAfterHide(event: Event): void {
    if (event.target !== event.currentTarget) return;
    // Escape or the close button: the focus goes back to the link (8.4).
    this.renderRoot.querySelector<HTMLElement>("#credits-link")?.focus();
  }

  // --- Rendering ---------------------------------------------------------------------------

  #t: Translator = (key, params) =>
    createTranslator(this.catalog, ENGLISH, intlLocale(this.locale))(key, params);

  get #themeClass(): "light" | "dark" {
    return this.theme === "dark" || (this.theme === "auto" && this.systemDark) ? "dark" : "light";
  }

  protected override render(): TemplateResult {
    const fatal = this.error !== undefined && FATAL.has(this.error);
    return html`
      <div
        class=${classMap({ root: true, [this.#themeClass]: true, [`wa-${this.#themeClass}`]: true })}
      >
        <div class="base" part="base">
          <div
            class="visually-hidden"
            part="live-region"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >${this.liveText}</div>
          ${this.#renderError()} ${fatal ? nothing : this.#renderMain()}
        </div>
        <!-- FR-30: the footer and the dialog are outside the "base" part, and are no part. -->
        <div class="footer">
          <button type="button" id="credits-link" class="credits-link" @click=${this.#openCredits}>
            ${this.#t("credits.link")}
          </button>
        </div>
        ${this.#renderCredits()}
      </div>
    `;
  }

  #renderError(): TemplateResult | typeof nothing {
    if (this.error === undefined) return nothing;
    const kind = this.error;
    return html`
      <hekate-wa-callout variant="danger" part="error" id="error">
        ${this.#t(ERROR_MESSAGE[kind])}
        ${
          kind === "wordlist"
            ? html`<div class="callout-actions">
                <hekate-wa-button
                  part="retry-button"
                  size="small"
                  variant="neutral"
                  @click=${this.#retry}
                >
                  ${this.#t("action.retry")}
                </hekate-wa-button>
              </div>`
            : nothing
        }
      </hekate-wa-callout>
    `;
  }

  #renderMain(): TemplateResult {
    const t = this.#t;
    const warnings = this.#warnings;
    const result = this.result;
    return html`
      <div class="main">
        <div class="password-block">
          <span class="field-label" id="password-label">${t("password.label")}</span>
          <div
            class="password"
            id="password"
            part="password"
            role="textbox"
            aria-readonly="true"
            aria-labelledby="password-label"
            aria-busy=${this.busy ? "true" : "false"}
            tabindex="0"
          >${this.#renderPassword(result)}</div>
        </div>
        <div class="actions">
          <hekate-wa-button
            part="new-password-button"
            variant="brand"
            with-start
            @click=${() => void this.#generate()}
          >
            <hekate-wa-icon
              slot="start"
              library="system"
              name="refresh"
              aria-hidden="true"
            ></hekate-wa-icon>
            ${t("action.new")}
          </hekate-wa-button>
          <hekate-wa-button
            part="copy-button"
            appearance="outlined"
            variant="neutral"
            with-start
            ?disabled=${result === undefined}
            @click=${() => void this.#copy()}
          >
            <hekate-wa-icon
              slot="start"
              library="system"
              name="copy"
              aria-hidden="true"
            ></hekate-wa-icon>
            ${t("action.copyLabel")}
          </hekate-wa-button>
          <span class="copy-status" part="copy-status"
            >${this.copyState === "copied" ? t("action.copied") : nothing}</span
          >
        </div>
        ${
          this.copyState === "failed"
            ? html`<hekate-wa-callout variant="warning" part="error" id="copy-error"
                >${t("action.copyFailed")}</hekate-wa-callout
              >`
            : nothing
        }
        ${warnings.words ? html`<hekate-wa-callout variant="warning" part="warning" id="words-warning">${t("words.warning")}</hekate-wa-callout>` : nothing}
        ${warnings.length ? html`<hekate-wa-callout variant="warning" part="warning" id="length-warning">${t("length.warning")}</hekate-wa-callout>` : nothing}
        ${warnings.ascii ? html`<hekate-wa-callout variant="neutral" part="ascii-note" id="ascii-note">${t("ascii.note")}</hekate-wa-callout>` : nothing}
        ${result ? this.#renderStrength(result) : nothing}
        <div class="options" part="options">
          ${this.#renderModeSwitch()}${this.mode === "words" ? this.#renderWordOptions() : this.#renderCharacterOptions()}
        </div>
      </div>
    `;
  }

  /** No white space around the runs: the text of the field must equal the password. */
  #renderPassword(result: Generated | undefined): TemplateResult | TemplateResult[] {
    if (result === undefined) {
      return html`<span class="field-label">${this.busy ? this.#t("password.loading") : ""}</span>`;
    }
    return tokenRuns(result.password, result.kinds).map(
      (run) => html`<span class=${run.name} part=${run.name}>${run.text}</span>`,
    );
  }

  #renderStrength(result: Generated): TemplateResult {
    const t = this.#t;
    const locale = intlLocale(this.locale);
    const strength = result.strength;
    const label = t(`strength.${strength}`);
    const bits = Math.round(result.entropyBits * 10) / 10;
    const time = formatCrackTime(result.crackSeconds, locale, t);
    return html`
      <div class=${classMap({ strength: true, [`strength-${strength}`]: true })} part="strength">
        <hekate-wa-progress-bar
          part="strength-bar"
          value=${STRENGTH_PERCENT[strength]}
          label=${`${t("strength.label")}: ${label}`}
        ></hekate-wa-progress-bar>
        <div class="strength-head">
          <hekate-wa-badge
            variant=${STRENGTH_VARIANT[strength]}
            part="strength-label"
            id="strength-label"
            >${label}</hekate-wa-badge
          >
          <span class="facts" part="entropy" id="entropy"
            >${t("entropy.value", { count: bits })}</span
          >
        </div>
        <p class="facts" part="crack-time" id="crack-time">${t("crack.label", { time })}</p>
        <p class="note" part="crack-note">${t("crack.note")}</p>
        <p class="facts" part="password-length" id="password-length">
          ${t("password.length", { count: Array.from(result.password).length })}
        </p>
      </div>
    `;
  }

  #renderWordOptions(): TemplateResult {
    const t = this.#t;
    const shown = this.wordsDraft ?? this.words;
    return html`
      <div class="option-group wide">
        <hekate-wa-select
          part="language"
          label=${t("language.label")}
          .value=${this.#wordLanguage}
          @change=${(event: ValueEvent) => {
            const value = String(event.target?.value ?? "");
            if (parseLanguage(value) !== undefined) this.language = parseLanguage(value);
          }}
        >
          ${MANIFESTS.map(
            (manifest: Manifest) =>
              html`<hekate-wa-option value=${manifest.code} lang=${ifDefined(manifest.code)}
                >${manifest.name}</hekate-wa-option
              >`,
          )}
        </hekate-wa-select>
      </div>
      <div class="option-group wide">
        <hekate-wa-slider
          part="words"
          label=${t("words.label")}
          min=${WORDS_MIN}
          max=${WORDS_MAX}
          step="1"
          with-tooltip
          .value=${this.words}
          @input=${(event: ValueEvent) => (this.wordsDraft = Number(event.target?.value))}
          @change=${(event: ValueEvent) => {
            this.wordsDraft = undefined;
            this.words = Number(event.target?.value);
          }}
        ></hekate-wa-slider>
        <span class="slider-value" part="words-value">${t("words.value", { count: shown })}</span>
      </div>
      <div class="option-group">
        <hekate-wa-radio-group
          part="separator"
          label=${t("separator.label")}
          orientation="horizontal"
          .value=${this.separator}
          @change=${(event: ValueEvent) => {
            const value = oneOf(SEPARATORS)(String(event.target?.value ?? ""));
            if (value !== undefined) this.separator = value;
          }}
        >
          ${SEPARATORS.map(
            (value) =>
              html`<hekate-wa-radio appearance="button" value=${value}
                >${t(SEPARATOR_MESSAGE[value])}</hekate-wa-radio
              >`,
          )}
        </hekate-wa-radio-group>
      </div>
      <div class="option-group">
        <hekate-wa-radio-group
          part="capitalization"
          label=${t("capitalization.label")}
          orientation="horizontal"
          .value=${this.capitalization}
          @change=${(event: ValueEvent) => {
            const value = oneOf(CAPITALIZATIONS)(String(event.target?.value ?? ""));
            if (value !== undefined) this.capitalization = value;
          }}
        >
          ${CAPITALIZATIONS.map(
            (value) =>
              html`<hekate-wa-radio appearance="button" value=${value}
                >${t(`capitalization.${value}`)}</hekate-wa-radio
              >`,
          )}
        </hekate-wa-radio-group>
      </div>
      <div class="switches wide">
        <hekate-wa-switch
          part="number"
          .checked=${this.number}
          @change=${(event: ValueEvent) => (this.number = event.target?.checked === true)}
          >${t("number.label")}</hekate-wa-switch
        >
        <hekate-wa-switch
          part="symbol"
          .checked=${this.symbol}
          @change=${(event: ValueEvent) => (this.symbol = event.target?.checked === true)}
          >${t("symbol.label")}</hekate-wa-switch
        >
        <hekate-wa-switch
          part="ascii-only"
          .checked=${this.asciiOnly}
          @change=${(event: ValueEvent) => (this.asciiOnly = event.target?.checked === true)}
          >${t("ascii.label")}</hekate-wa-switch
        >
      </div>
    `;
  }

  #renderCharacterOptions(): TemplateResult {
    const t = this.#t;
    const shown = this.lengthDraft ?? this.length;
    const onlyOne = this.charsets.length === 1;
    const toggle = (set: Charset, on: boolean): void => {
      const next = CHARSETS.filter((name) => (name === set ? on : this.charsets.includes(name)));
      if (next.length > 0) this.charsets = next;
    };
    return html`
      <div class="option-group wide">
        <hekate-wa-slider
          part="length"
          label=${t("length.label")}
          min=${LENGTH_MIN}
          max=${LENGTH_MAX}
          step="1"
          with-tooltip
          .value=${this.length}
          @input=${(event: ValueEvent) => (this.lengthDraft = Number(event.target?.value))}
          @change=${(event: ValueEvent) => {
            this.lengthDraft = undefined;
            this.length = Number(event.target?.value);
          }}
        ></hekate-wa-slider>
        <span class="slider-value" part="length-value">${t("length.value", { count: shown })}</span>
      </div>
      <div class="checks wide" part="charsets" role="group" aria-label=${t("charsets.label")}>
        ${repeat(
          CHARSETS,
          (set) => set,
          (set) =>
            html`<hekate-wa-checkbox
              part="charset"
              .checked=${this.charsets.includes(set)}
              ?disabled=${onlyOne && this.charsets.includes(set)}
              @change=${(event: ValueEvent) => toggle(set, event.target?.checked === true)}
              >${t(`charset.${set}`)}</hekate-wa-checkbox
            >`,
        )}
      </div>
      <div class="switches wide">
        <hekate-wa-switch
          part="avoid-similar"
          .checked=${this.avoidSimilar}
          @change=${(event: ValueEvent) => (this.avoidSimilar = event.target?.checked === true)}
          >${t("avoidSimilar.label")}</hekate-wa-switch
        >
      </div>
    `;
  }

  #renderModeSwitch(): TemplateResult {
    const t = this.#t;
    return html`
      <div class="option-group wide">
        <hekate-wa-radio-group
          part="mode"
          label=${t("mode.label")}
          orientation="horizontal"
          .value=${this.mode}
          @change=${(event: ValueEvent) => {
            const value = oneOf(MODES)(String(event.target?.value ?? ""));
            if (value !== undefined) this.mode = value;
          }}
        >
          <hekate-wa-radio appearance="button" value="words">${t("mode.words")}</hekate-wa-radio>
          <hekate-wa-radio appearance="button" value="characters"
            >${t("mode.characters")}</hekate-wa-radio
          >
        </hekate-wa-radio-group>
      </div>
    `;
  }

  #renderCredits(): TemplateResult {
    const t = this.#t;
    const report = `${assetsFolder(this.assetsUrl)}THIRD-PARTY-LICENSES.html`;
    return html`
      <hekate-wa-dialog
        id="credits"
        label=${t("credits.title")}
        without-header
        ?open=${this.creditsOpen}
        @wa-hide=${this.#onDialogHide}
        @wa-after-hide=${this.#onDialogAfterHide}
      >
        <div class="credits-header">
          <h2 class="credits-title">${t("credits.title")}</h2>
          <hekate-wa-button
            id="credits-close"
            appearance="plain"
            size="small"
            @click=${() => (this.creditsOpen = false)}
          >
            <hekate-wa-icon
              library="system"
              name="xmark"
              label=${t("credits.close")}
            ></hekate-wa-icon>
          </hekate-wa-button>
        </div>
        ${
          this.creditsShown
            ? html`<div class="credits">
                <p id="credits-version">${t("credits.version", { version: VERSION })}</p>
                <p id="credits-commit">${t("credits.commit", { commit: COMMIT })}</p>
                <p>
                  <a id="license-report" href=${report} target="_blank" rel="noopener noreferrer"
                    >${t("credits.licenseReport")}</a
                  >
                </p>
                <h3>${t("credits.wordlists")}</h3>
                ${MANIFESTS.map((manifest) => this.#renderWordlistCredits(manifest))}
              </div>`
            : nothing
        }
        <hekate-wa-button slot="footer" variant="neutral" @click=${() => (this.creditsOpen = false)}
          >${t("credits.close")}</hekate-wa-button
        >
      </hekate-wa-dialog>
    `;
  }

  #renderWordlistCredits(manifest: Manifest): TemplateResult {
    const t = this.#t;
    const selected = manifest.code === this.#wordLanguage;
    return html`
      <details id=${`credits-${manifest.code}`} ?open=${selected}>
        <summary lang=${manifest.code}>${manifest.name}</summary>
        <h4>${t("credits.sources")}</h4>
        <ul>
          ${manifest.sources.map(
            (source) =>
              html`<li>
                <a
                  class="source-name"
                  href=${ifDefined(safeUrl(source.url))}
                  target="_blank"
                  rel="noopener noreferrer"
                  >${source.name}</a
                >
                (${t(`credits.sourceRole.${source.role}`)})
                <br />${t("credits.sourceVersion", { version: source.version })}
                <br />${t("credits.license")}
                <a
                  class="source-license"
                  href=${ifDefined(safeUrl(source.license_url))}
                  target="_blank"
                  rel="noopener noreferrer"
                  >${source.license}</a
                >
                <br /><span class="source-credit"
                  >${t("credits.credit", { credit: source.credit })}</span
                >
              </li>`,
          )}
        </ul>
        <p class="changed-note">${manifest.changed_note}</p>
        <p class="hash words-hash">${t("credits.hashWords", { hash: manifest.sha256.words })}</p>
        ${
          manifest.ascii_same
            ? nothing
            : html`<p class="hash ascii-hash">
                ${t("credits.hashAscii", { hash: manifest.sha256.words_ascii })}
              </p>`
        }
      </details>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hekate-generator": HekateGenerator;
  }
}
