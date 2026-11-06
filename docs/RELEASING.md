# Release and repository maintenance runbook

This is the operational reference for maintainers of `redoracle/nixos`. It documents the automated SemVer pipeline, dependency review, registry publication, incident recovery, and safe cleanup of obsolete branches.

## Versioning and change policy

The source repository has a historical name. Release versions now describe the **Alpine + Nix container** and its compatibility, **not** the version of the Alpine-packaged Nix command.

The release branch is `master`. Semantic-release reads Conventional Commits and creates immutable Git tags of the form `vMAJOR.MINOR.PATCH`. Existing `v2.x` tags reflect the previous Nix-versioning convention; the malformed historical `v` tag is preserved for auditability but is not a SemVer release.

| Squash-merge title / commit | Release impact |
| --- | --- |
| `fix: ...` or `fix(deps): ...` | PATCH |
| `feat: ...` | MINOR |
| `feat!: ...` with a `BREAKING CHANGE:` footer | MAJOR |
| `perf: ...` or `revert: ...` | PATCH |
| `docs: ...`, `test: ...`, `chore: ...` | No new tag by default |

The **squash commit message**, not the PR's number of commits, determines the change type. For breaking changes, preserve the full footer at merge time; a `!` marker alone should not replace the written migration description.

## Delivery pipeline

Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml).

1. Run reusable CI, including workflow linting, shell tests, release-notes generator compatibility, and AMD64/ARM64 Docker builds with store smoke tests.
2. Set up Node.js 24 and install the private repository's release-tooling dependencies.
3. Run semantic-release against the repository's Git history. On a releasable change, create the SemVer tag, GitHub Release, and generated notes.
4. If a new version was created, authenticate to GHCR using the default-branch `GITHUB_TOKEN`. Authenticate to Docker Hub only when both optional credentials exist.
5. Build and publish one multi-platform image with source/revision labels, SBOM, and provenance; publish the matching version and `latest` tags.
6. Inspect the published GHCR image manifest and assert both AMD64 and ARM64 are present.

The release workflow is serialized via GitHub Actions concurrency; it runs on `master` pushes, manual dispatches on `master`, and the first day of every month at **03:17 UTC**. If nothing changed with SemVer impact, the scheduled check performs verification but creates **no fake release**.

### Registry credentials

| Target | Registry / repository | Authentication |
| --- | --- | --- |
| Primary | `ghcr.io/redoracle/nixos` | Built-in `GITHUB_TOKEN` with `packages: write` |
| Optional | `docker.io/<configured-user>/nixos` | Secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` |
| Legacy Docker Hub aliases | Same | `DOCKER_USERNAME` and `DOCKER_PASSWORD` |

The Docker Hub image repository must exist and the token must have push permission. Confirm GHCR package visibility is set to **public** if anonymous pulls are intended.

Version labels published on a new release are `vX.Y.Z`, `X.Y.Z` and the moving `latest` tag in each configured registry. Use immutable SHA256 image digests in critical deployments and never assume that a moving tag can be rolled back automatically.

### Release verification

View the run in [GitHub Actions](https://github.com/redoracle/nixos/actions/workflows/release.yml), check the published GitHub Release in [Releases](https://github.com/redoracle/nixos/releases), and inspect the multi-architecture manifest:

```sh
docker buildx imagetools inspect ghcr.io/redoracle/nixos:vX.Y.Z
```

Replace `X.Y.Z` with the actual published semantic version. Verify the reported manifest has `linux/amd64` and `linux/arm64`; inspect SBOM/provenance attestations and image digest as required by your deployment policy.

## Reviewable dependency upgrades

`.github/dependabot.yml` checks Docker/Alpine, GitHub Actions, and npm release tooling **monthly**. No dependency PR is auto-merged; maintainers must inspect release notes, migration implications, dependencies, and CI results.

The `conventional-changelog-conventionalcommits` v10 major upgrade is intentionally ignored for now. Its writer version is incompatible with the currently stable release-notes generation stack. Keep v9.3.1 until an upgraded generator has passed the real `npm run test:release-notes` integration test. Do not bypass this policy merely because `npm install` succeeds.

Merge compatible dependency PRs independently with `fix(deps):` titles and green CI. Merges can create new patch releases and images; this is expected. Major upgrades deserve explicit code review and, if incompatible, a documented deferral.

## Cleanup of merged and superseded branches

Workflow: [`.github/workflows/housekeeping.yml`](../.github/workflows/housekeeping.yml).

Housekeeping runs after `master` pushes, on the **second day of each month at 04:43 UTC**, or by manual dispatch. Automatic runs prune only qualifying branches. Manual dispatch defaults to **dry-run** so maintainers can preview candidates before deletion.

The eligibility policy is intentionally conservative:

- Never delete `master`, protected branches, or any head associated with an open PR.
- A closed, **merged** PR from the same repository qualifies only if its recorded head SHA equals the branch's current SHA.
- Closed, **unmerged** PRs do not qualify unless the exact ref and SHA appear in the reviewed legacy-superseded allowlist.
- Recheck live branch HEAD, protection, and open PRs immediately before deletion; log each outcome and verify the branch is gone afterward.
- Do not delete tags, GitHub Releases, forks, or unrelated active branches.

For the initial cleanup, the allowlist contains the two old v3→v4 Dependabot branches replaced by the new pinned-actions workflow. If a future PR is closed without merging, **do not add it to the allowlist without examining whether its changes have already been incorporated**.

The GitHub REST branch-deletion endpoint has no atomic conditional delete. Concurrent ref updates between the final check and deletion remain a theoretical race; limit the workflow to the default branch, keep the allowlist short, and prefer manual dry-run for unusually busy repositories.

## Recovery and rollback

**Partial release:** Semantic-release publishes the GitHub Release before the Docker images. If publishing fails, the GitHub release may exist without all expected registry tags. Never delete or force-move an existing SemVer tag to make CI pass.

1. Record the failed workflow run, GitHub tag, target commit, and missing registry tags. Review the exact cause (permissions, registry outage, manifest failure, or package issue).
2. Rebuild/re-push the missing image **from the exact released commit** after reviewing it and using authorized registry credentials, then verify the manifests and immutable digests.
3. Document the repair. A workflow rerun may produce a **no-op** because semantic-release sees the existing tag; a green rerun alone is not proof that the registry was repaired.
4. If the released code itself is defective, create a new corrective Conventional Commit and release a higher patch version. Do not rewrite published history.

**Application rollback:** deploy a previously verified digest. Rolling back a moving `latest` tag manually should be a conscious, documented release operation rather than an unreviewed workflow side effect.

**Dependency conflict:** close or defer the incompatible PR, record the version constraint, and add an integration test that would expose the regression. Prefer explicit version pinning over allowing a speculative major change into the publishing pipeline.

## Required repository settings

- Require status checks for the static and both architecture CI jobs before merging changes to `master`.
- Prefer squash merges that preserve Conventional Commit descriptions and breaking-change footers.
- Keep default-branch GitHub Actions permissions minimal and apply write permissions only to the release and housekeeping jobs.
- Review the optional Docker Hub secrets and GHCR visibility when rotating credentials.
- Keep the repository's branch protection/rulesets and secret-scanning options under maintainer control. These settings cannot be enforced merely by adding Markdown files.

## Local quality gate

```sh
sh -n install_nix.sh tests/*.sh
shellcheck --shell=sh install_nix.sh tests/*.sh
sh tests/test-installer.sh
node --test tests/branch-cleanup.test.mjs
npm install --ignore-scripts --no-audit --no-fund
npm run test:release
npm run test:release-notes
docker build --tag alpine-nix:test .
docker run --rm -i alpine-nix:test sh -s < tests/smoke.sh
```

GitHub CI additionally validates workflow syntax with Actionlint and executes platform-specific builds and smoke tests. Node.js is only a release-management dependency, not part of the final image. See the [architecture document](ARCHITECTURE.md) and [security policy](../SECURITY.md).
