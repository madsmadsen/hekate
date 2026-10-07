#!/bin/sh
# TDD-1: the new and changed tests of a pull request must fail on the base branch.
# TDD-6: pull requests that change only documentation or only word lists skip this job.
#
# How it works:
#   1. Make a temporary git worktree of the merge base.
#   2. Copy the new and changed test files of the pull request onto it.
#      Rust unit tests are in the same file as the code. For these files, the
#      script copies only the test module (the part after `#[cfg(test)]`).
#   3. Run the tests. At least one test must fail. A compile error counts as a failure.
#
# Usage: scripts/tdd-failing-test.sh [BASE_REF]      (default: origin/main)
# Set TDD_REFACTOR=1 for a pull request that only improves the code structure
# (TDD-5). A reviewer checks this claim. The job then skips.
set -eu

base=${1:-origin/main}
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

if [ "${TDD_REFACTOR:-0}" = "1" ]; then
  echo "TDD-1: skipped. The pull request is marked as a refactor (TDD-5). The reviewer checks it."
  exit 0
fi

plan=$(node scripts/tdd-plan.mjs "$base")
json() { printf '%s' "$plan" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);const v=eval("p."+process.argv[1]);console.log(Array.isArray(v)?v.join(" "):String(v))})' "$1"; }

if [ "$(json skip)" = "true" ]; then
  echo "TDD-1: skipped. $(json reason)"
  exit 0
fi

if [ "$(json hasTests)" != "true" ]; then
  echo "TDD-1: this pull request changes code but adds or changes no test." >&2
  echo "Write a test that fails without your change (see CONTRIBUTING.md)." >&2
  echo "If the change only improves the structure of the code, set the label 'refactor'." >&2
  exit 1
fi

merge_base=$(json mergeBase)
work=$(mktemp -d "${TMPDIR:-/tmp}/hekate-tdd.XXXXXX")
cleanup() {
  git worktree remove --force "$work/base" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

git worktree add --detach "$work/base" "$merge_base" >/dev/null
echo "TDD-1: base commit $merge_base is in $work/base"

# Copy the new tests onto the base commit.
for file in $(json rustTestFiles) $(json tsTestFiles) $(json e2eTestFiles) $(json scriptTestFiles); do
  mkdir -p "$work/base/$(dirname "$file")"
  cp "$file" "$work/base/$file"
done
for file in $(json rustUnitTestFiles); do
  if [ -f "$work/base/$file" ]; then
    node scripts/tdd-plan.mjs --splice "$work/base/$file" "$file" > "$work/spliced"
    mv "$work/spliced" "$work/base/$file"
  fi
done

failed=0
run() {
  echo "TDD-1: running: $*"
  if ( cd "$work/base" && "$@" ); then
    echo "TDD-1: these tests passed on the base commit."
  else
    echo "TDD-1: these tests failed on the base commit, as required."
    failed=1
  fi
}

for crate in $(json rustCrates); do
  package=$(basename "$crate")
  run cargo test --package "$package"
done

if [ -n "$(json scriptTestFiles)" ]; then
  # shellcheck disable=SC2046
  run node --test $(json scriptTestFiles)
fi

if [ -n "$(json tsPackages)" ]; then
  ( cd "$work/base" && pnpm install --frozen-lockfile >/dev/null && cargo xtask wasm >/dev/null )
  for package in $(json tsPackages); do
    run pnpm --filter "./packages/$package" test
  done
fi

if [ -n "$(json e2eTestFiles)" ]; then
  # The end-to-end tests need the base build in a Docker server (PRD section 9.1).
  ( cd "$work/base" && pnpm install --frozen-lockfile >/dev/null && cargo xtask dist >/dev/null )
  docker rm -f hekate-dev-tdd >/dev/null 2>&1 || true
  docker build --tag hekate-dev "$work/base/dev" >/dev/null
  docker run --detach --rm --name hekate-dev-tdd \
    --publish 18080:18080 --publish 18081:18081 \
    --volume "$work/base/dist:/srv/dist:ro" \
    --volume "$work/base/apps/demo/out:/srv/demo:ro" \
    hekate-dev >/dev/null
  run pnpm --filter ./tests/e2e exec playwright test --project=chromium
  docker rm -f hekate-dev-tdd >/dev/null 2>&1 || true
fi

if [ "$failed" -eq 0 ]; then
  echo "TDD-1: no new test failed on the base commit." >&2
  echo "A test for a change must fail without the change. Check that your test uses the new behavior." >&2
  exit 1
fi
echo "TDD-1: passed. At least one new test fails without the change."
