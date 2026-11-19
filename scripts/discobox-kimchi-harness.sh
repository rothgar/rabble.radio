#!/usr/bin/env bash
# Create or update a discobox harness config that runs Claude Code through the
# Kimchi gateway (what `kimchi claude` does on a laptop) with a chosen Kimchi
# model. One config per job lets triage and delivery use different models:
#
#   scripts/discobox-kimchi-harness.sh kimchi-triage  glm-5.3-flash
#   scripts/discobox-kimchi-harness.sh kimchi-deliver glm-5.3 glm-5.3-flash
#
#   SLUG         the harness config (`discobox run -H SLUG`, manager.json
#                workers.harness / workers.harnessByJob)
#   MODEL        the Kimchi model id (`kimchi --list-models`) Claude Code uses
#                for its main turns, and what the opus/sonnet aliases map to
#   SMALL_MODEL  optional; what the haiku alias and small/fast tasks map to
#                (default: MODEL). The gateway rejects Claude model names, so
#                every alias Claude Code might send is mapped here.
#
# Needs the project secret `kimchi` (the Kimchi API key, routed to
# llm.kimchi.dev) created once:
#   discobox secret create --name kimchi --route llm.kimchi.dev \
#     --refresh-command 'jq -r .apiKey ~/.config/kimchi/config.json' \
#     --ttl forever --max-binding-ttl forever
# The key is bound to the config as ANTHROPIC_API_KEY on first create; the
# box only ever sees a sentinel that its pool swaps on the way to the gateway.
# Running the script again with a new model only rewrites the settings file;
# boxes already running keep the model they started with.
#
# Any other Anthropic-compatible gateway works the same way through the
# environment: KIMCHI_GATEWAY (base URL), KIMCHI_SECRET (the project secret
# holding the credential) and KIMCHI_SECRET_AS (the variable the harness
# wants it in: ANTHROPIC_API_KEY for an API key, CLAUDE_CODE_OAUTH_TOKEN for
# a `claude setup-token` subscription token). The aperture proxy on the
# tailnet, which meters usage per person and forwards the client's own
# Anthropic credential:
#   KIMCHI_GATEWAY=https://ai.gerbil-dragon.ts.net KIMCHI_SECRET=anthropic \
#   KIMCHI_SECRET_AS=CLAUDE_CODE_OAUTH_TOKEN \
#   scripts/discobox-kimchi-harness.sh aperture-deliver claude-sonnet-5 claude-haiku-4-5
set -euo pipefail

slug=${1:?usage: discobox-kimchi-harness.sh SLUG MODEL [SMALL_MODEL]}
model=${2:?usage: discobox-kimchi-harness.sh SLUG MODEL [SMALL_MODEL]}
small=${3:-$model}
discobox=${DISCOBOX:-discobox}
secret=${KIMCHI_SECRET:-kimchi}
gateway=${KIMCHI_GATEWAY:-https://llm.kimchi.dev/anthropic}
secret_as=${KIMCHI_SECRET_AS:-ANTHROPIC_API_KEY}
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
    ANTHROPIC_SMALL_FAST_MODEL: $s,
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1"
  }
}' > "$tmp"

if "$discobox" admin harness get "$slug" >/dev/null 2>&1; then
  "$discobox" admin harness update "$slug" --name "$slug ($model)" \
    --file ".claude/settings.json=@$tmp" --egress-allow "$host"
else
  "$discobox" admin harness create --slug "$slug" --name "$slug ($model)" \
    --extends claude-code --file ".claude/settings.json=@$tmp"
  "$discobox" admin harness update "$slug" --egress-allow "$host"
fi

# Bind the key once; a binding survives later updates of the settings file.
if ! "$discobox" admin harness secret ls "$slug" -o json | jq -e '.secretBindings | length > 0' >/dev/null 2>&1; then
  if ! "$discobox" secret bind "$secret" --harness "$slug" --as "$secret_as" --for forever; then
    cat >&2 <<MSG
$slug is created but has no key. Create the secret once, then bind it:
  discobox secret create --name $secret --type token --route $host \
    --ttl forever --max-binding-ttl forever --token '<the credential>'
  (for Kimchi: --refresh-command 'jq -r .apiKey $HOME/.config/kimchi/config.json' instead of --token)
  discobox secret bind $secret --harness $slug --as $secret_as --for forever
MSG
  fi
fi
"$discobox" admin harness secret ls "$slug"
