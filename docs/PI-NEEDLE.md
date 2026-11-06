# Optional Pi + Needle image (Alpine + Nix)

The default `Dockerfile` builds the minimal **vanilla Alpine + Nix** container. The opt-in [`Dockerfile.pi`](../Dockerfile.pi) builds a **second** image containing:

- The existing Nix runtime and non-root UID 10001 store, unchanged.
- [Pi](https://pi.dev/docs/latest/quickstart), installed as a pinned npm package, providing its standard interactive coding agent.
- [Cactus Compute Needle 3](https://github.com/cactus-compute/needle), run locally using the [`cactus-needle` WebAssembly/Node runtime](https://github.com/afshinm/cactus-needle), prefetching its model weights during the build.
- `needle-cli`, a conservative natural-language tool selector with an explicit JSON tool catalog, model proposals shown by default, and opt-in restricted execution.

## Critical architecture distinction

**Needle is not a general-purpose language/reasoning model.** It is a small function-calling/extraction model. Running Pi's interactive coding agent still requires configuring a supported model provider or compatible separately served local reasoning model. Needle **does not automatically become Pi's chat model** and cannot autonomously perform arbitrary Pi coding workflows.

The third-party [`pi-llm-bridge`](https://pi.dev/packages/pi-llm-bridge) is designed to route tool intents from an additional upstream model through a fine-tuned Needle model. It does **not** turn Needle into that upstream reasoning model. Its JAX/Python runtime is not installed here: normal upstream `jaxlib` wheels target glibc rather than Alpine's musl, and its complete Alpine/multiarch compatibility has not been proven. The independent Needle 3 WebAssembly path avoids that packaging assumption.

## Build and choose either flavor

### Vanilla (existing behavior, no AI dependencies)

```sh
docker build -f Dockerfile -t alpine-nix:local .
docker run --rm -it alpine-nix:local
```

### Pi + Needle (opt-in)

```sh
docker build -f Dockerfile -t alpine-nix:local .
docker build -f Dockerfile.pi --build-arg BASE_IMAGE=alpine-nix:local -t alpine-nix-pi:local .
docker run --rm -it --mount type=bind,src="$PWD",dst=/workspace alpine-nix-pi:local
```

The Pi variant defaults to launching `pi`, as non-root `nixuser`. Configure a Pi provider using `/login`, or configure a local model serving endpoint as described in [Pi's documentation](https://pi.dev/docs/latest/quickstart). Pi may use its own `read`, `write`, `edit` and `bash` tools; those can modify files and execute commands within its container permissions.

To run a plain shell instead of Pi:

```sh
docker run --rm -it alpine-nix-pi:local bash
```

## Use Needle for local natural-language tool routing

Needle is exposed through the separate `needle-cli` command. It accepts a natural language request and produces proposed **JSON function calls without executing them**:

```sh
docker run --rm alpine-nix-pi:local needle-cli "What version of Nix is installed?"
```

Allow execution of the narrowly scoped, predefined functions in [`ai/needle-tools.json`](../ai/needle-tools.json):

```sh
docker run --rm alpine-nix-pi:local needle-cli --execute "What version of Nix is installed?"
```

The available function names and schemas are:

| Name | Parameters | Behavior |
| --- | --- | --- |
| `nix_version` | none | Runs fixed `nix --version` |
| `run_safe_check` | `check` enum | Runs one of three predefined diagnostics; never arbitrary shell |
| `list_workspace` | optional relative `path` | Lists up to 100 directory entries under `/workspace` |
| `read_workspace_file` | relative `path` | Reads up to 16 KiB of UTF-8 text, restricted to `/workspace` |
| `write_workspace_file` | `path`, `content` | Creates a new UTF-8 file; requires `--execute --allow-write`, does not overwrite |

For write operations, explicitly enable both execution and writing:

```sh
docker run --rm -it --mount type=bind,src="$PWD",dst=/workspace \
  alpine-nix-pi:local needle-cli --execute --allow-write \
  "Create a new file named summary.txt containing Hello"
```

**The generated action is not guaranteed to match the user's intent.** Preview the proposed call before enabling execution. A JSON Schema bounds the allowed parameters, but it does not make model output trustworthy. Symlink/path traversal checks, fixed diagnostics, limits and explicit write flags provide defense in depth; they are not a complete sandbox. Never mount sensitive credentials or expose Pi to untrusted prompts.

## Published image choice (after release workflow success)

| Variant | GHCR repository | Default command |
| --- | --- | --- |
| Vanilla | `ghcr.io/redoracle/nixos:vX.Y.Z` | `bash` |
| Pi + Needle | `ghcr.io/redoracle/nixos-pi:vX.Y.Z` | `pi` |

The release workflow builds the Pi image **from the exact matching published vanilla tag**, publishes both AMD64 and ARM64 variants under separate repositories, and verifies both manifests. Docker Hub mirrors are optional when repository credentials are configured. A PR does not publish images. Do not pull the Pi tag until the release workflow has actually published it.

## Provenance and updates

The Pi variant pins the top-level versions of `@earendil-works/pi-coding-agent` and `cactus-needle` in [`ai/package.json`](../ai/package.json). The installer disables npm lifecycle scripts. The WebAssembly runtime uses an upstream model manifest and downloads/caches Needle 3 weights during image build. **The npm transitive dependency graph is not yet frozen by a committed lockfile.** Treat this as an explicit reproducibility limitation; prefer a lockfile + `npm ci` and digest-pinned base image in a later hardening PR.

Model weights are cached under the image user's home so normal runtime inference works without a model download (subject to runtime compatibility). The built image is larger than vanilla, and an offline tool-routing model is not a replacement for the remote/local Pi reasoning provider.

Needle's model and its upstream runtime may have distinct licenses; consult the [upstream license and artifact notices](https://github.com/cactus-compute/needle) and the [`cactus-needle` NOTICE](https://github.com/afshinm/cactus-needle/blob/main/NOTICE). Telemetry is disabled in the image with `NEEDLE_TELEMETRY=0` and `DO_NOT_TRACK=1`.

## Security and maintenance acceptance

- The vanilla image, default `Dockerfile`, user, and Nix store behavior are unchanged.
- The extra image must pass separate Docker builds, Pi CLI smoke tests, and actual local Needle inference on AMD64 and ARM64 before release.
- The tool catalog is finite and checked by unit tests. It does not grant Needle an arbitrary Bash execution capability.
- No API key or Docker socket is baked into either image, and Pi's provider credentials should only be mounted at runtime when needed.
- A monthly Dependabot review can update the Pi/npm packages, with multiarch CI gating and deliberate SemVer release tags.
- Rollback is to the last published tagged image, or to the vanilla image if Pi/Needle is unnecessary.

Read [`SECURITY.md`](../SECURITY.md) and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the wider container security model. Nix sandboxing remains disabled in *both* images.
