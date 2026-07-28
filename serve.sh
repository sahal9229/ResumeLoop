#!/usr/bin/env sh
# ResumeFit - start a local server and open the app.
# ES modules will not load from file://, so this is the way in.
cd "$(dirname "$0")" || exit 1

PORT=8777
URL="http://127.0.0.1:$PORT/"

echo
echo "  ResumeFit  ->  $URL"
echo "  Press Ctrl+C to stop."
echo

# open the browser once the server is up, without blocking the server itself
( sleep 1
  if   command -v open    >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi ) &

if   command -v python3 >/dev/null 2>&1; then exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python  >/dev/null 2>&1; then exec python  -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx     >/dev/null 2>&1; then exec npx --yes http-server -p "$PORT" -a 127.0.0.1 -c-1
else
  echo "  No Python or Node found. Install either one, or serve this folder"
  echo "  with any static file server on port $PORT."
  exit 1
fi
