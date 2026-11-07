import test from 'node:test';
import assert from 'node:assert/strict';
import { runCleanup } from '../scripts/cleanup-branches.mjs';

const repo = 'redoracle/nixos';
const sha = 'd'.repeat(40);
const branch = 'feature/merged';
const encoded = encodeURIComponent(branch);

function fixture({
  changedHead = false, openBeforeDelete = false, deleteStatus = 204,
  survivesDelete = false, wrongIdentity = false,
} = {}) {
  const events = [];
  let deleted = false;
  let reads = 0;
  const respond = (body, status = 200) =>
    status === 204 ? new Response(null, { status }) : Response.json(body, { status });

  async function fetchImpl(raw, options = {}) {
    const url = new URL(raw);
    assert.equal(url.origin, 'https://api.github.com');
    const method = options.method ?? 'GET';
    const path = url.pathname;
    events.push({ method, path, search: url.search });
    assert.equal(options.headers.Authorization, 'Bearer fake-token');

    if (path === '/repos/' + repo) {
      return respond({
        full_name: wrongIdentity ? 'different/repository' : repo,
        default_branch: 'master',
      });
    }
    if (path === '/repos/' + repo + '/branches') {
      assert.equal(url.searchParams.get('page'), '1');
      return respond([
        { name: 'master', protected: false, commit: { sha: 'a'.repeat(40) } },
        { name: branch, protected: false, commit: { sha } },
      ]);
    }
    if (path === '/repos/' + repo + '/pulls') {
      if (url.searchParams.get('state') === 'all') {
        return respond([{
          number: 13, state: 'closed', merged_at: '2026-11-06T10:00:00Z',
          head: { ref: branch, sha, repo: { full_name: repo } },
        }]);
      }
      assert.equal(url.searchParams.get('state'), 'open');
      assert.equal(url.searchParams.get('head'), 'redoracle:' + branch);
      return respond(openBeforeDelete ? [{
        number: 14, state: 'open',
        head: { ref: branch, sha, repo: { full_name: repo } },
      }] : []);
    }
    if (path === '/repos/' + repo + '/branches/' + encoded && method === 'GET') {
      reads++;
      if (deleted && !survivesDelete) return respond({ message: 'Not Found' }, 404);
      return respond({
        name: branch, protected: false,
        commit: { sha: changedHead ? 'e'.repeat(40) : sha },
      });
    }
    if (path === '/repos/' + repo + '/git/refs/heads/' + encoded && method === 'DELETE') {
      if (deleteStatus !== 204) return respond({ message: 'GitHub error' }, deleteStatus);
      deleted = true;
      return respond(null, 204);
    }
    throw new Error('Unexpected network request: ' + method + ' ' + url.href);
  }

  return {
    fetchImpl, events,
    get deleted() { return deleted; },
    get reads() { return reads; },
  };
}

function opts(mock, dryRun) {
  return { repository: repo, token: 'fake-token', dryRun, fetchImpl: mock.fetchImpl };
}

test('housekeeping preview rechecks eligibility but never sends DELETE', async () => {
  const mock = fixture();
  const candidates = await runCleanup(opts(mock, true));
  assert.equal(candidates, 1);
  assert.equal(mock.deleted, false);
  assert.equal(mock.reads, 1);
  assert.ok(mock.events.some((e) => e.search.includes('head=redoracle%3Afeature%2Fmerged')));
  assert.ok(!mock.events.some((e) => e.method === 'DELETE'));
});

test('housekeeping deletes only a revalidated merged head and verifies deletion', async () => {
  const mock = fixture();
  const candidates = await runCleanup(opts(mock, false));
  assert.equal(candidates, 1);
  assert.equal(mock.deleted, true);
  assert.equal(mock.reads, 2, 'Must inspect again to verify the ref is gone');
  const deletes = mock.events.filter((e) => e.method === 'DELETE');
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].path, '/repos/' + repo + '/git/refs/heads/' + encoded);
});

test('housekeeping skips a branch whose head changed after candidate discovery', async () => {
  const mock = fixture({ changedHead: true });
  await runCleanup(opts(mock, false));
  assert.equal(mock.deleted, false);
  assert.equal(mock.reads, 1);
  assert.equal(mock.events.filter((e) => e.method === 'DELETE').length, 0);
});

test('housekeeping preserves a branch used by a newly opened pull request', async () => {
  const mock = fixture({ openBeforeDelete: true });
  await runCleanup(opts(mock, false));
  assert.equal(mock.deleted, false);
  assert.equal(mock.events.filter((e) => e.method === 'DELETE').length, 0);
});

test('housekeeping fails closed when the ref still exists after DELETE', async () => {
  const mock = fixture({ survivesDelete: true });
  await assert.rejects(runCleanup(opts(mock, false)), {
    message: 'Branch survived DELETE request: feature/merged',
  });
  assert.equal(mock.reads, 2);
});

test('housekeeping surfaces failed deletion API requests', async () => {
  const mock = fixture({ deleteStatus: 500 });
  await assert.rejects(runCleanup(opts(mock, false)), /HTTP 500/);
  assert.equal(mock.deleted, false);
});

test('housekeeping rejects mismatched repository identities before any deletion', async () => {
  const mock = fixture({ wrongIdentity: true });
  await assert.rejects(runCleanup(opts(mock, false)), /repository identity mismatch/);
  assert.equal(mock.events.length, 1);
});
