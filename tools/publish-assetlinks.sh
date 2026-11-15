#!/usr/bin/env bash
# Publish the Digital Asset Links file that lets the Android app open Temi
# full-screen, without a browser address bar.
#
#   bash tools/publish-assetlinks.sh "AA:BB:...:FF" ["second fingerprint" ...]
#
# Pass the SHA-256 fingerprint of your signing key (Bubblewrap and PWABuilder
# both print it). If you publish through Google Play, also pass the "App
# signing key" fingerprint shown in Play Console > Setup > App signing.
#
# The file has to live at the ROOT of the site's origin
# (https://<you>.github.io/.well-known/assetlinks.json), which on GitHub Pages
# means a repository called <you>.github.io. This script creates that
# repository if you don't have one, or adds the file to it if you do.
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: $0 <SHA-256 fingerprint> [more fingerprints]"; exit 1; }
PACKAGE="${TEMI_PACKAGE:-io.github.denzeldenys.temi}"
LOGIN="$(gh api user --jq .login)"
REPO="$LOGIN.github.io"
WORK="$(mktemp -d)"

if gh repo view "$LOGIN/$REPO" >/dev/null 2>&1; then
  gh repo clone "$LOGIN/$REPO" "$WORK" -- -q
  NEW=0
else
  git -C "$WORK" init -q -b main
  NEW=1
fi

PRINTS="$(printf '"%s", ' "$@")"
mkdir -p "$WORK/.well-known"
touch "$WORK/.nojekyll"   # GitHub Pages skips dot-folders without this
cat > "$WORK/.well-known/assetlinks.json" <<EOF
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "$PACKAGE",
      "sha256_cert_fingerprints": [${PRINTS%, }]
    }
  }
]
EOF

cd "$WORK"
git add -A
git commit -q -m "Digital Asset Links for Temi" || echo "(no change)"
if [ "$NEW" = 1 ]; then
  gh repo create "$REPO" --public --source=. --push
else
  git push -q
fi
echo "Published. In a minute, check: https://$LOGIN.github.io/.well-known/assetlinks.json"
