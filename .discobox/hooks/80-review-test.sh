#!/usr/bin/env bash
#---
# name: Vitest
# type: file
# pattern: "{src,tests}/**/*.{ts,tsx}"
# phase: review
# description: The full vitest suite, at review time rather than on every save
#---
set -euo pipefail
pnpm test
