# Release and maintenance handbook

## Versioning

Release automation follows the same **semantic-release** pattern used in other public `redoracle` repositories. `master` is the sole release branch. The last valid SemVer tag is used as the starting point; old tags such as `v2.30.1` reflect historical Nix package numbering, whereas **future tags describe the container's compatibility and behavior**, not the installed Nix version.

Conventional Commit examples:

| Commit | Result |
| --- | --- |
| `fix: ...` or `fix(deps): ...` | Patch |
| `feat: ...` | Minor |
| `feat!: ...` plus a `BREAKING CHANGE:` footer | Major |
| `docs: ...`, `test: ...`, `chore: ...` | No release by default |

A PR title used for **squash merges** must retain the appropriate conventional-commit prefix and breaking-change information. Never manually overwrite a versioned release tag.

## Scheduled updates

- **Monthly Dependabot:** opens reviewable updates for Alpine Docker base image, GitHub Actions, and npm-based release tooling. The configured `fix(deps)` prefix produces patch releases after such PRs are merged.
- **Monthly scheduled release workflow:** on the first day of each month at 03:17 UTC, runs lint and both platform image smoke tests, then checks for releasable commits. If nothing changed, no GitHub release or Docker version tag is created.
- **On merge to master:** the same verification and release pipeline runs automatically for conventional commits; publication is limited to `master`.
- **Manual runs:** `Actions → Semantic release and container publishing → Run workflow` on `master`. Manual dispatch also respects semantic-release's versioning rules.

Updates are **not auto-merged**. New versions require review and green checks. Rebuilds pick up compatible Alpine package updates from its stable repositories, but newly published Nix or Alpine upstream releases do not themselves guarantee a version bump.

## Registry setup

The workflow has minimal privileges: `contents: write` and `packages: write` in the release job only. GitHub's built-in `GITHUB_TOKEN` publishes to **`ghcr.io/redoracle/nixos`**.

Optional Docker Hub publication is enabled when both repository secrets are available:

- `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (preferred), or
- `DOCKER_USERNAME` and `DOCKER_PASSWORD` (legacy compatibility).

The corresponding Docker Hub repository must exist and the token must permit pushing. Ensure that the GHCR package is configured as **public** if public pulls are expected. Never put registry credentials into the Dockerfile or GitHub repository.

Each successful release builds both `linux/amd64` and `linux/arm64` in one build and publishes these tags:

- `ghcr.io/redoracle/nixos:vX.Y.Z`
- `ghcr.io/redoracle/nixos:X.Y.Z`
- `ghcr.io/redoracle/nixos:latest`
- The equivalent `docker.io/<Docker-Hub-username>/nixos` tags, when configured.

Use `:vX.Y.Z` for pinned releases, or preferably the registry digest shown after publishing for immutable deployment. `:latest` tracks the most recent stable publication and is mutable.

## Release safety and recovery

1. Require the `Static checks` and both `Container` PR checks via branch protection/rulesets. Do not grant secrets to untrusted PR workflows.
2. Review breaking changes, vulnerability information, and the dependency diff before merging.
3. Check the `Semantic release and container publishing` workflow, GitHub Release notes, and GHCR image manifest. Docker Hub push failures fail the job when Docker Hub is configured.
4. If semantic-release has created the tag/release but registry publication failed, **do not delete or forcibly move the tag**. Investigate the failing step. Re-publish the missing image tags for the existing release from the exact tagged commit using reviewed, authenticated Docker commands, then verify both architecture manifests.
5. A rerun with an existing tag may not cause semantic-release to publish the same release again; do not mistake a green no-op rerun for successful artifact recovery.

## Local verification

```sh
sh -n install_nix.sh tests/*.sh
shellcheck --shell=sh install_nix.sh tests/*.sh
sh tests/test-installer.sh
node scripts/check-release.mjs
docker build -t alpine-nix:test .
docker run --rm -i alpine-nix:test sh -s < tests/smoke.sh
```

The release tooling itself uses Node.js 24 in CI and is **not installed inside the container image**. Registry publication only occurs after the default-branch workflow passes validation.

For architecture and risk assumptions, see [ARCHITECTURE.md](ARCHITECTURE.md). For disclosure guidance, see [../SECURITY.md](../SECURITY.md).
