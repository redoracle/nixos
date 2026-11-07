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
