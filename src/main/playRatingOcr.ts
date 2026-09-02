import { execFile } from 'node:child_process'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  encodeBmp32,
  parseRatingObservation,
  ratingCaptureRects,
  resultCaptureRects,
  mergeRatingObservations,
  type CaptureRect,
  type RatingObservation
} from '../core/playRating'
import { captureGameClientBgra } from './winCapture'
import { macOcrRegion } from '../platform/macos'

const execFileAsync = promisify(execFile)

const OCR_PS = `
param([Parameter(Mandatory=$true)][string]$ImagePath)
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  if (-not $netTask.Wait(12000)) { throw 'OCR timed out' }
  $netTask.Result
}
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { throw 'No OCR engine' }
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
Write-Output $result.Text
`

let ocrScriptPath: string | null = null

export interface RatingOcrCapture {
  observation: RatingObservation
  rawText: string
  error: string | null
  debugCropPath: string | null
}

async function ocrScript(): Promise<string> {
  if (ocrScriptPath) return ocrScriptPath
  const script = join(tmpdir(), `battle-buddy-ocr-${process.pid}.ps1`)
  await writeFile(script, OCR_PS, 'utf8')
  ocrScriptPath = script
  return script
}

async function ocrImage(path: string): Promise<string> {
  const script = await ocrScript()
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-ImagePath', path],
    { windowsHide: true, timeout: 16000, windowsVerbatimArguments: false }
  )
  return stdout || ''
}

/** OCR any screen region into plain text (Windows / macOS). */
export async function ocrCaptureText(region: CaptureRect): Promise<string> {
  const width = Math.round(region.width)
  const height = Math.round(region.height)
  if (width < 40 || height < 40) return ''
  if (process.platform === 'darwin') {
    return macOcrRegion(region.x, region.y, width, height)
  }
  if (process.platform !== 'win32') return ''
  const pixels = captureGameClientBgra(region.x, region.y, width, height)
  if (!pixels) return ''
  const bmp = encodeBmp32(width, height, pixels)
  const imagePath = join(tmpdir(), `battle-buddy-ocr-${process.pid}-${Date.now()}.bmp`)
  await writeFile(imagePath, bmp)
  try {
    return await ocrImage(imagePath)
  } finally {
    await unlink(imagePath).catch(() => undefined)
  }
}

async function saveDebugCrop(
  debugDir: string | undefined,
  width: number,
  height: number,
  pixels: Buffer | null
): Promise<string | null> {
  if (!debugDir || !pixels) return null
  try {
    await mkdir(debugDir, { recursive: true })
    const path = join(debugDir, 'rating-ocr-debug.bmp')
    await writeFile(path, encodeBmp32(width, height, pixels))
    return path
  } catch {
    return null
  }
}

async function ocrRatingRegion(
  region: CaptureRect,
  allowLoneDelta = false,
  debugDir?: string
): Promise<RatingOcrCapture> {
  const width = Math.round(region.width)
  const height = Math.round(region.height)
  if (width < 40 || height < 40) {
    return {
      observation: { rating: null, delta: null },
      rawText: '',
      error: 'Capture region too small',
      debugCropPath: null
    }
  }
  const parseOpts = { allowLoneDelta, allowSmallLoneDelta: allowLoneDelta }
  if (process.platform === 'darwin') {
    const text = await macOcrRegion(region.x, region.y, width, height)
    const observation = parseRatingObservation(text, parseOpts)
    const error = !text.trim()
      ? 'No OCR text — grant Screen Recording to BattleBuddy in System Settings'
      : null
    return { observation, rawText: text, error, debugCropPath: null }
  }
  if (process.platform !== 'win32') {
    return {
      observation: { rating: null, delta: null },
      rawText: '',
      error: 'Rating OCR is only supported on Windows and macOS',
      debugCropPath: null
    }
  }
  const pixels = captureGameClientBgra(region.x, region.y, width, height)
  if (!pixels) {
    const debugCropPath = await saveDebugCrop(debugDir, width, height, null)
    return {
      observation: { rating: null, delta: null },
      rawText: '',
      error: 'Could not capture the Hearthstone window',
      debugCropPath
    }
  }
  const bmp = encodeBmp32(width, height, pixels)
  const imagePath = join(tmpdir(), `battle-buddy-rating-${process.pid}-${Date.now()}.bmp`)
  await writeFile(imagePath, bmp)
  try {
    const rawText = await ocrImage(imagePath)
    const observation = parseRatingObservation(rawText, parseOpts)
    const debugCropPath =
      observation.rating == null && observation.delta == null
        ? await saveDebugCrop(debugDir, width, height, pixels)
        : null
    return {
      observation,
      rawText,
      error: rawText.trim() ? null : 'OCR returned no text',
      debugCropPath
    }
  } catch (err) {
    const debugCropPath = await saveDebugCrop(debugDir, width, height, pixels)
    return {
      observation: { rating: null, delta: null },
      rawText: '',
      error: err instanceof Error ? err.message : String(err),
      debugCropPath
    }
  } finally {
    await unlink(imagePath).catch(() => undefined)
  }
}

export async function readRatingObservation(
  client: CaptureRect,
  opts?: { includeResults?: boolean; idleOnly?: boolean; debugDir?: string }
): Promise<RatingOcrCapture> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return {
      observation: { rating: null, delta: null },
      rawText: '',
      error: 'Rating OCR is only supported on Windows and macOS',
      debugCropPath: null
    }
  }
  const includeResults = Boolean(opts?.includeResults)
  const regions = includeResults
    ? resultCaptureRects(client)
    : ratingCaptureRects(client)
  const parts: RatingObservation[] = []
  let rawText = ''
  let error: string | null = null
  let debugCropPath: string | null = null
  for (const [i, region] of regions.entries()) {
    const plaque = includeResults && i < 3
    const captured = await ocrRatingRegion(region, plaque, opts?.debugDir)
    if (captured.rawText) rawText = [rawText, captured.rawText].filter(Boolean).join('\n')
    if (captured.error && !error) error = captured.error
    if (captured.debugCropPath) debugCropPath = captured.debugCropPath
    const observed = captured.observation
    parts.push(observed)
    if (observed.rating != null && observed.delta != null) {
      const merged =
        observed.placement != null
          ? observed
          : { ...observed, placement: mergeRatingObservations(parts).placement }
      return { observation: merged, rawText, error, debugCropPath }
    }
  }
  return {
    observation: mergeRatingObservations(parts),
    rawText,
    error,
    debugCropPath
  }
}

export async function readPlayRating(client: CaptureRect): Promise<number | null> {
  return (await readRatingObservation(client)).observation.rating
}

export async function cleanupOcrTemps(): Promise<void> {
  if (!ocrScriptPath) return
  const path = ocrScriptPath
  ocrScriptPath = null
  await unlink(path).catch(() => undefined)
}
