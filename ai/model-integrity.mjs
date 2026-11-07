import { open } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';

// Verify exact bytes through a single opened descriptor. Reject symlinks,
// missing files, empty files, invalid hashes and mismatching model sizes.
export async function verifySha256File(path, expectedSha256, expectedBytes = null) {
  if (typeof expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(expectedSha256)) {
    throw new TypeError('Expected a pinned 64-character SHA-256 digest');
  }
  if (expectedBytes !== null && (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0)) {
    throw new TypeError('Expected a positive integer model size');
  }
  const file = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size <= 0) throw new Error('Expected a nonempty regular model file');
    if (expectedBytes !== null && stat.size !== expectedBytes) {
      throw new Error('Model size differs from the pinned package metadata');
    }
    const sha = createHash('sha256');
    for await (const bytes of file.createReadStream({ autoClose: false })) sha.update(bytes);
    const actual = sha.digest('hex');
    if (actual !== expectedSha256.toLowerCase()) {
      throw new Error('Model SHA-256 differs from the pinned package metadata');
    }
    return { bytes: stat.size, sha256: actual };
  } finally {
    await file.close();
  }
}
