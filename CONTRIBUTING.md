# Contributing to preflight

Thank you for your interest in contributing! This guide covers everything you need to get up and running as a contributor to the preflight + clearance monorepo.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Project Structure](#project-structure)
3. [Branch Strategy](#branch-strategy)
4. [Making Changes](#making-changes)
5. [Testing](#testing)
6. [Code Conventions](#code-conventions)
7. [Submitting a PR](#submitting-a-pr)
8. [Releasing](#releasing)

---

## Development Setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | `.nvmrc` or `engines` field enforced |
| pnpm | 10+ | Workspace package manager |
| Foundry / Anvil | latest | Required to run fork-based tests |

Install Foundry (which includes Anvil):

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Verify Anvil is available:

```bash
anvil --version
```

### Clone, Install, Build, Test

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/preflight.git
cd preflight

# 2. Install all workspace dependencies
pnpm install

# 3. Build all packages
pnpm build

# 4. Run the full test suite
pnpm test
```

### Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env   # if present, otherwise create .env manually
```

```bash
# .env
FORK_RPC_URL=https://rpc.mevblocker.io    # RPC endpoint for Anvil fork (required for fork tests)
FORK_BLOCK_NUMBER=20000000                # Pin a reproducible block (optional)
```

> Tests that require a live fork will be skipped when `FORK_RPC_URL` is not set. All other tests run without it.

---

## Project Structure

```
preflight/
├── packages/
│   ├── preflight-core/          # @preflight/core — AnvilFork, Scenario API, on-chain assertions
│   ├── preflight-cli/           # @preflight/cli — CLI runner for preflight test files
│   ├── clearance-core/          # @clearance/core — EIP-7702-based agent permission scoping SDK
│   ├── eip7702/                 # @clearance/eip7702 — EIP-7702 signing utilities
│   ├── mcp/                     # @preflight/mcp — MCP server exposing fork/simulate/clearance tools to AI agents
│   ├── adapter-langchain/       # @preflight/adapter-langchain — mock chat model for LangChain
│   ├── adapter-openai-agents/   # @preflight/adapter-openai-agents — mock model for OpenAI Agents SDK
│   └── adapter-tokamak/         # @preflight/adapter-tokamak — Tokamak L2 fork adapter
├── examples/
│   └── uniswap-swap-agent/      # End-to-end example: Uniswap swap agent behavioral test
├── .github/
│   └── workflows/
│       ├── preflight-ci.yml     # CI: build + test on push/PR
│       ├── publish.yml          # Publish to npm on version tag
│       └── docs.yml             # Deploy TypeDoc to GitHub Pages
├── .changeset/                  # Changesets for versioning and changelogs
├── pnpm-workspace.yaml
├── turbo.json                   # Turborepo pipeline config
├── tsconfig.base.json           # Shared TypeScript base config
└── package.json                 # Root scripts and devDependencies
```

Each package under `packages/` is independently versioned and published to npm. They share build tooling (`tsup`, `vitest`) via the root `devDependencies`.

---

## Branch Strategy

| Branch pattern | Purpose |
|----------------|---------|
| `main` | Production-ready. All published releases come from here. |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Tooling, CI, dependency updates, non-functional changes |
| `docs/<name>` | Documentation-only changes |

**Never commit directly to `main`.** All changes must go through a pull request with at least one approving review before merge.

---

## Making Changes

1. **Fork** the repository on GitHub.
2. **Clone** your fork and add the upstream remote:
   ```bash
   git remote add upstream https://github.com/preflight-sh/preflight.git
   ```
3. **Create a branch** from the latest `main`:
   ```bash
   git fetch upstream
   git checkout -b feat/my-feature upstream/main
   ```
4. **Make your changes.** Follow the [Code Conventions](#code-conventions) below.
5. **Add a changeset** if you changed a public package:
   ```bash
   pnpm changeset
   ```
   Select the affected packages, choose `patch` / `minor` / `major`, and write a short summary. Commit the generated `.changeset/*.md` file along with your code changes.
6. **Push** your branch and open a pull request against `main`.

---

## Testing

### Running Tests

```bash
# All packages (from repo root)
pnpm test

# A single package
cd packages/preflight-core
pnpm test

# Watch mode (during development)
pnpm test --watch
```

### Test Stack

- **[Vitest](https://vitest.dev/)** — unit and integration tests
- **Anvil** — local EVM node used for fork-based tests; must be installed and on `$PATH`

### TDD Philosophy: RED → GREEN → IMPROVE

We follow test-driven development:

1. **RED** — Write a failing test that captures the expected behavior.
2. **GREEN** — Write the minimum implementation to make it pass.
3. **IMPROVE** — Refactor for clarity and performance without breaking the test.

This ensures every feature is covered before it ships.

### Coverage Target

Aim for **80% line coverage** or higher on all new code. Run coverage locally:

```bash
cd packages/preflight-core
pnpm vitest run --coverage
```

### Rules for Tests

- **No real LLM API calls.** Use `mockLLM()` / `createMockOpenAI()` from `@preflight/core`. Tests must be hermetic and free.
- **Always stop the fork after each test.** Use `afterEach(() => fork.stop())` to prevent dangling Anvil processes:
  ```typescript
  afterEach(async () => {
    await fork.stop()
  })
  ```
- Tests that require `FORK_RPC_URL` should guard with a `skipIf` condition so the suite passes in offline CI environments.

---

## Code Conventions

### TypeScript

- **`bigint` for all EVM amounts.** `number` cannot represent wei values without precision loss.

  ```typescript
  // ✅ bigint for EVM amounts
  const ONE_ETH = 1_000_000_000_000_000_000n

  // ❌ Never use number
  const ONE_ETH = 1e18
  ```

- **No `any`.** Use `unknown` and narrow the type, or define a proper interface.

- **No implicit returns from async functions without handling errors.** Wrap risky operations in `try/catch` and throw a descriptive error.

- **JSDoc on all public API functions.** At minimum: a one-line summary and `@param` / `@returns` tags.

  ```typescript
  /**
   * Creates a new clearance scope for an AI agent.
   * @param config - Agent address and permission set.
   * @returns A bound Clearance instance.
   */
  export function createClearance(config: ClearanceConfig): Clearance { ... }
  ```

### Immutability

Never mutate objects. Always return a new value:

```typescript
// ✅ Immutable
function update(p: Permissions, extra: string[]): Permissions {
  return { ...p, allowedContracts: [...p.allowedContracts, ...extra] }
}

// ❌ No mutation
p.allowedContracts.push(...extra)
```

### Logging

- **No `console.log` in production code.** Use a structured logger or remove debug output before committing.
- `console.error` in caught error paths is acceptable if the package does not yet have a logger.

### File Size

- Files should stay under **800 lines**. Extract utilities or sub-modules when a file grows beyond this.
- Functions should stay under **50 lines**. If a function is longer, it is doing too much.

---

## Submitting a PR

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description in imperative mood>
```

| Type | When to use |
|------|------------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `refactor` | Code change with no behavior change |
| `test` | Adding or fixing tests |
| `docs` | Documentation only |
| `chore` | Build, CI, dependency updates |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |

Examples:

```
feat: add blockNumber pinning to AnvilFork
fix: prevent fork process leak when scenario throws
chore: upgrade vitest to v4
```

### PR Description Template

When opening a PR, fill in the following:

```markdown
## Summary
- What does this PR do? (1–3 bullet points)

## Motivation
Why is this change needed?

## Changes
- List key files/modules changed

## Test Plan
- [ ] `pnpm test` passes locally
- [ ] New tests added for changed behavior
- [ ] No real LLM API calls in tests
- [ ] `afterEach(() => fork.stop())` present in fork tests
- [ ] Changeset added (if public package changed)
```

### Pre-Merge Checklist

- [ ] CI is green (build + test)
- [ ] No `console.log` left in source files
- [ ] No hardcoded secrets or RPC URLs
- [ ] `bigint` used for all EVM amounts
- [ ] Public functions have JSDoc
- [ ] Changeset file committed (for package changes)

---

## Releasing

Releases are **fully automated** via GitHub Actions on a version tag push.

### Process

1. Merge all intended changes to `main`.
2. Run `pnpm changeset version` locally to bump package versions and update `CHANGELOG.md` files based on accumulated changesets. Commit the result.
3. Tag the release:
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```
4. The [`publish.yml`](./.github/workflows/publish.yml) workflow triggers on `v*.*.*` tags and:
   - Installs dependencies
   - Builds all packages
   - Runs the full test suite (including Anvil)
   - Publishes all public packages to npm with `pnpm -r publish`

No manual `npm publish` steps are needed. The `NPM_TOKEN` secret must be configured in the repository settings.

---

## Questions?

Open a [GitHub Discussion](https://github.com/preflight-sh/preflight/discussions) or file an issue. We're happy to help.
