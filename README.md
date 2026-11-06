# Alpine Linux + Nix

[![CI](https://github.com/redoracle/nixos/actions/workflows/ci.yml/badge.svg)](https://github.com/redoracle/nixos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small, non-root Alpine Linux container with the **Nix package manager** installed from Alpine's signed package repositories. This project is **not NixOS**: NixOS is a separate operating system with a declarative system configuration. This image runs Alpine with Nix available for development and experimentation.

## Quick start

Requirements: Docker with BuildKit, or an equivalent recent container engine.

```sh
git clone https://github.com/redoracle/nixos.git
cd nixos
docker build --tag alpine-nix:local .
docker run --rm -it alpine-nix:local
```

Inside the container:

```sh
nix --version
nix-instantiate --eval --expr '1 + 1'
nix shell nixpkgs#hello
```

The first two commands work offline. `nix shell` requires network access and downloads Nixpkgs on first use. To mount a working directory, add `-v "$PWD:/workspace" -w /workspace` to `docker run`. Treat the mounted directory as writable by container UID **10001** (or adjust host ownership/permissions as appropriate).

## Architecture and supported platforms

- **Base:** Alpine Linux `3.24.4` (stable branch), rather than an unpredictable `latest` tag.
- **Nix:** Alpine's `community` repository package; the version is determined by the selected stable Alpine repositories, not by scraping release pages or fetching a shell script.
- **Security model:** the unprivileged `nixuser` (UID/GID 10001) owns a **single-user** Nix store at `/nix`. No Docker socket, root password, privileged container, or passwordless sudo is required.
- **Isolation:** Nix sandboxing is disabled **inside the container** because ordinary container environments lack the user namespaces required by Nix's sandbox. This weakens build isolation and reproducibility. Never execute untrusted derivations in this image. Keep the container itself unprivileged and apply your own runtime restrictions.
- **Platforms:** CI attempts image builds and store smoke tests on `linux/amd64` and `linux/arm64`.

The Nix store lives inside the container by default and is lost when the container is removed. Persist it only if you understand ownership, compatibility, and trust implications of sharing a store between containers.

## Manual installation on Alpine hosts

Use Alpine's packages rather than downloading an arbitrary upstream release archive. Review the installer before running it:

```sh
git clone https://github.com/redoracle/nixos.git
cd nixos
sudo sh ./install_nix.sh
```

The installer only checks that the host is Alpine, requires root, and runs `apk add --no-cache nix nix-openrc`. **It does not start system services or change an existing Nix store.** On a normal Alpine host running OpenRC, enable and start the packaged multi-user daemon explicitly:

```sh
sudo rc-update add nix-daemon default
sudo rc-service nix-daemon start
nix --version
```

An OpenRC host needs the daemon and appropriate Nix permissions/configuration for unprivileged clients. This is a *different installation model* from the single-user Docker image. Do not use the script as a generic installation method for Debian, NixOS, macOS, or Alpine containers without OpenRC.

## Updates and reproducibility

The Dockerfile pins the Alpine **patch release**, and `apk add --no-cache` installs the versions currently available for its stable repositories. Rebuild regularly to pick up security fixes, and update the `FROM` tag after review. Nix from Alpine's repositories may lag behind the newest upstream Nix release; switching to an unverified upstream binary would not be a safe automatic upgrade.

GitHub Dependabot tracks Docker base-image and GitHub Actions version updates. CI tests proposed changes but **does not publish images** or require registry credentials. Release/publishing can be added later as a separate, reviewed workflow using least-privilege tokens and immutable image references.

This is an operationally straightforward image, **not** a bit-for-bit reproducible build: stable Alpine repositories and upstream flake references still change over time. For stronger reproducibility, pin image digests and Nix flake lock files in downstream projects.

## Verification

```sh
sh -n install_nix.sh tests/*.sh
shellcheck --shell=sh install_nix.sh tests/*.sh
docker build --tag alpine-nix:test .
docker run --rm -i alpine-nix:test sh -s < tests/smoke.sh
```

The smoke test checks non-root execution, evaluates a Nix expression, adds a file to the local Nix store, and verifies the store. GitHub Actions runs these checks on both supported architectures.

## Security and contributions

Read [SECURITY.md](SECURITY.md) before deploying images and [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. Report issues through [GitHub Issues](https://github.com/redoracle/nixos/issues). See the [Nix manual](https://nixos.org/manual/nix/stable/) and [Alpine documentation](https://wiki.alpinelinux.org/) for upstream details.

Licensed under the [MIT License](LICENSE).
