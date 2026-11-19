#!/usr/bin/env bash
#---
# name: web
# description: next dev on :3000 against the local D1, reading .env.local
# features: [node]
# ports: 3000
#---
#
# The app, as a box service: started at boot, its output in a service tab,
# its port forwarded to whoever has the box open. `verify-recipes` drives it.

set -euo pipefail
# A service runs in the repository root, the directory its declaration was found in.

# pre-harness normally ran first; cover a box whose service started earlier.
until [ -f .env.local ] && [ -f "$(readlink -f node_modules/@prisma/client 2>/dev/null)/../.prisma/client/index.js" ]; do sleep 2; done

exec pnpm dev --port 3000
