#!/usr/bin/env bash
#---
# name: TypeScript
# type: file
# pattern: "{src,tests,scripts}/**/*.{ts,tsx}"
# description: tsc --noEmit over the whole project
#---
set -euo pipefail
pnpm typecheck
