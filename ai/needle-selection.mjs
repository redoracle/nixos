// Needle has a small tool-context budget. Offer at most six relevant
// function definitions per inference, keeping the full catalog available for
// independently validated explicit JSON calls.
export const SCOPES = Object.freeze([
  'auto', 'system', 'apk', 'nix', 'workspace', 'workflow', 'all',
]);

const STOP = new Set([
  'the', 'and', 'for', 'how', 'what', 'which', 'can', 'please', 'with',
  'from', 'this', 'that', 'are', 'was', 'into', 'show', 'give', 'would',
  'there', 'does', 'some', 'using', 'list', 'me', 'my',
]);

// Explicit workflow and operating-system intents take precedence over the
// names of embedded technologies. For example, "Nix health checks" is a
// workflow, "Alpine version" is system inspection, and "nix package" may be
// an Alpine apk query. These rules are deliberately provider-independent.
export function inferScope(prompt) {
  const text = String(prompt).toLowerCase();
  if (
    /\b(workflow|preflight|dependency audit|environment audit)\b/.test(text) ||
    /\baudit\b.*\benvironment\b/.test(text) ||
    /\brun\b.*\b(integrity checks|health|checks)\b/.test(text) ||
    /\bplan\b.*\b(review|project)\b/.test(text)
  ) return 'workflow';

  if (/\b(cpu|architecture|kernel|disk|free space|alpine version|alpine release|node version|identity|current user|user and groups)\b/.test(text)) {
    return 'system';
  }
  if (/\b(apk|alpine|packages? installed|package database|repositories|repo.*package|package.*repo)\b/.test(text)) {
    return 'apk';
  }
  if (/\b(sha[- ]?256|hash of|file|directory|folder|workspace|creating a)\b/.test(text)) {
    return 'workspace';
  }
  if (/\b(nix|flake|derivation|store|profile|nixpkgs|garbage|gc roots)\b/.test(text)) {
    return 'nix';
  }
  return 'system';
}

// Domain-specific synonyms fill genuine vocabulary gaps: apk "world" is the
// explicitly requested package set, and an Alpine "add" plan is an install.
// These are candidate-ranking hints only, never command authorization.
const INTENT_HINTS = Object.freeze({
  apk_world: /\b(explicitly requested|world|explicit package|world file)\b/i,
  apk_install_plan: /\b(add|install)\b.*\b(package|apk|alpine)\b/i,
});

export function selectTools(catalog, scope, prompt, limit = 6) {
  if (!SCOPES.includes(scope)) throw new Error('Unsupported catalog scope');
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
    throw new Error('Invalid selection limit');
  }
  const selectedScope = scope === 'auto' ? inferScope(prompt) : scope;
  const tokens = new Set(
    String(prompt).toLowerCase().split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !STOP.has(word)),
  );
  const planning = /\b(plan|install|remove|delete|upgrade|build|develop|shell|update|gc|garbage|repair|optimis|run|add)\b/i.test(prompt);

  const ranked = Object.entries(catalog.tools)
    .filter(([, item]) => selectedScope === 'all' || item.category === selectedScope)
    .map(([name, item]) => {
      const title = new Set(name.toLowerCase().split('_'));
      const description = item.description.toLowerCase();
      let score = 0;
      for (const word of tokens) {
        if (title.has(word)) score += 8;
        else if (name.includes(word)) score += 4;
        if (description.includes(word)) score += 1;
      }
      if (item.mode === 'manual') score += planning ? 1 : -5;
      if (item.mode === 'readonly') score += planning ? 0 : 2;
      if (INTENT_HINTS[name]?.test(prompt)) score += 20;
      return { name, score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  if (ranked.length === 0) throw new Error('No available tools in selected scope');
  return {
    scope: selectedScope,
    names: ranked.slice(0, limit).map((item) => item.name),
  };
}
