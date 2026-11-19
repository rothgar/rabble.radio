#!/usr/bin/env bash
#---
# name: Prisma client
# type: file
# pattern: "prisma/schema.prisma"
# description: Regenerate the Prisma client, and insist on a D1 migration for the change
#---
set -euo pipefail
pnpm prisma:generate >/dev/null
if git diff --quiet HEAD -- prisma/d1 && [ -z "$(git ls-files --others --exclude-standard prisma/d1)" ]; then
  echo "prisma/schema.prisma changed but prisma/d1/ has no new migration." >&2
  echo "Add prisma/d1/<nnnn>_<name>.sql (see README, Schema changes) and apply it with pnpm d1:migrate:local." >&2
  exit 1
fi
