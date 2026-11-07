#!/usr/bin/env node
// This check never downloads models. The model hash and size come from the
// installed cactus-needle package, whose exact npm tarball is pinned by
// package-lock.json. Verify the local cache against that immutable metadata.
import { DEFAULT_MODEL, getModelPath } from 'cactus-needle';
import { verifySha256File } from './model-integrity.mjs';

if (typeof getModelPath !== 'function' ||
    typeof DEFAULT_MODEL?.sha256 !== 'string') {
  throw new Error('cactus-needle no longer exposes pinned model metadata');
}
const location = getModelPath();
if (typeof location !== 'string' || !location.endsWith('.cact')) {
  throw new Error('Needle returned an unexpected cache filename');
}
const requiredBytes = Number.isSafeInteger(DEFAULT_MODEL.size) ? DEFAULT_MODEL.size : null;
const result = await verifySha256File(location, DEFAULT_MODEL.sha256, requiredBytes);
process.stdout.write(JSON.stringify({
  status: 'verified', sha256: result.sha256, bytes: result.bytes,
  metadata: 'integrity-locked cactus-needle DEFAULT_MODEL',
  network: 'none',
}) + '\n');
