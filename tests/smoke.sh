#!/bin/sh
# Execute as the image's default (non-root) user.
set -eu

[ "$(id -u)" -eq 10001 ]
[ -w /nix ]
[ -w /nix/store ]
[ -d /nix/var/nix/db ]
printf 'Nix local store directories are initialized.\n'
nix --version
[ "$(nix-instantiate --eval --expr '1 + 1')" = 2 ]

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
printf 'store smoke test\n' > "$tmp"
printf 'Adding a test object to the Nix store...\n'
store_path="$(nix-store --add "$tmp")"
printf 'Stored path: %s\n' "$store_path"
[ -f "$store_path" ]
[ "$(cat "$store_path")" = 'store smoke test' ]
nix-store --verify
