#!/usr/bin/env bash
# Run one QA pass on the live site in a discobox and keep its transcript.
# Scheduled by the rabble-qa.timer user unit (docs/discobox.md, "QA agent");
# run it by hand to QA now. Needs the aperture-qa harness config.
#
#   QA_SOURCE   what the box checks out (default: the GitHub main branch)
#   QA_HARNESS  harness config (default aperture-qa)
#   QA_LOGDIR   where transcripts go (default ~/.local/state/rabble-qa)
set -euo pipefail
: "${DISCOBOX:=discobox}"
: "${QA_SOURCE:=https://github.com/rothgar/rabble.radio@main}"
: "${QA_HARNESS:=aperture-qa}"
: "${QA_LOGDIR:=$HOME/.local/state/rabble-qa}"
mkdir -p "$QA_LOGDIR"
log="$QA_LOGDIR/$(date -u +%Y%m%dT%H%M%SZ).log"

id=$("$DISCOBOX" run -d -H "$QA_HARNESS" "$QA_SOURCE" -p '/qa-live' | awk '/^sbx_/ {print $1; exit}')
[ -n "$id" ] || { echo "qa-live: no box started" >&2; exit 1; }
"$DISCOBOX" tag "$id" job=qa --description "QA pass on rabble.rodeo" >/dev/null 2>&1 || true
echo "qa-live: box $id, transcript $log"

# The pass takes a few minutes; give it up to 40 and then collect whatever is there.
timeout 2400 "$DISCOBOX" wait "$id" --until finished --until exit >/dev/null 2>&1 || true
"$DISCOBOX" capture "$id" --trim --scrollback 400 > "$log" 2>&1 || true
"$DISCOBOX" rm "$id" >/dev/null 2>&1 || true
tail -n 25 "$log"
