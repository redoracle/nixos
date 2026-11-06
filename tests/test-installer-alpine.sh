#!/bin/sh
# Run inside the existing Alpine+Nix container. No network or host mutations.
set -eu

installer=/tmp/install_nix.sh
[ -r /etc/alpine-release ]
[ -r "$installer" ]

if [ "$(id -u)" -ne 0 ]; then
    if output="$(sh "$installer" 2>&1)"; then
        printf '%s\n' 'Installer unexpectedly succeeded as an unprivileged user' >&2
        exit 1
    fi
    case "$output" in
        *'run as root'*) ;;
        *) printf 'Missing non-root rejection: %s\n' "$output" >&2; exit 1 ;;
    esac
    printf '%s\n' 'Alpine non-root installer rejection passed.'
    exit 0
fi

dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT HUP INT TERM
mkdir -p "$dir/bin"
export INSTALLER_TEST_APK_LOG="$dir/apk.log"
export INSTALLER_TEST_NIX_LOG="$dir/nix.log"

cat > "$dir/bin/apk" <<'APK'
#!/bin/sh
printf '%s\n' "$@" > "$INSTALLER_TEST_APK_LOG"
if [ "$INSTALLER_TEST_APK_FAIL" = 1 ]; then
    exit 41
fi
APK

cat > "$dir/bin/nix" <<'NIX'
#!/bin/sh
printf '%s\n' "$@" > "$INSTALLER_TEST_NIX_LOG"
printf '%s\n' 'nix (Nix) mocked installer validation'
NIX
chmod 755 "$dir/bin/apk" "$dir/bin/nix"
PATH="$dir/bin:$PATH"
export PATH

# Happy path: verify *exact* apk arguments and the post-install probe.
output="$(sh "$installer")"
expected="$(printf 'add\n--no-cache\nnix\nnix-openrc')"
actual="$(cat "$INSTALLER_TEST_APK_LOG")"
[ "$actual" = "$expected" ] || {
    printf 'Unexpected apk invocation:\n%s\n' "$actual" >&2
    exit 1
}
[ "$(cat "$INSTALLER_TEST_NIX_LOG")" = '--version' ]
case "$output" in
    *'Nix packages are installed'*'rc-service nix-daemon start'*) ;;
    *) printf 'Missing documented next steps:\n%s\n' "$output" >&2; exit 1 ;;
esac

# A failed apk install must abort, without pretending that Nix is installed.
rm -f "$INSTALLER_TEST_APK_LOG" "$INSTALLER_TEST_NIX_LOG"
if INSTALLER_TEST_APK_FAIL=1 sh "$installer" > "$dir/failed.log" 2>&1; then
    printf '%s\n' 'Installer ignored a failing apk package installation' >&2
    exit 1
fi
[ -r "$INSTALLER_TEST_APK_LOG" ]
[ ! -e "$INSTALLER_TEST_NIX_LOG" ]
if grep -q 'Nix packages are installed' "$dir/failed.log"; then
    printf '%s\n' 'Installer falsely reported success after apk failure' >&2
    exit 1
fi

# Argument validation precedes package operations.
rm -f "$INSTALLER_TEST_APK_LOG"
if sh "$installer" --invalid > "$dir/invalid.log" 2>&1; then
    printf '%s\n' 'Installer unexpectedly accepted an invalid argument' >&2
    exit 1
fi
[ ! -e "$INSTALLER_TEST_APK_LOG" ]

printf '%s\n' 'Alpine root installer, apk failure and argument contract passed.'
