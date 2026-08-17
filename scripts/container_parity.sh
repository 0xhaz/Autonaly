#!/usr/bin/env bash
# Container parity: the deployed image must answer exactly as the local process.
#
# Checked here in P2/P5 rather than at cutover, so a packaging difference is
# found while it is cheap. Also audits that the engine image contains no LLM
# library — the deterministic boundary is a property of the dependency graph.
set -uo pipefail

REQ_CHOKE='{"event_key":"parity","chokepoint":"suez","transit_reduction":0.7114,"duration_months":1,"top_n":20}'
REQ_EXPO='{"event_key":"parity","sources":["RUS","UKR"],"baskets":["wheat"],"severity":{"label":"severe","transit_reduction":1.0,"duration_months":6},"top_n":20}'

docker rm -f autonaly-engine-parity >/dev/null 2>&1
docker run -d --name autonaly-engine-parity -p 8099:8080 \
  -e AUTONALY_ENV=local -e AUTONALY_ARTIFACT_ROOT=/artifacts \
  -v "$PWD/artifacts:/artifacts:ro" autonaly-engine:local >/dev/null

until curl -s -m 2 localhost:8099/health >/dev/null 2>&1; do sleep 2; done
until curl -s -m 2 localhost:8080/health >/dev/null 2>&1; do
  echo "  waiting for local engine on :8080 (run 'make engine-local')"; sleep 3
done

fail=0
for pair in "chokepoint:$REQ_CHOKE" "exposure:$REQ_EXPO"; do
  route="${pair%%:*}"; body="${pair#*:}"
  a=$(curl -s -X POST "localhost:8080/$route" -H 'content-type: application/json' -d "$body")
  b=$(curl -s -X POST "localhost:8099/$route" -H 'content-type: application/json' -d "$body")
  if [ "$a" = "$b" ]; then echo "  PASS  /$route identical (${#a} bytes)"
  else echo "  FAIL  /$route differs"; fail=1; fi
done

a=$(curl -s localhost:8080/concentration/rare_earth_magnets)
b=$(curl -s localhost:8099/concentration/rare_earth_magnets)
[ "$a" = "$b" ] && echo "  PASS  /concentration identical" || { echo "  FAIL  /concentration differs"; fail=1; }

echo "  --- dependency audit ---"
docker run --rm autonaly-engine:local python -c "
import importlib.util as u, sys
bad = [m for m in ('google.genai','google.adk') if u.find_spec(m) is not None]
print('  FAIL  engine image contains ' + ', '.join(bad) if bad else '  PASS  engine image has no LLM library')
sys.exit(1 if bad else 0)
" || fail=1

docker rm -f autonaly-engine-parity >/dev/null 2>&1
exit $fail
