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
cd "$(dirname "$0")/../.."

# pre-harness normally ran first; cover a box whose service started earlier.
until [ -d node_modules/.prisma/client ] && [ -f .env.local ]; do sleep 2; done

exec pnpm dev --port 3000
