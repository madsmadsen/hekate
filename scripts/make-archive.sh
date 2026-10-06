#!/bin/sh
# FR-51: make the release archive hekate-<version>.tar.gz from dist/<version>/.
# The archive is the same for the same files: sorted names, fixed time, no owner.
#
# Usage: scripts/make-archive.sh <version> <folder-with-version-folder> <output-dir>
set -eu

version=$1
dist=$2
out=$3

# The time of the release commit. HEKATE_ARCHIVE_TIME (Unix seconds) overrides it.
time=${HEKATE_ARCHIVE_TIME:-$(git show -s --format=%ct HEAD)}
archive="$out/hekate-$version.tar.gz"

mkdir -p "$out"
tar --sort=name --mtime="@$time" --owner=0 --group=0 --numeric-owner \
  --create --file - --directory "$dist" "$version" | gzip -n -9 > "$archive"
( cd "$out" && sha256sum "hekate-$version.tar.gz" > "hekate-$version.tar.gz.sha256" )
echo "Made $archive"
