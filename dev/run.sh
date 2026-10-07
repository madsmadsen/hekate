#!/bin/sh
# Build and start the Hekate development server (PRD section 9.1).
# Run it from any folder. It needs a built dist/ and a built apps/demo/out/.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)

docker build --tag hekate-dev "$root/dev"

echo "Demo page: http://localhost:${HEKATE_DEMO_PORT:-18080}  Assets: http://localhost:18081"
docker run --rm --name hekate-dev \
  --publish "${HEKATE_DEMO_PORT:-18080}:18080" \
  --publish 18081:18081 \
  --volume "$root/dist:/srv/dist:ro" \
  --volume "$root/apps/demo/out:/srv/demo:ro" \
  hekate-dev
