#!/bin/sh
# Restores the archive files over 5 MiB (the ladder pilot's hidden cases.json
# files and brag-output/brag.mp4) at their original paths. They live in a
# GitHub release so every tracked file stays under the Claude plugin
# directory's 5 MiB limit. Run from anywhere: sh experiments/fetch-large-files.sh
set -eu
cd "$(dirname "$0")/.."
base=https://github.com/lunox-work/duediligence/releases/download/experiments-large-files-2026-11-11
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$base/duediligence-experiments-large-files.tar.xz" -o "$tmp/files.tar.xz"
curl -fsSL "$base/duediligence-experiments-large-files.sha256" -o "$tmp/files.sha256"
tar -xJf "$tmp/files.tar.xz"
shasum -a 256 -c "$tmp/files.sha256" >/dev/null
echo "restored $(wc -l < "$tmp/files.sha256" | tr -d ' ') files"
