import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifySha256File } from '../ai/model-integrity.mjs';

test('model checksum verifies exact bytes without modifying the file', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'needle-model-integrity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('known offline model test payload');
  const path = join(root, 'test.cact');
  await writeFile(path, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');

  assert.deepEqual(await verifySha256File(path, digest, bytes.length), {
    bytes: bytes.length, sha256: digest,
  });

  await assert.rejects(verifySha256File(path, 'a'.repeat(64), bytes.length), {
    message: 'Model SHA-256 differs from the pinned package metadata',
  });
  await assert.rejects(verifySha256File(path, digest, bytes.length + 1), {
    message: 'Model size differs from the pinned package metadata',
  });
  await assert.rejects(verifySha256File(path, 'not-a-sha256'), {
    name: 'TypeError',
    message: 'Expected a pinned 64-character SHA-256 digest',
  });

  const link = join(root, 'aliased.cact');
  await symlink(path, link);
  await assert.rejects(verifySha256File(link, digest, bytes.length), {
    code: 'ELOOP',
  });
});

test('model checksum fails closed for missing and empty files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'needle-model-missing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const empty = join(root, 'empty.cact');
  await writeFile(empty, Buffer.alloc(0));

  await assert.rejects(verifySha256File(empty, '0'.repeat(64)),
    /nonempty regular model file/);
  await assert.rejects(verifySha256File(join(root, 'absent.cact'), '0'.repeat(64)),
    { code: 'ENOENT' });
});
