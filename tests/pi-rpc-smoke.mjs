// Integration test against the actual installed Pi CLI, not a fake ExtensionAPI.
// This test requires neither an upstream reasoning model nor network access.
// It is run inside the opt-in Alpine container as UID 10001.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

assert.equal(process.getuid(), 10001);

const child = spawn('pi', [
  '--mode', 'rpc', '--no-session', '--no-mcp', '--tools', 'needle_route',
], {
  cwd: '/workspace',
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NO_COLOR: '1' },
});

const pending = new Map();
let buffer = '';
let stderr = '';
let stopped = false;

function failAll(error) {
  for (const pendingRequest of pending.values()) {
    clearTimeout(pendingRequest.timer);
    pendingRequest.reject(error);
  }
  pending.clear();
}

child.stderr.on('data', (chunk) => {
  stderr = (stderr + chunk.toString()).slice(-8192);
});
child.on('error', failAll);
child.on('exit', (code, signal) => {
  stopped = true;
  failAll(new Error(
    'Pi RPC process exited before completion: ' + code + ' / ' + signal +
    ', stderr: ' + stderr,
  ));
});
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  // RPC framing is strict JSONL; split only on the LF delimiter.
  for (;;) {
    const i = buffer.indexOf('\n');
    if (i === -1) break;
    const line = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      failAll(new Error('Invalid Pi RPC JSON line: ' + error.message));
      return;
    }
    if (message.type !== 'response') continue;
    const request = pending.get(message.id);
    if (!request) continue;
    clearTimeout(request.timer);
    pending.delete(message.id);
    request.resolve(message);
  }
});

let sequence = 0;
function request(type, args = {}) {
  const id = 'pi-smoke-' + (++sequence);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Pi RPC ' + type + ' timed out; stderr: ' + stderr));
      child.kill('SIGKILL');
    }, 25000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, type, ...args }) + '\n');
  });
}

try {
  const commands = await request('get_commands');
  assert.equal(commands.success, true, JSON.stringify(commands));
  assert.ok(Array.isArray(commands.data?.commands), 'Expected real Pi command catalog');
  const extensionCommand = commands.data.commands.find(
    (entry) => entry.name === 'needle-health',
  );
  assert.ok(extensionCommand, 'Pi did not load the configured Needle extension');
  assert.equal(extensionCommand.source, 'extension');

  // Prove Pi handles the extension command itself with no LLM/API key.
  const response = await request('prompt', { message: '/needle-health' });
  assert.equal(response.success, true, JSON.stringify(response));
  assert.equal(response.data?.disposition, 'handled');
  console.log('Real Pi RPC loaded and executed /needle-health without an LLM');
} finally {
  child.stdin.end();
  if (!stopped) child.kill('SIGTERM');
}
