#!/bin/bash
set -euo pipefail

: "${GOOGLE_PLAY_JSON_KEY_FILE:?GOOGLE_PLAY_JSON_KEY_FILE is required}"

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
APP_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd -P)
REPO_ROOT=$(cd -- "$APP_DIR/../.." && pwd -P)
MANIFEST="$APP_DIR/src-tauri/gen/android/app/src/main/AndroidManifest.xml"
PLAY_STORE_CONFIG="$APP_DIR/src-tauri/tauri.playstore.conf.json"

if [[ "$GOOGLE_PLAY_JSON_KEY_FILE" = /* ]]; then
  key_file="$GOOGLE_PLAY_JSON_KEY_FILE"
else
  key_file="$APP_DIR/$GOOGLE_PLAY_JSON_KEY_FILE"
fi

if [[ -L "$key_file" || ! -f "$key_file" ]]; then
  echo "Google Play service-account file must be a regular, non-symlink file" >&2
  exit 1
fi
key_file=$(cd -- "$(dirname -- "$key_file")" && pwd -P)/$(basename -- "$key_file")
if [[ "$key_file" == "$REPO_ROOT"/* ]]; then
  echo "Google Play service-account file must remain outside the repository" >&2
  exit 1
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  key_mode=$(stat -f '%Lp' "$key_file")
else
  key_mode=$(stat -c '%a' "$key_file")
fi
if [[ "$key_mode" != "400" && "$key_mode" != "600" ]]; then
  echo "Google Play service-account file must use owner-only permissions" >&2
  exit 1
fi
export GOOGLE_PLAY_JSON_KEY_FILE="$key_file"

if [[ ! -f "$MANIFEST" || ! -f "$PLAY_STORE_CONFIG" ]]; then
  echo "Google Play Android release configuration is incomplete" >&2
  exit 1
fi

ised() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

INSTALL_PERMISSION_LINE='<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>'
STORAGE_PERMISSION_LINE='<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"/>'
had_install_permission=0
had_storage_permission=0

if grep -q 'REQUEST_INSTALL_PACKAGES' "$MANIFEST"; then
  had_install_permission=1
  ised "/REQUEST_INSTALL_PACKAGES/d" "$MANIFEST"
fi
if grep -q 'MANAGE_EXTERNAL_STORAGE' "$MANIFEST"; then
  had_storage_permission=1
  ised "/MANAGE_EXTERNAL_STORAGE/d" "$MANIFEST"
fi

restore_manifest() {
  if [[ "$had_install_permission" == "1" ]] && ! grep -q 'REQUEST_INSTALL_PACKAGES' "$MANIFEST"; then
    ised "/android.permission.INTERNET/a\\
    $INSTALL_PERMISSION_LINE
  " "$MANIFEST"
  fi
  if [[ "$had_storage_permission" == "1" ]] && ! grep -q 'MANAGE_EXTERNAL_STORAGE' "$MANIFEST"; then
    ised "/android.permission.WRITE_EXTERNAL_STORAGE/a\\
    $STORAGE_PERMISSION_LINE
  " "$MANIFEST"
  fi
}
trap restore_manifest EXIT

cd "$APP_DIR"
pnpm tauri android build --config "$PLAY_STORE_CONFIG"
restore_manifest
trap - EXIT

cd "$REPO_ROOT"
fastlane android upload_production
