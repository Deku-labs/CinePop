#!/usr/bin/env bash
# Bundles the PWA into ./src so Capacitor packs it inside the APK
# (no internet needed at runtime — the WebView loads files from the APK).
#
# Run this whenever the PWA changes, then `npx cap sync && cap open android`.

set -e
cd "$(dirname "$0")"

PWA_DIR="$(cd .. && pwd)"
echo "Bundling PWA from: $PWA_DIR"

# 1. Wipe + copy PWA into src/
rm -rf src
mkdir -p src/icons
cp "$PWA_DIR/index.html"             src/
cp "$PWA_DIR/app.js"                 src/
cp "$PWA_DIR/sw.js"                  src/
cp "$PWA_DIR/manifest.webmanifest"   src/
cp "$PWA_DIR/icons/"*.png            src/icons/

# 2. Rewrite IMDB_API to use the public CORS-bypass-on-Android endpoint.
#    Android WebView doesn't enforce CORS the way browsers do, so we can hit
#    IMDb's suggestion endpoint directly.
sed -i.bak \
  "s|const IMDB_API = './api/imdb';|const IMDB_API = 'https://v3.sg.media-imdb.com/suggestion';|" \
  src/app.js
rm src/app.js.bak

# 3. Use the offline config (no server.url)
cp capacitor.config.offline.json capacitor.config.json

# 4. Sync into native project (if android/ already exists)
if [ -d android ]; then
  npx cap sync android
fi

echo
echo "✓ PWA bundled into src/  ($(du -sh src | cut -f1))"
echo "  Next: npx cap open android  →  Build → Build APK"
