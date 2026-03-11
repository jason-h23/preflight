import type { ForkSession, ClearancePolicy } from './types.js'

const MAX_SESSIONS = parseInt(process.env.PREFLIGHT_MAX_SESSIONS ?? '5', 10)
const sessions = new Map<string, ForkSession>()
const clientCache = new Map<string, unknown>()
let policy: ClearancePolicy | null = null

export function getSession(id: string): ForkSession | undefined {
  return sessions.get(id)
}

export function addSession(session: ForkSession): void {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`Max sessions (${MAX_SESSIONS}) reached`)
  }
  sessions.set(session.id, session)
}

export function removeSession(id: string): boolean {
  clientCache.delete(id)
  return sessions.delete(id)
}

export function getAllSessions(): ReadonlyMap<string, ForkSession> {
  return sessions
}

export function getCachedClient(id: string): unknown {
  return clientCache.get(id)
}

export function setCachedClient(id: string, client: unknown): void {
  clientCache.set(id, client)
}

export function clearCachedClient(id: string): void {
  clientCache.delete(id)
}

export function getPolicy(): ClearancePolicy | null {
  return policy
}

export function setPolicy(p: ClearancePolicy): void {
  policy = p
}

export function clearPolicy(): void {
  policy = null
}
