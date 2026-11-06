# Security policy

## Supported versions and scope

Security fixes are developed against the `master` branch and incorporated into new semantic-versioned containers. The current supported release is listed under [GitHub Releases](https://github.com/redoracle/nixos/releases/latest). Historical images and tags may remain downloadable **without receiving backported fixes**; this project does not offer a security-patch SLA.

The project is **Alpine Linux with the Nix package manager**, not a hardened NixOS distribution or a security-isolation product.

## Reporting a vulnerability

Prefer [GitHub private vulnerability reporting](https://github.com/redoracle/nixos/security/advisories/new), where available. Include affected versions, reproduction steps, impact, and a proposed mitigation. Do **not** post exploits, secrets, or unredacted logs to public issues.

If private vulnerability reporting is unavailable, open a [minimal public issue](https://github.com/redoracle/nixos/issues/new/choose) requesting a private reporting channel **without vulnerability details**. Maintainers review reports on a best-effort basis. GitHub platform abuse can also be reported through GitHub's own channels.

## Threat model

| Area | Controls | Limitations and operator responsibilities |
| --- | --- | --- |
| Alpine packages | `apk` uses signed distribution repositories and a reviewed stable base image | Package indexes and images can change between builds; rebuild/review regularly |
| Execution | Default UID/GID 10001, no passwordless sudo or Docker socket | Unprivileged is not a substitute for seccomp, AppArmor, rootless containers, or network restrictions |
| Nix builds | User-owned local Nix store | **`sandbox = false`**: untrusted derivations can read accessible files and use network access unless further restricted |
| Data | Ephemeral store by default | Never mount host credentials or share a writable `/nix` across untrusted workloads |
| Automation | Read-only PR CI; scoped write token in default-branch release and branch housekeeping jobs | Workflow/script changes require review; a compromised default branch can affect packages, GitHub Releases, or refs |
| Releases | SHA-pinned actions, CI validation, SemVer tags, multi-platform manifest check, requested SBOM/provenance | Artifacts are not automatically signed or independently attested by an enforced deployment policy |
| Dependency updates | Monthly Dependabot and release-note compatibility smoke tests | No auto-merge; major upgrades require review and may be deliberately excluded |

The container does not promise that all Nixpkgs workloads work identically on Alpine, and it does not provide the NixOS module system or multi-user Nix daemon.

## Safe deployment guidance

- Use a versioned image tag or, preferably, an **immutable registry digest**. Avoid relying on the moving `latest` tag for production reproducibility.
- Run the container unprivileged with only the filesystem and network access it requires; do not add `--privileged` or mount the Docker socket.
- Treat Nix derivations and their inputs as executable code. Only run trusted expressions inside this container.
- Review Alpine and release-tooling updates with tests, and consider independent image scanning, signing, and runtime admission controls for critical systems.
- Read the [architecture](docs/ARCHITECTURE.md) and [release recovery runbook](docs/RELEASING.md) before depending on automated publishing.

## Response and disclosure

Maintain a private discussion while fixes are developed where practical. Document affected versions and mitigation in a security advisory or release notes after a fix is available. Do not rewrite existing Git release tags or conceal failed registry publication; use the documented recovery process.
