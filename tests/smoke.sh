#!/bin/sh
# Execute as the image's default (non-root) user.
set -eu

[ "$(id -u)" -eq 10001 ]
[ -w /nix ]
nix --version
[ "$(nix-instantiate --eval --expr '1 + 1')" = 2 ]

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
printf 'store smoke test\n' > "$tmp"
store_path="$(nix-store --add "$tmp")"
[ -f "$store_path" ]
[ "$(cat "$store_path")" = 'store smoke test' ]
nix-store --verify
