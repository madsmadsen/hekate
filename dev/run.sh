#!/bin/sh
# Build and start the Hekate development server (PRD section 9.1).
# Run it from any folder. It needs a built dist/ and a built apps/demo/out/.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)

docker build --tag hekate-dev "$root/dev"

docker run --rm --name hekate-dev \
  --publish 8080:8080 \
  --publish 8081:8081 \
  --volume "$root/dist:/srv/dist:ro" \
  --volume "$root/apps/demo/out:/srv/demo:ro" \
  hekate-dev
