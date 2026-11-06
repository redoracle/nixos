import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const config = JSON.parse(readFileSync('.releaserc.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.deepEqual(config.branches, ['master']);
assert.equal(config.tagFormat, 'v${version}');
assert.equal(pkg.private, true);
assert.ok(pkg.devDependencies['semantic-release']);
const plugins = config.plugins.map(([name]) => name);
assert.deepEqual(plugins, [
  '@semantic-release/commit-analyzer',
  '@semantic-release/release-notes-generator',
  '@semantic-release/exec',
  '@semantic-release/github',
]);
assert.ok(config.plugins[2][1].prepareCmd.includes('prepare-release.mjs'));

const workdir = mkdtempSync(join(tmpdir(), 'nix-release-test-'));
try {
  const script = resolve('scripts/prepare-release.mjs');
  const valid = spawnSync(process.execPath, [script, '3.2.1'], { cwd: workdir });
  assert.equal(valid.status, 0, valid.stderr.toString());
  assert.equal(readFileSync(join(workdir, '.release-version'), 'utf8'), '3.2.1\n');
  const invalid = spawnSync(process.execPath, [script, '../bad'], { cwd: workdir });
  assert.notEqual(invalid.status, 0);
  assert.equal(existsSync(join(workdir, 'bad')), false);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
console.log('Release config and version writer: OK');
