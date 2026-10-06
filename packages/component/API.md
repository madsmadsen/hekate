# The `<hekate-generator>` component

This file lists the attributes, the CSS custom properties, and the parts of the component.
A test (`test/api.test.ts`) checks that these lists are the same as the lists in `src/api.ts`.

## Attributes

An attribute sets the start value of an option. The user can still change every option in the UI.
A value that is not valid gives the default value and one warning in the browser console.
The match of attribute values ignores uppercase and lowercase.

| Attribute        | Allowed values                                                         | Default                                                              |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `mode`           | `words`, `characters`                                                  | `words`                                                              |
| `language`       | One of the 15 language codes of the word lists                         | The language of the browser                                          |
| `words`          | A whole number from 3 to 10                                            | `5`                                                                  |
| `separator`      | `none`, `-`, `.`, `_`, `space`                                         | `none`                                                               |
| `capitalization` | `lower`, `title`, `random`                                             | `title`                                                              |
| `number`         | `true`, `false`                                                        | `false`                                                              |
| `symbol`         | `true`, `false`                                                        | `false`                                                              |
| `ascii-only`     | `true`, `false`                                                        | `false`                                                              |
| `length`         | A whole number from 8 to 64                                            | `20`                                                                 |
| `charsets`       | A comma-separated list of `lower`, `upper`, `digits`, `symbols`        | `lower,upper,digits,symbols`                                         |
| `avoid-similar`  | `true`, `false`                                                        | `false`                                                              |
| `ui-language`    | A locale code that has a message file                                  | The first language of the browser that has a translation, or English |
| `theme`          | `light`, `dark`, `auto`                                                | `auto`                                                               |
| `assets-url`     | An absolute `https` URL of a folder (`http` is allowed on `localhost`) | The folder of `hekate.js`                                            |

## CSS custom properties

Set a property on the `<hekate-generator>` element, or on any parent element. All names start with `--hekate-`.

- `--hekate-font-family`: the font of all text.
- `--hekate-password-font-family`: the font of the password.
- `--hekate-password-font-size`: the font size of the password.
- `--hekate-color-text`: the color of the text.
- `--hekate-color-text-quiet`: the color of less important text, such as the labels and the notes.
- `--hekate-color-surface`: the background color of the component.
- `--hekate-color-border`: the color of the border of the password box.
- `--hekate-color-brand`: the color of the main button and of the switches, sliders, and selected buttons.
- `--hekate-color-separator`: the color of the separators in a word password.
- `--hekate-color-number`: the color of the number in a word password.
- `--hekate-color-symbol`: the color of the symbols in a password.
- `--hekate-color-digit`: the color of the digits in a character password.
- `--hekate-color-strength-weak`: the color of the strength bar for a weak password.
- `--hekate-color-strength-fair`: the color of the strength bar for a fair password.
- `--hekate-color-strength-strong`: the color of the strength bar for a strong password.
- `--hekate-color-strength-very-strong`: the color of the strength bar for a very strong password.
- `--hekate-radius`: the corner radius of the password box.
- `--hekate-gap`: the space between the parts of the component.

If you change the colors of the password, keep a contrast ratio of 4.5:1 or more against `--hekate-color-surface`.
Keep the different font weight of the separators, numbers, and symbols. It lets people see the tokens without color.

## Parts

Use a part with `hekate-generator::part(name)`. Web Awesome parts inside a part are not available.
The Credits link and the Credits dialog are not parts. A page cannot hide them.

- `base`: the box around the whole component.
- `live-region`: the hidden text that screen readers announce.
- `error`: a callout that shows an error.
- `retry-button`: the "Try again" button of the error callout.
- `warning`: a callout that shows a warning.
- `ascii-note`: the note about letters that are not ASCII.
- `password`: the box with the password.
- `token-word`: the letters of a word in a word password.
- `token-separator`: a separator in a word password.
- `token-number`: the number in a word password.
- `token-symbol`: a symbol in a password.
- `token-lower`: lowercase letters in a character password.
- `token-upper`: capital letters in a character password.
- `token-digit`: digits in a character password.
- `new-password-button`: the "New password" button.
- `copy-button`: the "Copy" button.
- `copy-status`: the text "Copied".
- `strength`: the box with the strength estimate.
- `strength-bar`: the strength bar.
- `strength-label`: the label "Weak", "Fair", "Strong", or "Very strong".
- `entropy`: the text with the entropy in bits.
- `crack-time`: the text with the time to crack.
- `crack-note`: the note about the guesses per second.
- `password-length`: the text with the length of the password.
- `options`: the box with all options.
- `mode`: the choice between Words and Characters.
- `language`: the language list.
- `words`: the slider for the number of words.
- `words-value`: the text with the number of words.
- `separator`: the choice of the separator.
- `capitalization`: the choice of the capital letters.
- `number`: the switch for the number.
- `symbol`: the switch for the symbol.
- `ascii-only`: the switch for ASCII-only.
- `length`: the slider for the length.
- `length-value`: the text with the length.
- `charsets`: the box with the character sets.
- `charset`: one check box of a character set.
- `avoid-similar`: the switch for similar characters.

## Selectors for tests

Inside the shadow root, the component has stable ids: `#password`, `#credits-link`, `#credits`,
`#credits-version`, `#credits-commit`, `#license-report`, `#credits-<language code>`, `#error`,
`#copy-error`, `#words-warning`, `#length-warning`, `#ascii-note`, `#strength-label`, `#entropy`,
`#crack-time`, and `#password-length`.
Playwright selectors pierce open shadow roots, for example `hekate-generator >> #password`.
The focus target of a slider is `[part=words] >> [role=slider]`.

## Notes

- The component makes no password until the WASM module is loaded and the checks of the browser pass.
- Web Awesome sets some CSS custom properties (for example `--percentage` of the strength bar) with
  the CSS object model (`element.style.setProperty`). A strict `style-src` rule allows this. The
  markup that the component writes has no `<style>` element and no `style` attribute.
- The names of the languages in the language list come from the word list manifests. They are data,
  not UI text.
- The time units in the time to crack ("years") come from `Intl.NumberFormat`.
