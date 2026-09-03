import { DEFAULT_RATING_CAPTURE, type PctRect, type RatingCaptureSettings } from './types'

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export interface RatingObservation {
  rating: number | null
  delta: number | null
  placement?: number | null
}

const RATING_LABEL =
  /(?:rating|wertung|cote|puntuaci[oó]n|pontua[cç][aã]o|рейтинг)\s*[:\-]?\s*([0-9][0-9\s,]{2,8})/i

function asRating(n: number): number | null {
  if (!Number.isFinite(n) || n < 0 || n > 30000) return null
  return n
}

export function battleTagDiscriminator(battleTag: string): number | null {
  const match = battleTag.match(/#(\d{1,5})$/)
  return match ? Number(match[1]) : null
}

/** Drop OCR hits that are the BattleTag # or an implausible jump from the last rating. */
export function acceptObservedRating(
  rating: number,
  opts?: { previous?: number | null; battleTag?: string; resync?: boolean }
): boolean {
  if (!Number.isFinite(rating)) return false
  const disc = battleTagDiscriminator(opts?.battleTag ?? '')
  if (disc != null && rating === disc) return false
  const previous = opts?.previous
  const previousJunk =
    previous != null && (previous === disc || previous < 1000)
  if (previousJunk && rating >= 2000) return true
  if (previous != null && previous >= 2000 && rating < 1000) return false
  if (previous != null && Math.abs(rating - previous) > 400) {
    // Play-screen reads can replace a stale public-leaderboard number.
    return Boolean(opts?.resync && rating >= 1000 && previous >= 1000)
  }
  return true
}

function asDelta(n: number, attachedToRating: boolean, allowSmallLone = false): number | null {
  if (!Number.isFinite(n) || n !== Math.round(n)) return null
  const abs = Math.abs(n)
  if (abs > 300) return null
  if (!attachedToRating && abs > 0 && abs < (allowSmallLone ? 1 : 8)) return null
  return n
}

export function parsePlayRating(text: string): number | null {
  return parseRatingObservation(text).rating
}

const SIGN = '([+\\-])'

export function parseRatingObservation(
  text: string,
  opts?: { allowLoneDelta?: boolean; allowSmallLoneDelta?: boolean; allowLoneRating?: boolean }
): RatingObservation {
  if (!text) return { rating: null, delta: null }
  const raw = text
    .replace(/\u00a0/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/#\d{3,5}\b/g, ' ')
    .replace(/\b(?:start|now|current|today|last\s*10|latest\s*games|avg\s*(?:place)?|mmr)\b\s*[:\-]?\s*[+\-]?\d[\d,]*/gi, ' ')
    .replace(/\b(?:1st|2nd|3rd|[4-8]th)\s+(?!place\b)[A-Za-z].{0,36}[+\-]\s*\d{1,3}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const labeled = raw.match(RATING_LABEL)
  let rating: number | null = null
  let delta: number | null = null
  if (labeled) {
    rating = asRating(Number(labeled[1].replace(/[^\d]/g, '')))
    const after = raw.slice((labeled.index ?? 0) + labeled[0].length)
    const near = after.match(new RegExp(`^\\s*${SIGN}\\s*(\\d{1,3})\\b`))
    if (near) delta = asDelta(Number(near[1] + near[2]), true, opts?.allowSmallLoneDelta)
    if (delta == null) {
      const later = after.match(new RegExp(`${SIGN}\\s*(\\d{1,3})\\b`))
      if (later) delta = asDelta(Number(later[1] + later[2]), true, opts?.allowSmallLoneDelta)
    }
  }
  if (rating == null && delta == null) {
    const combo = raw.match(
      new RegExp(
        `\\b(\\d{4,5})\\b(?:[^\\d+]{0,80})${SIGN}\\s*(\\d{1,3})\\b|${SIGN}\\s*(\\d{1,3})\\b(?:[^\\d+]{0,80})\\b(\\d{4,5})\\b`
      )
    )
    if (combo) {
      const n = Number((combo[1] ?? combo[6] ?? '').replace(/[^\d]/g, ''))
      const sign = combo[2] ?? combo[4]
      const mag = combo[3] ?? combo[5]
      const d = asDelta(Number(`${sign}${mag}`), false, opts?.allowSmallLoneDelta)
      rating = asRating(n)
      if (d != null && (rating == null || Math.abs((rating ?? n) - n) <= 300)) delta = d
    }
  }
  if (delta == null && opts?.allowLoneDelta) {
    const lone = raw.match(new RegExp(`(?:^|[^\\d])${SIGN}\\s*(\\d{2,3})\\b`))
    if (lone) delta = asDelta(Number(lone[1] + lone[2]), false, opts?.allowSmallLoneDelta)
  }
  if (rating == null && opts?.allowLoneRating && !/\bgold\b/i.test(raw)) {
    const lone = raw.match(/\b(\d{1,2}[,\s]\d{3}|\d{4,5})\b/)
    if (lone) rating = asRating(Number(lone[1].replace(/[^\d]/g, '')))
  }
  const placement = parseResultsPlacement(raw)
  return placement != null ? { rating, delta, placement } : { rating, delta }
}

/** Keep a rating and delta only when they came from the same crop. */
export function mergeRatingObservations(parts: RatingObservation[]): RatingObservation {
  const placement = parts.find((part) => part.placement != null)?.placement
  const paired = parts.find((part) => part.rating != null && part.delta != null)
  const merged = paired
    ? paired
    : (() => {
        const rated = parts.find((part) => part.rating != null)
        const deltaOnly = parts.find((part) => part.delta != null)
        if (rated && deltaOnly?.delta != null) return { rating: rated.rating, delta: deltaOnly.delta }
        if (rated) return rated
        return deltaOnly ?? { rating: null, delta: null }
      })()
  return placement != null ? { ...merged, placement } : merged
}

/** Overlay "Today −143" is the session total, not this game's delta. */
export function isSessionTotalDelta(
  delta: number,
  session: { startMmr?: number | null; games: Array<{ mmrBefore?: number | null }> }
): boolean {
  const start = session.startMmr
  const before = session.games.at(-1)?.mmrBefore
  if (start == null || before == null) return false
  return delta === before - start
}

function clampPct(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

export function clampPctRect(region: unknown, fallback: PctRect): PctRect {
  const src = region && typeof region === 'object' ? (region as Partial<PctRect>) : {}
  const w = clampPct(Number(src.w ?? fallback.w), 8, 80)
  const h = clampPct(Number(src.h ?? fallback.h), 6, 70)
  return {
    x: clampPct(Number(src.x ?? fallback.x), 0, 100 - w),
    y: clampPct(Number(src.y ?? fallback.y), 0, 100 - h),
    w,
    h
  }
}

export function sanitizeRatingCapture(raw?: Partial<RatingCaptureSettings> | null): RatingCaptureSettings {
  return {
    play: clampPctRect(raw?.play, DEFAULT_RATING_CAPTURE.play),
    results: clampPctRect(raw?.results, DEFAULT_RATING_CAPTURE.results),
    lobby: clampPctRect(raw?.lobby, DEFAULT_RATING_CAPTURE.lobby)
  }
}

export function captureRectFromPct(client: CaptureRect, region: PctRect): CaptureRect {
  const r = clampPctRect(region, DEFAULT_RATING_CAPTURE.play)
  return {
    x: client.x + Math.round(client.width * (r.x / 100)),
    y: client.y + Math.round(client.height * (r.y / 100)),
    width: Math.max(40, Math.round(client.width * (r.w / 100))),
    height: Math.max(40, Math.round(client.height * (r.h / 100)))
  }
}

/** Top-center BG lobby MMR display (large bare number, no "Rating:" label). */
export function lobbyCaptureRect(
  client: CaptureRect,
  lobby: PctRect = DEFAULT_RATING_CAPTURE.lobby
): CaptureRect {
  return captureRectFromPct(client, lobby)
}

/** Tight crop on the white rating digits inside the dark plaque (Play screen). */
export function ratingNumberPlaqueRect(client: CaptureRect): CaptureRect {
  const w = client.width
  const h = client.height
  return {
    x: client.x + Math.round(w * 0.738),
    y: client.y + Math.round(h * 0.112),
    width: Math.max(96, Math.round(w * 0.105)),
    height: Math.max(44, Math.round(h * 0.058))
  }
}

/** Upper-right Play widget: pink Rating label, number plaque, Full Stats button. */
export function ratingCaptureRect(client: CaptureRect, play?: PctRect): CaptureRect {
  if (play) return captureRectFromPct(client, play)
  const w = client.width
  const h = client.height
  return {
    x: client.x + Math.round(w * 0.72),
    y: client.y + Math.round(h * 0.085),
    width: Math.max(130, Math.round(w * 0.14)),
    height: Math.max(100, Math.round(h * 0.13))
  }
}

export function ratingCaptureRects(client: CaptureRect, play?: PctRect): CaptureRect[] {
  if (play) return [captureRectFromPct(client, play)]
  return [ratingNumberPlaqueRect(client), ratingCaptureRect(client)]
}

/** Center plaque on the Battlegrounds results screen — avoid gold and the quest bar. */
export function resultCaptureRects(
  client: CaptureRect,
  regions?: RatingCaptureSettings
): CaptureRect[] {
  if (regions) {
    return [
      captureRectFromPct(client, regions.results),
      ratingCaptureRect(client, regions.play)
    ]
  }
  return [ratingNumberPlaqueRect(client), ratingCaptureRect(client)]
}

export function parseResultsPlacement(text: string): number | null {
  if (!text) return null
  const m = text.match(/\b([1-8])(?:st|nd|rd|th)\s+place/i)
  if (!m) return null
  const place = Number(m[1])
  return place >= 1 && place <= 8 ? place : null
}

export function encodeBmp32(width: number, height: number, bgra: Buffer): Buffer {
  const stride = width * 4
  const pixelBytes = stride * height
  if (bgra.length < pixelBytes) {
    throw new Error('BMP pixel buffer is shorter than width × height')
  }
  const header = 54
  const out = Buffer.alloc(header + pixelBytes)
  out.write('BM', 0)
  out.writeUInt32LE(out.length, 2)
  out.writeUInt32LE(0, 6)
  out.writeUInt32LE(header, 10)
  out.writeUInt32LE(40, 14)
  out.writeInt32LE(width, 18)
  out.writeInt32LE(height, 22)
  out.writeUInt16LE(1, 26)
  out.writeUInt16LE(32, 28)
  out.writeUInt32LE(0, 30)
  out.writeUInt32LE(pixelBytes, 34)
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * stride
    bgra.copy(out, header + y * stride, src, src + stride)
  }
  return out
}
