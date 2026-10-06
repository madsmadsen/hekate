#!/bin/sh
# Run the end-to-end tests in Docker, against the nginx server of dev/ (PRD section 9.1).
#
# It does these steps:
#   1. builds the image of dev/ and starts the server with dist/ and apps/demo/out/,
#   2. runs Playwright in the official Playwright image. The test container shares the network of
#      the server container, so `localhost:8080` and `localhost:8081` are the server,
#   3. removes the server container, also when the tests fail.
#
# Usage: tests/e2e/run-in-docker.sh [playwright arguments]
#   tests/e2e/run-in-docker.sh --project=chromium
#   tests/e2e/run-in-docker.sh --project=webkit -g "FR-63"
#
# It needs a built dist/ and a built apps/demo/out/:
#   HEKATE_PSEUDO=1 cargo xtask dist && pnpm --filter @hekate/demo build
# Environment:
#   DOCKER           the docker command (default: docker, or ~/.rd/bin/docker for Rancher Desktop)
#   PLAYWRIGHT_IMAGE the test image. Its version must be the version of @playwright/test.
#   E2E_WORKERS      the number of parallel workers (default: Playwright decides)
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)

if [ -z "${DOCKER:-}" ]; then
  if command -v docker >/dev/null 2>&1; then
    DOCKER=docker
  elif [ -x "$HOME/.rd/bin/docker" ]; then
    DOCKER="$HOME/.rd/bin/docker"
  else
    echo "docker was not found. Set DOCKER to the docker command." >&2
    exit 1
  fi
fi

playwright_version=$(node -p "require('$root/tests/e2e/node_modules/@playwright/test/package.json').version")
image=${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${playwright_version}-noble}

if [ ! -d "$root/dist" ] || [ -z "$(ls -A "$root/dist")" ]; then
  echo "dist/ is empty. Run: HEKATE_PSEUDO=1 cargo xtask dist" >&2
  exit 1
fi
if [ ! -f "$root/apps/demo/out/index.html" ]; then
  echo "apps/demo/out/ is missing. Run: pnpm --filter @hekate/demo build" >&2
  exit 1
fi
version=$(ls "$root/dist" | sort | tail -n 1)
if ! grep -q "/$version/hekate.js" "$root/apps/demo/out/index.html"; then
  echo "apps/demo/out/ is not for dist/$version. Run: pnpm --filter @hekate/demo build" >&2
  exit 1
fi

server=hekate-e2e-server
cleanup() {
  "$DOCKER" rm -f "$server" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cleanup

"$DOCKER" build --quiet --tag hekate-dev "$root/dev" >/dev/null
"$DOCKER" run --detach --name "$server" \
  --volume "$root/dist:/srv/dist:ro" \
  --volume "$root/apps/demo/out:/srv/demo:ro" \
  hekate-dev >/dev/null

# Wait until the server answers on both ports.
ready=0
for _ in $(seq 1 40); do
  if "$DOCKER" run --rm --network "container:$server" busybox:latest \
    sh -c "wget -q -O /dev/null http://localhost:8080/ && wget -q -O /dev/null http://localhost:8081/$version/sri.txt" \
    >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  echo "The server did not start. Logs:" >&2
  "$DOCKER" logs "$server" >&2 || true
  exit 1
fi

# The tests read dist/ and wordlists/ from the repository. They run inside the mounted repository.
"$DOCKER" run --rm --init --ipc=host \
  --network "container:$server" \
  --volume "$root:/work" \
  --workdir /work/tests/e2e \
  --env CI="${CI:-}" \
  --env E2E_WORKERS="${E2E_WORKERS:-}" \
  --env HEKATE_VERSION="${HEKATE_VERSION:-}" \
  "$image" \
  node ./node_modules/@playwright/test/cli.js test "$@"
