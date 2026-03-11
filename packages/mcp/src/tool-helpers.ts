export function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  }
}

export function toolSuccess(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
