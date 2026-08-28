const FULLSCREEN_KEY = 'graphicsfullscreen'

function isTrue(value: string | undefined): boolean {
  return Boolean(value && /^(true|1|yes)$/i.test(value.trim()))
}

/** Hearthstone exclusive fullscreen blocks DWM overlays. Keep the client windowed so we can borderless it. */
export function ensureWindowedGraphics(text: string): { next: string; changed: boolean } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let found = false
  let changed = false
  const next = lines.map((line) => {
    const eq = line.indexOf('=')
    if (eq < 0) return line
    if (line.slice(0, eq).trim().toLowerCase() !== FULLSCREEN_KEY) return line
    found = true
    const value = line.slice(eq + 1)
    if (!isTrue(value)) return line
    changed = true
    return `${line.slice(0, eq)}=False`
  })
  if (!found) {
    while (next.length && next[next.length - 1] === '') next.pop()
    next.push(`${FULLSCREEN_KEY}=False`, '')
    return { next: next.join('\n'), changed: true }
  }
  return { next: next.join('\n'), changed }
}
