# Pi + Needle variant: Alpine/Nix command catalog and security guide

The repository offers **two independently selectable image flavors**:

| Flavor | Dockerfile | GitHub Container Registry | Default command |
| --- | --- | --- | --- |
| Vanilla | [`Dockerfile`](../Dockerfile) | `ghcr.io/redoracle/nixos:vX.Y.Z` | `bash` |
| Optional Pi + Needle | [`Dockerfile.pi`](../Dockerfile.pi) | `ghcr.io/redoracle/nixos-pi:vX.Y.Z` | `pi` |

The Pi image derives from the same reviewed Alpine + Nix vanilla base, keeps UID/GID **10001**, and adds Node.js, Pi, local [Needle 3](https://www.cactuscompute.com/needle) WebAssembly inference and a guarded tool router. The vanilla image and its command behavior remain unchanged.

> **Architectural boundary:** Needle is an on-device function selection model. It is **not a general chat/reasoning LLM**. The Pi coding agent still requires a separately configured provider or local language model. Pi's built-in `bash`, `write` and other tools are **not restricted** by the separate Needle JSON policy. Use only trusted prompts and projects with Pi; do not rely on a JSON catalog as a sandbox.

## Building the two image flavors

```sh
# Minimal Alpine + Nix (no AI runtime)
docker build -f Dockerfile -t alpine-nix:local .

# Opt-in coding agent, derived from the same locally verified image
docker build -f Dockerfile.pi \
  --build-arg BASE_IMAGE=alpine-nix:local \
  -t alpine-nix-pi:local .

# Run vanilla:
docker run --rm -it alpine-nix:local

# Run Pi (configure its reasoning-model provider separately):
docker run --rm -it \
  --mount type=bind,src="$PWD",dst=/workspace \
  alpine-nix-pi:local
```

The image builds and caches the Needle weights **at build time** as `nixuser`. A normal running container should not require a second model download. Package and model provenance still depend on upstream distribution and are not guaranteed bit-for-bit reproducible without further pinned digests/lockfiles.

## Pi extension: use Needle inside the agent

The optional image configures `~/.pi/agent/settings.json` to load the local [`needle-pi-extension.js`](../ai/needle-pi-extension.js), registering the **`needle_route`** Pi tool.

When Pi has a reasoning provider, you can ask:

> Use needle_route to inspect the Alpine packages installed in this container, then explain what you found.

The extension asks the offline Needle model to **propose** a validated action, and returns JSON suggestions to Pi. It **does not execute** the action. This is intentional: Pi's own reasoning-model tool calls and the model's preferred actions should be reviewed before state-changing work. For deterministic, constrained local execution, use `needle-cli` explicitly.

Pi configuration: see [Pi's extension documentation](https://pi.dev/docs/latest/extensions) and [Pi quickstart](https://pi.dev/docs/latest/quickstart).

## Needle CLI and JSON catalog

The authoritative [`ai/needle-tools.json`](../ai/needle-tools.json) declares **60 named functions** across five groups. Every function includes a description, scope, safety mode, strict JSON input schema, constrained command preview and sample arguments. [`ai/needle-scenarios.json`](../ai/needle-scenarios.json) provides **35 natural-language examples** with sample expected tools.

| Group | Catalog entries | Examples |
| --- | ---: | --- |
| `system` | 6 | UID/group, architecture, kernel, Alpine release, disk, Node |
| `apk` | 17 | Version, installed packages, dependencies, reverse deps, files, indexed search, policy, audit, repositories, world file; advice for add/del/update/upgrade/fix |
| `nix` | 27 | Version, safe fixed evaluation, configuration, flake registry, store verification/roots/live/dead/references/closure/size/hash, profile list; plans for flakes/builds/devshells/GC |
| `workspace` | 5 | List, read, stat, SHA-256, create a new file |
| `workflow` | 5 | System audit, dependency audit, Nix health, project audit plan, upgrade plan |

There is no safe finite representation of **all** Nix or Alpine commands: both have advanced, potentially privileged or arbitrary-code-executing operations. This catalog deliberately covers inspectable actions and practical procedures without promising unrestricted execution.

### Inspect and generate proposals (default: no execution)

```sh
docker run --rm alpine-nix-pi:local needle-cli --health
docker run --rm alpine-nix-pi:local needle-cli --catalog
docker run --rm alpine-nix-pi:local needle-cli --scope nix \
  "What version of Nix is installed?"
docker run --rm alpine-nix-pi:local needle-cli --scope apk \
  "Show the Alpine nix package dependencies"
docker run --rm alpine-nix-pi:local needle-cli --scope workflow \
  "How should I safely upgrade the Alpine packages and Nix version?"
```

The `--scope` option limits the tools supplied to the model: `auto` (default), `system`, `apk`, `nix`, `workspace`, `workflow` or `all`. Use a focused scope for more predictable tool selection and to avoid oversized model context. **The model is probabilistic** and may emit no call or the wrong call. Never assume an example phrase deterministically selects a given function.

### Execute a safe read-only catalog operation

```sh
docker run --rm alpine-nix-pi:local \
  needle-cli --call-json '{"name":"apk_info","arguments":{"package":"nix"}}' --execute

docker run --rm alpine-nix-pi:local \
  needle-cli --call-json '{"name":"nix_store_verify","arguments":{}}' --execute

docker run --rm alpine-nix-pi:local \
  needle-cli --call-json '{"name":"workflow_nix_health","arguments":{}}' --execute
```

Direct `--call-json` bypasses language-model selection **but not** the schema, safety mode, command allowlist or path controls. It is the exact deterministic entry point CI uses to validate each action.

Natural-language execution is also possible:

```sh
docker run --rm alpine-nix-pi:local \
  needle-cli --scope nix --execute "Show me the Nix version"
```

Review the JSON proposal before allowing execution of model-selected functions. No arbitrary command string or dynamically generated shell is supported.

### Explicitly allow new workspace files

```sh
docker run --rm \
  --mount type=bind,src="$PWD",dst=/workspace \
  alpine-nix-pi:local \
  needle-cli --call-json \
  '{"name":"workspace_create","arguments":{"path":"notes.txt","content":"Report ready"}}' \
  --execute --allow-write
```

Only files below `/workspace` can be accessed. Paths are normalized, escaping symlinks are rejected, sensitive/hidden filenames cannot be read or written through this interface, reads and hashes are size-capped, and file creation uses exclusive `wx` mode with permission `0600`. Existing files are never overwritten. These controls reduce risk, but they are not a substitute for isolating untrusted workloads or protecting concurrently modified mounts.

### Deliberately non-executable operations

The following catalog operations always return **review guidance only**, even if both execution flags are supplied:

- Alpine `apk add`, `apk del`, `apk upgrade`, `apk update` and `apk fix`: the container runs unprivileged and package changes belong in a reviewed Dockerfile/rebuild.
- Nix `build`, `run`, `develop`, `shell`, profile install/remove, flake check/update, store garbage collection and optimisation: these may fetch resources, execute code, mutate the store or remove data. This image explicitly sets `sandbox = false` for Nix compatibility, making unattended execution inappropriate.
- Full project audit and upgrade workflows that could modify source or download dependencies.

Example:

```sh
docker run --rm alpine-nix-pi:local needle-cli \
  --call-json '{"name":"nix_store_gc_plan","arguments":{}}' --execute
```

The output is a **plan**, not a performed garbage collection. Review it and run any selected commands yourself in a trusted context.

## Tested use cases and boundaries

The repository's CI runs on **`linux/amd64` and `linux/arm64`**. Each architecture job:

1. Builds and smoke-tests the vanilla Alpine + Nix image.
2. Builds the optional Pi + Needle image from that tested base.
3. Checks Pi CLI availability, registers the real Pi extension with a test host, verifies that Needle weights are present and exercises actual offline model inference without tool execution.
4. Validates every tool's metadata and schema, then performs **all 60 deterministic operation tests** under UID 10001: read-only operations execute against the image; advisory operations must remain non-executable; the workspace create action is tested under explicit permission against a temporary fixture.
5. Verifies that paths, shell-like package options, unexpected JSON properties, and hidden/secret files cannot bypass the catalog policy.

The deterministic checks validate command mapping and safe execution, **not** a 100% success rate for Needle choosing the intended function from arbitrary natural language. The Pi extension can be loaded and its registration checked without connecting a paid API key, but a fully interactive Pi chat session requires a separately selected LLM.

## Trust and operational considerations

- **Isolation:** neither image requires root at runtime, a Docker socket, or privileged containers. Nix builds run with sandbox disabled; never feed untrusted Nixpkgs derivations to Pi or manual commands.
- **Workspace file safety:** the Needle dispatcher rejects symlink path components (including aliases entirely within the workspace), blocks direct and resolved sensitive names, and reads through verified descriptors with `O_NOFOLLOW`. Creating a file never replaces an existing path. This reduces accidental disclosure but does **not** provide complete race-free confinement against an actively hostile process concurrently rewriting bind-mounted directories; use an isolated, trusted workspace.
- **Command trust:** executed diagnostics resolve only approved, root-owned system binaries in the Alpine image. The original absolute applet path is preserved to support BusyBox commands; the runtime `PATH` is fixed rather than inherited from the user. This does not confer privileges and is not a sandbox for Pi's independently accessible tools.
- **Model-scope integrity:** predicted function calls must belong to the exact subset of tools offered for the current request, not merely the full 60-entry catalog. Tests cover wrong-scope and malformed calls.
- **Secrets:** never put API keys in images or mount host secrets into an unrestricted Pi session. Pi's own tools can bypass Needle's router policy.
- **Supply chain:** `apk` packages come from Alpine-signed repositories; npm dependencies are top-level version-pinned but transitive versions are not lockfile-pinned in this PR. This is a known reproducibility gap. Model weights are fetched at build time; review upstream model/license terms and consider a digest-pinned artifact mirror.
- **Resource use:** the Pi image is intentionally larger, includes Node.js and model weights, and may have slower CPU inference on ARM emulation. Compare release image sizes after publishing.
- **Deployment:** keep the baseline variant for minimal systems. Use a versioned or digest-pinned `nixos-pi` tag only when the optional features are needed.
- **Rollback:** run the previous successful `nixos-pi` digest or switch directly back to the vanilla Alpine + Nix image; the main Dockerfile remains untouched.

Further reference: [Nix command manual](https://nix.dev/manual/nix/latest/command-ref), [Alpine apk documentation](https://wiki.alpinelinux.org/wiki/Alpine_Package_Keeper), [Needle WebAssembly usage](https://github.com/afshinm/cactus-needle/blob/main/docs/usage.md), [SECURITY.md](../SECURITY.md), and [architecture guide](ARCHITECTURE.md).
