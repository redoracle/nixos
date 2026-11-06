# Contributing

Thanks for helping keep Alpine + Nix small, trustworthy, and maintainable. All work is reviewed through GitHub pull requests against `master`. The repository uses SemVer, pinned GitHub Actions, and a deliberately conservative dependency and branch-maintenance policy.

## Before starting

1. Search existing [issues](https://github.com/redoracle/nixos/issues) and PRs. Use the provided issue templates for bugs or enhancements.
2. For a security-sensitive discovery, follow [SECURITY.md](SECURITY.md) instead of publishing exploit details.
3. Keep PRs focused, explain design trade-offs, and update relevant documentation and test coverage. Avoid new root privileges or remote shell installers without a compelling, reviewed rationale.
4. Never commit secrets, API tokens, Docker registry credentials, or real vulnerability payloads.

## Development checks

Required local checks:

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

GitHub Actions also runs [Actionlint](https://github.com/rhysd/actionlint), verifies shell and release maintenance behavior, and builds/smoke-tests **both** AMD64 and ARM64 images. Do not claim that a Docker or Nix change is fully verified until both architecture jobs pass.

Node.js tooling is for repository maintenance only. The shipped container does not contain npm/Node.js.

## PR and commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) for PR titles and squash merges:

- `fix:` and `fix(deps):` for patch releases
- `feat:` for a backward-compatible minor release
- `feat!:` plus a `BREAKING CHANGE:` footer for a major release
- `docs:`, `test:` or `chore:` for maintenance without a release by default

Explain user-visible behavior, security impact, tests, risks, migration instructions, and rollback plans in the pull-request template. Preserve the Conventional Commit title and footer when squash-merging; semantic-release reads the resulting history on `master`.

## Dependencies and releases

Dependabot checks the Docker base, GitHub Actions, and npm release tooling monthly, but **does not auto-merge**. Review release notes, major-version changes, SHA pins, and both platform checks before accepting updates.

Do not lift an explicit Dependabot compatibility exclusion without demonstrating the associated release-notes integration test passes. GitHub Releases and Docker images publish **only** from the default branch after passing CI; PRs never receive publishing credentials. See [docs/RELEASING.md](docs/RELEASING.md) for operational detail.

## Branch hygiene

Branches associated with merged PRs may be removed automatically after a successful merge. The workflow only considers exact matching merged PR heads, or a small explicit allowlist of closed PRs whose changes are demonstrably superseded. Protected branches, `master` and open PR heads are excluded. Keep unmerged work that still matters; consult the housekeeping runbook before making manual changes to the allowlist.

## Documentation standards

Use precise Nix vs. NixOS terminology. Distinguish observed CI verification from untested assumptions. Keep `README.md`, [architecture](docs/ARCHITECTURE.md), [release handbook](docs/RELEASING.md), and [security policy](SECURITY.md) synchronized with changes to the software and workflows. Do not promise image-signing, immutable builds, or production security guarantees that the project does not implement.
