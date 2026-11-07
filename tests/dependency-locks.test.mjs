import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function getJson(relative) {
  return JSON.parse(await readFile(new URL('../' + relative, import.meta.url), 'utf8'));
}

for (const directory of ['.', 'ai']) {
  test('npm lockfile pins package graph and registry integrity: ' + directory, async () => {
    const packageFile = directory === '.' ? 'package.json' : 'ai/package.json';
    const lockFile = directory === '.' ? 'package-lock.json' : 'ai/package-lock.json';
    const [manifest, lock] = await Promise.all([getJson(packageFile), getJson(lockFile)]);
    assert.equal(lock.lockfileVersion, 3);
    assert.equal(lock.name, manifest.name);
    assert.equal(lock.version, manifest.version);
    assert.equal(lock.packages[''].name, manifest.name);
    assert.deepEqual(lock.packages[''].dependencies ?? {}, manifest.dependencies ?? {});
    assert.deepEqual(lock.packages[''].devDependencies ?? {}, manifest.devDependencies ?? {});
    assert.ok(Object.keys(lock.packages).length > 20);

    let resolved = 0;
    for (const [path, packageEntry] of Object.entries(lock.packages)) {
      if (!packageEntry.resolved) continue;
      if (directory === '.' && path === 'node_modules/@semantic-release/npm') {
        // This one explicitly reviewed root-owned file link prevents pulling in
        // the unused upstream npm publisher and its vulnerable bundled npm CLI.
        assert.equal(packageEntry.resolved, 'vendor/semantic-release-npm-disabled');
        assert.equal(packageEntry.link, true);
        assert.equal(lock.packages['vendor/semantic-release-npm-disabled'].name,
          '@semantic-release/npm');
        continue;
      }
      assert.match(packageEntry.resolved,
        /^https:\/\/registry\.npmjs\.org\/[^?#]+\.tgz$/,
        'Untrusted package tarball destination: ' + path);
      assert.match(packageEntry.integrity ?? '', /^sha512-[A-Za-z0-9+/]+={0,2}$/,
        'Missing cryptographic integrity: ' + path);
      resolved++;
    }
    assert.ok(resolved > 20, 'Unexpectedly sparse transitive dependency graph');
  });
}

test('GHCR-only release excludes the unused npm publisher and vulnerable bundled minimatch', async () => {
  const [manifest, lock, config] = await Promise.all([
    getJson('package.json'), getJson('package-lock.json'), getJson('.releaserc.json'),
  ]);
  assert.equal(manifest.devDependencies['@semantic-release/npm'],
    'file:./vendor/semantic-release-npm-disabled');
  assert.equal(manifest.overrides['@semantic-release/npm'], '$@semantic-release/npm');
  assert.ok(config.plugins.every(([name]) => name !== '@semantic-release/npm'));
  assert.equal(Object.hasOwn(lock.packages, 'node_modules/npm'), false,
    'The upstream npm registry publisher must not bring in a bundled npm CLI');
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (!path.endsWith('/minimatch')) continue;
    const major = Number(pkg.version.split('.')[0]);
    assert.ok(major < 7 || major >= 11,
      'Vulnerable minimatch reintroduced through ' + path + ': ' + pkg.version);
  }

  const disabled = await import('../vendor/semantic-release-npm-disabled/index.js');
  for (const name of ['verifyConditions', 'prepare', 'publish', 'addChannel']) {
    assert.throws(() => disabled[name](),
      /npm registry publishing is disabled for this GHCR-only repository/);
  }
});
