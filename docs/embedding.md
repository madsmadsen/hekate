# Embed Hekate in your website

This is the full guide for website owners. Back to the [README](../README.md).

## Add Hekate to a page

Add one script tag and one `<hekate-generator>` tag.

```html
<script
  type="module"
  src="https://assets.example.com/2026.10.06-1432/hekate.js"
  integrity="sha384-VALUE_FROM_sri.txt"
  crossorigin="anonymous"
></script>

<hekate-generator language="sv" words="5" separator="-">
  Your browser cannot show the password generator.
</hekate-generator>
```

- Replace `assets.example.com` with your asset host (see "Deploy the files").
- The version is in the URL. It is the UTC time of the release commit, in the form `YYYY.MM.DD-HHMM`.
- `integrity` is Subresource Integrity (SRI). With SRI, the browser refuses the script if its hash is not the expected hash. The folder of each version has a file `sri.txt` with the value. `crossorigin="anonymous"` is required with `integrity`.
- `hekate.js` is one file with no extra chunks. The SRI value therefore covers all JavaScript. The script has the hashes of `hekate.wasm` and of the translation files, and checks them when it loads them. It checks the word lists with the hashes inside the WASM module.
- To upgrade, change the version in the URL and the `integrity` value.

**Fallback text.** The text inside the `<hekate-generator>` tag is shown only by a browser that has no support for custom elements. Use it to tell the user what is missing.

If another feature is missing (for example WebAssembly or Web Crypto), the component shows an error and makes no password. The page must be a secure context: HTTPS, or `localhost`.

Hekate supports the last 2 major versions of Chrome, Edge, Firefox, and Safari, iOS Safari 17 and later, and Android Chrome.

## Attributes

All attributes are optional. They set the start values of the options. The user can change every option in the user interface. A value that is not valid gives the default and a warning in the browser console. The match of values ignores uppercase and lowercase.

| Attribute        | Allowed values                                                                                                                           | Default                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `mode`           | `words`, `characters`                                                                                                                    | `words`                                                                |
| `language`       | One of the 15 language codes: `en-US`, `en-GB`, `de`, `fr-FR`, `fr-CA`, `es`, `it`, `pt-PT`, `pt-BR`, `nl`, `sv`, `nb`, `da`, `fi`, `pl` | The first language of the browser that has a list, else `en-US`        |
| `words`          | An integer from 3 to 10                                                                                                                  | `5`                                                                    |
| `separator`      | `none`, `-`, `.`, `_`, `space`                                                                                                           | `none`                                                                 |
| `capitalization` | `lower`, `title`, `random`                                                                                                               | `title`                                                                |
| `number`         | `true`, `false`                                                                                                                          | `false`                                                                |
| `symbol`         | `true`, `false`                                                                                                                          | `false`                                                                |
| `ascii-only`     | `true`, `false`                                                                                                                          | `false`                                                                |
| `length`         | An integer from 8 to 64                                                                                                                  | `20`                                                                   |
| `charsets`       | A comma-separated list of one or more of `lower`, `upper`, `digits`, `symbols`, for example `lower,digits`                               | `lower,upper,digits,symbols`                                           |
| `avoid-similar`  | `true`, `false`                                                                                                                          | `false`                                                                |
| `no-repeat`      | `true`, `false`                                                                                                                          | `false`                                                                |
| `ui-language`    | A locale code that has a message file                                                                                                    | The first language of the browser that has a translation, else English |
| `theme`          | `light`, `dark`, `auto`                                                                                                                  | `auto` (follows `prefers-color-scheme`)                                |
| `assets-url`     | An absolute `https` URL of a folder. On `localhost`, an `http` URL is also allowed.                                                      | The folder of `hekate.js`                                              |

You can put more than one `<hekate-generator>` on a page. Each works on its own. A word list loads only one time for the page.

## Styling

Hekate puts its user interface in a shadow root. A shadow root keeps the CSS of the component apart from the CSS of your page. Your page CSS does not break the component, and the component CSS does not change your page.

You change the look with CSS custom properties (variables in CSS) and with `::part()` selectors. A `::part()` selector styles a named element inside a shadow root. The file [`packages/component/API.md`](../packages/component/API.md) describes each property and part.

```css
hekate-generator {
  --hekate-color-brand: #6a1b9a;
  --hekate-radius: 0.25rem;
}
hekate-generator::part(copy-button) {
  font-weight: 700;
}
```

### CSS custom properties

- `--hekate-font-family`
- `--hekate-password-font-family`
- `--hekate-password-font-size`
- `--hekate-color-text`
- `--hekate-color-text-quiet`
- `--hekate-color-surface`
- `--hekate-color-border`
- `--hekate-color-brand`
- `--hekate-color-separator`
- `--hekate-color-number`
- `--hekate-color-symbol`
- `--hekate-color-digit`
- `--hekate-color-strength-weak`
- `--hekate-color-strength-fair`
- `--hekate-color-strength-strong`
- `--hekate-color-strength-very-strong`
- `--hekate-radius`
- `--hekate-gap`

### Parts

- `base`
- `live-region`
- `error`
- `retry-button`
- `warning`
- `ascii-note`
- `password`
- `token-word`
- `token-separator`
- `token-number`
- `token-symbol`
- `token-lower`
- `token-upper`
- `token-digit`
- `new-password-button`
- `copy-button`
- `copy-status`
- `strength`
- `strength-bar`
- `strength-label`
- `entropy`
- `crack-time`
- `crack-note`
- `strength-note`
- `naive-strength`
- `password-length`
- `options`
- `mode`
- `language`
- `words`
- `separator`
- `capitalization`
- `number`
- `symbol`
- `ascii-only`
- `length`
- `length-value`
- `charsets`
- `charset`
- `avoid-similar`
- `no-repeat`

The component works when its parent element is 320 px wide or wider. It uses container queries, which depend on the size of the parent element and not on the size of the screen.

## Deploy the files

`cargo xtask dist` makes one folder for each version, `dist/<version>/`.

```text
dist/
└── 2026.10.06-1432/
    ├── hekate.js                    the component script (one file)
    ├── hekate.wasm                  the WASM module
    ├── sri.txt                      the SRI value of hekate.js
    ├── wordlists/<code>/words.txt
    ├── wordlists/<code>/words-ascii.txt
    ├── locales/<locale>.json        translations (not English)
    ├── LICENSES/                    one license file for each word list
    └── THIRD-PARTY-LICENSES.html    licenses of the dependencies
```

Copy the folder to your asset host. The asset host is the web server that delivers the files. You choose the server and the domain.

**Keep the folders of old versions.** Never change the files of a version that is online, because the hashes would no longer match and old pages would stop working. Each page uses the files of one version only, because the component finds its files from the URL of its own script.

The component loads the WASM module when it starts. It loads a word list the first time the user selects its language. It loads a translation the first time the user selects a UI language other than English. It loads nothing from other servers. It does not use the CDN of Web Awesome or of Font Awesome.

### Response headers

The asset host must send these headers for every file in `dist/`.

| Header                                       | Why                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `Cache-Control: no-store`                    | The browser keeps no copy of the files (SR-8).                                |
| `Access-Control-Allow-Origin: *`             | Pages on other domains can load the files (SR-12).                            |
| `Content-Type: application/wasm`             | For `hekate.wasm`. The browser needs this type to compile the module (SR-12). |
| `Cross-Origin-Resource-Policy: cross-origin` | Recommended. It lets pages with strict cross-origin rules load the files.     |

The asset host sends no cookies and accepts no credentials.

[`dev/nginx.conf`](../dev/nginx.conf) is a complete nginx configuration with these headers. It is the server that the tests use, so it is a correct example for a deployment. Use `X-Content-Type-Options: nosniff` too, as in that file.

### Minimum Content Security Policy

A Content Security Policy (CSP) is a set of rules that limits what a page can load. If your page has a CSP, it needs at least these rules. `https://assets.example.com` is your asset host.

```text
script-src 'self' 'wasm-unsafe-eval' https://assets.example.com;
connect-src 'self' https://assets.example.com;
style-src 'self'
```

- `'wasm-unsafe-eval'` lets the browser compile the WASM module. Without it, the component shows an error.
- The asset host must be in `script-src` and in `connect-src`.
- The component uses only constructed stylesheets. It puts no `<style>` element and no `style` attribute in its markup. `style-src 'self'` is enough.

The demo page uses this CSP:

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' http://localhost:18081; style-src 'self'; connect-src 'self' http://localhost:18081; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

## Trust in the host page

Scripts on the host page can read the password from the component. Hekate cannot prevent this.

Load no third-party scripts on pages that have the component. Examples of third-party scripts are analytics scripts and advertisement scripts.

## Passwords with letters outside ASCII (NFC)

All passwords that Hekate makes are in Unicode form NFC. NFC gives the same bytes for the same visible text. Some systems use a different form, NFD, for text with letters outside ASCII, such as `é` or `ö`. The same visible password then has different bytes, and the login can fail.

Tell your users about this risk if your site accepts passwords with such letters. Every language has an **ASCII only** option. It makes a password with only the letters `a` to `z`.

## Privacy

- Hekate uses `crypto.getRandomValues()` of the browser for all random numbers. It never uses `Math.random()`.
- After the start, Hekate makes no network request. The exceptions are the word lists and the translations, which it loads from your asset host. It sends no data and makes no request to other servers.
- Hekate stores nothing on the device of the user. It uses no `localStorage`, `sessionStorage`, IndexedDB, cookies, Cache Storage, or service workers. It never puts a password in a URL, a log, or an event.
- The one exception is the clipboard. If the user selects **Copy**, Hekate writes the password to the clipboard. Hekate does not clear the clipboard (see "For users").
- The component tells screen readers only "New password generated". It does not read the password aloud on its own.
