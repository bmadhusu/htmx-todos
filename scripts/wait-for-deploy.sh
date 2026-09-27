#!/usr/bin/env bash
# Poll a deployed /healthz until it reports the expected commit.
#
# A deploy is not successful because a platform accepted a push; it is successful
# when the live service answers with the commit you pushed. That is the property
# /healthz exposes, so this checks it rather than assuming it.
#
# Usage: wait-for-deploy.sh <base-url> <expected-sha> [attempts] [interval-seconds]
set -euo pipefail

BASE_URL="${1:?usage: wait-for-deploy.sh <base-url> <expected-sha> [attempts] [interval]}"
EXPECTED="${2:?expected commit SHA required}"
ATTEMPTS="${3:-30}"
INTERVAL="${4:-10}"

echo "waiting for ${BASE_URL}/healthz to report ${EXPECTED:0:8}"
echo "  up to ${ATTEMPTS} attempts, ${INTERVAL}s apart ($((ATTEMPTS * INTERVAL))s total)"

for attempt in $(seq 1 "${ATTEMPTS}"); do
  body="$(curl -fsS -m 10 "${BASE_URL}/healthz" 2>/dev/null || true)"
  version="$(printf '%s' "${body}" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

  if [ "${version}" = "${EXPECTED}" ]; then
    echo "✅ live after ${attempt} attempt(s): ${version:0:8}"
    exit 0
  fi

  if [ -z "${body}" ]; then
    echo "  attempt ${attempt}/${ATTEMPTS}: no response yet"
  else
    short="${version:0:8}"
    echo "  attempt ${attempt}/${ATTEMPTS}: live is ${short:-unparseable}"
  fi

  # No point sleeping after the last look.
  if [ "${attempt}" -lt "${ATTEMPTS}" ]; then
    sleep "${INTERVAL}"
  fi
done

echo "❌ ${BASE_URL} never reported ${EXPECTED:0:8} after $((ATTEMPTS * INTERVAL))s" >&2
echo "   last response: ${body:-<none>}" >&2
exit 1
