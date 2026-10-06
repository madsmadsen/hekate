# Contributing to Hekate

Thank you for your help. This file tells you how to work on Hekate. Be kind to other people. The [code of conduct](CODE_OF_CONDUCT.md) applies.

Write all text (code comments, docs, error messages, commit messages) in simple English. Use short sentences and active voice. Explain a technical term the first time you use it.

The [product requirements document](docs/PRD.md) (PRD) is the source for what Hekate must do. Each requirement has an ID such as `FR-63` and acceptance criteria.

## Test-driven development

Test-driven development (TDD) is a way to write code in which the test comes first. TDD is required for all code in Hekate and for all contributors (PRD section 10.1).

Follow these steps for each change:

1. **Write a test** for the new behavior or for the bug. The test describes the behavior from a requirement or from the bug report.
2. **Run the test.** It must fail, because the code does not exist yet.
3. **Write the smallest amount of code** that makes the test pass.
4. **Improve the code** (refactor). All tests must continue to pass.

These rules apply:

| Rule  | What it means for you                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TDD-1 | A change to the behavior of the code contains a test that fails without the change. CI copies your new and changed tests onto the base branch and runs them. At least one must fail. A compile error counts as a failure. |
| TDD-2 | Each acceptance criterion with an `Automated:` mark has a test. The name of the test contains the requirement ID: `fr_63_all_selected_sets_present` in Rust, `FR-63 all selected sets are present` in TypeScript.         |
| TDD-3 | The tests for a milestone come from the acceptance criteria, before the code. The reviewer marks this item in the pull request.                                                                                           |
| TDD-4 | The tests must find errors. CI runs `cargo mutants` on the changed files of `hekate-core`. Each mutant must make a test fail. See below.                                                                                  |
| TDD-5 | A refactor adds no new behavior. All existing tests pass without changes to the tests. The reviewer marks this item. Put the label `refactor` on the pull request. CI then skips the TDD-1 job.                           |
| TDD-6 | A change of documentation only needs no test. A change of word list data only is tested by the word list rebuild in CI.                                                                                                   |

In the pull request, write the name of the test that failed before your change. The pull request template asks for it.

Where tests go:

- Rust unit tests are in the same file as the code, in a module `#[cfg(test)]` at the end of the file. CI needs the tests at the end of the file for TDD-1. Rust integration tests are in `crates/<crate>/tests/`.
- Component tests are in `packages/component/test/`.
- End-to-end tests are in `tests/e2e/`.
- Tests of the check scripts are in `scripts/test/`.

### Run the checks

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- --deny warnings
cargo test --workspace
pnpm format
pnpm lint
pnpm test
node --test 'scripts/test/*.test.mjs'
node scripts/check-requirement-ids.mjs     # TDD-2: every ID with an Automated criterion has a test
node scripts/check-readme.mjs              # the README has the text that the PRD requires
```

To see the missing IDs without a failure, add `--report` to the TDD-2 command. If a test for an ID is not written yet, you may list the ID in `scripts/requirement-ids.allow` with a reason. The list must be empty before a release.

### Mutation tests

Mutation testing makes small changes (mutants) to the code and makes sure that a test fails for each one.

```sh
cargo install cargo-mutants
cargo mutants --package hekate-core
node scripts/check-mutants.mjs mutants.out/missed.txt crates/hekate-core/mutants-equivalent.txt
```

If a mutant survives, write a better test. A mutant is equivalent when the change does not change what the code does. Only in this case, add it to `crates/hekate-core/mutants-equivalent.txt` with a reason. The file explains the format.

## How to add a language

You can add a language without a change to the code. A language needs a frequency source (it ranks the words) and a lexicon (a list of correctly spelled words). Both need an allowed license (PRD section 7.2). CC BY-SA, NonCommercial, NoDerivatives, research-only, and unclear licenses are not allowed.

1. **Open an issue** with the template "New language". Name the sources and their licenses. The sources must pass the license rules of PRD section 7.2.
2. **Copy a language folder.** Take a language that is close to yours:

   ```sh
   cp -R wordlists/de wordlists/<code>
   ```

   Remove the files that the build makes: `words.txt`, `words-ascii.txt`, and `manifest.json`. The code is a language tag such as `es-MX`.

3. **Write `wordlists/<code>/config.toml`.** It has the name of the language in that language, the sources with their download links, SHA-256 hashes, and licenses, the values `S`, `R`, and `N`, the length limits, the script, and the ASCII rules. `S` is the number of top ranks to remove. `R` is the last rank to use. `N` is the number of words in the list. `N` must be at least 4,096.
4. **Write `wordlists/<code>/blocklist.txt`.** Put rude words and other unwanted words in it, one word for each line. A language with a second variant can also have `extra-words.txt`. A native speaker must approve each extra word. The extra words must be 10% or less of `N`.
5. **Update `wordlists/<code>/LICENSE` and `CREDITS.md`** for your sources.
6. **Build the list:**

   ```sh
   cargo xtask wordlists --lang <code>
   ```

   The command streams each source, checks its hash, applies the filters, and writes `words.txt`, `words-ascii.txt`, and `manifest.json`. If a source hash is wrong, the command stops. Review the new file of the source first, then update the hash.

7. **Run the benchmark** of PRD section 7.6 to choose `S` and `R` (`cargo xtask benchmark --lang <code>`). Save the results in `wordlists/benchmark/`.
8. **Get a review by a native speaker.** At least one native speaker reads the list for unknown words, rude words, grammar words, spelling errors, and words of another variant. For a language with two variants, the reviewer comes from the country of the variant. Record the result, the name, and the date in `docs/release-checklist.md`, in a row `WORDLIST-REVIEW <code>`. A list without approval is not released.
9. **Open a pull request.** Do not edit `words.txt` by hand. CI rebuilds all lists and compares them byte for byte with the files in git.

## How to add a translation

You can add a translation without a change to the code. All UI text is in one file for each language.

1. **Copy the English file** to a new file with the name of your locale:

   ```sh
   cp packages/component/locales/en.json packages/component/locales/<locale>.json
   ```

   The locale is a language tag, for example `sv` or `pt-BR`.

2. **Translate the values.** Keep the keys. Do not change the keys.
3. **Keep the placeholders.** A placeholder such as `{count}` or `{time}` stands for a number or text that the code fills in. Write it exactly as in English. Messages that depend on a number have the forms `one` and `other` (and more, if your language needs them). Write the forms that your language uses. Do not join pieces of text yourself.
4. **Do not translate the names of the languages.** They come from the word lists. Keep placeholders and the product name `Hekate`.
5. **Run the pseudo-locale test.** It uses a test language that changes all text, and makes sure that no English UI text remains and that the layout works with text that is 40% longer:

   ```sh
   pnpm --filter @hekate/component test
   ```

6. **Build the component** and look at the result:

   ```sh
   cargo xtask dist
   ```

   Open the demo page with `ui-language="<locale>"` on the component. See "Development environment" in the README.

7. **Open a pull request.** Use the issue template "Translation" if you want to discuss it first. Check the layout at a parent width of 320 px. If a text is too long, make it shorter.

The translation file is loaded from the asset host the first time a user selects that UI language. Its hash is inside `hekate.js`. The build adds it.

## How to upgrade Web Awesome

Hekate uses Web Awesome in the fixed version 3.14.0, and only stable components. Hekate renames all Web Awesome elements to `hekate-wa-*`, so that they never clash with a `wa-*` element on the host page (FR-50). The build changes the names in templates, CSS, and internal references. Hekate also uses its own icon library, so that it loads no file from a CDN (SR-7).

1. **Read the release notes** of the new version. Look for changes to the components that Hekate uses, and for components that are marked "Experimental".
2. **Change the version** in `packages/component/package.json`. Use the exact version, with no `^`. Run `pnpm install` and commit the new `pnpm-lock.yaml`.
3. **Build the component:** `pnpm --filter @hekate/component build`. Look for new `wa-` names in the output of the build step that renames the elements. All of them must be renamed. Hekate must define no `wa-*` element.
4. **Check the icons.** Each icon that the component uses must be in the Hekate icon library. Add new icons there. No icon may load from a CDN.
5. **Run all tests:** the component tests, `cargo xtask dist`, and the end-to-end tests against the Docker server in Chromium, Firefox, and WebKit. The FR-50 test loads another Web Awesome version before and after the component. The SR-4 and SR-7 tests record every network request.
6. **Check the sizes:** `node scripts/check-sizes.mjs`. The WASM module must stay at 100 KB or less after gzip. Look at the size of `hekate.js` too.
7. **Run `cargo deny check` and `pnpm audit`.** A new dependency with a license that is not allowed stops the upgrade.
8. **Check the layout and the accessibility** in the demo page (axe, keyboard, and screen reader notes in `docs/release-checklist.md`).
9. **Update this file, the README, and `CHANGELOG.md`** if anything changed. Change the version number in the PRD only with the maintainers.

## Commits and pull requests

- Use Conventional Commits: `feat(core): ...`, `fix(wasm): ...`, `test: ...`, `docs: ...`, `chore: ...`.
- Keep a pull request small. One topic for each pull request.
- Fill in the pull request template.
- Add a line to `CHANGELOG.md` for each change that users see.

## Releases

A maintainer makes a release by pushing a tag `v<version>`, for example `v2026.10.06-1432`. The version is the UTC time of the release commit. The release workflow stops if the tag is different from the commit time, if `CHANGELOG.md` has no entry for the version, or if `docs/release-checklist.md` has no complete entry. Before the release, people do the Manual checks and write the results in `docs/release-checklist.md`. See [docs/release-checklist.md](docs/release-checklist.md).
