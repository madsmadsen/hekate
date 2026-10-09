# Hekate: Product Requirements Document

| Field | Value |
|---|---|
| Product | Hekate, a generator for passwords that are easy to remember |
| Status | Draft v0.8 |
| Date | 2026-10-09 |
| License | MIT for the code. The word lists keep the license of their source (see section 7.2). |

## 1. Summary

Hekate makes passwords from random words. The passwords are hard to guess. Hekate is free and open source. Open source means that the code is public and anyone can use it. The team is the group of people who maintain Hekate.

The user selects a language. Hekate then selects words only from the word list for that language. The word list does not contain the most common words of the language, such as "the", "and", and "have". It contains words that native speakers know well. A password in the native language of the user is easier to remember.

Hekate can also make passwords from random characters, such as `k9P$wq2Zmf3v`. These passwords are hard to remember, but a password manager can store them.

Hekate makes all passwords in the browser. The team writes the password code in Rust and compiles it to WebAssembly (WASM). WASM is a fast program format that browsers run. The random numbers come from a secure random generator. A secure random generator gives numbers that an attacker cannot predict. Hekate sends no password to any server. Scripts of the host page can read the password (SR-11).

Hekate is a web component. A web component is a custom HTML element that any website can use. A website owner adds Hekate to a page with one script tag and one HTML tag: `<hekate-generator>`. The user interface (UI) of the component uses the free, open-source edition of Web Awesome. Hekate uses Web Awesome version 3.14.0, under the MIT license.

## 2. Problem

Hekate solves these problems:

- Some people select weak passwords, because random strings such as `k9P$wq2Zmf3v` are hard to remember.
- Passwords made from random words are easier to remember. But common generators use only English word lists. For a person whose native language is not English, English words are harder to remember and to spell.
- Some online generators run JavaScript of unknown quality. Some load scripts from other companies. Some do not tell the user how strong the password is.
- Website owners who want a password generator on their own pages must build one themselves. Hekate gives them a component that they can embed.

## 3. Goals and non-goals

### 3.1 Goals

| ID | Goal |
|---|---|
| G1 | Make passwords from random words in the language that the user selects. |
| G2 | Use only random numbers that are secure and unbiased. Unbiased means that each possible value has the same chance. |
| G3 | Make all passwords on the device of the user, in Rust and WASM. After the component starts, contact only the asset host, and only to get a word list or a translation. The asset host is the web server that delivers the files of the component. |
| G4 | Show a correct estimate of password strength. Show the entropy and the time to crack the password. Entropy is a measure of how hard a password is to guess. It is given in bits. Each extra bit doubles the number of guesses. Hekate also shows a second estimate for an attacker who knows nothing about the password (FR-24). |
| G5 | Release the project as open source under the MIT license. Make the code easy for others to examine. Use only word lists that companies can use for commercial purposes (NFR-9). |
| G6 | Give contributors a repeatable process to add a new language (NFR-10). |
| G7 | Let any website embed Hekate as a web component, with no changes to the rest of the page. |
| G8 | Make passwords from random characters for users who store their passwords in a password manager. |
| G9 | Make the UI ready for translation into other languages. |

### 3.2 Non-goals for v1.0

Hekate v1.0 does not include these items:

- Password storage, sync between devices, user accounts, or a server (backend).
- A search for the password in lists of stolen passwords, for example Have I Been Pwned. This search needs network calls.
- Browser extensions and native mobile apps.
- Translations of the UI. Version 1.0 has English UI text only, but it is ready for translations (section 5.6).
- Chinese, Japanese, and Korean word lists. These languages need special input methods and do not put spaces between words. The team plans this feature for a later release.
- Word lists for languages that are written from right to left. The team plans this feature for a later release.

## 4. Users and use cases

| Type of user | Need |
|---|---|
| Everyday user | The user needs a password that the user can type from memory. Examples are a computer login and the main password of a password manager. |
| User whose native language is not English | The user has the same need, but wants words in the native language of the user. |
| User of a password manager | The user needs a long random password that the password manager stores. |
| Website owner | The owner wants to add a password generator to a page with little work. The owner wants it to match the design of the page. |
| Security expert or auditor | The expert wants to make sure that the random numbers, the word lists, and the strength estimate are correct. |
| Contributor | The contributor wants to add a word list for a new language, improve a word list, or add a translation of the UI. |

Main use case for users: The user opens a page that contains Hekate. The user selects a language, or keeps the language from the browser. The user sets the number of words and copies the password. Section 12 gives the time target for this task.

Main use case for website owners: The website owner adds the script tag and the `<hekate-generator>` tag to a page. The owner sets the start options with attributes and the colors with CSS. Section 12 gives the time target for this task.

## 5. Functional requirements

A functional requirement tells what the product does. Each requirement has a priority. P0 means that the feature must be in v1.0. P1 means that the team plans the feature for v1.0, but it does not block the release.

The acceptance criteria tell how the team makes sure that the product meets the requirement. Each criterion is marked Automated or Manual. An Automated criterion is a test that runs in CI. CI (continuous integration) is the set of automatic tests that run on each change. A Manual criterion is a review by a person. The team records each Manual result in `docs/release-checklist.md` (section 10.1).

An end-to-end test uses the component in a real browser, as a person does. The options are the values that the user selects, such as the language and the number of words. All statistical tests use a fixed seed for a random generator that only the tests use. As a result, each run of a statistical test gives the same result.

### 5.1 Word passwords

Word passwords are the default mode. Hekate has two modes: word mode and character mode.

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-1 | P0 | Language. The user selects one language from the list of supported languages. All words in a password come from the word list of that language. | Automated: For each supported language, a test makes 10,000 passwords. All words in these passwords are in the word list of that language. |
| FR-2 | P0 | Default language. If the `language` attribute is set (FR-42), Hekate uses that language. If not, Hekate reads the entries of `navigator.languages` in order. It uses the first entry that matches a row of table 5.1. If no entry matches, it uses English (US). The match ignores uppercase and lowercase. Hekate skips an entry with no match, for example a malformed value. | Automated: An end-to-end test sets `navigator.languages` to each value of table 5.1. Hekate selects the word list of that row. If the value is `["sv-SE","en"]`, Hekate selects Swedish. If it is `["xx"]`, Hekate selects English (US). If it is `["PT-BR"]`, Hekate selects Portuguese (Brazil). If it is `["not a tag!","de-AT"]`, Hekate selects German. If `language="de"` is set, Hekate selects German. |
| FR-3 | P0 | Number of words. The user can select 3 to 10 words. The default is 5. The control is a slider with 8 positions. The numbers 3 to 10 are under the track. The thumb is 44 px wide. A caption shows the selected count, for example "5 words". One click or tap on the track sets the count. The arrow keys, Home, and End also change it. | Automated: The slider has the minimum 3, the maximum 10, and the step 1. A test taps the track at each of the 8 positions. Each tap sets the number of words and the caption. The arrow keys, Home, and End change the value. At a parent width of 320 px, the numbers and the caption fit with no horizontal scroll bar. |
| FR-4 | P0 | Separator. A token is one word, the number, or the symbol of a word password. A separator is the character between the tokens. The user selects one of these separators in a group of radio buttons: `none`, `-`, `.`, `_`, or `space`. Each button is at least 44 px high and shows an example (`ab`, `a-b`, `a.b`, `a_b`, `a b`). The accessible name is the example and the name, for example "a-b, Hyphen (-)". A caption under the group shows the full name of the selected separator. All buttons are on one row at a parent width of 320 px. The default is `none`. | Automated: The group has 5 radio buttons. At a parent width of 320 px, all buttons are on one row. The password has the selected separator between all tokens. With the default options, the password is in PascalCase, for example `BraveMapleRiverCloudStone`. PascalCase means that the words are joined with no separator and each word starts with a capital letter. |
| FR-5 | P0 | Capital letters. The user selects one of three styles in a group of radio buttons: `lower`, `title`, or `random`. Each button is at least 44 px high and shows an example (`abc`, `Abc`, `Abc abc`). The accessible name is the example and the name, for example "Abc, Title case". A caption under the group shows the full name of the selected style. All buttons are on one row at a parent width of 320 px. In the `lower` style, all letters are lowercase. In the `title` style, the first letter of each word is a capital. In the `random` style, a new secure random bit selects `lower` or `title` for each word. The default is `title`. Together with the default separator (`none`), the default gives PascalCase. | Automated: A test makes 100,000 words in the `random` style. It counts the words in each of the two styles. A chi-square test with 1 degree of freedom gives p > 0.001. A chi-square test is a statistical test that finds uneven results. The value p is the chance of results this uneven from a fair generator. |
| FR-6 | P0 | Number. If this option is on, Hekate adds one random number from 0 to 99 to the password. The number is a separate token at a random position. | Automated: A test uses 5 words with the number option on. It makes 100,000 passwords. A chi-square test of the 100 numbers (99 degrees of freedom) gives p > 0.001. A separate chi-square test of the 6 positions (5 degrees of freedom) gives p > 0.001. |
| FR-7 | P0 | Symbol. If this option is on, Hekate adds one symbol at a random position. The symbol comes from this fixed set of 16: `! # $ % & * + - = ? @ ^ _ ~ : ;` | Automated: A test uses 5 words with the symbol option on. It makes 100,000 passwords. A chi-square test of the 16 symbols (15 degrees of freedom) gives p > 0.001. A separate chi-square test of the 6 positions (5 degrees of freedom) gives p > 0.001. |
| FR-8 | P0 | New password. A button makes new words with the current options. A change to the language, the number of words, "Basic English letters only (ASCII)", "No same character twice in a row" or the mode makes new words. A change to the separator, the capital letters, the number switch or the symbol switch keeps the words (FR-11). In character mode, every change makes a new password. | Automated: A component test replaces the WASM API with a test version that counts the calls that make words and the calls that build a password from the same words. One click gives one call of each kind. A change of the language, the number of words, "Basic English letters only (ASCII)" or no-repeat gives one call of each kind. A change of the separator, the capital letters, the number or the symbol gives zero calls that make words and one call that builds the password. In character mode, each change gives one call. |
| FR-9 | P0 | Copy. One action copies the password to the clipboard. Hekate then shows the message "Copied". This rule applies to word mode and to character mode. Hekate does not clear the clipboard (SR-8). | Automated: The clipboard contains exactly the password that Hekate shows. The message shows for 2 seconds or less. |
| FR-10 | P0 | Basic English letters only (ASCII). The option is named "Basic English letters only (ASCII)" in the UI. ASCII is the set of basic English letters, digits, and symbols. Some systems do not accept other letters, such as `å`, `ü`, or `ß`. If this option is on, Hekate uses the ASCII word list of the language (section 7.4). Each language has an ASCII word list. | Automated: For each language, the ASCII list has 4,096 words or more. With the option on, all characters in the password are printable ASCII. The strength estimate uses the size of the ASCII word list. |
| FR-11 | P0 | Keep the words. If the user changes the separator or the capital letter style, or turns the number or the symbol on or off, Hekate keeps the words of the current password and applies the new options. The number, the symbol and their places also stay the same. If the user turns the number off and then on again, the same number comes back in the same place. In the `random` style, each word keeps its own style. | Automated: A unit test makes one set of words and builds the password with each separator, each style, and each on/off combination of the number and the symbol. All 60 passwords contain the same words in the same order. An end-to-end test changes the separator, the style, the number and the symbol. The words stay the same, and the WASM function that makes words is not called. |
| FR-12 | P0 | No same character twice in a row (word mode). If this option is on, no two characters next to each other in the password are the same letter, digit or symbol. Uppercase and lowercase do not count, so `aA` is also not allowed. Hekate uses only the words that have no letter twice in a row. It does not use the numbers 11, 22, …, 99. It does not use the symbols `-` and `_`, because they can stand next to a separator with the same character. It makes new words until no word ends with the letter that starts the next word. Hekate does this check also when there is a separator. As a result, a change of the separator keeps the words (FR-11). The default is off. Appendix A.1 gives the entropy. | Automated: A unit test makes 100,000 passwords with the option on, with each separator, the number and the symbol on. No password has the same character twice in a row (case ignored). A unit test uses the list `ab`, `ba`, `cd` with 3 words and makes 170,000 passwords. There are 17 valid passwords, and a chi-square test (16 degrees of freedom) gives p > 0.001. The entropy equals log2 of a count by brute force within 1e-9 bits. Brute force means that the test counts every possible password. |

Table 5.1: Browser values and word lists. The value `*` means any region code.

| Browser value | Word list |
|---|---|
| `en-gb`, `en-ie`, `en-au`, `en-nz`, `en-za`, `en-in` | English (UK). These countries use British spelling. |
| `en`, `en-*` (all other) | English (US) |
| `de`, `de-*` | German |
| `fr-ca` | French (Canada) |
| `fr`, `fr-*` (all other) | French (France) |
| `es`, `es-*` | Spanish |
| `it`, `it-*` | Italian |
| `pt-br` | Portuguese (Brazil) |
| `pt`, `pt-*` (all other) | Portuguese (Portugal) |
| `nl`, `nl-*` | Dutch |
| `sv`, `sv-*` | Swedish |
| `no`, `no-*`, `nb`, `nb-*` | Norwegian (Bokmål) |
| `da`, `da-*` | Danish |
| `fi`, `fi-*` | Finnish |
| `pl`, `pl-*` | Polish |

### 5.2 Strength estimate

The strength estimate applies to word mode and to character mode.

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-20 | P0 | Entropy. Hekate shows the entropy in bits. It counts only the random choices. It assumes that the attacker knows the word list, the character sets, and the options. Appendix A gives the formulas. Hekate always shows the entropy, for example "64.6 bits of entropy". An info icon is on the right side of this text. A panel (not a dialog that blocks the page) opens when the user moves the mouse over the icon for 150 ms, puts the keyboard focus on the icon, or clicks or taps the icon. The panel has a short explanation of entropy and the note for the current mode, and also the time to crack (FR-21) and the comparison of FR-24. The panel is closed by default. It closes 200 ms after the pointer leaves the icon and the panel, unless the user opened it with a click or a key. Escape and the Close button close it. Tab out of the panel closes it. The panel follows WCAG 1.4.13: the user can dismiss it, move the pointer onto it, and it stays open until the user closes it or leaves. In word mode, the note is: "This estimate assumes that the attacker knows that Hekate uses random words from the {language} word list, and knows the selected options." In character mode, the note is: "This estimate assumes that the attacker knows that Hekate uses random characters, and knows the selected character sets and length." | Automated: A table of unit test cases has one case for each formula row of Appendix A and each example of Appendix A. Each result is within 0.05 bits of the expected value. The note text is shown in each mode. The entropy text is visible with the panel closed. A test opens the panel before it checks the notes. A test checks the 150 ms and 200 ms delays, the pinned state, Escape, and Tab out. |
| FR-21 | P0 | Time to crack. Hekate shows the average time that an attacker needs to guess the password. The attacker has a copy of the stored password data and makes 10¹⁰ guesses per second. On average, the attacker needs 2^(H−1) guesses. `H` is the entropy. The component shows the time as "Estimated time to crack: {time}", with this note: "This is an average estimate. It assumes an attacker who has the stored password data and makes 10 billion guesses per second." The time and the note are in the info panel of FR-20. Hekate shows the time with 2 significant digits and a `~` prefix. It uses the largest unit that gives a value of 1 or more. The units are seconds, minutes, hours, days, and years. If the time is less than 1 second, Hekate shows "less than 1 second". | Automated: For 5 words from a list of 7,776 words (64.6 bits), Hekate shows "~45 years". For 30 bits, Hekate shows "less than 1 second". The note text is present. |
| FR-22 | P0 | Strength label. Less than 45 bits: Weak. From 45 bits to less than 60 bits: Fair. From 60 bits to less than 80 bits: Strong. 80 bits or more: Very strong. The bar and the label stay visible when the info panel is closed. | Automated: A unit test gives these labels: 44.99 bits Weak, 45.00 bits Fair, 59.99 bits Fair, 60.00 bits Strong, 79.99 bits Strong, 80.00 bits Very strong. |
| FR-23 | P0 | Length. Hekate shows the number of characters in the password, because some sites limit the length. The length stays visible when the info panel is closed. | Automated: The number is the count of Unicode code points. For example, `å` in NFC form counts as 1. The number agrees with the password. |
| FR-24 | P0 | Estimate when the attacker knows nothing. Hekate also computes the entropy for an attacker who does not know how Hekate made the password. This attacker tries every password of the same length that uses only the character groups in the password (Appendix A.3). A character group is a set such as all lowercase letters or all digits. The component shows this estimate in the info panel of FR-20, after the main estimate: "Length-based comparison: {strength}, {entropy}, estimated time to crack {time}. This comparison ignores how Hekate made the password. It uses only the length and the character groups, such as lowercase letters or digits." The label and the time use the rules of FR-21 and FR-22. The strength bar and the main label always use the FR-20 value, because that value is never too high. | Automated: A unit test has one case for each example of Appendix A.3, each within 0.05 bits. An end-to-end test reads the password and computes Appendix A.3. The line shows that value, its label and its time. |

### 5.3 Credits

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-30 | P0 | Credits dialog. The component has a "Credits" link that opens a dialog. The dialog shows the version of Hekate (FR-51) and its git commit. For each word list, the dialog shows the items in the list below this table. The dialog also links to the report of third-party licenses. Website owners cannot remove the link. | Automated: For each language, a test opens the dialog and compares each item with `manifest.json`. A test page sets every attribute of FR-42 and CSS rules on every part of FR-47. The link is visible on this page. |

For each word list, the Credits dialog shows these items:

1. The name of each source.
2. The version of each source. For a source with no version, the dialog shows the copy date (section 7.3).
3. The license of each source, with a link to the license text.
4. The note "Hekate changed this source. Hekate filtered the words and shortened the list." CC BY requires this note.
5. The exact credit text that the source requires. For ParlaIbero-BR, the text names the dataset, its DOI, and "Câmara dos Deputados".
6. The SHA-256 hash of the list. A SHA-256 hash is a fixed fingerprint of a file.

The licenses of the word list sources require this credit (see section 7.2). The component does not contain a "How it works" text or questions and answers (FAQ). The host page can contain them. The host page is the page that embeds the component.

### 5.4 Embedding

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-40 | P0 | Custom element. Hekate is a custom element with the name `<hekate-generator>`. A website owner adds it to a page with one `<script type="module">` tag and one `<hekate-generator>` tag. | Automated: A test page contains only these two tags. The page shows a 5-word password, the strength label, and the copy button. The browser console shows no error. |
| FR-41 | P0 | Isolation. The component puts its UI in a shadow root. A shadow root keeps the CSS of the component apart from the CSS of the page. The CSS of the page does not break the component. The CSS of the component does not change the page. | Automated: A test page has global CSS rules that change all buttons, for example `button { color: red; }`. A screenshot of the component in Chromium differs by zero pixels from the reference screenshot. A second screenshot of the page outside the component differs by zero pixels from the same page without the component. |
| FR-42 | P0 | Start options. The website owner sets the start values of the options with the attributes of table 5.2. The user can still change all options in the UI. If a value is not valid, Hekate uses the default and writes a warning to the browser console. | Automated: For each attribute, a test sets each allowed value and one value that is not valid. The test also sets the limits 3, 10, 2, and 11 for `words` and 8, 64, 7, and 65 for `length`. An allowed value is used. A value that is not valid gives the default and a console warning. |
| FR-43 | P0 | Asset location. By default, the component loads the WASM module, the word lists, and the translations from the folder of the component script (`hekate.js`). The `assets-url` attribute sets a different folder. | Automated: A test page loads the component script from a second origin. An origin is the combination of scheme, host name, and port of a URL. The component loads all files from that origin. With `assets-url` set, it loads all files from that URL. |
| FR-44 | P0 | Several components. A page can contain more than one `<hekate-generator>`. Each component works independently. A word list loads only one time for the page. | Automated: A test page with two components shows two different passwords. The network log shows one request for each word list. |
| FR-45 | P0 | Safe registration. If the name `hekate-generator` is already defined on the page, the component script does not define it again and does not stop with an error. | Automated: A test loads the component script two times. The page shows no error. |
| FR-46 | P0 | Distribution. The build pipeline makes one folder for each release, `dist/<version>/` (FR-51). The build pipeline is the `cargo xtask dist` command (section 9.2). The folder contains the component script (`hekate.js`), the WASM module, the word lists, and the translations. It also contains the license files, the license report, and the SRI value (SR-13). The person who deploys Hekate selects the web server and the domain. The README lists the response headers that the asset host must send (SR-8, SR-12). | Automated: CI builds `dist/` and serves it with the web server of the development environment (section 9.1). This server sends the headers from the README. All end-to-end tests run against this server. |
| FR-47 | P1 | Look and feel. The website owner changes colors, fonts, and spacing with CSS custom properties and `::part()` selectors. A CSS custom property is a variable in CSS. A `::part()` selector styles a named element inside a shadow root. The README lists all supported properties and parts. The custom property `--hekate-color-on-brand` sets the text color on the brand color (default white). The `theme` attribute selects `light`, `dark`, or `auto`. The default is `auto`, which follows `prefers-color-scheme`. | Automated: A test page sets each listed property and part. The computed value of the target element equals the set value. A CI test compares the README list with the properties and parts that the code declares. The two lists are equal. |
| FR-48 | P0 | Stable options. When the user changes an option, Hekate adds or removes nothing above the options. The strength section keeps the same height. Only the password field can change its height, when the password wraps to a different number of lines. | Automated: At parent widths of 320 px, 480 px, and 800 px, a test changes each switch, check box, slider, and radio button. The height of the strength section and the space between the password field and the options stay the same, within 1 px. |
| FR-49 | P0 | Width of the parent element. The component works when its parent element is 320 px wide or wider. It uses container queries to change its layout, not the width of the screen. A container query is a CSS rule that depends on the size of the parent element. | Automated: A test shows the component in parent elements that are 320 px, 480 px, and 800 px wide. At each width, the component has no horizontal scroll bar. All controls are inside the box of the component. No text element has a `scrollWidth` larger than its `clientWidth`. |
| FR-50 | P0 | Web Awesome names. Hekate registers all Web Awesome elements that it uses under new names with the prefix `hekate-wa-`, for example `hekate-wa-button`. Hekate never registers a `wa-*` name. The build changes the names in the templates, the CSS, and the internal references of Web Awesome. | Automated: A test page loads a different version of Web Awesome before the component, and a second test page loads it after the component. On each page, a `wa-button` of the page keeps its computed CSS. `customElements.get("wa-button")` returns the class of the page. The component makes a password. Hekate defines no `wa-*` element. |
| FR-51 | P0 | Version and release. The version of a release is the UTC time of the release commit, in the form `YYYY.MM.DD-HHMM`, for example `2026.10.06-1432`. The git tag is `v<version>`. A maintainer makes a release when the maintainer pushes a tag. The maintainer then runs `cargo xtask dist`, which builds `dist/<version>/`. `CHANGELOG.md` has one entry for each version. | Automated: The release build computes the version from the commit time. It stops if the tag is different. It stops if `CHANGELOG.md` has no entry for the version. The Credits dialog shows the version. |

The version comes from the commit time, not from the build time. As a result, two builds of one tag give the same files (SR-10). The website owner loads `https://<asset-host>/<version>/hekate.js`. To upgrade, the website owner changes the version in the script tag and the `integrity` value (SR-13). The deployer keeps the folders of old versions on the asset host. As a result, old pages continue to work. A page always uses the files of one version, because the component finds its files from the URL of its own script (`import.meta.url`).

Table 5.2: Attributes. The match of attribute values ignores uppercase and lowercase.

| Attribute | Allowed values | Default |
|---|---|---|
| `mode` | `words`, `characters` | `words` |
| `language` | One of the 15 codes of section 7.5 | The result of FR-2 |
| `words` | An integer from 3 to 10 | `5` |
| `separator` | `none`, `-`, `.`, `_`, `space` | `none` |
| `capitalization` | `lower`, `title`, `random` | `title` |
| `number` | `true`, `false` | `false` |
| `symbol` | `true`, `false` | `false` |
| `ascii-only` | `true`, `false` | `false` |
| `length` | An integer from 8 to 64 | `20` |
| `charsets` | A comma-separated list of one or more of `lower`, `upper`, `digits`, `symbols`, for example `lower,digits` | `lower,upper,digits,symbols` |
| `avoid-similar` | `true`, `false` | `false` |
| `no-repeat` | `true`, `false` | `false` |
| `ui-language` | A locale code that has a message file (FR-70) | The result of FR-71 |
| `theme` | `light`, `dark`, `auto` | `auto` |
| `assets-url` | An absolute `https` URL of a folder. On `localhost`, an `http` URL is also allowed. | The folder of the component script |

### 5.5 Character passwords

In character mode, Hekate makes a password from random characters. The component does not show the language and the word options in this mode.

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-60 | P0 | Mode. The user selects "Words" or "Characters". The default is "Words". | Automated: The UI shows the options of the selected mode only. |
| FR-61 | P0 | Length. The user can select 8 to 64 characters. The default is 20. | Automated: The control accepts only values from 8 to 64. |
| FR-62 | P0 | Character sets. The user selects one or more of four sets. The sets are lowercase letters (`a` to `z`), capital letters (`A` to `Z`), digits (`0` to `9`), and symbols (FR-7). All four sets are on by default. At least one set must be on. | Automated: The UI does not let the user turn off the last set. All characters in the password come from the selected sets. |
| FR-63 | P0 | All selected sets are present. The password contains at least one character from each selected set. Hekate makes a new random password until this condition is true. It does not change single characters, because that method causes bias. | Automated: A unit test of `hekate-core` uses two small test sets, {a, b} and {1}, and length 3. There are 18 valid passwords. The test makes 180,000 passwords. A chi-square test of the 18 passwords (17 degrees of freedom) gives p > 0.001. A second test makes 100,000 passwords with the four real sets. Each password contains each selected set. |
| FR-64 | P1 | Avoid similar characters. If this option is on, Hekate does not use characters that look the same: `0`, `O`, `1`, `l`, and `I`. The default is off. | Automated: A test turns on the option and all four sets, with length 20. It makes 10,000 passwords. No password contains these characters. The entropy equals the value of Appendix A.2 for the sizes 25, 24, 8, and 16, within 0.05 bits. |
| FR-65 | P0 | Security of character mode. SR-1, SR-2, and SR-3 also apply to character mode. | Automated: The SR-1, SR-2, and SR-3 tests run in word mode and in character mode. |
| FR-66 | P0 | No same character twice in a row (character mode). The option of FR-12 also applies in character mode. No two characters next to each other are the same, and case does not count, so `aA` is not allowed. Each valid password has the same chance (SR-2). Appendix A.2 gives the entropy. | Automated: A unit test makes 100,000 passwords with only digits, "Avoid similar characters" on and length 64, and 100,000 passwords with all four sets and length 8. No password has the same character twice in a row (case ignored). A unit test uses the sets {a, b}, {A}, {1} with length 4. There are 34 valid passwords. It makes 340,000 passwords, and a chi-square test (33 degrees of freedom) gives p > 0.001. The entropy equals the Appendix A.2 examples within 0.05 bits. |

### 5.6 Translation readiness

Version 1.0 has English UI text only. A contributor must be able to add a translation without a change to the code.

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-70 | P0 | Message files. All UI text is in message files, one file for each UI language, in `packages/component/locales/<locale>.json`. The code contains no UI text. The English file is inside the component script. Other translations are separate files that the component loads from the asset host on first use. The names of the languages in the language selector are data, not UI text. They come from the `name` field of each word list manifest (section 7.3). | Automated: A test uses a pseudo-locale. A pseudo-locale is a test language that changes all text, for example "Copy" to "[Ćöpÿ !!!]". The test makes sure that no English UI text remains. The language names stay the same. |
| FR-71 | P0 | UI language. If the `ui-language` attribute is set, Hekate uses that UI language. If not, it uses the first entry in `navigator.languages` that has a translation. If no entry has one, it uses English. The UI language is separate from the word list language. | Automated: With a test translation file, each of the three cases selects the correct UI language. |
| FR-72 | P0 | Numbers, plurals, and times. Hekate formats numbers and times with `Intl.NumberFormat`, `Intl.PluralRules`, and other `Intl` functions. Message files use placeholders, not text that the code joins. | Automated: The pseudo-locale uses the plural rules of English. The test makes sure that 1 character uses the `one` form and 20 characters use the `other` form (the length text of character mode). With the UI language `de`, 64.6 bits shows as "64,6". With the UI language `en`, the time of FR-21 shows as "~45 years". |
| FR-73 | P1 | Layout for other languages. The layout works when the text is 40% longer than English. The CSS uses logical properties, such as `margin-inline-start`. With logical properties, a right-to-left UI is possible later. | Automated: The pseudo-locale makes all text 40% longer. At parent widths of 320 px and 800 px, no text element has a `scrollWidth` larger than its `clientWidth`. The boxes of no two controls overlap. |
| FR-74 | P1 | Translation guide. `CONTRIBUTING.md` explains how to add a translation. | Manual: A person who did not write the guide follows it. The person adds a test translation, builds the component, and sees the new text. The person changes no code. The result is in `docs/release-checklist.md`. |

### 5.7 Errors

All error text is in the message files. The component shows each error with `<wa-callout>`. The live region of SR-9 announces each error.

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-80 | P0 | Word list does not load. The request for a word list can give an HTTP error or a network error. In this case, the component shows an error message and a "Try again" button. It makes no password. The button sends the request again. | Automated: A test makes the server return HTTP 404 for a word list. The component shows the error and the button and no password. The test then lets the request succeed and clicks the button. The component shows a password. |
| FR-81 | P0 | Wrong word list hash. If the hash of a word list is wrong (SR-5), the component shows an error message. It makes no password and shows no "Try again" button. | Automated: A test changes one byte of a word list. The component shows the error, no password, and no button. |
| FR-82 | P0 | WASM module does not load. If the WASM module does not load, the component shows an error message and makes no password. Examples are an HTTP error, an SRI error (SR-13), and a CSP that blocks WASM. | Automated: A test page has a CSP without `'wasm-unsafe-eval'`. A second test makes the server return HTTP 500 for the WASM module. In each test, the component shows the error and no password. |
| FR-83 | P0 | Translation does not load. If the request for a translation gives an HTTP error or a network error, the component uses English. It writes a warning to the browser console and shows no error. If the translation has a wrong SRI hash (SR-13), the component shows an error and makes no password. | Automated: A test makes the server return HTTP 404 for a translation. The UI is in English, the console shows a warning, and the component shows a password. |
| FR-84 | P0 | Copy fails. If the clipboard write fails or the Clipboard API is not present, the component shows "Copy failed. Select the password and copy it." The user can still select the text in the password field. | Automated: A test removes `navigator.clipboard`. After a click on copy, the component shows the message. The test selects the password field. The selected text equals the password. |
| FR-85 | P0 | Page is not secure. If `window.isSecureContext` is false, the component shows an error and makes no password. The clipboard and the SRI hash test of `fetch` need HTTPS. The browser treats `localhost` as a secure context. | Automated: A test loads the page over plain HTTP from a host name that is not `localhost`. The component shows the error and no password. |
| FR-86 | P0 | Browser feature is not present. If the browser has no custom elements, the browser shows the content that the website owner puts inside `<hekate-generator>`. This content is fallback text. The README shows an example. If another feature of NFR-4 is not present, the component shows an error and makes no password. | Automated: A test page has fallback text inside the tag and removes `customElements`. The page shows the fallback text. A second test removes `WebAssembly`. The component shows the error and no password. |
| FR-87 | P0 | Error text. All error text of section 5.7 is in the message files. | Automated: The pseudo-locale test produces each error of section 5.7. No English text remains. |

## 6. Security requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| SR-1 | Hekate gets all random numbers from the secure random generator of the browser. It uses the Rust crate `getrandom` with the `wasm_js` feature. A crate is a Rust package. This feature calls the Web Crypto function `crypto.getRandomValues()`. Web Crypto is the browser API for cryptography. On the wasm32 target, the `wasm_js` feature is the only setting that `getrandom` needs. Hekate does not use `Math.random()`, start values from the clock, or its own random number generator. | Automated: `cargo tree` for the wasm32 target shows `getrandom` as the only crate that reads random data from the system. A CI test fails if the TypeScript code contains `Math.random`. It also fails if the Rust code contains `SystemTime`, `Instant`, `Date::now`, or `Math::random`. |
| SR-2 | Hekate makes each random choice without bias. Bias means that some values occur more often than others. Each word, the number, and the symbol are random choices. The position of the number, the position of the symbol, and the style of each word (FR-5) are also random choices. Each character in character mode is a random choice. Hekate uses rejection sampling, or uniform range sampling of the `rand` crate. Rejection sampling discards random values that cause bias and gets new ones. Uniform range sampling of the `rand` crate also discards these values. Hekate does not use plain modulo (`%`). | Automated: A unit test gives fixed random bytes to the code. The test makes sure that the code discards values above the rejection limit. A statistical test makes 10⁶ selections from a list of 7,776 words. A chi-square test of the 7,776 words (7,775 degrees of freedom) gives p > 0.001. |
| SR-3 | Fail closed. Fail closed means that Hekate stops when something is wrong. If Web Crypto is not available or gives an error, Hekate shows an error and makes no password. | Automated: A test removes `crypto.getRandomValues`. Hekate shows an error and no password. |
| SR-4 | The component loads the WASM module during its own start, before it shows the first password. After that, it makes no network requests, with two exceptions. The first time that the user selects a language, the component gets its word list from the asset host. The first time that the component uses a UI language other than English, it gets its translation from the asset host. The component collects no usage data and makes no requests to other servers. | Automated: A Playwright test records all requests. The test accepts only the component script, the WASM module, word lists, and translations from the asset host. |
| SR-5 | Hekate compares each word list with its SHA-256 hash. The command `cargo xtask wasm` puts the hashes into the WASM module. If the hashes are different, Hekate makes no password (FR-81). | Automated: A test changes a word list file. Hekate then makes no password. |
| SR-6 | The component works with a strict Content Security Policy (CSP) on the host page. A CSP is a set of rules that limits what a page can load. The README lists the minimum rules that a host page needs. These rules include `'wasm-unsafe-eval'` in `script-src`, and the origin of the asset host in `script-src` and `connect-src`. The component uses only constructed stylesheets. It puts no `<style>` elements and no `style` attributes in its markup. As a result, `style-src 'self'` is enough. The demo page uses the CSP that follows this table. | Automated: An end-to-end test runs the component on a host page with the minimum CSP from the README. The browser reports no CSP errors. |
| SR-7 | The asset host delivers all files of the component, including Web Awesome and its icons. The component loads no file from the CDN of Web Awesome or of Font Awesome. A CDN is a third-party server that delivers files. By default, the Web Awesome icon element loads icons from a CDN. To prevent this, Hekate registers its own icon library. The icons are inside the component script. | Automated: The SR-4 test passes. A second test blocks all requests to other hosts and shows every icon of the component. Each icon element contains an SVG image. |
| SR-8 | Hekate does not write data to the device of the user, and it does not read data from it. This rule includes `localStorage`, `sessionStorage`, IndexedDB, cookies, Cache Storage, and service workers. The README tells the person who deploys Hekate to send `Cache-Control: no-store` for all files. With this header, the browser keeps no copies of the files. Hekate never puts a password in a URL, a log, or an event. The clipboard is the one exception. If the user selects copy, Hekate writes the password to the clipboard (FR-9). Hekate does not clear the clipboard. A web page cannot clear the clipboard reliably after the user leaves the page. The password stays in the clipboard until the user copies other content. The README tells users this fact. | Automated: An end-to-end test uses the component and then reads all browser storage. The storage is empty. A second test does each action of the component. It records all URLs, the console output, and all events. The password text is in none of them. |
| SR-9 | Hekate does not send the password text to screen readers automatically. A screen reader is software that reads the screen aloud. After each new password, Hekate announces only "New password generated" through a live region. The same live region announces errors and the copy message. The user can go to the password field to hear the password. | Automated: A Playwright test reads the `aria-live` region after each action. After a new password, the text is "New password generated". The region never contains the password. |
| SR-10 | Supply chain. The supply chain is all the third-party code that Hekate uses. The lock files are in the repository. A lock file records the exact version of each dependency. CI runs `cargo deny` and `pnpm audit`. `cargo deny` tests the licenses, the sources, and the security advisories of the Rust dependencies. A security advisory is a published report of a known security problem. Anyone can rebuild a release from its git tag and get the same files. | Automated: CI stops the release if `cargo deny` or `pnpm audit` fails. The release workflow builds the tag again in a clean container. It compares the SHA-256 hash of each file with the release archive. One different file stops the release. |
| SR-11 | Trust in the host page. Scripts on the host page can read the password from the component. Hekate cannot prevent this. The README tells website owners this fact. It also tells them to load no third-party scripts on pages with the component. Examples of third-party scripts are analytics and advertisement scripts. | Automated: A CI test makes sure that the README has the section "Trust in the host page" with these two statements. Manual: Before each release, a person reads the section. The result is in `docs/release-checklist.md`. |
| SR-12 | Cross-origin access. The README tells the person who deploys Hekate to send `Access-Control-Allow-Origin: *` for every file in `dist/`. With this header, pages on other domains can load the files. The asset host sends no cookies and accepts no credentials. The asset host sends the WASM module with the `application/wasm` content type. | Automated: An end-to-end test loads the component from a second origin with the headers from the README. All requests succeed. |
| SR-13 | Subresource Integrity (SRI). SRI is a browser feature that refuses a file when its hash is not the expected hash. The README shows the script tag with the `integrity` and `crossorigin="anonymous"` attributes. `dist/<version>/` contains the SRI value of the component script. The component script is one file with no extra chunks. As a result, the SRI value covers all JavaScript. The component script contains the SHA-256 hashes of the WASM module and of the translation files. It fetches these files with the `integrity` option of `fetch`. The word lists keep the hash test of SR-5. | Automated: A test changes one byte of the component script, of the WASM module, of a translation, and of a word list. For each file, the browser or Hekate refuses the file and Hekate makes no password. |

The demo page uses this CSP:

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' http://localhost:18081; style-src 'self'; connect-src 'self' http://localhost:18081; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

## 7. Word lists

### 7.1 Content rules

Each word list follows these rules:

1. The list does not contain the most common words of the language. A frequency corpus ranks the words. A frequency corpus is a large set of text in which words are counted. Hekate skips the top `S` words in this ranking. Hekate takes words from the ranks after `S`, up to the rank limit `R`. The limit `R` keeps rare words out of the list, so native speakers know the words. The proposed values are `S` = 1,000 and `R` = 30,000. The benchmark in section 7.6 decides the final values.
2. The list has at least 4,096 different words. This size gives 12 bits per word. The target is 7,776 words, which gives 12.9 bits per word. The EFF and Diceware lists have the same size.
3. All words are lowercase, use the normal script of the language, and are 3 to 9 characters long. All words are in Unicode NFC form. NFC is a standard form that gives the same bytes for the same visible text.
4. The list does not contain names, abbreviations, words with digits or punctuation, or rude and offensive words.
5. The list does not contain errors from the source. Examples are typos, foreign words, and scanning errors. Each word must also be in the lexicon of the language. A lexicon is a list of correctly spelled words, for example a spelling dictionary.
6. The list has no duplicate words after conversion to NFC.
7. A word list changes only in a new release (FR-51). A change gives a new hash.

The most common words are mostly short grammar words, such as "the", "and", and "of". These words make dull passwords. When Hekate skips these words, the password does not become stronger. The strength depends only on the size of the list and on random selection (see Appendix A). The reason is that Hekate assumes that the attacker knows the list.

### 7.2 Sources and licenses

Hekate uses only word sources with a license that permits commercial use. These licenses are allowed, in no order: CC0, public domain, MIT, BSD, Apache-2.0, CC BY, GPL, LGPL, MPL, and EUPL. These licenses are not allowed:

- CC BY-SA and other ShareAlike licenses. A ShareAlike term requires that changed versions use the same license, and CC BY-SA forbids other licenses for the list.
- Licenses with NonCommercial terms (no commercial use) or NoDerivatives terms (no changed versions).
- Licenses for research use only, and sources without a clear license.

If a source offers a choice of licenses, Hekate selects the one with the fewest duties. The order of preference is: CC0 or public domain, then MIT, BSD, Apache-2.0, or CC BY, then MPL, then LGPL, then GPL or EUPL.

Each language uses two kinds of source: a frequency source and a lexicon. A language can use more than one frequency source. A frequency source ranks the words (rule 1 of section 7.1). A lexicon removes typos and other errors (rule 5). If a source offers a choice of licenses, the table shows the license that Hekate selects.

| Language | Frequency source | License | Lexicon | License |
|---|---|---|---|---|
| English (US) | [Google Books Ngram v3](https://storage.googleapis.com/books/ngrams/books/datasetsv3.html), American English corpus `eng-us` | CC BY 3.0 | [SCOWL / ESDB](https://github.com/en-wl/wordlist), size 60, spelling `A` (American) | MIT-style permission |
| English (UK) | Google Books Ngram v3, British English corpus `eng-gb` | CC BY 3.0 | SCOWL / ESDB, size 60, spelling `B` (British, with "-ise") | MIT-style permission |
| German | Google Books Ngram v3 | CC BY 3.0 | [Wikidata Lexemes](https://dumps.wikimedia.org/legal.html). Backup: [LibreOffice de_DE_frami](https://github.com/LibreOffice/dictionaries/tree/master/de). | CC0. Backup: GPL-2.0 or GPL-3.0. |
| French (France) | Google Books Ngram v3, French corpus `fre` | CC BY 3.0 | [LibreOffice fr](https://github.com/LibreOffice/dictionaries/tree/master/fr_FR) | MPL-2.0 |
| French (Canada) | Google Books Ngram v3, French corpus `fre`, with a Québec word list that the team writes (see the notes) | CC BY 3.0. The Québec word list uses MIT. | LibreOffice fr | MPL-2.0 |
| Spanish | Google Books Ngram v3 | CC BY 3.0 | [LibreOffice es](https://github.com/LibreOffice/dictionaries/tree/master/es) | MPL-1.1 (choice of GPL, LGPL, or MPL) |
| Italian | Google Books Ngram v3 | CC BY 3.0 | Wikidata Lexemes. Backup: [LibreOffice it_IT](https://github.com/LibreOffice/dictionaries/tree/master/it_IT). | CC0. Backup: GPL-3.0. |
| Portuguese (Portugal) | [ParlaMint 4.1](https://www.clarin.si/repository/xmlui/handle/11356/1912) `ParlaMint-PT` | CC BY 4.0 | [Natura / UMinho Hunspell pt_PT](https://natura.di.uminho.pt/wiki/doku.php?id=dicionarios:main) | MPL-1.1 (choice of GPL, LGPL, or MPL) |
| Portuguese (Brazil) | [ParlaIbero-BR](https://doi.org/10.7910/DVN/VTXNW3), version 2, speeches from 2009 or later | CC BY 4.0 | [VERO pt_BR](https://github.com/LibreOffice/dictionaries/tree/master/pt_BR) | MPL (choice of LGPL-3.0 or MPL) |
| Dutch | ParlaMint 4.1 `ParlaMint-NL`, and the Dutch speeches of `ParlaMint-BE` | CC BY 4.0 | [OpenTaal word list](https://github.com/OpenTaal/opentaal-wordlist) | BSD-3-Clause |
| Swedish | [Språkbanken Flex](https://sprakbanken.se/en/resources/flex) | CC BY 4.0 | [SALDO](https://sprakbanken.se/en/resources/saldo) (`saldo.xml`) | CC BY 4.0 |
| Norwegian (Bokmål) | [NB Språkbanken N-gram Bokmål](https://www.nb.no/sprakbanken/ressurskatalog/en/oai-nb-no-sbr-12/) | CC0 | [Norsk ordbank Bokmål 2005](https://www.nb.no/sprakbanken/ressurskatalog/en/oai-nb-no-sbr-5/) | CC BY 4.0 |
| Danish | [NST N-gram Danish](https://www.nb.no/sprakbanken/ressurskatalog/en/oai-nb-no-sbr-28/), with ParlaMint 4.1 `ParlaMint-DK` for newer words | CC0 and CC BY 4.0 | [COR, Det Centrale Ordregister](https://ordregister.dk/) | CC0 |
| Finnish | [Kielipankki Psycholinguistic Descriptives](https://www.kielipankki.fi/download/psychlingdesc/) (base forms) | CC BY 4.0 | [Kotus Nykysuomen sanalista 2024](https://kotus.fi/sanakirjat/kielitoimiston-sanakirja/nykysuomen-sana-aineistot/nykysuomen-sanalista/) | CC BY 4.0 |
| Polish | [KWJP100 frequency lists](https://github.com/ipipan/kwjp100-varia/tree/main/freqlists) (base forms) | CC BY 4.0 | [SJP.PL](https://sjp.pl/sl/en/) | Apache-2.0 (choice of GPL, LGPL, MPL, CC BY, or Apache) |

Notes on the sources:

- ParlaMint is a set of transcripts of debates in 29 European parliaments. CLARIN publishes it under CC BY 4.0. Each country has 9 to 126 million words, mostly from 2015 to 2022. The Portugal data goes to March 2024.
- ParlaMint has data for each launch language except Portuguese (Brazil) and English (US). ParlaMint is the backup frequency source for each of these other languages. English (UK) uses `ParlaMint-GB`. Both French lists use `ParlaMint-FR`, which is from France.
- Parliament speech uses many formal and political words. The "known words" measurement of the benchmark (section 7.6) finds lists with too many of these words.
- The Federal Register is the daily journal of the US government. It is in the public domain, because works of the US government have no copyright (17 U.S.C. §105). The bulk files are on [govinfo](https://www.govinfo.gov/bulkdata). The Federal Register is the backup frequency source for English (US).
- ParlaIbero-BR contains the speeches in the plenary of the Brazilian Câmara dos Deputados from 2003 to 2025, about 210 million words. Version 2 is from 2026-09-07. Hekate uses only rows with `dm_speech=1`.
- Hekate uses only ParlaIbero-BR speeches from 2009 or later. Older text uses the spelling from before the 1990 spelling agreement. The credit names the dataset, its DOI, and "Câmara dos Deputados" as the source of the text.
- The terms of the Câmara portal say that all its information is in the public domain. A copy must name "Câmara dos Deputados" as the source. The backup frequency source for Portuguese (Brazil) is a word count that the team makes from the speech transcripts of the [Câmara open data API](https://dadosabertos.camara.leg.br/).
- Google Books Ngram has no Canadian French corpus. Canada and France use the same spelling, and LibreOffice registers its French dictionary for `fr-CA`. The difference between the two French lists is in the choice of words.
- For this reason, French (Canada) adds a Québec word list (`extra-words.txt`, section 7.3). The team writes this list. It does not copy it from OQLF, Usito, Wiktionary, or other dictionaries. Examples are "dépanneur", "magasiner", "courriel", and "tuque". The reviewers can also block words that only people in France use.
- The two English lists differ mostly in spelling, for example "color" and "colour". The lexicon removes the words with the spelling of the other country. The UK list uses the "-ise" spelling ("organise"), because most UK texts use it.
- The Kielipankki Finnish data counts words from several sources, including Wikipedia. The dataset itself uses CC BY 4.0. Hekate uses this word count, but it does not use Wikipedia text directly. If the team does not accept frequency counts from CC BY-SA text, `ParlaMint-FI` replaces Kielipankki.
- The SALDO page has an old sentence that says "Share Alike". The download table and the license file in the download say CC BY. Hekate uses `saldo.xml` (CC BY 4.0).
- NST Danish contains newspaper text from 1995 to 1999. `ParlaMint-DK` adds newer words.
- Only German and Italian need GPL, and only as a backup lexicon. Wikidata Lexemes (CC0) is the first choice for both.
- The VERO pt_BR files offer a choice of LGPL-3.0 or MPL. Before the release, the team reads the VERO README and writes the MPL version in this table.

Download links:

Each source that Hekate uses has a direct download link. A direct download link gives the data file itself, not a web page about the file. The team tested each original link below with `curl` on 2026-10-06. The build (section 7.3) downloads the sources from these links.

Some sources have no version, remove old files, or block downloads by scripts. The team copies each of these sources one time into the `sources` release of the Hekate repository. A release of a GitHub repository can have attached files. The download table links to this copy and keeps the original link as a note. The team splits a copy into files of less than 2 GB, because GitHub limits the size of a release file.

| Source | Used for | Version | Direct download link |
|---|---|---|---|
| Google Books Ngram v3, `eng-us` | English (US) | 20200217 | 14 files, from [`1-00000-of-00014.gz`](https://storage.googleapis.com/books/ngrams/books/20200217/eng-us/1-00000-of-00014.gz) to `1-00013-of-00014.gz` in the same folder. Totals: [`totalcounts-1`](https://storage.googleapis.com/books/ngrams/books/20200217/eng-us/totalcounts-1) |
| Google Books Ngram v3, `eng-gb` | English (UK) | 20200217 | 4 files, from [`1-00000-of-00004.gz`](https://storage.googleapis.com/books/ngrams/books/20200217/eng-gb/1-00000-of-00004.gz) to `1-00003-of-00004.gz` in the same folder. Totals: [`totalcounts-1`](https://storage.googleapis.com/books/ngrams/books/20200217/eng-gb/totalcounts-1) |
| Google Books Ngram v3, `ger` | German | 20200217 | 8 files, from [`1-00000-of-00008.gz`](https://storage.googleapis.com/books/ngrams/books/20200217/ger/1-00000-of-00008.gz) to `1-00007-of-00008.gz` in the same folder. Totals: [`totalcounts-1`](https://storage.googleapis.com/books/ngrams/books/20200217/ger/totalcounts-1) |
| Google Books Ngram v3, `fre` | French (France), French (Canada) | 20200217 | 6 files, from [`1-00000-of-00006.gz`](https://storage.googleapis.com/books/ngrams/books/20200217/fre/1-00000-of-00006.gz) to `1-00005-of-00006.gz` in the same folder. Totals: [`totalcounts-1`](https://storage.googleapis.com/books/ngrams/books/20200217/fre/totalcounts-1) |
| Google Books Ngram v3, `spa` | Spanish | 20200217 | 3 files, from [`1-00000-of-00003.gz`](https://storage.googleapis.com/books/ngrams/books/20200217/spa/1-00000-of-00003.gz) to `1-00002-of-00003.gz` in the same folder. Totals: [`totalcounts-1`](https://storage.googleapis.com/books/ngrams/books/20200217/spa/totalcounts-1) |
| Google Books Ngram v3, `ita` | Italian | 20200217 | 2 files, [`1-00000-of-00002.gz`](https://storage.googleapis.com/books/ngrams/books/20200217/ita/1-00000-of-00002.gz) and `1-00001-of-00002.gz` in the same folder. Totals: [`totalcounts-1`](https://storage.googleapis.com/books/ngrams/books/20200217/ita/totalcounts-1) |
| SCOWL / ESDB | English (US), English (UK) | Tag `rel-2026.02.25` | [`rel-2026.02.25.tar.gz`](https://github.com/en-wl/wordlist/archive/refs/tags/rel-2026.02.25.tar.gz) |
| Wikidata Lexemes | German, Italian | Dump of 2026-09-30 | [`wikidata-20260930-lexemes.json.bz2`](https://dumps.wikimedia.org/wikidatawiki/entities/20260930/wikidata-20260930-lexemes.json.bz2) |
| LibreOffice de_DE_frami (backup) | German | Commit `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | [`de_DE_frami.dic`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/de/de_DE_frami.dic) and [`de_DE_frami.aff`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/de/de_DE_frami.aff) |
| LibreOffice fr | French (France), French (Canada) | Commit `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | [`fr.dic`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/fr_FR/dictionaries/fr.dic) and [`fr.aff`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/fr_FR/dictionaries/fr.aff) |
| LibreOffice es | Spanish | Commit `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | [`es_ES.dic`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/es/es_ES.dic) and [`es_ES.aff`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/es/es_ES.aff) |
| LibreOffice it_IT (backup) | Italian | Commit `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | [`it_IT.dic`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/it_IT/it_IT.dic) and [`it_IT.aff`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/it_IT/it_IT.aff) |
| VERO pt_BR | Portuguese (Brazil) | Commit `32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4` | [`pt_BR.dic`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/pt_BR/pt_BR.dic) and [`pt_BR.aff`](https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/pt_BR/pt_BR.aff) |
| Natura / UMinho Hunspell pt_PT | Portuguese (Portugal) | 20251001, spelling after the 1990 agreement | [`hunspell-pt_PT-20251001.tar.gz`](http://natura.di.uminho.pt/download/sources/Dictionaries/hunspell/hunspell-pt_PT-20251001.tar.gz) |
| ParlaMint 4.1, `ParlaMint-PT` | Portuguese (Portugal) | 4.1 | [`ParlaMint-PT.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-PT.tgz?sequence=24&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-NL` | Dutch | 4.1 | [`ParlaMint-NL.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-NL.tgz?sequence=21&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-BE` | Dutch | 4.1 | [`ParlaMint-BE.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-BE.tgz?sequence=3&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-DK` | Danish | 4.1 | [`ParlaMint-DK.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-DK.tgz?sequence=6&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-FI` (backup) | Finnish | 4.1 | [`ParlaMint-FI.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-FI.tgz?sequence=12&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-GB` (backup) | English (UK) | 4.1 | [`ParlaMint-GB.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-GB.tgz?sequence=14&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-FR` (backup) | French (France), French (Canada) | 4.1 | [`ParlaMint-FR.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-FR.tgz?sequence=13&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-AT` (backup). This file contains the debates of the parliament of Austria. | German | 4.1 | [`ParlaMint-AT.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-AT.tgz?sequence=1&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-ES` (backup) | Spanish | 4.1 | [`ParlaMint-ES.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-ES.tgz?sequence=8&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-IT` (backup) | Italian | 4.1 | [`ParlaMint-IT.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-IT.tgz?sequence=19&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-SE` (backup) | Swedish | 4.1 | [`ParlaMint-SE.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-SE.tgz?sequence=26&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-NO` (backup) | Norwegian (Bokmål) | 4.1 | [`ParlaMint-NO.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-NO.tgz?sequence=22&isAllowed=y) |
| ParlaMint 4.1, `ParlaMint-PL` (backup) | Polish | 4.1 | [`ParlaMint-PL.tgz`](https://www.clarin.si/repository/xmlui/bitstream/handle/11356/1912/ParlaMint-PL.tgz?sequence=23&isAllowed=y) |
| ParlaIbero-BR | Portuguese (Brazil) | Version 2 | [`BR_interventions.csv`](https://dataverse.harvard.edu/api/access/datafile/14215092). The full dataset of version 2 is a [zip file](https://dataverse.harvard.edu/api/access/dataset/:persistentId/versions/2?persistentId=doi:10.7910/DVN/VTXNW3). |
| Câmara dos Deputados open data API (backup) | Portuguese (Brazil) | API v2. The API has no versions. The copy date is in the manifest. | A copy in the `sources` release of the Hekate repository. The team gets the JSON files from the API one time and keeps them as one archive. Original: the Câmara has no bulk file for speeches. First, the team gets the list of deputies for each legislature, for example [legislature 57](https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=57&itens=100&pagina=1). Then the team gets the speeches of each deputy, for example [deputy 220593 in 2023](https://dadosabertos.camara.leg.br/api/v2/deputados/220593/discursos?dataInicio=2023-02-01&dataFim=2023-12-31&itens=100&pagina=1&ordenarPor=dataHoraInicio&ordem=ASC). |
| Federal Register (backup) | English (US) | The source has no versions. The copy date is in the manifest. | A copy in the `sources` release of the Hekate repository. Original: one zip file for each year, for example [`FR-2025.zip`](https://www.govinfo.gov/bulkdata/FR/2025/FR-2025.zip). The link for another year has the same form. |
| OpenTaal word list | Dutch | Tag `2.20.19` | [`wordlist.txt`](https://raw.githubusercontent.com/OpenTaal/opentaal-wordlist/2.20.19/wordlist.txt) |
| Språkbanken Flex | Swedish | The source has no versions. The copy date is in the manifest. | A copy in the `sources` release of the Hekate repository. Original: [`flex.csv.zip`](https://spraakbanken.gu.se/resurser/data/flex.csv.zip) |
| SALDO | Swedish | The source has no versions. The copy date is in the manifest. | A copy in the `sources` release of the Hekate repository. Original: [`saldo.xml`](https://svn.spraakbanken.gu.se/sb-arkiv/pub/lmf/saldo/saldo.xml) |
| NB Språkbanken N-gram Bokmål | Norwegian (Bokmål) | The source has no versions. The copy date is in the manifest. | A copy in the `sources` release of the Hekate repository. Original: [`1gram_nob_f1_freq.zip`](https://www.nb.no/sbfil/tekst/1gram_nob_f1_freq.zip) |
| Norsk ordbank Bokmål 2005 | Norwegian (Bokmål) | 20220201 | [`20220201_norsk_ordbank_nob_2005.tar.gz`](https://www.nb.no/sbfil/leksikalske_databaser/ordbank/20220201_norsk_ordbank_nob_2005.tar.gz) |
| NST N-gram Danish | Danish | The source has no versions. The copy date is in the manifest. | A copy in the `sources` release of the Hekate repository, in several files. Original: [`ngram_dan.tar.gz`](https://www.nb.no/sbfil/tekst/ngram_dan.tar.gz). The file is 8.1 GB. It has no separate file for single words. |
| COR, Det Centrale Ordregister | Danish | 1.5.1.0 | [`cor1.5.1.0.tsv`](https://ordregister.dk/files/cor1.5.1.0.tsv) |
| Kielipankki Psycholinguistic Descriptives | Finnish | The source has no versions. The copy date is in the manifest. | A copy in the `sources` release of the Hekate repository. Original: [`psychlingdesc.zip`](https://www.kielipankki.fi/download/psychlingdesc/psychlingdesc.zip) |
| Kotus Nykysuomen sanalista | Finnish | 2024 | A copy in the `sources` release of the Hekate repository. Original: [`nykysuomensanalista2024.txt`](https://kaino.kotus.fi/lataa/nykysuomensanalista2024.txt). A Cloudflare bot filter blocks downloads by scripts. A browser can download the file. |
| KWJP100 frequency lists | Polish | Commit `26d82bd8b906dfed1cfcf8f903b1650b56daeabf` | [`kwjp100-slowa-lemma-all.csv.gz`](https://raw.githubusercontent.com/ipipan/kwjp100-varia/26d82bd8b906dfed1cfcf8f903b1650b56daeabf/freqlists/kwjp100-slowa-lemma-all.csv.gz) |
| SJP.PL | Polish | 20260901 | A copy in the `sources` release of the Hekate repository. Original: [`sjp-20260901.zip`](https://sjp.pl/sl/growy/sjp-20260901.zip). SJP.PL keeps only the newest file. The original link stops working when a new file comes out. |

The Québec word list for French (Canada) has no download link, because the team writes it in the Hekate repository.

Sources that Hekate does not use:

| Source | Reason |
|---|---|
| hermitdave/FrequencyWords, rspeer/wordfreq, Wikipedia | These sources use CC BY-SA. Hekate does not use Wikipedia text directly. The Kielipankki word count includes Wikipedia, and Hekate uses that count (see the notes). |
| Leipzig Corpora Collection | The team cannot use this source. |
| SUBTLEX-NL, SUBTLEX-PT-BR, LexPorBR, NoWaC, Corpus Carolina, Aurora-PT, BrPoliCorpus, QFrCoLA | These sources have NonCommercial, NoDerivatives, or ShareAlike terms. |
| Common Voice sentences | The source is too small to rank 30,000 words. Most French sentences come from Wikipedia. |
| Web crawls: GigaVerbo, ClassiCC-PT, HPLT, FineWeb-2 | The license covers only the collection. The text of each web page keeps its own copyright. |
| OpenSubtitles | The source has no license. |
| Agência Brasil | Commercial use needs a paid license. |
| Debates of the House of Commons and the Senate of Canada, and of the Assemblée nationale du Québec | Commercial use needs written permission. |
| OQLF data (Grand dictionnaire terminologique, Banque de dépannage linguistique) | Any copy needs permission. The open datasets use CC BY-NC-SA. |
| SUBTLEX-PT, Linguateca frequency lists, TurkuNLP Parsebank | These sources have no license. |
| CETEMPúblico, Corpus do Português, INT frequency lists | These sources are for research use only, need payment, or need an account. |
| DSL frequency lists (Danish) | The source has a custom license. The license forbids products that compete with DSL. |
| BIP-39 word lists | Each list has only 2,048 words (11 bits per word). The lists have no frequency data. |
| EFF large word list | The list is English only. It has no frequency data. |

Effect of the licenses:

- CC BY permits commercial use and changes. It requires credit to the source (attribution), a link to the license, and a note that the work was changed. FR-30 shows these items.
- GPL, LGPL, MPL, and EUPL are copyleft licenses. A copyleft license requires that changed versions use the same license. A word list made from such a source keeps that license. This rule also applies when the source is only the lexicon, because all words in the list come from the lexicon.
- Hekate keeps each word list in a separate file in `wordlists/<lang>/`, with its own `LICENSE` file and credits. All other code stays under MIT.
- The build never puts a word list file inside the WASM module, the component script, or any other code file. The `dist/` folder contains the lists as separate files. These separate files keep the copyleft rule on the list file only. They also protect website owners who bundle the component into their own code.
- For a GPL or EUPL list, the Credits dialog (FR-30) shows the license and links to the build files of the list in the Hekate repository. The build files include the configuration file of section 7.3.
- The Credits dialog gives the credit on each website that embeds the component.

### 7.3 Build process

A Rust command, `cargo xtask wordlists`, builds all word lists. For each language, the command does these steps in this order:

1. Read the configuration file `wordlists/<lang>/config.toml`. This file contains the sources, their download links, their SHA-256 hashes, their licenses, `S`, `R`, `N`, the length limits, and the ASCII rules. `N` is the target size of the list.
2. Read the block list `wordlists/<lang>/blocklist.txt`. This list contains rude words and other unwanted words.
3. If the language has an extra word list, read `wordlists/<lang>/extra-words.txt`. `E` is the number of extra words.
4. For each source, look for the counted result in the cache. In CI, the cache is the CI cache. On the computer of a developer, the cache is `target/wordlist-sources/`. The cache key is the SHA-256 hash of the source plus the version of the `xtask` code that counts it. If the cache has the result, go to step 6.
5. Stream the source. The command downloads, decompresses, and counts the words in one pass and does not store the full file. It computes the SHA-256 hash during the stream. If the hash is wrong, discard the result and stop with an error.
6. Convert all words to NFC.
7. Remove the words that are outside the script or the length limits of the language.
8. Remove the words that are not in the lexicon.
9. Remove the top `S` ranks.
10. Remove the words of the block list.
11. Remove duplicate words.
12. If fewer than `N − E` words remain between rank `S` and rank `R`, stop with an error.
13. Take the next `N − E` words in rank order, but not past rank `R`.
14. Add the extra words. If `E` is more than 10% of `N`, stop with an error.
15. If the list does not have exactly `N` words, stop with an error. If `N` is less than 4,096, stop with an error.
16. Make the ASCII list (section 7.4).
17. Write `words.txt`, `words-ascii.txt`, and `manifest.json` in `wordlists/<lang>/`.

The manifest contains the word count, the entropy per word, the sources, and the version or the copy date of each source. It also contains the licenses and the credit text of each source. It contains the name of the language in that language, for example "Svenska". Last, it contains the SHA-256 hash of each list and the value `ascii_same` (section 7.4).

The command gives the same output, byte for byte, for the same input. CI runs the word list rebuild on every pull request. CI builds only the sources that the configuration files name. CI uses a backup source only after the team changes a configuration file. CI applies all filters, builds all lists, and compares them byte for byte with the lists in git. The CI job has a time limit of 60 minutes.

The team does this work by hand:

- If the file of a source changes, its hash is not correct and the command stops. The team then reviews the new file and updates the hash.
- A link can stop working, or a script cannot use it. In this case, the team keeps a copy of the file in the `sources` release (section 7.2). All allowed licenses permit this copy. The copy keeps the license file and the credits of the source.
- Native-speaker reviewers keep the block list up to date.
- The team writes the extra words. Rule 5 (lexicon) does not apply to extra words. Instead, a native-speaker reviewer approves each extra word. Each extra word follows rules 3, 4, and 6 of section 7.1.

Before release, at least one native speaker reviews each new language. For a language with two variants, the reviewer comes from the country of the variant. For example, a reviewer from Québec reviews French (Canada). The reviewer reads the list for unknown words, rude words, grammar words, spelling errors, and words of the other variant. The reviewer records the result, the name, and the date in `docs/release-checklist.md`. If the reviewer does not approve the list, the language is not released.

### 7.4 ASCII word lists (FR-10)

Every language has an ASCII word list. The ASCII word lists follow these rules:

1. Each language has its own rules to convert letters to ASCII (table 7.1).
2. After the conversion, Hekate removes each word that still contains a character outside ASCII.
3. Hekate then removes duplicates. If two words become the same, Hekate removes both words.
4. The ASCII list has at least 4,096 words.
5. If all words of a list are already ASCII, the ASCII list is the same as the main list. The build still writes `words-ascii.txt`, and the manifest sets `ascii_same` to `true`.

"Remove accents" means: replace a letter with an accent mark by the same letter without the mark, for example `é→e`, `è→e`, `ê→e`, and `ë→e`.

Table 7.1: ASCII conversion rules.

| Language | Conversion |
|---|---|
| English (US), English (UK) | Remove accents (`é→e`). |
| German | `ä→ae`, `ö→oe`, `ü→ue`, `ß→ss` |
| French (France), French (Canada) | Remove accents. `ç→c`, `œ→oe`, `æ→ae` |
| Spanish | Remove accents. `ñ→n`, `ü→u` |
| Italian | Remove accents. |
| Portuguese (Portugal), Portuguese (Brazil) | Remove accents and tildes (`ã→a`, `õ→o`). `ç→c` |
| Dutch | Remove accents and diaereses (`ë→e`, `ï→i`). |
| Swedish | `å→a`, `ä→a`, `ö→o` |
| Norwegian (Bokmål) | `æ→ae`, `ø→oe`, `å→aa` |
| Danish | `æ→ae`, `ø→oe`, `å→aa` |
| Finnish | `ä→a`, `ö→o`, `å→a` |
| Polish | `ą→a`, `ć→c`, `ę→e`, `ł→l`, `ń→n`, `ó→o`, `ś→s`, `ź→z`, `ż→z` |

### 7.5 Languages at launch (v1.0)

Version 1.0 has 15 word list languages:

| Code | Language |
|---|---|
| `en-US` | English (US) |
| `en-GB` | English (UK) |
| `de` | German |
| `fr-FR` | French (France) |
| `fr-CA` | French (Canada) |
| `es` | Spanish |
| `it` | Italian |
| `pt-PT` | Portuguese (Portugal) |
| `pt-BR` | Portuguese (Brazil) |
| `nl` | Dutch |
| `sv` | Swedish |
| `nb` | Norwegian (Bokmål) |
| `da` | Danish |
| `fi` | Finnish |
| `pl` | Polish |

English, French, and Portuguese each have two variants. Each variant is a separate language with its own word list, because the spelling or the words are different. In this document, "language" means one row of this table. Table 5.1 shows which browser value selects which variant.

The team releases a language only when all these conditions are true:

- The list follows section 7.1.
- The ASCII list has at least 4,096 words.
- The list passes the benchmark of section 7.6.
- A native speaker approved the list (section 7.3).

If a language does not meet these conditions in time, it moves to a later release. It does not block v1.0.

### 7.6 Benchmark for `S` and `R`

The team selects `S` and `R` with a benchmark before the word lists are final. The benchmark runs for each language. The benchmark is a command of `xtask`. Its results are in `wordlists/benchmark/`.

The `xtask` command builds the list for each combination of `S` and `R`. It tests these values of `S`: 0, 500, 1,000, and 2,000. It tests these values of `R`: 20,000, 30,000, and 50,000.

For each combination, the benchmark records these measurements:

| Measurement | How the team gets it |
|---|---|
| List size | The command counts the words between rank `S` and rank `R` after all filters. |
| Average word length | The command computes the average number of characters per word. |
| Known words | The command selects 200 random words from the list with a fixed seed and stores them in `wordlists/benchmark/`. Two native speakers each rate the same 200 words as "known" or "not known". The value is the mean of the two percentages of known words. |
| Grammar words | The same two native speakers each count the grammar words among the 100 words with the highest frequency in the list. The value is the mean of the two counts. Grammar words are articles, pronouns, prepositions, conjunctions, and auxiliary verbs. |

The team selects the values for each language with these rules:

1. Use only combinations with a list size of 7,776 words or more. If no combination reaches 7,776, use the largest list of at least 4,096 words.
2. Use only combinations with 95% or more known words.
3. Use only combinations with 2 or fewer grammar words.
4. From the remaining combinations, select the smallest `S`, and then the smallest `R`.

If no combination meets rules 2 and 3, the language does not ship in v1.0.

## 8. User interface

### 8.1 Framework

The component uses Web Awesome as follows:

- The component uses the free edition of Web Awesome, version 3.14.0. `package.json` and `pnpm-lock.yaml` fix this exact version. The build installs it from npm (`@awesome.me/webawesome`) and puts it inside the component script.
- An upgrade of Web Awesome follows the steps in `CONTRIBUTING.md`.
- The component does not use Web Awesome Pro components, themes, or patterns.
- The component loads the Web Awesome theme CSS inside its shadow root, not on the host page.
- Hekate registers the Web Awesome elements under the prefix `hekate-wa-` (FR-50). The new names prevent conflicts with a host page that also loads Web Awesome.

### 8.2 Layout

The table shows the Web Awesome component for each element. The team can use a different Web Awesome component with the same function. In the build, each `wa-` name gets the `hekate-wa-` prefix (FR-50).

| Element | Web Awesome component |
|---|---|
| Password, in large monospace text | `<wa-input readonly>` or text with CSS, with `<wa-copy-button>` |
| Button for a new password | `<wa-button variant="brand">` |
| Strength bar and label | `<wa-progress-bar>`, `<wa-badge>`, the entropy text with an info icon, and an info panel with the notes of FR-20 and FR-21, the time to crack, and the line of FR-24 |
| Mode (Words or Characters) | `<wa-radio-group>` with radio buttons, shown as a segmented control |
| Language (word mode) | `<wa-select>`, with the name of each language in that language, for example "Svenska" and "Deutsch". The names come from the word list manifests (FR-70). |
| Number of words (word mode) | `<wa-slider>` (3 to 10) with the numbers under the track and a caption "N words" |
| Separator and capital letter style (word mode) | `<wa-radio-group>` for each, with radio buttons that show an example and have a caption under the group |
| Number, symbol, and "Basic English letters only (ASCII)" options (word mode) | `<wa-switch>` |
| No same character twice in a row (both modes) | `<wa-switch>` |
| Length (character mode) | `<wa-slider>` (8 to 64) |
| Character sets (character mode) | `<wa-checkbox>` for each set |
| Avoid similar characters (character mode) | `<wa-switch>` |
| Errors (section 5.7) | `<wa-callout>` |
| Credits | A small link that opens `<wa-dialog>` |

### 8.3 Rules for the user experience

The UI follows these rules:

- The component shows a password when it starts. The user does not have to click.
- In word mode, separators, numbers, and symbols have a different color and a different font weight. As a result, the user can see where each word starts and ends without color. In character mode, digits and symbols have a different color and a different font weight. A copy gives plain text only.
- Each colored text has a contrast ratio of 4.5:1 or more against its background, in the light theme and in the dark theme.
- Each control is at least 44 px high.
- While a word list loads, the old password stays dimmed. The New password and Copy buttons are disabled.
- The look uses an indigo brand color. Text on the brand color has a contrast ratio of 4.5:1 or more. The custom property `--hekate-color-on-brand` sets the text color on the main button and on the selected mode button. Its default is white.
- The password field, the buttons, and the lists have rounded corners. The action buttons are in two columns.
- When `prefers-reduced-motion` is set, the component has no hover lift and no icon turn.
- The separator and the capital letters each fit on one row at a parent width of 320 px (FR-4, FR-5). The number of words is a slider. The user changes each of them with one click.
- The UI text follows section 5.6.

### 8.4 Accessibility of the controls

Each control has a label from the message files and a keyboard action. NFR-3 and NFR-8 test these rules.

| Control | Label | Keyboard action |
|---|---|---|
| Password field | "Password" | Tab moves the focus to the field. The user can select the text. |
| New password button | "New password" | Enter or Space makes a new password. |
| Copy button | "Copy password" | Enter or Space copies the password. |
| Mode | "Password type" | The arrow keys select "Words" or "Characters". |
| Language | "Word language" | Enter or Space opens the list. The arrow keys move. Enter selects. |
| Number of words | "Number of words" | The arrow keys change the value by 1. Home selects 3 and End selects 10. |
| Separator | "Separator" | The arrow keys move the selection. Space selects the focused button. |
| Capital letters | "Capital letters" | The arrow keys move the selection. Space selects the focused button. |
| Number, symbol, "Basic English letters only (ASCII)", avoid similar characters, and no same character twice in a row | One label for each option | Space turns the option on or off. |
| Length | "Length" | The arrow keys change the value by 1. Home selects 8 and End selects 64. |
| Character sets | "Character sets", with the hint "Keep at least one character set on.", and one label for each set | Space turns the set on or off. |
| Credits link | "Credits" | Enter opens the dialog. Escape closes it, and the focus goes back to the link. |
| Entropy info icon | "About password strength" | Keyboard focus on the icon opens the panel, and the focus stays on the icon. Enter or Space opens the panel and moves the focus to its heading. Enter or Space on the icon again closes it. Escape or Close closes it, and the focus goes back to the icon. Tab from the icon goes to Close. Tab out of the panel closes it. |

## 9. Technical design

The project has these folders:

| Folder | Technology | Job |
|---|---|---|
| `crates/hekate-core/` | Rust library. It has no I/O and no `wasm-bindgen`. | It does the random selection, puts the password together in both modes, and computes the entropy. |
| `crates/hekate-wasm/` | Rust with `wasm-bindgen` | It is the API for JavaScript. It gets random numbers through `getrandom` (`wasm_js`). It loads word lists and makes sure that their hashes are correct. |
| `packages/component/` | TypeScript and Lit, built with Vite | It is the `<hekate-generator>` web component with the Web Awesome UI and the message files. It calls `hekate-wasm`. Lit is the library that Web Awesome uses for its own components. |
| `apps/demo/` | HTML | It is a test page for development and end-to-end tests. It is not a product. |
| `tests/e2e/` | TypeScript and Playwright | It contains the end-to-end tests. They test the files in `dist/` in a browser. |
| `dev/` | Dockerfile and nginx configuration | It is the local web server for development and tests (section 9.1). It is not a product. |
| `xtask/` | Rust | It is the build tool. It builds the word lists, runs the benchmark, builds the WASM module, and makes `dist/`. |
| `wordlists/` | Data with its own licenses | It contains the configuration file of each word list, the built word lists, their manifests, and the benchmark results. |

Section 9.2 shows where each folder is in the repository.

Design rules:

- All logic that makes passwords and computes entropy is in Rust. TypeScript only controls the UI state, the UI text, and calls to the WASM API.
- `hekate-core` gets the random generator as a parameter. As a result, tests can give it fixed bytes, and the tests run without a browser.
- Word lists are separate static files. The component loads a list the first time that the user selects its language. It keeps the list in memory until the user closes the page. All components on one page share the loaded lists (FR-44).
- The lists are not inside the WASM module, so the first download stays small. The hashes of the lists are inside the module (SR-5).
- The component finds the folder of its files from the URL of its own script (`import.meta.url`), unless `assets-url` is set (FR-43).
- The build pipeline makes all files in `dist/<version>/` (FR-46). The person who deploys Hekate selects the web server and the domain. The asset host must send the headers of SR-8 and SR-12.

Example for a website owner:

```html
<script type="module"
  src="https://<asset-host>/2026.10.06-1432/hekate.js"
  integrity="sha384-<value from dist/2026.10.06-1432/>"
  crossorigin="anonymous"></script>
<hekate-generator language="sv" words="5" separator="-">
  Your browser cannot show the password generator.
</hekate-generator>
```

Suggested WASM API:

```ts
loadWordlist(lang: string, ascii: boolean, bytes: Uint8Array): void   // checks SHA-256, throws on mismatch
drawWords(lang: string, ascii: boolean, words: number, noRepeat: boolean): WordDraw
WordDraw.render(separator: "none" | "-" | "." | "_" | "space",
                capitalization: "lower" | "title" | "random",
                number: boolean, symbol: boolean): Generated   // same words every time
generateCharacters(length: number, charsets: number /* bit mask 1,2,4,8 */,
                   avoidSimilar: boolean, noRepeat: boolean): Generated
Generated: { password; kinds; entropyBits; crackSeconds; strength;
             naiveEntropyBits; naiveCrackSeconds; naiveStrength }
```

A `WordDraw` holds the random choices of one password. It gives the same words for all styles (FR-11).

### 9.1 Development environment

For development and tests, the team uses a web server in a Docker container. The default server is nginx. A similar static web server, such as Caddy, is also permitted. The server sends the same headers as a real deployment. As a result, the tests find header errors early.

The development environment follows these rules:

- The repository contains a `Dockerfile` and the server configuration in `dev/`. The team does not use Docker Compose. The README gives the `docker build` and `docker run` commands that start the environment.
- The `docker run` command mounts `dist/` and `apps/demo/` as read-only folders and publishes ports 18080 and 18081.
- The Docker container serves the `dist/` folder and the `apps/demo/` page. It does not build them. The build pipeline builds them on the computer of the developer or in CI.
- The Docker container sends all headers that the README requires. These headers are `Cache-Control: no-store` (SR-8), `Access-Control-Allow-Origin: *` and the `application/wasm` content type (SR-12), and the CSP of the demo page (SR-6).
- The Docker container serves on two origins: `http://localhost:18080` for the demo page and `http://localhost:18081` for the asset files. As a result, the tests load the component from a second origin (FR-43, SR-12).
- CI uses the same Docker container and configuration for the end-to-end tests (FR-46). There is only one server configuration, for development and for CI.
- The README for website owners uses the server configuration as an example of a correct deployment.

### 9.2 Repository structure

Hekate is a monorepo. A monorepo is one repository that contains all folders of a project. All Rust packages are in one Cargo workspace. All TypeScript packages are in one pnpm workspace. A workspace is a group of packages that share one lock file and one set of tool versions.

```text
hekate/
├── .cargo/
│   └── config.toml           Alias for `cargo xtask`.
├── .github/
│   ├── ISSUE_TEMPLATE/       Bug, new language, translation, word list problem
│   └── pull_request_template.md
├── apps/
│   └── demo/                 Demo and test page. Not a product.
├── crates/
│   ├── hekate-core/          Rust library: selection, assembly, entropy
│   │   ├── src/
│   │   ├── tests/
│   │   └── mutants-equivalent.txt   Equivalent mutants, each with a reason (TDD-4)
│   └── hekate-wasm/          Rust API for JavaScript (wasm-bindgen)
│       ├── src/
│       └── tests/            wasm-bindgen-test
├── dev/
│   ├── Dockerfile
│   └── nginx.conf
├── docs/
│   ├── PRD.md
│   └── release-checklist.md  Results of the Manual criteria for each release
├── packages/
│   └── component/            <hekate-generator> (TypeScript, Lit, Vite)
│       ├── src/
│       ├── locales/          en.json and the other message files
│       ├── test/
│       ├── wasm/             Generated by `cargo xtask wasm`. Not in git.
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── tests/
│   └── e2e/                  Playwright tests. A separate pnpm package.
├── wordlists/
│   ├── <lang>/               One folder for each language code, for example en-US
│   │   ├── config.toml       Sources, download links, hashes, S, R, N, length limits, ASCII rules
│   │   ├── blocklist.txt
│   │   ├── extra-words.txt   Only for some languages, for example fr-CA
│   │   ├── words.txt         Built list. In git.
│   │   ├── words-ascii.txt   Built list. In git.
│   │   ├── manifest.json
│   │   ├── LICENSE
│   │   └── CREDITS.md
│   └── benchmark/            Benchmark results and the 200-word samples (section 7.6)
├── xtask/                    Rust build tool
│   └── src/
├── dist/                     Build output, one folder for each version. Not in git.
│   └── <version>/
├── Cargo.toml                Cargo workspace: crates/*, xtask
├── Cargo.lock
├── rust-toolchain.toml       Fixed Rust version and the wasm32 target
├── rustfmt.toml
├── deny.toml                 Configuration for cargo deny
├── about.toml                Configuration for cargo about
├── package.json              pnpm workspace root. Private. Fixed pnpm version.
├── pnpm-workspace.yaml       pnpm workspace: apps/*, packages/*, tests/e2e
├── pnpm-lock.yaml
├── tsconfig.base.json        Shared TypeScript configuration
├── eslint.config.js
├── .prettierrc.json
├── .node-version             Fixed Node.js version
├── .editorconfig
├── .gitattributes
├── .gitignore
├── LICENSE                   MIT
├── NOTICE                    Credits for all word list sources
├── CHANGELOG.md              One entry for each version
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── CODE_OF_CONDUCT.md
```

The folders have these jobs:

- `crates/` contains Rust libraries.
- `packages/` contains TypeScript libraries.
- `apps/` contains pages that run in a browser but are not products.
- `tests/e2e/` contains the tests that use more than one package. Each package keeps its own unit tests in its own folder.
- `xtask/` contains the build tool. `wordlists/` contains data. `dev/` contains the development server. `docs/` contains the documentation for the project.

The repository follows these rules:

1. Each workspace has one lock file, in the root: `Cargo.lock` and `pnpm-lock.yaml`.
2. The root fixes the version of each tool. `rust-toolchain.toml` fixes the Rust version. `.node-version` fixes the Node.js version. The `packageManager` field in `package.json` fixes the pnpm version.
3. Shared configuration is in the root, for example `tsconfig.base.json`, `rustfmt.toml`, and `eslint.config.js`. A package changes a shared value only in its own configuration file, for example `packages/component/tsconfig.json`.
4. The packages depend on each other in one direction only. `hekate-core` depends on no other package. `hekate-wasm` depends only on `hekate-core`. The component depends only on the files in its `wasm/` folder, which `hekate-wasm` makes.
5. `apps/demo/` and `tests/e2e/` use only the files in `dist/`. `xtask` can use `hekate-core`, for example to compute the entropy per word. No other package depends on `xtask`, `apps/`, or `tests/`.
6. `cargo xtask` is the one entry point for tasks that use both workspaces. `cargo xtask wordlists` builds the word lists (section 7.3).
7. `cargo xtask wasm` reads each `wordlists/<lang>/manifest.json` and puts the hashes into the WASM module. It builds the WASM module and writes its JavaScript bindings to `packages/component/wasm/`.
8. `cargo xtask dist` runs `cargo xtask wordlists`, then `cargo xtask wasm`, then the pnpm build of the component. It then copies all files into `dist/<version>/` (FR-46).
9. Generated files are not in git: `target/`, `node_modules/`, `dist/`, and `packages/component/wasm/`. The built word lists are an exception. They are in git, because reviewers read them and CI compares them with a new build (section 7.3).
10. The build keeps the counted results of the word sources in `target/wordlist-sources/`. It does not keep the full source files. The counted results are not in git.
11. `.gitattributes` sets `eol=lf` for all text files in `wordlists/`. As a result, the bytes and the SHA-256 hash of each list are the same on all operating systems.
12. Rust unit tests are in the same file as the code. Rust integration tests are in `crates/<crate>/tests/`. Component tests are in `packages/component/test/`. End-to-end tests are in `tests/e2e/`.
13. The name of each test that covers a requirement contains the requirement ID (TDD-2).

## 10. Non-functional requirements

A non-functional requirement tells how well the product must work.

| ID | Area | Requirement | Acceptance criteria |
|---|---|---|---|
| NFR-1 | Speed and size | The WASM module is 100 KB or less after gzip compression. Each word list file is 40 KB or less after gzip compression. One call to `generate` takes 5 ms or less in word mode and in character mode. | Automated: A CI step measures the gzip size of the WASM module and of each word list file in `dist/<version>/`. It fails the build if a file is too large. A Playwright test in CI runs 1,000 calls to `generate` in each mode in Chrome with the CPU slowed down 4 times. The 95th percentile of the call times is 5 ms or less. |
| NFR-2 | Speed and quality | On the demo page, the mobile Lighthouse scores for Performance, Accessibility, and Best Practices are 95 or more. | Automated: CI runs Lighthouse with the mobile preset on the demo page. Each of the three scores is 95 or more. |
| NFR-3 | Accessibility | The component meets WCAG 2.2 level AA. All functions work with a keyboard. Each control has the label and the keyboard action of section 8.4. | Automated: CI runs axe on the component in each mode. axe reports no violations. A Playwright test does each keyboard action of section 8.4. Manual: Before each release, a person does each action of section 8.4 with VoiceOver in Safari on macOS and with NVDA in Firefox on Windows. The result is in `docs/release-checklist.md`. |
| NFR-4 | Browsers | Hekate supports the last 2 major versions of Chrome, Edge, Firefox, and Safari. It also supports iOS Safari 17 and later, and Android Chrome. The browser must support WebAssembly, Web Crypto, custom elements, shadow DOM, container queries, `Intl`, the Clipboard API, `::part()`, `import.meta.url`, `adoptedStyleSheets`, and secure contexts. | Automated: CI runs Playwright with Chromium, Firefox, and WebKit. All P0 end-to-end tests pass in each browser. |
| NFR-5 | Tests | Rust unit tests cover 90% or more of the lines in `hekate-core`. `wasm-bindgen-test` runs in headless Chrome and Firefox. Playwright end-to-end tests cover all P0 requirements. | Automated: `cargo llvm-cov` reports 90% or more line coverage for `hekate-core`. The `wasm-bindgen-test` job passes in both browsers. The TDD-2 test passes for all P0 IDs. |
| NFR-6 | Unicode | All passwords are in NFC form. Some systems use a different form (NFD). This difference in form can cause login errors for passwords with letters outside ASCII. The README tells website owners about this risk. The website owners can then explain it to their users. | Automated: A test makes 10,000 passwords in each language and makes sure that each one is in NFC form. A CI test makes sure that the README contains the NFC note. |
| NFR-7 | Development process | All development uses test-driven development (TDD). Section 10.1 gives the rules. | Automated: The tests of TDD-1, TDD-2, and TDD-4 pass. Manual: Section 10.1 gives the review items. |
| NFR-8 | Color | Color is not the only mark that shows the tokens and the character types (section 8.3). Each colored text has a contrast ratio of 4.5:1 or more. | Automated: A test reads the computed CSS of each separator, number, symbol, and digit. Its font weight is different from the font weight of the words or letters. Its contrast ratio is 4.5:1 or more in the light theme and in the dark theme. |
| NFR-9 | Licenses of the word lists | Each word list uses only sources with an allowed license (section 7.2). This requirement supports goal G5. | Automated: A CI test reads each `wordlists/<lang>/manifest.json`. It fails if a source has a license that is not on the allowed list of section 7.2. |
| NFR-10 | New languages | A contributor can add a language without a change to the code. `CONTRIBUTING.md` has the section "How to add a language", with each step. This requirement supports goal G6. | Automated: A CI test adds a test language from a fixture with `cargo xtask wordlists`. It changes no code. The test language then makes passwords. |

### 10.1 Test-driven development

Test-driven development (TDD) is a way to write code in which the test comes first. TDD is required for all code in Hekate and for all contributors.

Each change follows these steps:

1. Write a test for the new behavior or for the bug. The test describes the behavior from a requirement or from the bug report.
2. Run the test. It must fail, because the code does not exist yet.
3. Write the smallest amount of code that makes the test pass.
4. Improve the code (refactor). All tests must continue to pass.

These rules apply:

| ID | Rule | Acceptance criteria |
|---|---|---|
| TDD-1 | Each change to the behavior of the code contains a test that fails without the change. This rule applies to new features and to bug fixes. | Automated: A CI job copies the new and changed test files onto the target branch and runs them. At least one test must fail. A compile error counts as a failing test. If no test fails, CI stops the merge. Changes to documentation only and to word list data only skip this job (TDD-6). |
| TDD-2 | Each acceptance criterion of a FR, SR, or NFR requirement has at least one test. The test name contains the requirement ID, for example `fr_63_all_selected_sets_present`. | Automated: A CI script reads all requirement IDs with Automated criteria from this PRD. It searches the tests for them. If an ID has no test, CI fails. The release workflow fails if `docs/release-checklist.md` has no result for a Manual criterion. |
| TDD-3 | The team writes the tests for a milestone from the acceptance criteria before it writes the code for that milestone. | Manual: The reviewer of each pull request marks the TDD-3 item in the pull request template. |
| TDD-4 | The tests must find errors in the code, not only run it. Mutation testing measures this quality. Mutation testing makes small changes (mutants) to the code and makes sure that a test fails for each mutant. | Automated: CI runs `cargo mutants` on every pull request for the changed files of `hekate-core`. The release workflow runs it on all of `hekate-core`. Each mutant must fail a test. The only exceptions are the mutants in `crates/hekate-core/mutants-equivalent.txt`, each with a reason. |
| TDD-5 | A change that only improves the structure of the code (refactor) adds no new behavior. All existing tests must pass without changes to the tests. | Manual: The reviewer of each pull request marks the TDD-5 item in the pull request template. |
| TDD-6 | Changes to documentation only need no test. Changes to word list data use the word list rebuild in CI (section 7.3) as their test. | Automated: CI skips the TDD-1 job when a pull request changes only documentation files or only files in `wordlists/`. |

`CONTRIBUTING.md` explains the TDD rules. The pull request template asks the contributor to name the test that failed before the change. The template also has the review items of TDD-3 and TDD-5.

`docs/release-checklist.md` contains the results of all Manual criteria for each release. The release workflow requires a complete entry for the version.

## 11. Open source

The repository follows these rules:

- License of the code: MIT, in the `LICENSE` file in the root of the repository.
- License of the data: one `wordlists/<lang>/LICENSE` file and one `wordlists/<lang>/CREDITS.md` file for each language. The credits for all sources are also in `NOTICE` in the root.
- The build makes a report of all third-party licenses, for example with `cargo about` and a license tool for the pnpm workspace. The Credits dialog links to this report.
- Licenses allowed for dependencies: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, Unicode-3.0, and CC0. `cargo deny` enforces this list.
- Files in the repository: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, a pull request template, and issue templates.
- `CONTRIBUTING.md` has the sections "Test-driven development", "How to add a language", "How to add a translation", and "How to upgrade Web Awesome".
- `SECURITY.md` tells people how to report security problems privately. The issue templates are for bugs, new languages, translations, and word list problems.
- `CHANGELOG.md` has one entry for each version (FR-51).
- The README has a section for website owners. It covers the script tag with SRI (SR-13), the fallback text (FR-86), and all attributes. It also covers the CSS custom properties and parts, the minimum CSP, the required response headers, and the trust rules of SR-11.
- The README tells users that Hekate does not clear the clipboard (SR-8).
- A maintainer makes a release when the maintainer pushes a tag. The maintainer then runs `cargo xtask dist`, which builds `dist/<version>/` (FR-51).

The CI of the project does these steps:

1. Format (`cargo fmt` and Prettier).
2. Lint (`clippy` and ESLint).
3. Unit tests, component tests, and end-to-end tests.
4. The TDD tests of section 10.1.
5. The word list rebuild (section 7.3).
6. The license tests (`cargo deny` and NFR-9).
7. The build of `dist/`.

## 12. Success metrics

Hekate collects no usage data (SR-4). As a result, the metrics come from the project and from public information.

| Metric | Target |
|---|---|
| Languages released in v1.0 | The target is 15. Every released language passed the conditions of section 7.5. |
| Automated criteria of SR-1 to SR-13 | All pass in CI on every release. |
| Manual criteria of the SR requirements | All results are in `docs/release-checklist.md` for every release. |
| Independent review of the random number and selection code | At least 1 public review exists before v1.0. A public review is a published report by a person outside the team. The report has no open finding of high severity. |
| Limits of NFR-1 and NFR-2 | The limits are met on every release. |
| Outside contributions | Outside contributors add or improve 3 or more languages or translations in the first 6 months after v1.0. An outside contributor is a person who is not in the team. The count is the number of merged pull requests. |
| Time for users | In a timed test, 5 users each open the demo page, select a language, set the number of words, and copy the password. Each user needs less than 10 seconds, from the first display of the page to the copy. |
| Time for website owners | In a timed test, 1 website owner follows the README. The owner adds the two tags, sets three attributes, and changes one color. The owner needs less than 15 minutes. |

## 13. Milestones

Each milestone lists its requirement IDs. Every P0 FR, every SR, and every NFR appears in exactly one milestone. A milestone is complete when all Automated acceptance criteria of its IDs pass in CI.

| Milestone | Scope | Requirement IDs |
|---|---|---|
| M0: Setup | The repository, the licenses, CI with the TDD tests of section 10.1, the development environment of section 9.1, the repository structure of section 9.2, and the release workflow. A test build that renames the Web Awesome elements. | FR-46, FR-50, FR-51, SR-10, NFR-5, NFR-7, NFR-9 |
| M1: Core | `hekate-core` and `hekate-wasm` for both modes, the English (US) word list, the random selection, the entropy math, and tests. The tests come first (TDD-3). | FR-5, FR-6, FR-7, FR-20, FR-63, SR-1, SR-2, SR-5 |
| M2: Word lists | The `xtask` build process, the benchmark of section 7.6, the 15 launch lists, the ASCII lists, the block lists, the Québec word list, and the native-speaker reviews. | FR-1, FR-10, NFR-6, NFR-10 |
| M3: Component | The `<hekate-generator>` component with the Web Awesome UI, both modes, the message files and the pseudo-locale test, the errors, the demo page, and accessibility. | FR-2, FR-3, FR-4, FR-8, FR-9, FR-11, FR-12, FR-21, FR-22, FR-23, FR-24, FR-30, FR-40, FR-41, FR-42, FR-43, FR-44, FR-45, FR-47, FR-49, FR-60, FR-61, FR-62, FR-64, FR-65, FR-66, FR-70, FR-71, FR-72, FR-73, FR-74, FR-80, FR-81, FR-82, FR-83, FR-84, FR-85, FR-86, FR-87, SR-3, SR-4, SR-7, SR-8, SR-9, NFR-3, NFR-8 |
| M4: Hardening | The CSP, cross-origin, and SRI tests, the browser tests, the external review, the README for website owners, and the release of v1.0. | SR-6, SR-11, SR-12, SR-13, NFR-1, NFR-2, NFR-4 |
| Later | Translations of the UI, Cyrillic and Greek languages, Chinese, Japanese, Korean, and right-to-left languages. | None |

## 14. Risks

| Risk | Effect | Action |
|---|---|---|
| Frequency data contains names, old words, typos, and scanning errors. | Bad or unknown words get into passwords. | The lexicon filter, the block lists, and the native-speaker review remove these words (section 7.3). |
| Words after the top `S` ranks are less familiar. The frequency data also has more errors at lower ranks. | Words are harder to remember, and more bad words get into the list. | The benchmark of section 7.6, the rank limit `R`, and the native-speaker review limit this effect. |
| The benchmark needs two native speakers for each language. | Some languages are late. | A late language moves to a later release (section 7.5). |
| Some frequency sources use old text, for example Danish news from 1995 to 1999. | Some modern words are not in the list, and some old words are in the list. | The team adds newer ParlaMint data. The native-speaker review finds old words. |
| ParlaMint and ParlaIbero-BR contain only parliament speech. | The lists from these sources contain too many formal and political words. | The "known words" measurement of the benchmark (section 7.6) and the native-speaker review find these lists. |
| French (Canada) uses frequency data from French books, mostly from France. | Some common Québec words are not in the list, and some words that only people in France use are in the list. | The Québec word list (`extra-words.txt`), the block list, and the review by a speaker from Québec fix the list. |
| Some systems or keyboards do not accept letters outside ASCII. | The user cannot log in. | Every language has the option "Basic English letters only (ASCII)" (FR-10). |
| After the filters, some languages have small lists. | Each word gives fewer bits. | A list has at least 4,096 words. The team does not release a language with fewer words. |
| Some sites do not accept some symbols in character mode. | The user cannot use the password on that site. | The user can turn off the symbol set (FR-62). |
| Web Awesome loads files from a CDN by default. | These requests break the privacy promise and the CSP. | The asset host delivers all files (SR-7). An end-to-end test records all requests. |
| A wrong strength estimate gives false confidence. | Users keep weak passwords. | The formula never gives too high a value (Appendix A). Unit tests and a public review make sure of this result. |
| Some sites do not accept the same character twice in a row. | The user cannot use the password. | The option of FR-12 and FR-66. |
| The estimate for an attacker who knows nothing is much higher. | Users trust a weak password. | The bar and the main label use the safe estimate (FR-20). The info panel of the entropy says that it assumes the attacker knows nothing (FR-24). |
| Web Awesome 3.x changes its API. Some components are marked "Experimental". | The UI breaks after an upgrade. | The team uses only stable components and the fixed version 3.14.0. The end-to-end tests run before each upgrade. |
| Web Awesome elements refer to each other by name, for example in templates and CSS. The new names of FR-50 must change all these references. | The component breaks, or a renamed element uses a `wa-*` element of the host page. | The test build in M0 and the FR-50 end-to-end test find this error. |
| Third-party scripts on the host page read the password. Analytics scripts are an example. | The password goes to other companies. | The README tells website owners to use no third-party scripts on these pages (SR-11). |
| The person who deploys Hekate does not send the required headers. | The browser keeps copies of the files, or other domains cannot load the component. | The README lists the headers (SR-8, SR-12). The CI test server uses the same headers. |
| The CSP of a host page blocks WASM or the asset host. | The component does not work on that page. | The component shows an error (FR-80, FR-82). The README lists the minimum CSP (SR-6). |
| Hekate does not clear the clipboard. | The password stays in the clipboard until the user copies other content. Other programs can read it. | The README tells users this fact (SR-8). |
| A word source is very large, for example NST Danish (8.1 GB). | The word list rebuild in CI is slow. | The build streams each source and CI keeps a cache of the counted result (section 7.3). The job has a time limit of 60 minutes. |
| A deployer replaces the files of a version on the asset host. | The hashes do not match, and old pages stop working. | Each version has its own folder, and the deployer keeps old folders (FR-51). |

## 15. Decisions

| ID | Question | Decision |
|---|---|---|
| Q1 | Which Portuguese variant does Hekate use? | Hekate uses both, as two separate languages: `pt-PT` and `pt-BR`. |
| Q2 | Which languages are in v1.0? | The 15 languages of section 7.5 are in v1.0. A language that is not ready moves to a later release. |
| Q3 | Which technology does the team use for the component? | The team uses TypeScript and Lit. All password logic is in Rust and WASM. |
| Q4 | Which web server and domain does the asset host use? | The person who deploys Hekate decides. The build pipeline makes all files in `dist/` (FR-46). |
| Q5 | Does the team translate the UI in v1.0? | No translations are in v1.0, but the UI is ready for them (section 5.6). |
| Q6 | Does v1.0 include passwords from random characters? | Yes. Section 5.5 gives the requirements. |
| Q7 | What are the values of `S` and `R`? | The values are not decided. The benchmark of section 7.6 decides them. The proposed values are `S` = 1,000 and `R` = 30,000. |
| Q8 | What happens if the host page already defines `wa-*` elements? | Hekate gives the Web Awesome elements new names with the prefix `hekate-wa-` (FR-50). |
| Q9 | Which English and French variants does Hekate use? | Hekate uses two of each, as separate languages: `en-US` and `en-GB`, and `fr-FR` and `fr-CA`. |
| Q10 | Which source replaces the Leipzig Corpora Collection? | ParlaMint 4.1 replaces it for Portuguese (Portugal), Dutch, newer Danish words, and as the backup source. ParlaIbero-BR replaces it for Portuguese (Brazil). |
| Q11 | What is the form of the version? | The version is the UTC time of the release commit, in the form `YYYY.MM.DD-HHMM`. Each version has its own folder `dist/<version>/` (FR-51). |
| Q12 | Does Hekate clear the clipboard? | No. A web page cannot clear the clipboard reliably after the user leaves the page. The README tells users this fact (SR-8). |
| Q13 | Does Hekate require Subresource Integrity? | Yes. The script tag uses SRI, and the component script fetches the WASM module and the translations with SRI hashes (SR-13). |
| Q14 | When does CI rebuild the word lists? | CI rebuilds them on every pull request, with streamed sources, a cache, and a time limit of 60 minutes (section 7.3). |
| Q15 | Does every language need an ASCII list? | Yes. Every language has an ASCII list of at least 4,096 words, and FR-10 stays P0 (section 7.4). |
| Q16 | How does the user select the number of words? | The number of words uses a slider with the numbers under the track. One click on the track sets the count. |
| Q17 | What does the no-repeat rule forbid? | The no-repeat rule forbids the same character twice in a row, with case ignored, in both modes. |
| Q18 | Does Hekate show a second estimate? | Hekate shows a second estimate for an attacker who knows nothing, in the info panel of the entropy. The bar and the label use the safe estimate. |
| Q19 | Does a style change make new words? | A change to the separator, the capital letters, the number or the symbol keeps the words. |
| Q20 | Does Hekate warn about short passwords and letters outside ASCII? | No. The strength badge shows the risk. The warnings made the options move. |
| Q21 | Where are the entropy and the strength notes? | The entropy value is always visible, with an info icon on its right side. The notes, the time to crack, and the length-based comparison are in a panel that opens from the icon (FR-20). The badge, the bar, the entropy, and the length stay visible. |
| Q22 | Does Hekate use dropdown lists for the options? | No. Each change takes one click. The number of words is a slider. The separator and the capital letters are radio buttons on one row. |

## Appendix A: Entropy formulas

For both modes, the average time to crack, in seconds, is `2^(H−1) / 10^10`. `H` is the total entropy in bits. FR-24 uses the same time formula with `H` from A.3.

### A.1 Word mode

`N` is the number of words in the list that Hekate uses (main list or ASCII list). `k` is the number of words in the password.

| Token or option | Bits added |
|---|---|
| Words | `k · log2(N)` |
| Capital letters: `lower` or `title` style | 0 |
| Capital letters: `random` style | `k` (1 bit for each word) |
| Number (0 to 99) | `log2(100)` ≈ 6.64 |
| Symbol (16 options) | 4 |
| Position of the number or the symbol | 0. Hekate does not count it, so that the estimate is never too high. |
| Separator | 0. The user selects it, so it is not random. |

The total entropy `H` is the sum of the rows that apply.

Examples with `N = 7,776`:

| Options | H (bits) | Label |
|---|---|---|
| 4 words, `title` style | 51.7 | Fair |
| 5 words, `title` style | 64.6 | Strong |
| 5 words, `title` style, number, symbol | 75.3 | Strong |
| 6 words, `random` style, number | 90.2 | Very strong |

#### With no-repeat on (FR-12)

`N'` is the number of words that have no letter twice in a row (case ignored) and whose capital form has the same letters. `W_k` is the number of sequences of `k` words from these `N'` words in which no word ends with the first letter of the next word (case ignored).

The words row adds `log2(W_k)` instead of `k · log2(N)`. The number row adds `log2(91)` ≈ 6.51. The symbol row adds `log2(14)` ≈ 3.81. The capital letters rows do not change.

Example: the list `ab`, `ba`, `cd` with `k = 3` gives `W_3 = 17`, so 4.09 bits.

Hekate computes `W_k` with this rule. `f_1(c)` is the number of words that end with `c`. `f_{i+1}(c) = Σ` over the words `w` that end with `c` of `(T_i − f_i(first letter of w))`. `T_i` is the sum of `f_i`, and `W_k = T_k`.

### A.2 Character mode

`L` is the length. The selected character sets are `s1` to `sm`, with sizes `|s1|` to `|sm|`. `C` is the total number of characters in all selected sets. The sizes are: lowercase 26, capital letters 26, digits 10, symbols 16. With "Avoid similar characters" on, the sizes are: lowercase 25, capital letters 24, digits 8, symbols 16.

FR-63 accepts only passwords that contain each selected set. The number of these passwords is `V`. Hekate computes `V` with the inclusion-exclusion rule:

`V = Σ over all subsets T of the selected sets: (−1)^|T| · (C − size of all sets in T)^L`

The entropy is `H = log2(V)`. This value is a little smaller than `L · log2(C)`.

With no-repeat on, the term `(C − size of all sets in T)^L` becomes `R(A_T, L)`. `A_T` is the set of characters that are left after Hekate removes the sets in `T`. `R(A_T, L)` is the number of passwords of length `L` from `A_T` in which no two neighbors are in the same case group. A case group is the set of characters that are equal when case is ignored, for example `a` and `A`. `e_1(j) = s_j`, where `s_j` is the size of group `j`. `e_{n+1}(j) = s_j · (T_n − e_n(j))`, `T_n` is the sum of `e_n`, and `R = T_L`.

Examples:

| Options | H (bits) | Label |
|---|---|---|
| 8 characters, lowercase and digits | 41.2 | Weak |
| 12 characters, all four sets | 75.0 | Strong |
| 20 characters, all four sets | 125.6 | Very strong |
| 8 characters, lowercase and digits, no-repeat | 40.97 | Weak |
| 12 characters, all four sets, no-repeat | 74.67 | Strong |
| 20 characters, all four sets, no-repeat | 125.02 | Very strong |
| 8 characters, digits only, no-repeat | 25.51 | Weak |

### A.3 Attacker who knows nothing

`L` is the number of code points. `P` is the sum of the sizes of the groups that appear in the password: lowercase `a`–`z` 26, capitals `A`–`Z` 26, digits 10, other printable ASCII characters including space 33, and all other characters 190 (U+00C0 to U+017F without `×` and `÷`). `H = L · log2(P)`.

Examples:

| Password | L | P | H (bits) |
|---|---|---|---|
| `BraveMapleRiverCloudStone` | 25 | 52 | 142.5 |
| `Brave-Maple-42-River!` | 21 | 95 | 138.0 |
| `aB3!efgh` | 8 | 95 | 52.6 |
| `smörgås-tårta-fika` | 18 | 249 | 143.3 |

## Appendix B: Glossary

- ASCII: The set of basic English letters, digits, and symbols.
- Asset host: The web server that delivers the files of the component.
- Automated criterion: An acceptance criterion that a test in CI makes sure of.
- Bias: Some values occur more often than others.
- Build pipeline: The `cargo xtask dist` command, which makes `dist/<version>/`.
- Case group: Letters that differ only in case, for example `a` and `A`.
- CDN: A third-party server that delivers files.
- Character set: A group of characters that the user can turn on or off, for example digits.
- Chi-square test: A statistical test that finds uneven results.
- CI: Continuous integration. Automatic tests that run on each change.
- Component script: The file `hekate.js`, the one ES module of the component.
- Container query: A CSS rule that depends on the size of the parent element.
- CSP: Content Security Policy. Browser rules that limit what a page can load.
- End-to-end test: A test that uses the component in a real browser, as a person does.
- Entropy: A measure of how hard a password is to guess, in bits. Each bit doubles the number of guesses.
- Fail closed: Stop when something is wrong.
- Frequency corpus: A large set of text in which words are counted.
- Host page: The page that embeds the component.
- Lexicon: A list of correctly spelled words, for example a spelling dictionary.
- Manual criterion: An acceptance criterion that a person reviews. The result is in `docs/release-checklist.md`.
- Mode: Word mode or character mode.
- Monorepo: One repository that contains all folders of a project.
- Mutation testing: A test method that makes small changes to the code and makes sure that a test fails for each change.
- NFC: A Unicode form that gives the same bytes for the same visible text.
- Options: The values that the user selects, such as the language and the number of words.
- Origin: The combination of scheme, host name, and port of a URL.
- Pseudo-locale: A test language that changes all UI text, to find text that is not translated.
- Refactor: A change that improves the structure of the code but does not change what the code does.
- Rejection sampling: Discard random values that cause bias, and get new ones.
- Secure context: A page that the browser loaded over HTTPS, or from `localhost`.
- Secure random generator: A generator of random numbers that an attacker cannot predict.
- Separator: The character between the tokens of a password.
- Shadow root: A separate tree of elements that keeps the CSS of a component apart from the page.
- SHA-256 hash: A fixed fingerprint of a file.
- SRI: Subresource Integrity. A browser feature that refuses a file when its hash is not the expected hash.
- Style: The capital letter style of a word: `lower`, `title`, or `random`.
- TDD: Test-driven development. A way to write code in which a failing test comes first.
- Team: The maintainers of Hekate.
- Token: One word, the number, or the symbol of a word password.
- Version: The UTC time of the release commit, in the form `YYYY.MM.DD-HHMM`.
- WASM: WebAssembly. A fast program format that browsers run.
- Web component: A custom HTML element that any website can use.
