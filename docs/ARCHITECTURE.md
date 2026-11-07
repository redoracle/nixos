# Architecture and engineering decisions

This document describes the system **as built and verified**, its trust boundaries, and its deliberate non-goals. The repository name is historical: this is **not a NixOS distribution**, but Alpine Linux with Alpine's packaged Nix command-line tools.

## System overview

```text
                    Pull request / Dependabot
                               |
                  static checks + release notes
                               |
                    Buildx image smoke tests
                       /             \
                 linux/amd64       linux/arm64
                       \             /
                        reviewed master
                               |
                   semantic-release (SemVer)
                               |
                   Git tag + GitHub Release
                               |
                  multi-platform Docker image
                     /                 \
                GHCR (primary)      Docker Hub (optional)
                     |
            Verify published arch manifest

         Separately: closed PRs -> guarded branch housekeeping
```

### Runtime image

- **Base:** pinned Alpine stable patch tag (`alpine:3.24.4` at the time of this document).
- **Dependencies:** `bash`, `ca-certificates` and `nix` installed through Alpine's signed repositories. Nix's remaining runtime dependencies come from `apk`.
- **User:** `nixuser` (UID/GID 10001) runs without sudo or root privileges.
- **Store:** `/nix/store` and `/nix/var/nix` are created before `nix-store --init`. The image uses a **single-user local store** rather than requiring a privileged daemon. The smoke test asserts a writable, initialized store, adds an object, and verifies it.
- **Configuration:** the user-specific `nix.conf` enables the `nix-command` and `flakes` features, disables the Nix build sandbox, and clears the multi-user build group.
- **Entrypoint:** interactive Bash. No init system, external network service, host daemon, or Docker socket is part of the image.

The initial implementation failed because Nix fell back to a per-user chroot store when `/nix/var/nix` was absent. The image and smoke tests now require the intended real `/nix` store.

### Manual Alpine host installation

`install_nix.sh` only installs the distribution's `nix` and `nix-openrc` packages after checking the host OS and privileges. It intentionally does not rewrite an existing Nix store or enable the OpenRC daemon. Host installations have different privileges and lifecycle requirements from the container.

## Development and verification

`.github/workflows/ci.yml` is triggered for pull requests and reused by the default-branch release workflow. It runs:

1. Actionlint validation of GitHub Actions workflows.
2. POSIX shell parsing, ShellCheck, and installer contract checks.
3. Release configuration tests and **actual** Conventional Commits release-notes generation, to catch incompatible npm dependency updates.
4. Unit tests for branch-cleanup eligibility.
5. A Buildx image build and Nix store smoke test on each supported architecture.

A successful lint-only check is **not** sufficient to verify the container. Docker build and smoke tests for `linux/amd64` and `linux/arm64` are distinct required checks.

The image does not contain the Node.js toolchain. Node.js 24 is used by GitHub CI/release maintenance jobs only.

## Delivery and maintenance

### Release flow

`.github/workflows/release.yml` runs on merges to `master`, scheduled monthly validation, and manual dispatch:

1. Reuse the complete CI verification workflow, with read-only permissions.
2. Allow the default-branch release job write permissions for GitHub Releases and GHCR.
3. Resolve Conventional Commits using semantic-release. A releasable change produces a new `vMAJOR.MINOR.PATCH` tag and GitHub Release.
4. Build/push a multi-architecture image with versioned and moving tags, plus SBOM/provenance metadata.
5. Verify that the GHCR manifest advertises AMD64 and ARM64.

If no commit warrants a release, no version or Docker tag is invented. Existing tags, including the historical invalid `v` tag, remain untouched.

A limitation remains: a GitHub Release is created **before** the registry push, so registry failure can leave a partially delivered release. The [releasing runbook](RELEASING.md) documents recovery without moving tags.

### Dependency updates

Dependabot proposes monthly updates for the Docker base, GitHub Actions, and npm release tooling. Updates are reviewed, **not automatically merged**. The conventional-changelog preset's next major is currently deferred because the release-notes generator/writer compatibility must be tested end to end. CI runs the same release-notes generation path used by production.

### Repository housekeeping

`.github/workflows/housekeeping.yml` invokes `scripts/cleanup-branches.mjs`. The script:

- Enumerates PRs and refs, preserving the default branch and every protected branch.
- Selects only exact matching HEADs of **merged** PRs from this repository, plus a short, reviewed SHA allowlist of explicitly superseded closed PRs.
- Refuses branches referenced by any open PR; re-fetches HEAD/protection/open-PR status just before deletion.
- Logs and verifies deletions. A manual dry-run mode allows reviewing the proposed operation.

Other closed but unmerged PR branches are **not** deleted automatically. Git tags and releases are never touched. Like the GitHub REST API itself, deletion cannot provide a fully atomic compare-and-delete lease; the live rechecks minimize—but cannot completely eliminate—a concurrent branch-write race.

## Security and reliability boundaries

| Boundary | Current guarantee and limitation |
| --- | --- |
| Registry content | Alpine `apk` uses distribution-managed signed repositories; stable indexes can change between builds |
| Build isolation | Nix sandboxing is **disabled** inside the container; only run trusted derivations |
| Process privileges | UID/GID 10001 in the final container; this does not replace runtime policy, network controls, or rootless container hosting |
| Local storage | `/nix` is writable to the Nix user; do not share a writable store across different trust domains |
| CI credentials | PR checks receive read-only token permissions and no container registry secrets; only master release and branch housekeeping jobs obtain scoped write permissions |
| Release identity | Semantic version tags and image manifest checks; full end-to-end atomicity across GitHub Releases and container registries is **not** provided |
| Reproducibility | Published image digests are immutable references; source builds with moving Alpine repositories or unlocked flakes are not bit-reproducible |
| Supply chain | Images request SBOM and provenance, but no independent signature enforcement, admission policy, or automatic vulnerability exception process is claimed |


## Optional Pi + Needle layer

The opt-in `Dockerfile.pi` derives from the tested vanilla image and adds a pinned Pi coding-agent CLI and local Needle 3 WebAssembly runtime. Model weights are fetched at build time as UID 10001; neither the vanilla image nor the underlying non-root Nix store setup changes.

Pi loads the local `needle_route` extension, which returns **proposed** JSON actions. `needle-cli` can subsequently execute only reviewed read-only commands or explicitly approved new workspace file creation. The 60-tool catalog is split into `system`, `apk`, `nix`, `workspace`, and `workflow` domains so Needle is not asked to reason over a monolithic list on each request. `apk` root operations and Nix builds, shells, profile mutation, flake changes and garbage collection are manual-only plans; no arbitrary shell is accepted by the Needle dispatcher.

The Pi reasoning agent still needs a supported LLM provider and retains its independent tools, including `bash`. The Needle policy is **not** a global restriction on Pi and does not make disabled Nix sandboxing safe for untrusted builds. A separate CI matrix builds both flavors and executes all catalog entries deterministically; an independent inference smoke test validates the local model without requiring an external Pi provider.

See [Pi + Needle usage, catalogs, command classes, examples and safety limits](PI-NEEDLE.md).

## Non-goals and future work

This project does not implement NixOS modules, a production multi-user Nix daemon, a privileged container, or complete sandbox isolation.

Possible future work includes OCI base-image digest pinning with verified update automation, digest signature verification, runtime vulnerability scanning, Nix input lockfiles for example workloads, and a two-stage release protocol that publishes images *before* finalizing a GitHub Release. Each change should have an explicit security/maintenance trade-off and multi-architecture CI evidence.
