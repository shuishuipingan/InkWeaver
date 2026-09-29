#!/bin/sh
set -eu

sandbox_path='/opt/InkWeaver/chrome-sandbox'
if [ ! -f "$sandbox_path" ] || [ -L "$sandbox_path" ]; then
  printf 'Missing regular Chromium sandbox helper: %s\n' "$sandbox_path" >&2
  exit 1
fi

chown root:root "$sandbox_path"
chmod 4755 "$sandbox_path"
