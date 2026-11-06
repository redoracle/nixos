import { realpath, lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { execFile as callbackExecFile } from 'node:child_process';

const execFile = promisify(callbackExecFile);

export function validateCall(call, catalog) {
  if (!call || typeof call !== 'object' || Array.isArray(call)) {
    throw new TypeError('Tool call must be an object');
  }
  const definition = catalog.tools[call.name];
  if (!definition) throw new Error(`Unknown Needle action: ${String(call.name)}`);
  const args = call.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new TypeError('arguments must be a JSON object');
  }
  const schema = definition.inputSchema;
  for (const key of schema.required ?? []) {
    if (!Object.hasOwn(args, key)) throw new Error(`Missing required argument: ${key}`);
  }
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties[key];
    if (!prop) throw new Error(`Unexpected argument: ${key}`);
    if (typeof value !== prop.type) throw new TypeError(`Invalid type for ${key}`);
    if (typeof value === 'string') {
      if (prop.minLength !== undefined && value.length < prop.minLength) {
        throw new Error(`Argument too short: ${key}`);
      }
      if (prop.maxLength !== undefined && value.length > prop.maxLength) {
        throw new Error(`Argument too long: ${key}`);
      }
      if (prop.enum && !prop.enum.includes(value)) {
        throw new Error(`Unsupported value for ${key}`);
      }
    }
  }
  return { name: call.name, arguments: args };
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel));
}

export async function checkedWorkspacePath(root, input, { create = false } = {}) {
  if (typeof input !== 'string' || !input || input.includes('\0') || isAbsolute(input)) {
    throw new Error('Use a nonempty relative workspace path');
  }
  const realRoot = await realpath(root);
  const target = resolve(realRoot, input);
  if (!inside(realRoot, target)) throw new Error('Path escapes /workspace');
  if (!create) {
    const realTarget = await realpath(target);
    if (!inside(realRoot, realTarget)) throw new Error('Symlink escapes /workspace');
    return realTarget;
  }
  const realParent = await realpath(dirname(target));
  if (!inside(realRoot, realParent)) throw new Error('Parent symlink escapes /workspace');
  // Require the final pathname not to exist, including a symlink.
  try {
    await lstat(target);
    throw new Error('Refusing to replace an existing path');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return target;
}

async function fixedCheck(command, args) {
  const { stdout, stderr } = await execFile(command, args, {
    cwd: '/workspace',
    timeout: 15000,
    maxBuffer: 128 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER },
  });
  return (stdout + stderr).slice(0, 65536).trim();
}

export async function executeAllowed(call, { workspace = '/workspace', allowWrite = false } = {}) {
  const args = call.arguments;
  switch (call.name) {
    case 'nix_version':
      return fixedCheck('nix', ['--version']);
    case 'run_safe_check':
      if (args.check === 'nix-store-verify') return fixedCheck('nix-store', ['--verify']);
      if (args.check === 'nix-eval-test') return fixedCheck('nix-instantiate', ['--eval', '--expr', '1 + 1']);
      if (args.check === 'node-version') return fixedCheck('node', ['--version']);
      throw new Error('Unknown diagnostic');
    case 'list_workspace': {
      const path = await checkedWorkspacePath(workspace, args.path ?? '.');
      const listing = await readdir(path, { withFileTypes: true });
      return listing.slice(0, 100).map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
      }));
    }
    case 'read_workspace_file': {
      const path = await checkedWorkspacePath(workspace, args.path);
      const { size } = await lstat(path);
      if (size > 16384) throw new Error('File exceeds the 16 KiB read limit');
      return readFile(path, 'utf8');
    }
    case 'write_workspace_file': {
      if (!allowWrite) throw new Error('Writing requires both --execute and --allow-write');
      const path = await checkedWorkspacePath(workspace, args.path, { create: true });
      await writeFile(path, args.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      return { created: args.path, bytes: Buffer.byteLength(args.content, 'utf8') };
    }
    default:
      throw new Error('Unknown action');
  }
}
