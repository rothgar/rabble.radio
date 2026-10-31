#!/usr/bin/env bash
# Run a Kimchi persona non-interactively in the current directory.
#
#   scripts/kimchi-agent.sh <persona> "<task prompt>"
#
# <persona> is a file in .kimchi/agents/<persona>.md. Its frontmatter supplies
# the model (first entry of `models:`) and `thinking:` level; its body is
# appended to Kimchi's system prompt. Run it from inside the worktree you want
# edited. Prints Kimchi's final reply on stdout; exit code is Kimchi's.
set -euo pipefail

persona="${1:?usage: kimchi-agent.sh <persona> <task>}"
task="${2:?usage: kimchi-agent.sh <persona> <task>}"
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
file="$root/.kimchi/agents/$persona.md"
[ -f "$file" ] || { echo "no persona at $file" >&2; exit 2; }

# Frontmatter is between the first two '---' lines; body is everything after.
front="$(awk 'NR==1 && $0!="---"{exit} /^---$/{c++; next} c==1{print}' "$file")"
body="$(awk '/^---$/{c++; next} c>=2{print}' "$file")"

model="$(printf '%s\n' "$front" | sed -n 's/^models:[[:space:]]*\[\?[[:space:]]*"\?\([^",]*\)"\?.*/\1/p' | head -1)"
thinking="$(printf '%s\n' "$front" | sed -n 's/^thinking:[[:space:]]*//p' | head -1)"

args=(-p --no-session --auto)
[ -n "$model" ] && args+=(--model "$model")
[ -n "$thinking" ] && args+=(--thinking "$thinking")

export KIMCHI_NO_UPDATE_CHECK=1
exec kimchi "${args[@]}" --append-system-prompt "$body" "$task"
