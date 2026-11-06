# Changelog

This repository uses **semantic-release** and Conventional Commits. The canonical, automatically generated history of versions and change descriptions is [GitHub Releases](https://github.com/redoracle/nixos/releases).

- [Latest release](https://github.com/redoracle/nixos/releases/latest): current tagged container version and release notes.
- [All historical releases](https://github.com/redoracle/nixos/releases): older Nix-version-based tags and current SemVer tags.

Starting with **v3.0.0** (November 6, 2026), release versions describe the **container's compatibility**, not the underlying Nix package version. The historical tag named only `v` is malformed and preserved for historical traceability; it should not be used for deployments.

GitHub Release notes are generated automatically after a reviewed Conventional Commit is merged to `master`. A new GitHub Release is created only when the commit history warrants a semantic version change. The related Docker images are published as versioned tags to GHCR and optionally Docker Hub. Their publication is verified separately in the [release workflow](https://github.com/redoracle/nixos/actions/workflows/release.yml).

See the [release handbook](docs/RELEASING.md) for version rules and recovery from partial publication.
