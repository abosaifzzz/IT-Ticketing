import assert from 'node:assert/strict'

export async function openStream(url, headers = {}) {
  const controller = new AbortController()
  const response = await fetch(url, { headers, signal: controller.signal })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/event-stream/)
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = ''
  return {
    async next(name, timeoutMs = 4000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        let boundary
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const lines = frame.split('\n')
          if (lines.find((line) => line.startsWith('event: '))?.slice(7) !== name) continue
          const data = lines.find((line) => line.startsWith('data: '))?.slice(6)
          return { id: lines.find((line) => line.startsWith('id: '))?.slice(4), data: data ? JSON.parse(data) : null }
        }
        let timer
        try {
          const result = await Promise.race([reader.read(), new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Timed out waiting for SSE ${name}`)), Math.max(1, deadline - Date.now()))
          })])
          if (result.done) throw new Error(`SSE ended before ${name}`)
          buffer += decoder.decode(result.value, { stream: true })
        } finally { clearTimeout(timer) }
      }
      throw new Error(`Timed out waiting for SSE ${name}`)
    },
    async close() {
      controller.abort()
      try { await reader.cancel() } catch { /* Aborting an already closed reader is harmless. */ }
    },
  }
}
