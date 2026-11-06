// Needle has a constrained tool-context budget. Provide at most six relevant
// functions per inference, while retaining the entire catalog for deterministic
// explicit JSON calls and for future scopes.
export const SCOPES = Object.freeze(['auto','system','apk','nix','workspace','workflow','all']);
const STOP = new Set(['the','and','for','how','what','which','can','please','with','from','this','that','are','was','into','show','give','would','there','does','some','using','list','me','my']);

export function inferScope(prompt) {
  const text = String(prompt).toLowerCase();
  if (/\b(apk|alpine|apk-tools|packages? installed|package database|repositories)\b/.test(text)) return 'apk';
  if (/\b(nix|flake|derivation|store|profile|nixpkgs|garbage)\b/.test(text)) return 'nix';
  if (/\b(file|directory|folder|workspace|sha256|create|read text)\b/.test(text)) return 'workspace';
  if (/\b(workflow|health audit|upgrade plan|dependency audit|preflight)\b/.test(text)) return 'workflow';
  return 'system';
}

export function selectTools(catalog, scope, prompt, limit = 6) {
  if (!SCOPES.includes(scope)) throw new Error('Unsupported catalog scope');
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error('Invalid selection limit');
  const selectedScope = scope === 'auto' ? inferScope(prompt) : scope;
  const words = String(prompt).toLowerCase().split(/[^a-z0-9]+/)
    .filter(word => word.length >= 3 && !STOP.has(word));
  const tokens = new Set(words);
  const planning = /\b(plan|install|remove|delete|upgrade|build|develop|shell|update|gc|garbage|repair|optimis|run)\b/i.test(prompt);
  const ranked = Object.entries(catalog.tools)
    .filter(([,tool]) => selectedScope === 'all' || tool.category === selectedScope)
    .map(([name, tool]) => {
      const title = new Set(name.toLowerCase().split('_'));
      const description = tool.description.toLowerCase();
      let score = 0;
      for (const word of tokens) {
        if (title.has(word)) score += 8;
        else if (name.includes(word)) score += 4;
        if (description.includes(word)) score += 1;
      }
      if (tool.mode === 'manual') score += planning ? 1 : -5;
      if (tool.mode === 'readonly') score += planning ? 0 : 2;
      return { name, score };
    })
    .sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));
  if (ranked.length === 0) throw new Error('No available tools in selected scope');
  return { scope:selectedScope, names:ranked.slice(0,limit).map(item=>item.name) };
}
