/** Knock out a flat dark studio backdrop so golden tavern renders sit on transparency. */
export function knockoutDarkBackdrop(img: HTMLImageElement): string | null {
  try {
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (width < 8 || height < 8) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const shot = ctx.getImageData(0, 0, width, height)
    const px = shot.data
    const samples = [
      0,
      (width - 1) * 4,
      (height - 1) * width * 4,
      ((height - 1) * width + (width - 1)) * 4
    ]
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (const i of samples) {
      if (px[i + 3] < 200) continue
      r += px[i]
      g += px[i + 1]
      b += px[i + 2]
      n += 1
    }
    if (n < 3) return null
    r = Math.round(r / n)
    g = Math.round(g / n)
    b = Math.round(b / n)
    if ((r + g + b) / 3 > 70) return null
    const maxDist = 78 * 78
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 8) continue
      const dr = px[i] - r
      const dg = px[i + 1] - g
      const db = px[i + 2] - b
      if (dr * dr + dg * dg + db * db < maxDist && (px[i] + px[i + 1] + px[i + 2]) / 3 < 90) {
        px[i + 3] = 0
      }
    }
    ctx.putImageData(shot, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** True when the painting is empty, transparent, or a white name-plate leftover. */
export function isMostlyBlankImage(img: HTMLImageElement): boolean {
  try {
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (width < 4 || height < 4) return true
    const canvas = document.createElement('canvas')
    const sw = Math.min(48, width)
    const sh = Math.min(48, height)
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, sw, sh)
    const px = ctx.getImageData(0, 0, sw, sh).data
    let blank = 0
    let n = 0
    for (let i = 0; i < px.length; i += 4) {
      n += 1
      if (px[i + 3] < 24) {
        blank += 1
        continue
      }
      const r = px[i]
      const g = px[i + 1]
      const b = px[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (lum > 232 && max - min < 28) blank += 1
    }
    return n > 0 && blank / n > 0.72
  } catch {
    return false
  }
}
