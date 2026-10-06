# Implementation notes

This file tells what the code does differently from `docs/PRD.md`, and what work is still open before a v1.0 release. It is in simple English.

## What is done

| Part | State |
|---|---|
| `hekate-core` (Rust) | Done. Random choice without bias, word and character passwords, entropy, strength. 90%+ line coverage. Mutation testing finds no missed mutant. |
| `hekate-wasm` | Done. Checks the SHA-256 hash of each word list. Native tests and `wasm-bindgen-test` tests pass (Node). |
| Word lists | 15 lists built from the sources in PRD 7.2, each with 7,776 words and an ASCII list of 4,096 words or more. |
| `xtask` | `wordlists`, `benchmark`, `wasm`, `dist`, `check-manifests`. The build is deterministic. |
| Component | `<hekate-generator>` with Lit and Web Awesome 3.14.0. All Web Awesome elements get the `hekate-wa-` prefix. |
| End-to-end tests | Playwright in Docker. Chromium, Firefox and WebKit pass. |
| CI and release | Workflows, scripts, Docker development server. |

## Differences from the PRD

- **Sources release.** The PRD says the team keeps copies of some sources in a `sources` release of the repository. That release does not exist yet. The builds use the original links. For Kotus (Finnish), the original link blocks scripts, so the config uses an Internet Archive copy of the same file. The team should create the `sources` release and move these links to it.
- **Danish.** The NST N-gram file has no word counts, only 6-grams. Danish uses ParlaMint-DK as its only frequency source (the PRD backup).
- **English word lexicon.** The SCOWL tag archive needs Python and SQLite to build. The build uses the finished Hunspell lists from the same SCOWL release.
- **Polish license.** The SJP.PL word file is offered under GPL 2 or CC BY 4.0. The list uses CC BY 4.0. The PRD names Apache-2.0, which only covers the SJP Hunspell dictionary.
- **Dutch.** ParlaMint-BE mixes French and Dutch. The build counts only text marked as Dutch.
- **Word list API.** `loadWordlist` takes a third argument, `ascii`, because the hash key is different for the main list and the ASCII list.
- **Time to crack.** For 1 million years or more, the text uses words ("1.4 million years"). For 10^12 years or more, it uses scientific form. This keeps the text short at 320 px.
- **Web Awesome inline styles.** Web Awesome sets a few CSS custom properties on its own elements from script (CSSOM). A strict `style-src` allows this. The markup that Hekate writes has no `style` attributes.
- **Copy button.** The component uses its own button and "Copied" message, not `<wa-copy-button>`.
- **UI translations.** v1.0 has English only (PRD Q5). The FR-72 test for the `de` UI language is skipped until a German translation exists.

## Open work before a release

These items need people. The code cannot do them.

1. **Native speaker review.** No native speaker has reviewed any word list or block list. The block lists are first drafts. Record each review in `docs/release-checklist.md`. A reviewer from Québec must check `fr-CA`.
2. **Benchmark ratings.** `cargo xtask benchmark` made the 200-word samples. Two native speakers must rate them (PRD 7.6). Until then, every language uses the proposed `S` = 1,000 and `R` = 30,000. A language that fails the rules does not ship.
3. **Known quality problems.** The lists contain many verb forms and many formal words (parliament text). The ratings will show how bad this is.
4. **Independent review** of the random number and selection code (PRD section 12).
5. **Manual checks** with VoiceOver and NVDA, and the other Manual criteria in `docs/release-checklist.md`.
6. **Timed user tests** from PRD section 12.
7. **CI is not run yet.** The workflows are written and checked with `actionlint`. They have not run on GitHub.
8. **`cargo deny`** needs write access to `~/.cargo/advisory-dbs`. Run it on a normal machine or in CI.

## How to run the checks

```sh
cargo test --workspace                     # Rust tests
pnpm -r --filter '!@hekate/e2e' run test   # component tests
node --test scripts/test/*.test.mjs        # script tests
node scripts/check-requirement-ids.mjs     # every Automated ID has a test (TDD-2)
cargo xtask check-manifests                # word list rules (NFR-9)
HEKATE_PSEUDO=1 cargo xtask dist && pnpm --filter @hekate/demo build \
  && tests/e2e/run-in-docker.sh            # end-to-end tests
```

Never ship a release that was built with `HEKATE_PSEUDO=1`. It adds a test language.
