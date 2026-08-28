export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export interface RatingObservation {
  rating: number | null
  delta: number | null
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
  opts?: { previous?: number | null; battleTag?: string }
): boolean {
  if (!Number.isFinite(rating)) return false
  const disc = battleTagDiscriminator(opts?.battleTag ?? '')
  if (disc != null && rating === disc) return false
  const previous = opts?.previous
  const previousJunk =
    previous != null && (previous === disc || previous < 1000)
  if (previousJunk && rating >= 2000) return true
  if (previous != null && previous >= 2000 && rating < 1000) return false
  if (previous != null && Math.abs(rating - previous) > 400) return false
  return true
}

function asDelta(n: number, attachedToRating: boolean): number | null {
  if (!Number.isFinite(n) || n !== Math.round(n)) return null
  const abs = Math.abs(n)
  if (abs > 300) return null
  if (!attachedToRating && abs > 0 && abs < 8) return null
  return n
}

export function parsePlayRating(text: string): number | null {
  return parseRatingObservation(text).rating
}

const SIGN = '([+\\-])'

export function parseRatingObservation(
  text: string,
  opts?: { allowLoneDelta?: boolean }
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
    if (near) delta = asDelta(Number(near[1] + near[2]), true)
    if (delta == null) {
      const later = after.match(new RegExp(`${SIGN}\\s*(\\d{1,3})\\b`))
      if (later) delta = asDelta(Number(later[1] + later[2]), true)
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
      const d = asDelta(Number(`${sign}${mag}`), false)
      rating = asRating(n)
      if (d != null && (rating == null || Math.abs((rating ?? n) - n) <= 300)) delta = d
    }
  }
  if (delta == null && opts?.allowLoneDelta) {
    const lone = raw.match(new RegExp(`(?:^|[^\\d])${SIGN}\\s*(\\d{2,3})\\b`))
    if (lone) delta = asDelta(Number(lone[1] + lone[2]), false)
  }
  return { rating, delta }
}

/** Keep a rating and delta only when they came from the same crop. */
export function mergeRatingObservations(parts: RatingObservation[]): RatingObservation {
  const paired = parts.find((part) => part.rating != null && part.delta != null)
  if (paired) return paired
  const rated = parts.find((part) => part.rating != null)
  if (rated) return rated
  return parts.find((part) => part.delta != null) ?? { rating: null, delta: null }
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

/** Center-right of the Battlegrounds Play screen, where "Rating NNNN" sits. */
export function ratingCaptureRect(client: CaptureRect): CaptureRect {
  return {
    x: client.x + Math.round(client.width * 0.42),
    y: client.y + Math.round(client.height * 0.22),
    width: Math.max(180, Math.round(client.width * 0.4)),
    height: Math.max(100, Math.round(client.height * 0.36))
  }
}

export function ratingCaptureRects(client: CaptureRect): CaptureRect[] {
  const primary = ratingCaptureRect(client)
  return [
    primary,
    {
      x: client.x + Math.round(client.width * 0.32),
      y: client.y + Math.round(client.height * 0.18),
      width: Math.max(200, Math.round(client.width * 0.5)),
      height: Math.max(120, Math.round(client.height * 0.45))
    }
  ]
}

/** Center of the client — Battlegrounds results / rating tick after a game. */
export function resultCaptureRects(client: CaptureRect): CaptureRect[] {
  return [
    {
      x: client.x + Math.round(client.width * 0.34),
      y: client.y + Math.round(client.height * 0.44),
      width: Math.max(240, Math.round(client.width * 0.32)),
      height: Math.max(90, Math.round(client.height * 0.18))
    },
    {
      x: client.x + Math.round(client.width * 0.28),
      y: client.y + Math.round(client.height * 0.36),
      width: Math.max(280, Math.round(client.width * 0.44)),
      height: Math.max(110, Math.round(client.height * 0.24))
    },
    {
      x: client.x + Math.round(client.width * 0.22),
      y: client.y + Math.round(client.height * 0.18),
      width: Math.max(240, Math.round(client.width * 0.56)),
      height: Math.max(160, Math.round(client.height * 0.52))
    },
    ...ratingCaptureRects(client)
  ]
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
