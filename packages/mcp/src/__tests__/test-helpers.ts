export function parseToolResult(result: { content: { text: string }[]; isError?: boolean }) {
  return JSON.parse(result.content[0].text)
}
