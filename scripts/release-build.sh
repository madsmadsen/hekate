#!/bin/sh
# SR-10: build dist/<version>/ from the git tree of HEAD in a clean container.
# The container has only the files of git (`git archive`), so no local file
# changes the result.
#
# Usage: scripts/release-build.sh <version> <output-dir>
#   Writes <output-dir>/<version>/...
# The Docker image comes from dev/Dockerfile.release. The versions of Rust,
# Node.js, and pnpm come from rust-toolchain.toml, .node-version, and package.json.
set -eu

version=$1
out=$2
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

rust=$(sed -n 's/^channel *= *"\(.*\)"/\1/p' rust-toolchain.toml)
node_version=$(tr -d 'v \n' < .node-version)
pnpm_version=$(node -p 'require("./package.json").packageManager.split("@")[1]')

docker build --file dev/Dockerfile.release \
  --build-arg "RUST_VERSION=$rust" \
  --build-arg "NODE_VERSION=$node_version" \
  --build-arg "PNPM_VERSION=$pnpm_version" \
  --tag hekate-release-build dev

mkdir -p "$out"
# The cache holds only counted word source data. Its key includes the hash of each source.
cache_args=""
if [ -d "$root/target/wordlist-sources" ]; then
  cache_args="--volume $root/target/wordlist-sources:/cache/wordlist-sources:ro"
fi

# shellcheck disable=SC2086
git archive --format=tar HEAD | docker run --rm --interactive \
  --env "HEKATE_VERSION=$version" \
  $cache_args \
  hekate-release-build sh -ec '
    mkdir /src && tar -x -C /src && cd /src
    if [ -d /cache/wordlist-sources ]; then
      mkdir -p target && cp -R /cache/wordlist-sources target/wordlist-sources
    fi
    { pnpm install --frozen-lockfile && cargo xtask dist; } >&2
    tar -c -C dist "$HEKATE_VERSION"
  ' | tar -x -C "$out"

test -d "$out/$version" || { echo "The build made no dist/$version/ folder." >&2; exit 1; }
echo "Built $out/$version"
