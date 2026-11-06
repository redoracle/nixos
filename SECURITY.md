# Security policy

## Supported builds

The `master` branch and the most recent Alpine 3.24-based image definition are maintained on a best-effort basis. This repository does not currently publish verified container artifacts or provide an SLA for fixes.

## Reporting a vulnerability

Please use [GitHub's private vulnerability reporting](https://github.com/redoracle/nixos/security/advisories/new), if enabled, rather than publicly disclosing exploitation details. Otherwise, open an issue that omits sensitive exploit details and request a private communication channel.

## Threat model and limitations

- This is Alpine with the **Nix package manager**, not NixOS and not a hardened isolation boundary.
- Nix sandboxing is disabled inside the container. Run **trusted derivations only**; untrusted builds may read files accessible to the Nix user and can access the network unless the container runtime restricts it.
- Containers run as UID 10001 without sudo. Do not add `--privileged`, mount the Docker socket, or share writable `/nix` stores across trust boundaries.
- Alpine packages are installed through apk's signed repositories. Review base-image upgrades, rebuild for security fixes, and inspect supply-chain changes in PRs.
- CI builds and tests images but does not attest, sign, or publish them. Use image digests and your own scanning/signing controls for production usage.
