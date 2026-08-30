/** Compare dotted versions, including `0.1.0-test.12` prerelease bits. */
export function versionParts(raw: string): number[] {
  const cleaned = raw.trim().replace(/^v/i, '')
  const [core, ...pre] = cleaned.split('-')
  const nums = (core ?? '0').split('.').map((n) => Number(n) || 0)
  const preNums = pre
    .join('.')
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((n) => Number(n) || 0)
  return [...nums, ...preNums]
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = versionParts(latest)
  const b = versionParts(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false
  }
  return false
}
