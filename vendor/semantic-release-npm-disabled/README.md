# Deliberately disabled npm-registry publisher

This repository publishes **GHCR/Docker images only**, never packages to the npm registry. Our explicit `.releaserc.json` uses the commit analyzer, release-notes generator, exec version writer, and GitHub release plugin; it does not load `@semantic-release/npm`.

The upstream `semantic-release` package nevertheless declares `@semantic-release/npm` as a mandatory dependency. That unused publishing plugin pulls in a bundled `npm` CLI containing `minimatch` 10.2.5, affected by [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). A root override of `minimatch` cannot replace dependencies shipped inside an npm package bundle.

The root package manifest therefore defines this repository-local, fail-closed `@semantic-release/npm` replacement as a direct `file:` dependency and redirects the transitive dependency through an npm `$@semantic-release/npm` override. The replacement has **no publication implementation**: invoking its hooks raises an error, rather than silently uploading an npm package.

CI checks the dependency graph, confirms that the vulnerable bundled npm CLI is absent, and checks that the real release configuration does not reference the disabled plugin. The registry-installed dependencies remain integrity-locked; this single local package link is explicitly audited.

**Removal criteria:** revert this replacement once upstream `semantic-release` stops depending on the unused publisher or its npm dependency includes a patched `minimatch`, after verifying release notes, semantic-version selection and GHCR publishing end to end. Do not add the npm publisher to `.releaserc.json` without a separate reviewed change.
