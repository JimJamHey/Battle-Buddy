import { nativeImage } from 'electron'
import { encodeBmp32, type CaptureRect } from '../core/playRating'
import { captureGameClientBgra } from './winCapture'

export function captureOpponentBoardDataUrl(region: CaptureRect): string | null {
  const width = Math.round(region.width)
  const height = Math.round(region.height)
  if (width < 80 || height < 80) return null
  const pixels = captureGameClientBgra(region.x, region.y, width, height)
  if (!pixels) return null
  const img = nativeImage.createFromBuffer(encodeBmp32(width, height, pixels))
  if (img.isEmpty()) return null
  const jpeg = img.toJPEG(86)
  if (!jpeg?.length) return null
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}
