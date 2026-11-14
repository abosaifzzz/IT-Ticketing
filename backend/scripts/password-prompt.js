export function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Use an interactive terminal for private password entry')
  return new Promise((resolve, reject) => {
    let value = ''
    process.stdout.write(label)
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8')
    const finish = (error) => {
      process.stdin.removeListener('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n')
      if (error) reject(error); else resolve(value)
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u0003') return finish(new Error('Cancelled'))
        if (char === '\u0008' || char === '\u007f') { value = value.slice(0, -1); continue }
        if (char >= ' ') { value += char; process.stdout.write('*') }
      }
    }
    process.stdin.on('data', onData)
  })
}
