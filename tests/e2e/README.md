# End-to-end tests

These tests use the `<hekate-generator>` component in a real browser, as a person does.
They use Playwright with Chromium, Firefox, and WebKit (NFR-4). They test the files in `dist/`
and the demo pages in `apps/demo/out/`. They cover the P0 criteria of the PRD that are
marked "Automated" and need a browser (FR-1 to FR-87, SR-3 to SR-13, NFR-1, NFR-3, NFR-4,
NFR-6, NFR-8).

Every test title starts with the requirement ID, for example `FR-63 ...`. The script
`scripts/check-requirement-ids.mjs` (TDD-2) reads the titles.

## What the tests need

Playwright does **not** start the servers. The tests expect the nginx server of `dev/`
(PRD section 9.1):

| Address                  | Content                                         |
| ------------------------ | ----------------------------------------------- |
| `http://localhost:18080` | the demo pages (`apps/demo/out/`), the base URL |
| `http://localhost:18081` | the asset host (`dist/`)                        |

The tests read `dist/<version>/` and `wordlists/*/manifest.json` from the repository. They find the
languages in the manifests. No test has a fixed list of languages. The version is the newest
folder in `dist/`. Set `HEKATE_VERSION` to use another folder.

### 1. Build

```sh
HEKATE_PSEUDO=1 cargo xtask dist
pnpm --filter @hekate/demo build
```

`HEKATE_PSEUDO=1` adds the **pseudo-locale** `qps` to the build. A pseudo-locale is a test language
that changes all UI text. The tests of FR-70 to FR-73, FR-83, FR-87, and SR-13 (translation) need it.
They fail with a clear message if the build has no `qps`. Never ship a release that was built with
`HEKATE_PSEUDO=1`. The CI build job sets it. The release workflow does not.

Run `pnpm --filter @hekate/demo build` again after each `cargo xtask dist`. The demo pages contain the
version and the SRI value.

### 2. Start the servers

```sh
docker build --tag hekate-dev dev
docker run --rm --name hekate-dev \
  --publish 18080:18080 --publish 18081:18081 \
  --volume "$PWD/dist:/srv/dist:ro" \
  --volume "$PWD/apps/demo/out:/srv/demo:ro" \
  hekate-dev
```

`dev/run.sh` does the same.

### 3. Run

```sh
pnpm install
pnpm --filter @hekate/e2e exec playwright install --with-deps   # one time, installs the browsers
pnpm --filter @hekate/e2e test                                  # all three browsers
pnpm --filter @hekate/e2e test --project=chromium               # one browser
pnpm --filter @hekate/e2e test -g "FR-63"                       # tests with this text in the title
```

## Run everything in Docker

If the browsers cannot run on your computer, use the Playwright Docker image:

```sh
tests/e2e/run-in-docker.sh                       # all three browsers
tests/e2e/run-in-docker.sh --project=webkit      # one browser
tests/e2e/run-in-docker.sh -g "SR-13"            # arguments go to `playwright test`
```

The script builds the image of `dev/`, starts the server with `dist/` and `apps/demo/out/`, runs the tests
in `mcr.microsoft.com/playwright:v<version>-noble` (the test container uses the network of the server
container, so `localhost:18080` and `localhost:18081` are the server), and removes the server
container at the end. It needs a built `dist/` and `apps/demo/out/`. The version of the image must be the
version of `@playwright/test` (the script reads it). Set `DOCKER` if your docker command has another
name, `E2E_WORKERS` for the number of parallel workers, and `PLAYWRIGHT_IMAGE` for another image.

## How the tests work

- **Fault injection.** `page.route()` makes HTTP 404 and 500 errors, network errors, and changed bytes
  (word lists, WASM module, translations, the script). It also serves extra test pages from strings.
  `page.addInitScript()` removes `navigator.clipboard`, `crypto.getRandomValues`, `WebAssembly`, or
  `customElements`, and sets `navigator.languages`. The server of `dev/` is never changed.
- **Requests.** `page.on('request')` records all requests (SR-4, SR-7, FR-44, FR-43).
- **Many passwords.** Tests that need 10,000 passwords run the loop inside `page.evaluate`. The loop
  clicks "New password" and reads the password field. It is fast.
- **Fixed seed.** Tests that compare screenshots or run statistics replace `crypto.getRandomValues` with a
  seeded generator (`support/browser.ts`). Only tests do this. A run always gives the same passwords.
- **Speed of `generate`.** NFR-1 wraps the WASM exports `drawWords`, `worddraw_render` (the `render`
  method of a word draw), and `generateCharacters` with a timer. FR-8 and FR-11 also count these calls.
  NFR-1 runs in Chromium only, because only Chromium can slow the CPU down (CDP).
  Other tests that need one browser use `test.skip(browserName !== 'chromium', 'reason')` with the reason.
- **Screenshots (FR-41).** The test makes two screenshots in the same run and compares the bytes: the
  component on a clean page and on a page with hostile CSS, and the page outside the component with and
  without the component. Zero pixels may differ. The pictures are also written to
  `tests/e2e/__screenshots__/<project>/` for people to look at. That folder is not in git.
- **Web Awesome (FR-50).** The test page loads Web Awesome from `node_modules` (served by `page.route()`),
  before and after the component.
- **Chromium and `localhost`.** Pages that `page.route()` makes have no IP address space, so Chromium blocks
  their requests to `localhost:18081` ("Local Network Access"). `playwright.config.ts` turns this check off
  for Chromium. Pages that nginx serves are not affected.
- **Clipboard.** Firefox and WebKit do not let Playwright grant `clipboard-read`. Most tests use a test
  double for `navigator.clipboard`. One Chromium test reads the real clipboard.

## Files

| File                          | Content                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `playwright.config.ts`        | projects `chromium`, `firefox`, `webkit`, base URL `:18080`     |
| `tests/words.spec.ts`         | FR-1, FR-2, FR-3, FR-4, FR-10, NFR-6                            |
| `tests/strength.spec.ts`      | FR-21, FR-22, FR-23, NFR-8                                      |
| `tests/credits.spec.ts`       | FR-30                                                           |
| `tests/embedding.spec.ts`     | FR-40, FR-42, FR-43, FR-44, FR-45, FR-46                        |
| `tests/styling.spec.ts`       | FR-41, FR-47, FR-49, FR-50                                      |
| `tests/characters.spec.ts`    | FR-60 to FR-65                                                  |
| `tests/i18n.spec.ts`          | FR-70 to FR-73                                                  |
| `tests/errors.spec.ts`        | FR-80 to FR-87, SR-3                                            |
| `tests/security.spec.ts`      | SR-4, SR-6, SR-7, SR-8, SR-9, SR-12, SR-13, FR-8, FR-9          |
| `tests/accessibility.spec.ts` | NFR-3 (axe, labels, keyboard), NFR-4                            |
| `tests/performance.spec.ts`   | NFR-1                                                           |
| `support/`                    | helpers: environment, component, browser faults, network, maths |

The folders `test-results/` and `playwright-report/` are made by a run. They are not in git.
