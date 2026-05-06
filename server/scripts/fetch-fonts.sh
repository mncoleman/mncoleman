#!/usr/bin/env bash
# Downloads Inter font files needed by Satori for OG image rendering.
# Source: rsms/inter v4.0 release zip — SIL Open Font License 1.1.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$SCRIPT_DIR/../assets/fonts"
mkdir -p "$DEST"

if [[ -f "$DEST/Inter-Regular.ttf" && -f "$DEST/Inter-SemiBold.ttf" ]]; then
    echo "[fonts] already present; skipping"
    ls -la "$DEST"
    exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "[fonts] downloading Inter v4.0 release..."
curl -fsSL --retry 3 \
    https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip \
    -o "$TMP/inter.zip"

echo "[fonts] extracting..."
unzip -q -o "$TMP/inter.zip" -d "$TMP/inter"

for variant in Inter-Regular Inter-SemiBold; do
    src=$(find "$TMP/inter" -name "${variant}.ttf" -not -path '*/Variable*' | head -1)
    if [[ -z "$src" ]]; then
        echo "[fonts] ERROR: ${variant}.ttf not found in archive"
        echo "[fonts] available .ttf files:"
        find "$TMP/inter" -name "*.ttf" | head -10
        exit 1
    fi
    cp "$src" "$DEST/${variant}.ttf"
    echo "[fonts] copied $variant.ttf ($(stat -f%z "$src" 2>/dev/null || stat -c%s "$src") bytes)"
done

echo "[fonts] done"
ls -la "$DEST"
