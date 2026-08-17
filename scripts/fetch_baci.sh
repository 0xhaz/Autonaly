#!/usr/bin/env bash
# CEPII throttles to ~50 KB/s per connection but honours byte ranges, so a
# single-stream download of the 287 MB archive takes ~100 minutes. Ten ranged
# connections bring that to ~10. Resumable: existing complete parts are skipped.
set -uo pipefail

REV="${1:-HS22}"
VER="${2:-V202601}"
N="${3:-10}"

DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
URL="https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_${REV}_${VER}.zip"
OUT="${DATA_DIR}/BACI_${REV}_${VER}.zip"
PARTS="${DATA_DIR}/.parts_${REV}"

mkdir -p "$PARTS"

TOTAL=$(curl -sIL "$URL" | awk 'BEGIN{IGNORECASE=1}/^content-length:/{v=$2}END{print v}' | tr -d '\r')
[ -z "$TOTAL" ] && { echo "could not determine size for $URL"; exit 1; }
CHUNK=$(( (TOTAL + N - 1) / N ))
echo "url=$URL"
echo "total=$TOTAL bytes  parts=$N  chunk=$CHUNK"

for i in $(seq 0 $((N-1))); do
  START=$(( i * CHUNK ))
  END=$(( START + CHUNK - 1 ))
  [ $END -ge $TOTAL ] && END=$((TOTAL-1))
  WANT=$(( END - START + 1 ))
  P="${PARTS}/p$(printf %02d "$i")"

  if [ -f "$P" ] && [ "$(wc -c < "$P" | tr -d ' ')" = "$WANT" ]; then
    echo "part $i complete, skipping"
    continue
  fi
  curl -s -r "${START}-${END}" -o "$P" --retry 8 --retry-delay 3 --retry-all-errors "$URL" &
done
wait

for i in $(seq 0 $((N-1))); do
  P="${PARTS}/p$(printf %02d "$i")"
  [ -f "$P" ] || { echo "MISSING part $i"; exit 1; }
done

cat "${PARTS}"/p* > "$OUT"
GOT=$(wc -c < "$OUT" | tr -d ' ')
if [ "$GOT" != "$TOTAL" ]; then
  echo "SIZE MISMATCH: got $GOT want $TOTAL — rerun to resume"
  exit 1
fi

if unzip -t "$OUT" > /dev/null 2>&1; then
  rm -rf "$PARTS"
  echo "OK $OUT ($GOT bytes, archive integrity verified)"
else
  echo "ARCHIVE CORRUPT — parts kept at $PARTS for retry"
  exit 1
fi
