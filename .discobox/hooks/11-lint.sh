#!/usr/bin/env bash
#---
# name: ESLint
# type: file
# pattern: "{src,tests,scripts}/**/*.{ts,tsx,js,mjs}"
# description: eslint over the whole project
#---
set -euo pipefail
pnpm lint
