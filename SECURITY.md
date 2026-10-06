# Security policy

Hekate makes passwords, so we take security problems seriously.

## Report a problem in private

**Do not open a public issue for a security problem.**

Use a private GitHub security advisory:

1. Open the page "Security" of the repository.
2. Select "Report a vulnerability".
3. Describe the problem. Say which version you used (the version is in the script URL, for example `2026.10.06-1432`), which browser you used, and how we can repeat the problem.

Only the maintainers can read the report. We will answer in a few days. We will tell you when we have a fix, and we will credit you in the changelog if you want.

## What is in scope

- The password logic: the random numbers, the random choice of words and characters, the entropy estimate.
- The component: the script `hekate.js`, the WASM module, and the loading of word lists and translations. This includes the checks with SHA-256 and SRI hashes.
- A leak of a password to another page, another server, a log, a URL, or the storage of the device.
- A way to make Hekate load a file from a host that is not the asset host.
- The build and release process: for example, a release that cannot be rebuilt from its tag.
- A dependency with a known vulnerability that affects Hekate.

## What is not in scope

- Scripts on the host page that read the password. Hekate cannot prevent this. The README tells website owners to load no third-party scripts on pages with the component.
- Other programs that read the clipboard. Hekate does not clear the clipboard, and the README says so.
- A website owner who does not send the response headers that the README requires.
- A browser that does not meet the requirements in the README.
- Problems in the demo page or in the development server in `dev/`. They are not products.

## Supported versions

Only the latest version gets security fixes. The version is the UTC time of the release commit. Each version has its own folder on the asset host. After a fix, the maintainers publish a new version, and website owners must change the version and the `integrity` value in their script tag.

## Independent review

Before v1.0, a person outside the team reviews the random number and selection code. We publish the report.
