# Support

The project is a community-maintained Alpine + Nix container, not a commercial NixOS distribution. There are no guaranteed response times or production support SLAs.

## Before filing an issue

1. Read the [README](README.md) and [architecture decisions](docs/ARCHITECTURE.md) to confirm your use case is supported.
2. Check the [latest GitHub Release](https://github.com/redoracle/nixos/releases/latest), supported `linux/amd64` and `linux/arm64` architectures, and the [CI history](https://github.com/redoracle/nixos/actions/workflows/ci.yml).
3. Reproduce the problem with a versioned image or a specific commit and gather **sanitized** output from `nix --version`, `docker version`, and the relevant command.
4. Open a [bug or feature request](https://github.com/redoracle/nixos/issues/new/choose). Provide a minimal reproduction and expected/actual results.

For Alpine packaging and OpenRC questions, consult [Alpine documentation](https://docs.alpinelinux.org/). For Nix derivations, flakes or store behavior, consult the [Nix manual](https://nixos.org/manual/nix/stable/). An issue specific to those projects may belong upstream.

**Security-sensitive details must not be posted publicly.** Follow [SECURITY.md](SECURITY.md) for private disclosure options.

## Maintainer resources

- [Release and maintenance runbook](docs/RELEASING.md): SemVer, registries, upgrades, recovery, branch hygiene
- [Contributing](CONTRIBUTING.md): test requirements, PR expectations and dependency compatibility
- [Code of Conduct](CODE_OF_CONDUCT.md): participation guidelines

The repository's automated checks and release history are the canonical record of what has actually been verified and published.
