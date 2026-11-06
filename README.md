# Alpine + Nix

[![CI](https://github.com/redoracle/nixos/actions/workflows/ci.yml/badge.svg)](https://github.com/redoracle/nixos/actions/workflows/ci.yml)
[![Release workflow](https://github.com/redoracle/nixos/actions/workflows/release.yml/badge.svg)](https://github.com/redoracle/nixos/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/redoracle/nixos)](https://github.com/redoracle/nixos/releases/latest)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A small Alpine Linux container with the Nix package manager.** Packages come from Alpine's signed repositories, the container runs without root privileges, and GitHub Actions validates both AMD64 and ARM64 images before publishing release artifacts.

> [!IMPORTANT]
> This is **Alpine Linux with Nix**, **not NixOS**. It does not provide NixOS modules, declarative operating-system configuration, or systemd. The container intentionally disables *Nix's internal build sandbox* because typical container runtimes do not expose the namespace capabilities it requires. Run **trusted Nix expressions and derivations only**.

## Start with a published image

Choose the [latest verified release](https://github.com/redoracle/nixos/releases/latest). For the mutable convenience tag:

```bash
docker pull ghcr.io/redoracle/nixos:latest
docker run --rm -it ghcr.io/redoracle/nixos:latest
```

Inside the container:

```sh
nix --version
nix-instantiate --eval --expr '1 + 1'
nix-store --verify
```

For a production deployment, **use a release-specific tag** such as `ghcr.io/redoracle/nixos:v3.0.2` or an immutable `@sha256:…` image digest. The `latest` tag moves after each successful semantic release.

Optional Docker Hub mirrors are published as `docker.io/<configured-username>/nixos` if registry credentials are configured; the actual namespace depends on the repository's Docker Hub secret. GHCR is the primary publishing destination.

## Build locally

Requirements: Docker with BuildKit and, for ARM64 builds on x86 runners, an appropriate QEMU/Buildx environment.

```bash
git clone https://github.com/redoracle/nixos.git
cd nixos
docker build -t alpine-nix:local .
docker run --rm -it alpine-nix:local
```

The Dockerfile currently uses Alpine `3.24.4` and Alpine's packaged `nix`. The final process runs as `nixuser` (UID/GID `10001`). The writable Nix store is initialized within `/nix`; no passwordless sudo, Docker daemon socket, or privileged container is required.

### Working with Nix

The built-in evaluation and store checks operate without downloading Nixpkgs. To fetch a package from the upstream flake registry:

```sh
nix shell nixpkgs#hello
```

This command requires network access. Nixpkgs and package dependencies may be large and are subject to upstream availability. For your own application, commit a flake lock file to pin external inputs. See the [Nix reference manual](https://nixos.org/manual/nix/stable/) for exact command semantics.

To mount a working directory, use a bind mount such as `--mount type=bind,src="$PWD",dst=/workspace -w /workspace`. Ensure that UID 10001 can write the files it needs. Avoid mounting secrets, host sockets, or stores shared with untrusted workloads.

The Nix store is ephemeral by default. If the container is removed, its store is removed too; persisting it requires explicit storage and ownership planning.


## Optional Pi coding agent + offline Needle tool routing

A separate [`Dockerfile.pi`](Dockerfile.pi) builds an **opt-in** Pi + Needle variant from the same vanilla Alpine + Nix image. The existing `Dockerfile` and published vanilla image remain unchanged.

```sh
docker build -t alpine-nix:local .
docker build -f Dockerfile.pi --build-arg BASE_IMAGE=alpine-nix:local -t alpine-nix-pi:local .
docker run --rm -it alpine-nix-pi:local
```

The Pi image defaults to the `pi` interactive coding agent. A **separate**, local WebAssembly-based Needle 3 tool router is available as `needle-cli`; it prints suggested JSON actions by default, and only executes a small, documented allowlist when `--execute` is supplied. **Needle is not a Pi reasoning/chat model.** The Pi agent still needs a separately configured supported LLM provider or local reasoning endpoint.

Successful versioned releases publish both `ghcr.io/redoracle/nixos:vX.Y.Z` (vanilla) and `ghcr.io/redoracle/nixos-pi:vX.Y.Z` (opt-in), verified on AMD64 and ARM64. See the detailed [Pi + Needle integration and security guide](docs/PI-NEEDLE.md) before using the model or mounting a workspace.

## Design and security

| Component | Choice | Reason |
| --- | --- | --- |
| Base image | Alpine stable patch release | Predictable distro line; security fixes via reviewed rebuilds |
| Package installation | `apk add --no-cache` | Alpine-maintained package and repository signature verification |
| Default user | `nixuser`, UID 10001 | Avoid running interactive Nix workloads as root |
| Store | Writable single-user `/nix` | No host Nix daemon or privileged Docker mode |
| Nix sandbox | Disabled inside the container | Compatibility; **do not process untrusted derivations** |
| Platforms | `linux/amd64` and `linux/arm64` | Built and smoke-tested in CI |
| Registry distribution | GHCR, optional Docker Hub | Versioned, multi-platform images with SBOM/provenance |

The base image tag, Alpine package indexes, and unpinned remote Nix inputs can change over time. **This is not a bit-for-bit reproducible image.** Prefer a digest-pinned published image and flake lock files where reproducibility matters.

Details: [Architecture and trust boundaries](docs/ARCHITECTURE.md), [Security policy](SECURITY.md).

## Automated releases and maintenance

The repository uses **Conventional Commits and semantic-release**. CI runs before publishing; only the protected default-branch release workflow has write credentials.

| Event | Behavior |
| --- | --- |
| Pull request | Actionlint, ShellCheck, installer tests, release-notes compatibility tests, AMD64 and ARM64 image smoke tests |
| `fix:` / `fix(deps):` merge | Patch release (`vX.Y.Z`) |
| `feat:` merge | Minor release |
| Breaking Conventional Commit | Major release |
| `docs:` / `chore:` alone | No new semantic release |
| Monthly Dependabot | Reviewable Docker, GitHub Actions and npm release-tooling PRs; **not auto-merged** |
| Monthly release schedule | Runs the same tests, but creates no new version without releasable commits |
| Branch housekeeping | Removes only verified closed/merged PR heads or explicit SHA-allowlisted superseded heads; skips active/protected branches |

Successful releases create a GitHub Release and build multi-architecture images for **`ghcr.io/redoracle/nixos`**. Tags include `:vX.Y.Z`, `:X.Y.Z` and `:latest`, and builds request SBOM/provenance attestations. Docker Hub uses the same tags when both optional secrets are configured.

Some dependency majors must be deferred until their **runtime compatibility** is proven. In particular, the currently installed Conventional Commits release-notes generator is tested with preset v9; Dependabot's preset v10 major upgrade is intentionally excluded pending compatibility.

For workflows, required secrets, rollback procedures, recovery from partial releases, and branch cleanup controls, see [Release and maintenance handbook](docs/RELEASING.md).

## Manual installation on an Alpine host

Use the Alpine package manager. This path is **not** equivalent to the container's non-root store design.

```sh
git clone https://github.com/redoracle/nixos.git
cd nixos
sudo sh ./install_nix.sh
```

The script verifies it is running on Alpine as root, then installs `nix` and `nix-openrc`. It deliberately does **not** start a daemon, change an existing store, or rewrite host configuration. For an Alpine/OpenRC host, opt in to the packaged multi-user daemon separately:

```sh
sudo rc-update add nix-daemon default
sudo rc-service nix-daemon start
nix --version
```

Review Alpine OpenRC and Nix permissions for the target machine before enabling an unprivileged client or modifying a pre-existing store.

## Verification

```sh
sh -n install_nix.sh tests/*.sh
shellcheck --shell=sh install_nix.sh tests/*.sh
sh tests/test-installer.sh
node --test tests/branch-cleanup.test.mjs
npm install --ignore-scripts --no-audit --no-fund
npm run test:release
npm run test:release-notes
docker build -t alpine-nix:test .
docker run --rm -i alpine-nix:test sh -s < tests/smoke.sh
```

CI additionally checks workflow syntax and runs Docker smoke tests for both target architectures. Npm tooling is used **only for GitHub release automation**, not included in the published image.

## Project documentation

- [Architecture](docs/ARCHITECTURE.md): image layout, lifecycle, security boundaries, and engineering decisions
- [Releasing](docs/RELEASING.md): SemVer, dependency reviews, registries, recovery, branch cleanup
- [Changelog](CHANGELOG.md): canonical release history and versioning migration
- [Security](SECURITY.md): supported builds, risk disclosure, threat model
- [Contributing](CONTRIBUTING.md): development and PR acceptance requirements
- [Support](SUPPORT.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [License](LICENSE)

Issues and improvements are welcome through the [GitHub issue templates](https://github.com/redoracle/nixos/issues/new/choose).
