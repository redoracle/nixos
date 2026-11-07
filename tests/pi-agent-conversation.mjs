// End-to-end Pi agent test: a deterministic loopback-only OpenAI-compatible
// "reasoning model" directs the real Pi runtime to its registered Needle tool.
// Pi then calls the REAL local Needle inference and sends the tool result back
// to the fake model. The test uses no external credentials or AI provider.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

assert.equal(process.getuid(), 10001, 'Pi must run unprivileged');

const root = await mkdtemp('/workspace/pi-agent-e2e-');
const agentDir = join(root, 'agent');
await mkdir(agentDir);
await writeFile(join(agentDir, 'settings.json'), JSON.stringify({
  extensions: ['/opt/pi-needle/needle-pi-extension.js'],
}));

const calls = [];
const finish = 'PI_NEEDLE_E2E_SUCCESS';
let serverError = null;
let child = null;
let stderr = '';
const events = [];
const listeners = new Set();
let lineBuffer = '';
let sequence = 0;

function sse(res, index, chunks) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  for (const [n, item] of chunks.entries()) {
    res.write('data: ' + JSON.stringify({
      id: 'chatcmpl-e2e-' + index, object: 'chat.completion.chunk',
      created: 1, model: 'deterministic-fixture',
      choices: [{ index: 0, delta: item.delta,
        finish_reason: item.finish_reason ?? null }],
    }) + '\n\n');
  }
  res.end('data: [DONE]\n\n');
}

const server = createServer(async (req, res) => {
  try {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/chat/completions');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(body.model, 'deterministic-fixture');
    assert.equal(body.stream, true);
    assert.ok(Array.isArray(body.tools), 'Pi must send the registered extension tool');
    assert.deepEqual(body.tools.map(item => item.function.name), ['needle_route']);

    calls.push(body);
    if (calls.length === 1) {
      assert.ok(body.messages.some(m => m.role === 'user'));
      sse(res, 1, [
        { delta: { role: 'assistant' } },
        { delta: { tool_calls: [{
          index: 0, id: 'fixture-needle-call', type: 'function',
          function: {
            name: 'needle_route',
            arguments: '{"request":"What version of Nix is installed?","scope":"nix"}',
          },
        }] } },
        { delta: {}, finish_reason: 'tool_calls' },
      ]);
    } else if (calls.length === 2) {
      const toolResults = body.messages.filter(m => m.role === 'tool');
      assert.equal(toolResults.length, 1, 'Pi must send Needle result back to provider');
      assert.equal(toolResults[0].tool_call_id, 'fixture-needle-call');
      const toolContent = toolResults[0].content;
      const text = typeof toolContent === 'string'
        ? toolContent
        : toolContent.map(piece => piece.text ?? '').join('\n');
      const payload = JSON.parse(text);
      assert.ok(payload.selectedTools.includes('nix_version'));
      assert.equal(payload.executed, false);
      assert.ok(Array.isArray(payload.plans));
      assert.ok(payload.plans.every(plan => plan.executed === false));
      // Needle has selected structured proposals only; the router has not run
      // any underlying Nix or Alpine diagnostics as a side effect.
      sse(res, 2, [
        { delta: { role: 'assistant', content: finish } },
        { delta: {}, finish_reason: 'stop' },
      ]);
    } else {
      throw new Error('Unexpected additional provider request: ' + calls.length);
    }
  } catch (error) {
    serverError = error;
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('deterministic provider contract failed');
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
await writeFile(join(agentDir, 'models.json'), JSON.stringify({
  providers: {
    fixture: {
      baseUrl: 'http://127.0.0.1:' + address.port + '/v1',
      api: 'openai-completions', apiKey: 'not-a-real-credential',
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      models: [{
        id: 'deterministic-fixture', name: 'Offline deterministic Pi E2E',
        reasoning: false, input: ['text'], contextWindow: 8192,
        maxTokens: 512, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }],
    },
  },
}));

const pending = new Map();
let exited = false;
function rejectPending(error) {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(error);
  }
  pending.clear();
  for (const fn of listeners) fn({ type: 'fatal_error', error: String(error.message) });
}
function readRpcLine(line) {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch (error) {
    rejectPending(new Error('Invalid Pi JSONL: ' + error.message));
    return;
  }
  if (msg.type === 'response' && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    clearTimeout(p.timer);
    pending.delete(msg.id);
    p.resolve(msg);
  } else {
    if (events.length < 1000) events.push(msg);
    for (const fn of listeners) fn(msg);
  }
}
function rpc(type, fields = {}) {
  const id = 'e2e-' + (++sequence);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Pi RPC request timed out: ' + type + ': ' + stderr));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, type, ...fields }) + '\n');
  });
}
function waitForAgentSettled(ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listeners.delete(watcher);
      reject(new Error('Pi agent did not settle; stderr: ' + stderr +
        '; last events: ' + JSON.stringify(events.slice(-7))));
    }, ms);
    const watcher = msg => {
      if (msg.type === 'agent_settled') {
        clearTimeout(timer);
        listeners.delete(watcher);
        resolve();
      } else if (msg.type === 'fatal_error') {
        clearTimeout(timer);
        listeners.delete(watcher);
        reject(new Error(msg.error));
      }
    };
    listeners.add(watcher);
  });
}

try {
  child = spawn('pi', [
    '--mode', 'rpc', '--no-session', '--no-mcp', '--tools', 'needle_route',
    '--provider', 'fixture', '--model', 'deterministic-fixture',
  ], {
    cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDir,
      PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0',
    },
  });
  child.on('error', rejectPending);
  child.on('exit', (code, signal) => {
    exited = true;
    rejectPending(new Error('Pi process terminated: ' + code + '/' + signal + ': ' + stderr));
  });
  child.stderr.on('data', x => { stderr = (stderr + x.toString()).slice(-8192); });
  child.stdout.on('data', x => {
    lineBuffer += x.toString();
    for (;;) {
      const end = lineBuffer.indexOf('\n');
      if (end < 0) break;
      const line = lineBuffer.slice(0, end);
      lineBuffer = lineBuffer.slice(end + 1);
      readRpcLine(line.replace(/\r$/, ''));
    }
  });

  const state = await rpc('get_state');
  assert.equal(state.success, true, JSON.stringify(state));
  assert.equal(state.data?.model?.id, 'deterministic-fixture');

  // Subscribe BEFORE requesting the prompt so fast events cannot be missed.
  const settled = waitForAgentSettled(240000);
  const response = await rpc('prompt', {
    message: 'Ask needle_route about the installed Nix version, then summarize its proposal.',
  });
  assert.equal(response.success, true, JSON.stringify(response));
  assert.equal(response.data?.disposition, 'started');
  await settled;

  assert.ifError(serverError);
  assert.equal(calls.length, 2, 'Expected one tool call and one final completion');
  const hasTool = events.some(e =>
    e.type === 'tool_execution_start' && e.toolName === 'needle_route');
  assert.equal(hasTool, true, 'Real Pi agent did not execute needle_route');

  const final = await rpc('get_last_assistant_text');
  assert.equal(final.success, true, JSON.stringify(final));
  assert.ok(JSON.stringify(final.data).includes(finish), 'Final assistant reply was not returned');
  console.log('PI AGENT E2E PASS: model -> Pi -> Needle -> tool result -> model -> reply');
} finally {
  if (child) {
    child.stdin.end();
    if (!exited) child.kill('SIGTERM');
  }
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
