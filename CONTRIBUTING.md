# Contributing

Contributions should keep the image minimal, easy to audit, and reproducible to the extent supported by Alpine package repositories.

1. Open a focused pull request explaining the problem, security or compatibility trade-offs, and expected behavior.
2. Run `sh -n install_nix.sh tests/*.sh`, `shellcheck --shell=sh install_nix.sh tests/*.sh`, `sh tests/test-installer.sh`, and `node scripts/check-release.mjs`.
3. Run `docker build -t alpine-nix:test .` followed by `docker run --rm -i alpine-nix:test sh -s < tests/smoke.sh`.
4. Update `README.md` and `SECURITY.md` for changes to the installation, user permissions, supported platforms, or trust model.
5. Prefer Alpine stable-repository updates to opaque install scripts. Avoid adding registry credentials to pull-request workflows.
6. Use **Conventional Commit** titles (`fix:`, `feat:`, or `feat!:` with a `BREAKING CHANGE:` footer). Squash merges must preserve the intended SemVer impact. See [the release handbook](docs/RELEASING.md).
7. Dependency bumps are proposed monthly by Dependabot but are never auto-merged. Review major updates and keep package changes separate from unrelated refactors.

CI verifies both amd64 and arm64 images. Do not claim platform support based solely on shell syntax checks.
