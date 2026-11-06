import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { validateCall, checkedWorkspacePath, executeAllowed } from '../ai/needle-policy.mjs';

const catalog = JSON.parse(await readFile(new URL('../ai/needle-tools.json', import.meta.url), 'utf8'));

test('tool descriptions and schemas are explicitly declared', () => {
  assert.deepEqual(Object.keys(catalog.tools).sort(), [
    'list_workspace', 'nix_version', 'read_workspace_file',
    'run_safe_check', 'write_workspace_file',
  ]);
  for (const definition of Object.values(catalog.tools)) {
    assert.equal(definition.inputSchema.type, 'object');
    assert.equal(definition.inputSchema.additionalProperties, false);
    assert.ok(definition.description.length > 15);
  }
});

test('reject unknown tools, unwanted arguments and unexpected types', () => {
  assert.throws(() => validateCall({ name: 'bash', arguments: { command: 'rm -rf /' } }, catalog), /Unknown/);
  assert.throws(() => validateCall({ name: 'nix_version', arguments: { command: 'whoami' } }, catalog), /Unexpected/);
  assert.throws(() => validateCall({ name: 'read_workspace_file', arguments: {} }, catalog), /Missing/);
  assert.throws(() => validateCall({ name: 'run_safe_check', arguments: { check: 'delete-all' } }, catalog), /Unsupported/);
  assert.deepEqual(validateCall({ name: 'nix_version', arguments: {} }, catalog),
    { name: 'nix_version', arguments: {} });
});

test('workspace paths cannot escape through .., absolute paths or symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'needle-root-'));
  const external = await mkdtemp(join(tmpdir(), 'needle-external-'));
  try {
    await mkdir(join(root, 'safe'));
    await writeFile(join(root, 'safe', 'test.txt'), 'sample');
    await symlink(external, join(root, 'external'));
    assert.equal(await checkedWorkspacePath(root, 'safe/test.txt'), join(root, 'safe', 'test.txt'));
    await assert.rejects(checkedWorkspacePath(root, '../escape'), /escapes/);
    await assert.rejects(checkedWorkspacePath(root, '/etc/passwd'), /relative/);
    await assert.rejects(checkedWorkspacePath(root, 'external/private'), /ENOENT|escapes/);
    await assert.rejects(checkedWorkspacePath(root, 'external/new.txt', { create: true }), /escapes/);
    await assert.rejects(checkedWorkspacePath(root, 'safe/test.txt', { create: true }), /existing/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test('writes require explicit permission and never overwrite files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'needle-write-'));
  const call = { name: 'write_workspace_file', arguments: { path: 'new.txt', content: 'example' } };
  try {
    await assert.rejects(executeAllowed(call, { workspace: root }), /requires/);
    assert.deepEqual(await executeAllowed(call, { workspace: root, allowWrite: true }), {
      created: 'new.txt', bytes: 7,
    });
    assert.equal(await readFile(join(root, 'new.txt'), 'utf8'), 'example');
    await assert.rejects(executeAllowed(call, { workspace: root, allowWrite: true }), /existing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
