#!/bin/sh
# Install the Alpine-packaged Nix tools. Host daemon setup is an explicit choice.
set -eu

usage() {
    cat <<'USAGE'
Usage: sh install_nix.sh [--help]

Install the Alpine Linux nix and nix-openrc packages using apk.
Run as root on an Alpine host; start the OpenRC daemon separately.
No remote scripts, version scraping, or unverified archives are used.
USAGE
}

if [ "${1:-}" = '--help' ] && [ "$#" -eq 1 ]; then
    usage
    exit 0
fi
if [ "$#" -ne 0 ]; then
    usage >&2
    exit 2
fi
if [ ! -r /etc/alpine-release ]; then
    printf '%s\n' 'Error: this installer supports Alpine Linux only.' >&2
    exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
    printf '%s\n' 'Error: run as root (for example, sudo sh install_nix.sh).' >&2
    exit 1
fi

apk add --no-cache nix nix-openrc
nix --version
cat <<'NEXT'

Nix packages are installed. On a normal Alpine/OpenRC host, start the
multi-user daemon explicitly when you are ready:
  rc-update add nix-daemon default
  rc-service nix-daemon start

This script deliberately does not change existing /nix permissions,
create users, or modify your nix.conf. See README.md for details.
NEXT
