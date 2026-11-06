import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/prepare-release.mjs');

async function withWorkdir(t) {
  const directory = await mkdtemp(join(tmpdir(), 'release-contract-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function run(directory, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: directory, encoding: 'utf8', timeout: 10000,
  });
}

for (const version of ['0.0.1', '3.2.1', '12.34.56', '3.2.1-rc.1']) {
  test('release writer atomically accepts valid version ' + version, async (t) => {
    const dir = await withWorkdir(t);
    const result = run(dir, [version]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(dir, '.release-version'), 'utf8'), version + '\n');
    assert.match(result.stdout, /Prepared release version/);
  });
}

for (const invalid of [
  '', '../bad', '1', '1.2', 'v1.2.3', '01.2.3', '1.02.3',
  '1.2.03', '1.2.3/../../escape', '1.2.3\nmalicious', '--help',
]) {
  test('release writer rejects invalid or unsafe version ' + JSON.stringify(invalid), async (t) => {
    const dir = await withWorkdir(t);
    const result = run(dir, invalid === '' ? [] : [invalid]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Expected a semantic release version/);
    await assert.rejects(access(join(dir, '.release-version')), { code: 'ENOENT' });
  });
}

test('release writer must not overwrite an existing release-version file', async (t) => {
  const dir = await withWorkdir(t);
  await writeFile(join(dir, '.release-version'), '3.0.0\n');
  const second = run(dir, ['3.1.0']);
  assert.notEqual(second.status, 0);
  assert.equal(await readFile(join(dir, '.release-version'), 'utf8'), '3.0.0\n');
});

test('release version arguments never create files outside the working directory', async (t) => {
  const dir = await withWorkdir(t);
  const parent = join(dir, 'outside-marker');
  const result = run(dir, ['../../outside-marker']);
  assert.notEqual(result.status, 0);
  await assert.rejects(access(parent), { code: 'ENOENT' });
});
