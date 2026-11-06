# Architecture and trust boundaries

## Scope

This project provides **Alpine Linux with the Nix package manager**. It does not provide the NixOS operating system, systemd, or the NixOS module system.

### Image build

1. Docker BuildKit pulls `alpine:3.24.4`.
2. Alpine `apk` installs `bash`, `ca-certificates`, and Alpine's `nix` package from the image's configured signed package repositories.
3. The Dockerfile creates `nixuser` (UID/GID 10001) and a writable `/nix` store, with no sudo.
4. Nix is configured for **single-user** operation and unprivileged container execution. `nix-store --init` initializes the store and basic evaluation is smoke-tested at build time.
5. The final image uses `nixuser` as its default user.

### Local verification

`tests/test-installer.sh` checks that the manual installer rejects unsupported inputs without invoking `apk`. `tests/smoke.sh` checks identity, writable Nix store, expression evaluation, adding an item to the store, and store verification.

Pull-request CI runs ShellCheck and both `linux/amd64` and `linux/arm64` image smoke tests. The release workflow invokes the same checks before creating any release.

### Release/data flow

```text
Dependabot (monthly) ---> reviewable dependency PR
                                      |
conventional commit / merged PR ---> master
                                      |
                   CI lint + amd64/arm64 build/smoke
                                      |
                          semantic-release
                                      |
                        Git tag + GitHub Release
                                      |
                 multi-arch image build / publish
                             /               \
                GHCR (required)      Docker Hub (optional)
                                      |
                       check published GHCR manifest
```

The monthly release workflow also runs verification when there are **no new commits**. Semantic-release correctly emits **no new version** when there is no releasable conventional commit. Dependencies are not automatically merged, and monthly checks do not silently retag previous releases.

## Security boundaries

- **Host vs. image:** user namespaces and Nix sandboxing inside ordinary containers are often unavailable, so `sandbox = false` is an explicit image-level compromise. Only build trusted derivations.
- **Package trust:** `apk` verifies Alpine repository metadata, but repository contents may change; this is not a bit-for-bit reproducible image.
- **Image identity:** release images are built for two architectures with provenance and SBOM enabled. Prefer digest-qualified images in deployment.
- **Secrets:** PR checks use only read permissions. Only the default-branch release job receives write permissions. Docker Hub credentials are optional and never shared with PR jobs.
- **Lifecycle:** image registry publishing and GitHub Releases run in one workflow. If registry push fails after a GitHub Release was created, the failed run must be investigated and the images repaired; the existing Git tag is not automatically re-released.

## Non-goals and possible enhancements

There is no embedded init system, privileged multi-user daemon, production security certification, or guarantee of reproducibility across time. Further hardening could pin a base-image digest, add mandatory dependency vulnerability scanning, sign release image digests via OIDC, and use a release environment with required reviewers.
