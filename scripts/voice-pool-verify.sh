#!/usr/bin/env bash
# voice-pool-verify.sh — F29 pre-flight verification for Phase 1.4.E voice layer.
#
# Fetches the ElevenLabs premade voice catalog and reports the live state
# of the 6 voice IDs Mango Studio depends on. Output is then pasted into
# docs/phase-1.4-prompt-refactor/03-voice-pool-verification.md and consumed
# by Phase 1.4.E.T9 to reconcile voices.ts + voices.md.
#
# Usage:
#   ELEVENLABS_API_KEY=sk_... ./scripts/voice-pool-verify.sh
#
# Requirements: bash, curl, jq.

set -euo pipefail

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  echo "ERROR: ELEVENLABS_API_KEY env var is required." >&2
  echo "Usage: ELEVENLABS_API_KEY=sk_... $0" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed." >&2
  exit 1
fi

# Mango's 6-voice pool (mirrors VOICE_POOL in packages/core/src/media/voices.ts).
POOL_IDS=(
  "21m00Tcm4TlvDq8ikWAM:Rachel:female:neutral"
  "pNInz6obpgDQGcFmaJgB:Adam:male:neutral"
  "AZnzlk1XvdvUeBnXmlld:Domi:female:young"
  "EXAVITQu4vr4xnSDxMaL:Bella:female:soft"
  "ErXwobaYiN019PkySvjV:Antoni:male:warm"
  "VR6AewLTigWG4xSOukaG:Arnold:male:serious"
)

CATALOG="$(curl -fsSL \
  -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
  "https://api.elevenlabs.io/v1/voices?category=premade")"

if [[ -z "${CATALOG}" ]]; then
  echo "ERROR: empty catalog response." >&2
  exit 2
fi

echo "# F29 Voice Pool Verification"
echo
echo "Fetched: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Source: GET https://api.elevenlabs.io/v1/voices?category=premade"
echo
printf '| %-22s | %-16s | %-14s | %-14s | %s\n' \
  "id" "Mango label" "live name" "status" "preview_url"
printf '|%s|%s|%s|%s|%s\n' \
  "$(printf -- '-%.0s' {1..24})" \
  "$(printf -- '-%.0s' {1..18})" \
  "$(printf -- '-%.0s' {1..16})" \
  "$(printf -- '-%.0s' {1..16})" \
  "$(printf -- '-%.0s' {1..40})"

for entry in "${POOL_IDS[@]}"; do
  IFS=":" read -r vid mango_label slot_gender slot_tone <<<"${entry}"

  match="$(echo "${CATALOG}" | jq -r --arg id "${vid}" \
    '.voices[]? | select(.voice_id == $id) | "\(.name)|\(.preview_url // "")"')"

  if [[ -z "${match}" ]]; then
    printf '| %-22s | %-16s | %-14s | %-14s | %s\n' \
      "${vid}" "${mango_label}" "—" "MISSING (404)" "—"
  else
    live_name="${match%%|*}"
    preview_url="${match#*|}"
    if [[ "${live_name}" == "${mango_label}" ]]; then
      status="OK"
    else
      status="RENAMED"
    fi
    printf '| %-22s | %-16s | %-14s | %-14s | %s\n' \
      "${vid}" "${mango_label}" "${live_name}" "${status}" "${preview_url}"
  fi
done

echo
echo "## Suggested replacements"
echo
echo "If any row shows MISSING, pick a replacement from the catalog matching"
echo "the original slot's gender/tone (Mango label hint). Filter the full"
echo "catalog with:"
echo
echo '```bash'
echo "ELEVENLABS_API_KEY=... curl -s -H \"xi-api-key: \$ELEVENLABS_API_KEY\" \\"
echo "  https://api.elevenlabs.io/v1/voices?category=premade \\"
echo "  | jq '.voices[] | { voice_id, name, labels }'"
echo '```'
echo
echo "## Catalog totals"
echo "$(echo "${CATALOG}" | jq '.voices | length') premade voices in catalog."
