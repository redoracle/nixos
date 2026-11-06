import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupCandidates, SUPERSEDED_HEADS } from '../scripts/cleanup-branches.mjs';

const repo = 'redoracle/nixos';
const head = (ref, sha) => ({ ref, sha, repo: { full_name: repo } });
const branch = (name, sha, protectedBranch = false) => ({
  name, commit: { sha }, protected: protectedBranch,
});
const pr = (number, ref, sha, { merged = false, state = 'closed' } = {}) => ({
  number, state, head: head(ref, sha),
  merged_at: merged ? '2026-11-06T12:00:00Z' : null,
});

test('removes only merged and explicitly superseded closed PR branches', () => {
  const s = '1234567890123456789012345678901234567890';
  const obsolete = SUPERSEDED_HEADS['dependabot/github_actions/docker/login-action-4'];
  const branches = [
    branch('master', s),
    branch('feature/merged', s),
    branch('dependabot/github_actions/docker/login-action-4', obsolete),
    branch('feature/closed-not-merged', s),
    branch('feature/changed', s),
    branch('feature/open', s),
    branch('feature/protected', s, true),
    branch('feature/orphan', s),
  ];
  const pulls = [
    pr(6, 'feature/merged', s, { merged: true }),
    pr(4, 'dependabot/github_actions/docker/login-action-4', obsolete),
    pr(99, 'feature/closed-not-merged', s),
    pr(21, 'feature/changed', 'a'.repeat(40), { merged: true }),
    pr(22, 'feature/open', s, { state: 'open' }),
    pr(23, 'feature/protected', s, { merged: true }),
  ];
  assert.deepEqual(cleanupCandidates({
    branches, pulls, repository: repo, defaultBranch: 'master',
  }).map((entry) => entry.name), [
    'feature/merged',
    'dependabot/github_actions/docker/login-action-4',
  ]);
});

test('does not prune a branch with a live open PR even if it was merged previously', () => {
  const sha = 'b'.repeat(40);
  assert.deepEqual(cleanupCandidates({
    repository: repo, defaultBranch: 'master',
    branches: [branch('feature/claimed', sha)],
    pulls: [
      pr(11, 'feature/claimed', sha, { merged: true }),
      pr(12, 'feature/claimed', sha, { state: 'open' }),
    ],
  }), []);
});

test('never removes a branch whose exact head does not match a closed in-repo PR', () => {
  const sha = 'c'.repeat(40);
  assert.deepEqual(cleanupCandidates({
    repository: repo, defaultBranch: 'master',
    branches: [branch('feature/forked', sha)],
    pulls: [{
      ...pr(11, 'feature/forked', sha, { merged: true }),
      head: { ref: 'feature/forked', sha, repo: { full_name: 'someone/else' } },
    }],
  }), []);
});
