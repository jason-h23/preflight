# Anvil Standalone E2E Tests

> **Date:** 2026-03-19
> **Status:** Draft
> **Scope:** `@preflight/core` — `createFork` standalone mode + full flow E2E tests

---

## Problem

현재 E2E 테스트(`live-fork.live.test.ts`)는 외부 Sepolia RPC가 필수다. `SEPOLIA_RPC_URL` 없으면 전부 skip되어 CI에서 E2E 검증이 불가능하다. 기존 `fork.test.ts`도 `https://eth.drpc.org` 같은 public RPC에 의존해 불안정할 수 있다.

## Solution

`createFork`에 `standalone: true` 옵션을 추가해 Anvil을 fork 없이 로컬 체인으로 실행한다. 이를 활용해 외부 의존성 zero인 full flow E2E 테스트를 작성한다.

---

## Design

### 1. `ForkOptions` 변경

```typescript
export interface ForkOptions {
  /** RPC URL of the chain to fork. Required unless standalone is true. */
  readonly rpc?: string
  /** Run Anvil as a standalone local chain (no fork). Default: false. */
  readonly standalone?: boolean
  /** Block number to fork at (ignored in standalone mode) */
  readonly blockNumber?: bigint
  /** Local Anvil port (defaults to auto-assignment via randomPort) */
  readonly port?: number
}
```

**Validation rules:**
- `standalone: true` → `rpc` ignored, `blockNumber` ignored
- `standalone` falsy + `rpc` missing → throw Error
- `standalone` falsy + `rpc` present → existing fork mode (no change)

### 2. `createFork` 변경

```typescript
export async function createFork(options: ForkOptions): Promise<Fork> {
  // Narrow rpc early: standalone doesn't need it, fork mode requires it.
  const rpc = options.standalone
    ? undefined
    : options.rpc?.trim() || undefined

  if (!options.standalone && !rpc) {
    throw new Error('createFork: rpc is required unless standalone is true')
  }

  const maxAttempts = options.port === undefined ? 3 : 1

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = options.port ?? randomPort()
    const anvil = createAnvil({
      // standalone: omit forkUrl/forkBlockNumber entirely
      ...(rpc ? { forkUrl: rpc, forkBlockNumber: options.blockNumber } : {}),
      port,
      startTimeout: 30_000,
    })
    // ... rest unchanged
  }
}
```

**Edge cases:**
- `{ standalone: false, rpc: '' }` → empty string trimmed to undefined → throws
- `{ standalone: false, rpc: undefined }` → throws
- `{ standalone: true, rpc: 'http://...' }` → rpc ignored, standalone mode
```

### 3. E2E 테스트 파일: `e2e.test.ts`

**위치:** `packages/preflight-core/src/e2e.test.ts`

**테스트 시나리오:**

#### 3a. Fork standalone basics
- Anvil standalone 시작 → `client.getBlockNumber()` 확인 (0n)
- Hardhat test account (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`) 잔액 확인 (10,000 ETH)
- `fork.stop()` 후 동일 포트로 새 client 접속 시도 → reject 확인 (scenario.test.ts 패턴 동일)

#### 3b. Scenario + standalone fork
- `preflight.scenario('standalone test', { fork: { standalone: true } })` 실행
- 콜백 내에서 fork context 사용
- 콜백 완료 후 자동 정리 확인

#### 3c. Clearance check (pure logic, no chain interaction)
- `createClearance` → `check()` → allowed/denied 검증
- standalone Anvil 컨텍스트에서 실행 (Clearance 자체는 순수 로직이지만 E2E 흐름에 포함)

#### 3d. Assert on-chain
- standalone Anvil에서 test account 잔액을 `assertOnChain().balanceDecreased()` 등으로 검증
- gas used assertion

### 4. 파일 변경 목록

| File | Change |
|------|--------|
| `packages/preflight-core/src/fork.ts` | `rpc` optional, `standalone` 옵션 추가 |
| `packages/preflight-core/src/fork.test.ts` | standalone 모드 unit test 2-3개 추가 |
| `packages/preflight-core/src/e2e.test.ts` | **신규** — full flow E2E (4 describe blocks, ~12 tests) |
| `packages/preflight-core/src/index.ts` | 변경 없음 |
| `packages/preflight-core/src/scenario.ts` | 변경 없음 (ForkOptions 타입만 변경) |

### 5. 기존 테스트 호환성

- `fork.test.ts`: `rpc`를 제공하므로 기존 동작 그대로
- `scenario.test.ts`: `rpc`를 제공하므로 기존 동작 그대로
- `live-fork.test.ts` / `live-fork.live.test.ts`: `createLiveFork`는 항상 `rpc` 제공 → 영향 없음
- 다른 패키지: `@preflight/core`의 export interface만 확장 → 하위 호환

### 6. Standalone Anvil 특성

Anvil standalone 모드에서 사용 가능한 상태:
- 10개 test account (각 10,000 ETH)
- Block number 0 (또는 1)부터 시작
- `eth_sendTransaction` 가능 (WalletClient 사용 시)
- ERC-20 등 컨트랙트 배포 가능

E2E 테스트에서는 기본 test account의 ETH 잔액을 활용해 assertion을 검증한다.

---

## Out of Scope

- WalletClient를 통한 tx 전송 E2E (향후 Phase에서)
- ERC-20 컨트랙트 배포 + 토큰 잔액 E2E (향후)
- MCP 서버 E2E (별도 패키지)

---

## Success Criteria

- `pnpm test` — 외부 RPC 없이 모든 E2E 테스트 통과
- 기존 204 tests 전부 통과 + 새 E2E ~12 tests 추가
- CI에서 Anvil만으로 full flow 검증 가능
