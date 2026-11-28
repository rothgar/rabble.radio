#!/usr/bin/env bash
#---
# name: livekit
# description: LiveKit server in --dev mode (key devkey / secret secret) for the live room
# features: [docker]
# ports: 7880
#---
#
# The live room needs a LiveKit SFU. In dev mode the server accepts the fixed
# API key `devkey` / secret `secret`, which `.env.local` (written by
# pre-harness) points the app at.

set -euo pipefail

IMAGE=livekit/livekit-server:v1.13.5

if command -v livekit-server >/dev/null 2>&1; then
  exec livekit-server --dev --bind 0.0.0.0
fi

if ! docker info >/dev/null 2>&1; then
  echo "livekit: neither livekit-server nor a usable docker; the live room is unavailable in this box" >&2
  exit 0
fi

docker rm -f rabble-livekit >/dev/null 2>&1 || true
exec docker run --rm --name rabble-livekit --network host "$IMAGE" --dev --bind 0.0.0.0
