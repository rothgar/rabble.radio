#!/usr/bin/env bash
# Create or update a discobox harness config that runs Claude Code through an
# Anthropic-compatible gateway with a chosen model. One config per job lets
# triage and delivery use different models:
#
#   scripts/discobox-gateway-harness.sh aperture-triage  claude-sonnet-5 claude-haiku-4-5
#   scripts/discobox-gateway-harness.sh aperture-deliver claude-opus-5   claude-haiku-4-5
#
#   SLUG         the harness config (`discobox run -H SLUG`, manager.json
#                workers.harness / workers.harnessByJob)
#   MODEL        the gateway's model id for Claude Code's main turns, and
#                what the opus and sonnet aliases map to
#   SMALL_MODEL  optional; what the haiku alias and small/fast tasks map to
#                (default: MODEL)
#
# Environment:
#   GATEWAY_URL        base URL (default https://ai.gerbil-dragon.ts.net, the
#                      tailnet proxy that meters usage per person and forwards
#                      the box's own Anthropic credential; its model ids are
#                      at GET /v1/models)
#   GATEWAY_SECRET     the project secret holding the credential (default
#                      anthropic)
#   GATEWAY_SECRET_AS  the variable the harness wants it in (default
#                      CLAUDE_CODE_OAUTH_TOKEN for a `claude setup-token`
#                      subscription token; ANTHROPIC_API_KEY for an API key)
#
# The secret is created once, routed to the gateway host (and to
# api.anthropic.com so the same token works on the plain claude-code harness):
#   discobox secret create --name anthropic --type token \
#     --route ai.gerbil-dragon.ts.net --route api.anthropic.com \
#     --ttl forever --max-binding-ttl forever --token "$TOKEN"
# It is bound to the config on first create; the box only ever sees a
# sentinel that its pool swaps on the way to the gateway. Running the script
# again with a new model only rewrites the settings file; boxes already
# running keep the model they started with.
set -euo pipefail

slug=${1:?usage: discobox-gateway-harness.sh SLUG MODEL [SMALL_MODEL]}
model=${2:?usage: discobox-gateway-harness.sh SLUG MODEL [SMALL_MODEL]}
small=${3:-$model}
discobox=${DISCOBOX:-discobox}
secret=${GATEWAY_SECRET:-anthropic}
gateway=${GATEWAY_URL:-https://ai.gerbil-dragon.ts.net}
secret_as=${GATEWAY_SECRET_AS:-CLAUDE_CODE_OAUTH_TOKEN}
host=${gateway#*://}; host=${host%%/*}

tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
# The built-in claude-code settings (theme, no permission prompts) plus the
# gateway and model mapping. `env` here is applied by Claude Code at start.
jq -n --arg m "$model" --arg s "$small" --arg g "$gateway" '{
  theme: "dark",
  skipDangerousModePermissionPrompt: true,
  permissions: { defaultMode: "bypassPermissions" },
  model: $m,
  env: {
    ANTHROPIC_BASE_URL: $g,
    ANTHROPIC_MODEL: $m,
    ANTHROPIC_DEFAULT_OPUS_MODEL: $m,
    ANTHROPIC_DEFAULT_SONNET_MODEL: $m,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: $s,
    ANTHROPIC_SMALL_FAST_MODEL: $s
  }
}' > "$tmp"

# How the credential reaches Claude Code. The harness declares its secrets as
# file-delivered: the pool substitutes {"$secret": "VAR"} in a configured file
# with the sentinel. For ANTHROPIC_API_KEY the server generates that file
# (.claude.json primaryApiKey) itself; for CLAUDE_CODE_OAUTH_TOKEN it does not
# (v0.19.5), so the config ships a credentials file with the placeholder.
# Variables in .claude/settings.json `env` are not substituted.
files=(--file ".claude/settings.json=@$tmp")
if [ "$secret_as" = CLAUDE_CODE_OAUTH_TOKEN ]; then
  creds=$(mktemp); trap 'rm -f "$tmp" "$creds"' EXIT
  jq -n '{claudeAiOauth: {accessToken: {"$secret": "CLAUDE_CODE_OAUTH_TOKEN"}, refreshToken: "",
          expiresAt: 4102444800000, scopes: ["user:inference", "user:profile"], subscriptionType: "max"}}' > "$creds"
  files+=(--file ".claude/.credentials.json=@$creds" --create-only-file .claude/.credentials.json)
fi

if "$discobox" admin harness get "$slug" >/dev/null 2>&1; then
  "$discobox" admin harness update "$slug" --name "$slug ($model)" "${files[@]}" --egress-allow "$host"
else
  "$discobox" admin harness create --slug "$slug" --name "$slug ($model)" \
    --extends claude-code "${files[@]}"
  "$discobox" admin harness update "$slug" --egress-allow "$host"
fi

# Bind the credential once; a binding survives later updates of the settings file.
if ! "$discobox" admin harness secret ls "$slug" -o json | jq -e '.secretBindings | length > 0' >/dev/null 2>&1; then
  if ! "$discobox" secret bind "$secret" --harness "$slug" --as "$secret_as" --for forever; then
    cat >&2 <<MSG
$slug is created but has no credential. Create the secret once, then bind it:
  discobox secret create --name $secret --type token --route $host --route api.anthropic.com \
    --ttl forever --max-binding-ttl forever --token "\$TOKEN"
  discobox secret bind $secret --harness $slug --as $secret_as --for forever
MSG
  fi
fi

"$discobox" admin harness secret ls "$slug"
