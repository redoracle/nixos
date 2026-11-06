/**
 * Prune only immutable HEADs of closed, in-repository PRs.
 *
 * Merged PRs qualify; unmerged PRs only qualify through a reviewed SHA
 * allowlist. Open PRs, changed HEADs, protected refs and master are preserved.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SUPERSEDED_HEADS = Object.freeze({
  'dependabot/github_actions/docker/login-action-4':
    '5ea41e3b3ef21e640fb940bf459cbbf2df74d4ca',
  'dependabot/github_actions/docker/setup-buildx-action-4':
    '076f1d33d6b8911bca8d0ed7f964ed935946cfd7',
});

export function cleanupCandidates({ branches, pulls, repository, defaultBranch }) {
  const openHeads = new Set(pulls.filter((pr) => pr.state === 'open').map((pr) => pr.head?.ref));
  const ownRepo = repository.toLowerCase();

  return branches.flatMap((branch) => {
    const { name } = branch;
    const sha = branch.commit?.sha;
    if (!name || !sha || name === defaultBranch || branch.protected ||
        openHeads.has(name) || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) ||
        name.includes('..') || name.includes('//')) return [];

    const source = pulls.find((pr) => pr.state === 'closed' &&
      pr.head?.ref === name && pr.head?.sha === sha &&
      pr.head?.repo?.full_name?.toLowerCase() === ownRepo &&
      (Boolean(pr.merged_at) || SUPERSEDED_HEADS[name] === sha));
    return source ? [{
      name, sha, prNumber: source.number,
      reason: source.merged_at ? 'merged PR' : 'explicitly superseded PR',
    }] : [];
  });
}

async function api(path, token, { method = 'GET', allow404 = false } = {}) {
  const response = await fetch(`https://api.github.com/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'redoracle-nixos-branch-maintenance',
    },
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub API ${method} ${path}: HTTP ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

async function listAll(path, token) {
  const items = [];
  for (let page = 1; page <= 20; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await api(`${path}${separator}per_page=100&page=${page}`, token);
    if (!Array.isArray(batch)) throw new Error('Expected a GitHub result array');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error('Exceeded 20 result pages; refusing incomplete branch analysis');
}

export async function runCleanup({
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
  dryRun = process.env.CLEANUP_DRY_RUN !== 'false',
} = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || !token) {
    throw new Error('Valid GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  }
  const metadata = await api(`repos/${repository}`, token);
  if (metadata.full_name.toLowerCase() !== repository.toLowerCase()) {
    throw new Error('GitHub repository identity mismatch');
  }

  const [branches, pulls] = await Promise.all([
    listAll(`repos/${repository}/branches`, token),
    listAll(`repos/${repository}/pulls?state=all`, token),
  ]);
  const candidates = cleanupCandidates({
    branches, pulls, repository, defaultBranch: metadata.default_branch,
  });
  console.log(`Found ${candidates.length} candidate(s); dryRun=${dryRun}`);

  for (const branch of candidates) {
    const escaped = encodeURIComponent(branch.name);
    const branchPath = `repos/${repository}/branches/${escaped}`;
    const latest = await api(branchPath, token, { allow404: true });
    if (!latest || latest.protected || latest.commit?.sha !== branch.sha) {
      console.log(`Skipping changed/protected/deleted branch: ${branch.name}`);
      continue;
    }

    // Recheck live open PRs immediately before deleting a branch reference.
    const owner = repository.split('/')[0];
    const head = encodeURIComponent(`${owner}:${branch.name}`);
    const active = await listAll(
      `repos/${repository}/pulls?state=open&head=${head}`, token,
    );
    if (active.length) {
      console.log(`Skipping branch under review: ${branch.name}`);
      continue;
    }

    console.log(`${dryRun ? 'Would delete' : 'Deleting'} ${branch.name} (${branch.sha}), ${branch.reason} #${branch.prNumber}`);
    if (!dryRun) {
      await api(`repos/${repository}/git/refs/heads/${escaped}`, token, { method: 'DELETE' });
      if (await api(branchPath, token, { allow404: true })) {
        throw new Error(`Branch survived DELETE request: ${branch.name}`);
      }
      console.log(`Verified deleted: ${branch.name}`);
    }
  }
  return candidates.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCleanup().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
