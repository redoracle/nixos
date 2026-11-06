# Alpine Linux + Nix

[![CI](https://github.com/redoracle/nixos/actions/workflows/ci.yml/badge.svg)](https://github.com/redoracle/nixos/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/redoracle/nixos?display_name=tag)](https://github.com/redoracle/nixos/releases)
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

## Releases and monthly maintenance

The [release workflow](.github/workflows/release.yml) verifies both architectures, uses **semantic-release** to create GitHub releases from reviewed Conventional Commits, and publishes matching Docker images. Tags use `vMAJOR.MINOR.PATCH` (for example, `v3.0.0`) and represent the **container's compatibility**, not the version of Nix packaged by Alpine.

| Event | What happens |
| --- | --- |
| Pull request | Shell lint, installer tests, semantic-release config tests, and `amd64` / `arm64` container smoke tests. No publish permissions or registry secrets. |
| Merge to `master` | The same checks run first. A `fix:` commit produces a patch release, `feat:` a minor release, and a breaking change a major release. Releases are skipped if there are no releasable commits. |
| Monthly Dependabot | Reviewable PRs for Docker/Alpine, GitHub Actions, and npm-based semantic-release plugins. Dependency update commits use the `fix(deps):` prefix. |
| First day of each month | Scheduled verification at **03:17 UTC**, followed by release evaluation. A successful no-change run does **not** create a meaningless new tag. |

Every new semantic release publishes **`ghcr.io/redoracle/nixos:vX.Y.Z`**, `:X.Y.Z`, and `:latest` as multi-architecture images with SBOM and provenance. When Docker Hub repository credentials are configured, the same version and `latest` tags are published there as well. Use the versioned tag or, ideally, an immutable digest in deployments. The GitHub Release is generated before the registry publish step; if publication fails, treat the workflow as failed and follow the [recovery procedure](docs/RELEASING.md).

**Docker Hub setup:** provide repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (legacy `DOCKER_USERNAME` / `DOCKER_PASSWORD` are also supported). GHCR uses the built-in GitHub token and requires no additional secret. The GHCR package may need its visibility set to public after first publication. The release workflow never publishes images from untrusted PRs.

See the [release and maintenance handbook](docs/RELEASING.md) for configuration, release rules, maintenance schedules, and recovery.

## Updates and reproducibility

The Dockerfile pins the Alpine **patch release**, and `apk add --no-cache` installs the versions currently available for its stable repositories. Rebuild regularly to pick up security fixes, and update the `FROM` tag after review. Nix from Alpine's repositories may lag behind the newest upstream Nix release; switching to an unverified upstream binary would not be a safe automatic upgrade.

GitHub Dependabot checks Docker/Alpine, GitHub Actions, and npm-based release dependencies monthly; upgrades are **reviewed rather than auto-merged**. Pull-request CI never receives publication credentials. The privileged release workflow publishes only from `master` after checks succeed. Installed Nix is updated through Alpine's maintained package repositories when images are rebuilt.

This is an operationally straightforward image, **not** a bit-for-bit reproducible build: stable Alpine repositories and upstream flake references still change over time. For stronger reproducibility, pin image digests and Nix flake lock files in downstream projects.

## Verification

```sh
sh -n install_nix.sh tests/*.sh
shellcheck --shell=sh install_nix.sh tests/*.sh
sh tests/test-installer.sh
node scripts/check-release.mjs
docker build --tag alpine-nix:test .
docker run --rm -i alpine-nix:test sh -s < tests/smoke.sh
```

The smoke test checks non-root execution, evaluates a Nix expression, adds a file to the local Nix store, and verifies the store. GitHub Actions runs these checks on both supported architectures.

## Security and contributions

Read [SECURITY.md](SECURITY.md) before deploying images, [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for participation standards. The [architecture guide](docs/ARCHITECTURE.md) and [release handbook](docs/RELEASING.md) document design, trust boundaries, and publishing. Use structured [GitHub Issues](https://github.com/redoracle/nixos/issues) for reports and requests. See the [Nix manual](https://nixos.org/manual/nix/stable/) and [Alpine documentation](https://wiki.alpinelinux.org/) for upstream details.

Licensed under the [MIT License](LICENSE).
