/**
 * Smoke-test the exact Conventional Commits notes generator used by releases.
 * This catches mismatched conventional-changelog-writer / preset majors.
 */
import assert from 'node:assert/strict';
import { generateNotes } from '@semantic-release/release-notes-generator';

const notes = await generateNotes(
  { preset: 'conventionalcommits' },
  {
    commits: [
      { hash: 'a'.repeat(40), message: 'feat: add a safe branch cleanup policy' },
      { hash: 'b'.repeat(40), message: 'fix: protect release credentials' },
    ],
    lastRelease: { version: '3.0.0', gitTag: 'v3.0.0', gitHead: '0'.repeat(40) },
    nextRelease: { version: '3.1.0', gitTag: 'v3.1.0', gitHead: '1'.repeat(40) },
    options: { repositoryUrl: 'https://github.com/redoracle/nixos.git' },
    cwd: process.cwd(),
  },
);

assert.match(notes, /Features/);
assert.match(notes, /Bug Fixes/);
assert.match(notes, /safe branch cleanup policy/);
assert.match(notes, /protect release credentials/);
console.log('Conventional Commit release notes generated successfully');
