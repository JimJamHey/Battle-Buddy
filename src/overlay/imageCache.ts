const ok = new Map<string, boolean>()
const inflight = new Map<string, Promise<boolean>>()

function probe(url: string): Promise<boolean> {
  const cached = ok.get(url)
  if (cached != null) return Promise.resolve(cached)
  const pending = inflight.get(url)
  if (pending) return pending
  const next = new Promise<boolean>((resolve) => {
    const img = new Image()
    img.onload = () => {
      ok.set(url, true)
      inflight.delete(url)
      resolve(true)
    }
    img.onerror = () => {
      ok.set(url, false)
      inflight.delete(url)
      resolve(false)
    }
    img.src = url
  })
  inflight.set(url, next)
  return next
}

export function warmUrls(urls: string[]): void {
  for (const url of urls) {
    if (url) void probe(url)
  }
}

export function firstCached(urls: string[]): string | null {
  for (const url of urls) {
    if (!url) continue
    if (ok.get(url) === true) return url
  }
  return null
}

export async function firstAvailable(urls: string[]): Promise<string | null> {
  const cached = firstCached(urls)
  if (cached) return cached
  for (const url of urls) {
    if (!url) continue
    if (await probe(url)) return url
  }
  return null
}
