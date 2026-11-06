#!/bin/sh
# Non-destructive contract checks; never calls apk.
set -eu

help="$(sh ./install_nix.sh --help)"
case "$help" in
    *'Usage: sh install_nix.sh'*) ;;
    *) printf '%s\n' 'Missing help text' >&2; exit 1 ;;
esac

if sh ./install_nix.sh --invalid >/dev/null 2>&1; then
    printf '%s\n' 'Unknown argument was accepted' >&2
    exit 1
fi

# The Linux CI runner is not Alpine. The installer must refuse to mutate it.
if [ ! -r /etc/alpine-release ]; then
    if sh ./install_nix.sh >/dev/null 2>&1; then
        printf '%s\n' 'Non-Alpine host was accepted' >&2
        exit 1
    fi
fi
