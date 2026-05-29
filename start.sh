#!/usr/bin/env bash
# start.sh — launches the CinePop locally.
# Boots a tiny Python server that serves the app AND proxies IMDb's
# suggestion endpoint at /api/imdb/* (avoids browser CORS errors).

set -e

PORT="${PORT:-8080}"
HOST="${HOST:-127.0.0.1}"
DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$DIR"

# ---- Need python3 (3.7+) for the proxy server ------------------------------
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "✗ Need Python 3 to run the local server." >&2
  echo "  Install Python 3, then re-run ./start.sh" >&2
  exit 1
fi

URL="http://${HOST}:${PORT}/"

echo "──────────────────────────────────────────────"
echo "  CinePop"
echo "  Open:  $URL"
echo "  Stop:  Ctrl+C"
echo "──────────────────────────────────────────────"

# ---- Open the browser shortly after the server boots -----------------------
(
  sleep 1
  if command -v xdg-open >/dev/null 2>&1;  then xdg-open  "$URL" >/dev/null 2>&1 || true
  elif command -v open    >/dev/null 2>&1; then open       "$URL" >/dev/null 2>&1 || true
  elif command -v start   >/dev/null 2>&1; then start      "$URL" >/dev/null 2>&1 || true
  fi
) &

# ---- Run the server (foreground) -------------------------------------------
exec env PORT="$PORT" HOST="$HOST" "$PY" "$DIR/server.py"
