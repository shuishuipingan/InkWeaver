#!/usr/bin/env bash
set -euo pipefail

test -d "$GITHUB_WORKSPACE"
node_binary="$(readlink -f "$(command -v node)")"
node_root="$(dirname "$(dirname "$node_binary")")"
build_image='ubuntu:22.04@sha256:829f6df217bcbae2b371026e81711d1a787c61b2967ad09d015063663ebafbf7'

docker run --rm --interactive --platform linux/amd64 \
  --volume "$GITHUB_WORKSPACE:$GITHUB_WORKSPACE" \
  --volume "$node_root:/host-node:ro" \
  --workdir "$GITHUB_WORKSPACE" \
  "$build_image" bash -s <<'IN_CONTAINER'
set -euo pipefail
export PATH="/host-node/bin:$PATH"
export DEBIAN_FRONTEND=noninteractive
test "$(node --version)" = 'v22.23.1'
apt-get update -qq
apt-get install -y -qq build-essential python3 pkg-config libsecret-1-dev libgtk-3-dev libnss3 libasound2 libxss1
corepack prepare pnpm@11.11.0 --activate
test "$(pnpm --version)" = '11.11.0'
pnpm install --frozen-lockfile --reporter=append-only
pnpm run build:linux:artifacts
IN_CONTAINER
