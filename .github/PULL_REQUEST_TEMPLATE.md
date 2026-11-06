## Purpose and change summary

<!-- Explain the user need, implementation approach and issue reference. -->

## SemVer and compatibility

- [ ] `fix:` / `fix(deps):` — patch
- [ ] `feat:` — backward-compatible feature
- [ ] `feat!:` plus `BREAKING CHANGE:` footer — major
- [ ] `docs:` / `chore:` / `test:` — no release by default

<!-- Use a Conventional Commit PR title; preserve its release semantics when squash-merging. -->

## Verification evidence

- [ ] POSIX shell syntax, ShellCheck, and installer contract tests
- [ ] Release configuration and actual release-notes generation tests (if tooling changed)
- [ ] GitHub Actions Actionlint validation
- [ ] Branch cleanup eligibility tests (if housekeeping changed)
- [ ] Docker image build and store smoke test on AMD64
- [ ] Docker image build and store smoke test on ARM64
- [ ] Documentation and security implications reviewed

## Security, migration and rollback

<!-- Identify changes to privileges, network access, Nix sandboxing, mutable dependencies,
     published tags, secrets or branch deletion. Describe migration/rollback steps. -->

## Dependency changes (if applicable)

<!-- Link upstream release notes. Verify SHA pins and runtime compatibility.
     Never merge incompatible major updates solely because installation succeeds. -->

<!-- Never paste real secrets, private vulnerability reports or unredacted logs. -->
