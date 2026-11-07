// This is deliberately NOT the upstream @semantic-release/npm publisher.
// Our release pipeline publishes GHCR images, not packages to npm. The core
// semantic-release package unconditionally depends on the upstream plugin,
// which bundles an npm CLI with vulnerable minimatch. Explicit plugin config
// in .releaserc.json never uses npm publishing; fail closed if misconfigured.
function disabled() {
  throw new Error('npm registry publishing is disabled for this GHCR-only repository');
}
export const verifyConditions = disabled;
export const prepare = disabled;
export const publish = disabled;
export const addChannel = disabled;
export default { verifyConditions, prepare, publish, addChannel };
