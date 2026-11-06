#!/bin/sh
set -eu

# Smoke-test the opt-in image as its own unprivileged default user.
[ "$(id -u)" -eq 10001 ]
[ -w /workspace ]
nix --version
pi --version
node /opt/pi-needle/needle-cli.mjs --health | node -e '
let json = "";
process.stdin.on("data", c => { json += c; });
process.stdin.on("end", () => {
  const result = JSON.parse(json);
  if (result.executingByDefault !== false || result.toolNames.length !== 5) {
    process.exit(1);
  }
});
'
# Exercise the actual offline Needle WASM inference path, never execute calls.
timeout 180 node /opt/pi-needle/needle-cli.mjs "What version of Nix is installed?" > /tmp/needle-inference.json
node -e '
const fs = require("node:fs");
const result = JSON.parse(fs.readFileSync("/tmp/needle-inference.json", "utf8"));
if (result.executed !== false || !Array.isArray(result.function_calls)) {
  process.exit(1);
}
console.log("Needle inference returned structured proposed calls without executing.");
'
rm -f /tmp/needle-inference.json
