import { lstat, stat, realpath, readdir, open } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, relative, isAbsolute, join, sep } from 'node:path';

const execFile = promisify(execFileCallback);
const MAX_OUTPUT = 65536;
const MAX_FILES = 100;
const MAX_READ = 16384;
const MAX_HASH = 1048576;

// Exact, independently reviewed command signatures. A changed catalog cannot
// silently turn read-only inspection into an apk install or Nix build.
const SAFE = Object.freeze({
  system_identity:['id'], system_arch:['uname','-m'],
  system_kernel:['uname','-a'], system_disk:['df','-h','/nix'],
  alpine_release:['cat','/etc/alpine-release'],
  node_version:['node','--version'],
  apk_version:['apk','--version'], apk_installed:['apk','info'],
  apk_info:['apk','info','-a','{package}'],
  apk_dependencies:['apk','info','-R','{package}'],
  apk_required_by:['apk','info','-r','{package}'],
  apk_files:['apk','info','-L','{package}'],
  apk_search:['apk','search','{package}'],
  apk_policy:['apk','policy','{package}'],
  apk_stats:['apk','stats'],
  apk_repositories:['cat','/etc/apk/repositories'],
  apk_world:['cat','/etc/apk/world'],
  apk_audit:['apk','audit','--system'],
  nix_version:['nix','--version'],
  nix_eval_selftest:['nix-instantiate','--eval','--expr','1 + 1'],
  nix_config:['nix','show-config'],
  nix_registry:['nix','registry','list'],
  nix_store_verify:['nix-store','--verify'],
  nix_store_roots:['nix-store','--gc','--print-roots'],
  nix_store_dead:['nix-store','--gc','--print-dead'],
  nix_store_live:['nix-store','--gc','--print-live'],
  nix_store_references:['nix-store','-q','--references','{store_path}'],
  nix_store_referrers:['nix-store','-q','--referrers','{store_path}'],
  nix_store_requisites:['nix-store','-q','--requisites','{store_path}'],
  nix_store_deriver:['nix-store','-q','--deriver','{store_path}'],
  nix_store_size:['nix-store','-q','--size','{store_path}'],
  nix_store_hash:['nix-store','-q','--hash','{store_path}'],
  nix_store_path_info:['nix','path-info','--json','{store_path}'],
  nix_profile_list:['nix','profile','list'],
});

export function validateCall(raw, catalog) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Tool call must be a JSON object');
  }
  const name = raw.name ?? raw.toolName;
  if (typeof name !== 'string' || !Object.hasOwn(catalog.tools, name)) {
    throw new Error(`Unknown Needle action: ${String(name)}`);
  }
  let args = raw.arguments ?? raw.input;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { throw new Error('Tool arguments are not JSON'); }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new TypeError('Tool arguments must be a JSON object');
  }
  const schema = catalog.tools[name].inputSchema;
  if (schema.type !== 'object' || schema.additionalProperties !== false) {
    throw new Error('Invalid catalog schema');
  }
  for (const field of schema.required ?? []) {
    if (!Object.hasOwn(args, field)) throw new Error(`Missing required argument: ${field}`);
  }
  for (const [field, value] of Object.entries(args)) {
    if (!Object.hasOwn(schema.properties, field)) {
      throw new Error(`Unexpected argument: ${field}`);
    }
    const spec = schema.properties[field];
    if (spec.type !== 'string' || typeof value !== 'string') {
      throw new TypeError(`Invalid argument type: ${field}`);
    }
    if (spec.minLength !== undefined && value.length < spec.minLength) {
      throw new Error(`Argument too short: ${field}`);
    }
    if (spec.maxLength !== undefined && value.length > spec.maxLength) {
      throw new Error(`Argument too long: ${field}`);
    }
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
      throw new Error(`Invalid argument format: ${field}`);
    }
    if (value.includes('\0')) throw new Error('NUL bytes are not permitted');
    if (field === 'project' || field === 'installable') {
      if (/[\n\r;|&`$<>]/.test(value)) throw new Error('Untrusted input characters in advisory arguments');
    }
  }
  return { name, arguments: args };
}

function isInside(root, path) {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../');
}

const DENY_NAMES = /(^\.|^id_rsa|\.key$|\.pem$|secret|token|password|credential|private|api[-_]?key|\.env)/i;

function rejectSensitiveParts(root, target) {
  const parts = relative(root, target).split(sep);
  if (parts.some((part) => DENY_NAMES.test(part))) {
    throw new Error('Sensitive or hidden file names are not readable/writable through Needle');
  }
}

// Disallow ALL symlink components, including benign in-workspace aliases.
// This avoids bypassing name checks with a symlink to /workspace/.env.
// It also keeps path resolution predictable for untrusted mounted workspaces.
async function rejectSymlinkComponents(root, target) {
  let cursor = root;
  for (const segment of relative(root, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    const metadata = await lstat(cursor);
    if (metadata.isSymbolicLink()) throw new Error('Symlink escapes workspace confinement');
  }
}

export async function checkedWorkspacePath(root, input, { create = false, file = false } = {}) {
  if (typeof input !== 'string' || !input || input.includes('\0') || isAbsolute(input)) {
    throw new Error('A nonempty relative workspace path is required');
  }
  const realRoot = await realpath(root);
  const candidate = resolve(realRoot, input);
  if (!isInside(realRoot, candidate)) throw new Error('Path escapes workspace');
  if (file || create) rejectSensitiveParts(realRoot, candidate);

  // For creation the final pathname must not exist; the parent must exist
  // and contain no symlinks. O_EXCL below enforces atomic no-overwrite.
  await rejectSymlinkComponents(realRoot, create ? dirname(candidate) : candidate);
  if (create) return candidate;

  const resolved = await realpath(candidate);
  if (!isInside(realRoot, resolved)) throw new Error('Symlink escapes workspace');
  if (file) rejectSensitiveParts(realRoot, resolved);
  return resolved;
}

// Validate the *opened descriptor*, not just the pathname checked earlier.
// /proc/self/fd is available in the Linux image; fail closed without it.
async function assertOpenedWorkspaceFile(handle, workspace) {
  const root = await realpath(workspace);
  const actual = await realpath(`/proc/self/fd/${handle.fd}`);
  if (!isInside(root, actual)) throw new Error('Opened file escapes workspace');
  rejectSensitiveParts(root, actual);
  return actual;
}

function commandPreview(entry, args) {
  return entry.commandPreview.map(item => item.replace(/\{(package|store_path|project|installable|file|path)\}/g,
    (match, field) => args[field] ?? (field === 'path' ? '.' : match)));
}
export function planCall(call, catalog) {
  const valid = validateCall(call, catalog);
  const entry = catalog.tools[valid.name];
  const argv = commandPreview(entry, valid.arguments);
  return {
    name: valid.name, category: entry.category, mode: entry.mode, argv,
    executed: false,
    message: entry.mode === 'manual'
      ? 'Advisory only: never executed by Needle; review and run manually outside this router'
      : entry.mode === 'write'
        ? 'Requires both --execute and --allow-write; only creates a new file'
        : 'Read-only; explicit --execute needed to run',
  };
}

const TRUSTED_BIN_DIRS = Object.freeze(['/usr/bin', '/bin', '/usr/sbin', '/sbin']);

async function trustedExecutable(name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('Invalid executable name');
  }
  for (const dir of TRUSTED_BIN_DIRS) {
    let target;
    try {
      target = await realpath(join(dir, name));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!TRUSTED_BIN_DIRS.some((root) => isInside(root, target))) {
      throw new Error('Executable resolves outside system-owned directories');
    }
    const info = await stat(target);
    if (!info.isFile() || info.uid !== 0 ||
        (info.mode & 0o022) !== 0 || (info.mode & 0o111) === 0) {
      throw new Error('Executable is not a trusted root-owned binary');
    }
    // Preserve the original absolute applet pathname: BusyBox uses argv[0]
    // (for example /usr/bin/id), not the resolved /bin/busybox target.
    return join(dir, name);
  }
  throw new Error(`Approved executable not found: ${name}`);
}

async function runCommand(name, entry, args, { workspace }) {
  const signature = SAFE[name];
  if (!signature || JSON.stringify(entry.commandPreview) !== JSON.stringify(signature)) {
    throw new Error(`Denied: command signature for ${name} is not in the reviewed allowlist`);
  }
  const [bin, ...argv] = commandPreview(entry, args);
  const executable = await trustedExecutable(bin);
  if (args.store_path) {
    // Do not query arbitrary absent paths or unusual symlinks inside the store.
    const realStorePath = await realpath(args.store_path);
    if (realStorePath !== args.store_path) throw new Error('Refusing redirected Nix store path');
  }
  const opts = {
    cwd: workspace, timeout: 30000, maxBuffer: 256 * 1024,
    env: {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      HOME: process.env.HOME ?? '/home/nixuser',
      USER: process.env.USER ?? 'nixuser',
    },
  };
  try {
    const { stdout, stderr } = await execFile(executable, argv, opts);
    return { ok: true, exitCode: 0,
      stdout: stdout.slice(0, MAX_OUTPUT),
      stderr: stderr.slice(0, MAX_OUTPUT) };
  } catch (error) {
    const code = Number.isInteger(error.code) ? error.code : null;
    const diagnostic = name === 'apk_audit' && code === 99;
    return {
      ok: diagnostic, exitCode: code,
      stdout: String(error.stdout ?? '').slice(0, MAX_OUTPUT),
      stderr: String(error.stderr ?? error.message).slice(0, MAX_OUTPUT),
      diagnostic, timeout: Boolean(error.killed),
    };
  }
}

async function getSafeFile(workspace, value, { limit }) {
  const file = await checkedWorkspacePath(workspace, value, { file: true });
  const flags = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK;
  const handle = await open(file, flags);
  try {
    await assertOpenedWorkspaceFile(handle, workspace);
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error('Only regular workspace files can be read or hashed');
    if (metadata.size > limit) throw new Error(`File exceeds ${limit}-byte limit`);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function executeWorkspace(name, args, { workspace, allowWrite }) {
  if (name === 'workspace_list') {
    const path = await checkedWorkspacePath(workspace, args.path ?? '.');
    const entries = await readdir(path, { withFileTypes: true });
    return { ok: true, entries: entries.slice(0, MAX_FILES).map(e => ({
      name: e.name, type: e.isDirectory() ? 'directory' : e.isSymbolicLink() ? 'symlink' : 'file'
    })), truncated: entries.length > MAX_FILES };
  }
  if (name === 'workspace_stat') {
    const path = await checkedWorkspacePath(workspace, args.path, { file: true });
    const meta = await lstat(path);
    return { ok: true, kind: meta.isFile() ? 'file' : meta.isDirectory() ? 'directory' : 'other',
      bytes: meta.size, permissions: (meta.mode & 0o777).toString(8) };
  }
  if (name === 'workspace_read') {
    const handle = await getSafeFile(workspace, args.file, { limit: MAX_READ });
    try {
      return { ok: true, text: await handle.readFile('utf8') };
    } finally {
      await handle.close();
    }
  }
  if (name === 'workspace_hash') {
    const handle = await getSafeFile(workspace, args.file, { limit: MAX_HASH });
    try {
      const digest = createHash('sha256').update(await handle.readFile()).digest('hex');
      return { ok: true, sha256: digest };
    } finally {
      await handle.close();
    }
  }
  if (name === 'workspace_create') {
    if (!allowWrite) throw new Error('File creation requires --execute and --allow-write');
    const path = await checkedWorkspacePath(workspace, args.path, { create: true });
    const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT |
      fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
    const handle = await open(path, flags, 0o600);
    try {
      await assertOpenedWorkspaceFile(handle, workspace);
      await handle.writeFile(args.content, 'utf8');
    } finally {
      await handle.close();
    }
    return { ok: true, created: args.path, bytes: Buffer.byteLength(args.content, 'utf8') };
  }
  throw new Error('Workspace action is not implemented');
}

const WORKFLOWS = Object.freeze({
  workflow_system_audit:['system_identity','system_arch','alpine_release','nix_version','system_disk'],
  workflow_dependency_audit:['apk_version','apk_installed','nix_version'],
  workflow_nix_health:['nix_eval_selftest','nix_store_verify'],
});

export async function executeAllowed(call, {
  catalog, workspace = '/workspace', execute = false, allowWrite = false
} = {}) {
  if (!catalog) throw new Error('Explicit catalog is required');
  const valid = validateCall(call, catalog);
  const entry = catalog.tools[valid.name];
  const preview = planCall(valid, catalog);
  if (entry.mode === 'manual') return preview;
  if (!execute) return preview;
  if (entry.mode === 'write' && !allowWrite) {
    throw new Error('Mutating action requires both --execute and --allow-write');
  }
  if (Object.hasOwn(WORKFLOWS, valid.name)) {
    const stages = [];
    for (const name of WORKFLOWS[valid.name]) {
      stages.push({ name, result: await executeAllowed({ name, arguments:{} },
        { catalog, workspace, execute:true }) });
    }
    return { name: valid.name, mode:'readonly', executed:true,
      ok: stages.every(x => x.result.ok), stages };
  }
  if (entry.category === 'workspace') {
    return { name: valid.name, mode:entry.mode, executed:true,
      ...await executeWorkspace(valid.name, valid.arguments, { workspace, allowWrite }) };
  }
  if (entry.mode !== 'readonly') throw new Error('Unsupported execution mode');
  return { name: valid.name, mode:entry.mode, executed:true,
    ...await runCommand(valid.name, entry, valid.arguments, { workspace }) };
}
