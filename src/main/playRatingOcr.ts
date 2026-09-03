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
  lobbyCaptureRect,
  mergeRatingObservations,
  type CaptureRect,
  type RatingObservation
} from '../core/playRating'
import { DEFAULT_RATING_CAPTURE, type RatingCaptureSettings } from '../core/types'
import { captureGameClientBgra } from './winCapture'
import { macOcrRegion } from '../platform/macos'

const execFileAsync = promisify(execFile)

const WINDOWS_POWERSHELL = join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
)

/** Windows PowerShell 5.1 WinRT OCR. Keep IAsyncOperation`1 out of a JS template string. */
const OCR_PS = [
  'param([Parameter(Mandatory=$true)][string]$ImagePath)',
  '$ErrorActionPreference = \'Stop\'',
  '$ProgressPreference = \'SilentlyContinue\'',
  'try {',
  '  $winrt = [AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq \'System.Runtime.WindowsRuntime\' }',
  '  if (-not $winrt) { Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null }',
  '  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]',
  '  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]',
  '  $null = [Windows.Foundation.IAsyncOperation`1, Windows.Foundation, ContentType = WindowsRuntime]',
  '  $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]',
  '  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]',
  '  $null = [Windows.Storage.Streams.RandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]',
  '  $null = [WindowsRuntimeSystemExtensions]',
  '  $null = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages',
  '  $awaiter = [WindowsRuntimeSystemExtensions].GetMember(\'GetAwaiter\') | Where-Object {',
  '    $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq \'IAsyncOperation`1\'',
  '  } | Select-Object -First 1',
  '  if (-not $awaiter) { throw \'WinRT GetAwaiter not found\' }',
  '  function Await($AsyncTask, $ResultType) {',
  '    $awaiter.MakeGenericMethod($ResultType).Invoke($null, @($AsyncTask)).GetResult()',
  '  }',
  '  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()',
  '  if (-not $engine) { throw \'No OCR engine\' }',
  '  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])',
  '  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])',
  '  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])',
  '  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])',
  '  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])',
  '  [Console]::Out.Write(($result.Text | Out-String).Trim())',
  '} catch {',
  '  [Console]::Error.WriteLine($_.Exception.Message)',
  '  exit 1',
  '}'
].join('\n')

let ocrScriptPath: string | null = null

export interface RatingOcrCapture {
  observation: RatingObservation
  rawText: string
  error: string | null
  debugCropPath: string | null
}

async function ocrScript(): Promise<string> {
  if (ocrScriptPath) return ocrScriptPath
  const script = join(tmpdir(), `battle-buddy-ocr-v3-${process.pid}.ps1`)
  await writeFile(script, OCR_PS, 'utf8')
  ocrScriptPath = script
  return script
}

async function ocrImage(path: string): Promise<string> {
  const script = await ocrScript()
  const { stdout, stderr } = await execFileAsync(
    WINDOWS_POWERSHELL,
    ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-ImagePath', path],
    { windowsHide: true, timeout: 20000, windowsVerbatimArguments: false }
  )
  const text = String(stdout || '').trim()
  const err = String(stderr || '').trim()
  if (/duplicate type name/i.test(text) || /duplicate type name/i.test(err)) {
    throw new Error(err || text)
  }
  if (err && !text) throw new Error(err)
  return text
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

async function ocrRegion(
  region: CaptureRect,
  allowLoneDelta = false,
  debugDir?: string,
  allowLoneRating?: boolean
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
  const parseOpts = {
    allowLoneDelta,
    allowSmallLoneDelta: allowLoneDelta,
    allowLoneRating: allowLoneRating ?? !allowLoneDelta
  }
  if (process.platform === 'darwin') {
    const text = await macOcrRegion(region.x, region.y, width, height)
    const observation = parseRatingObservation(text, parseOpts)
    const error =
      !text.trim() && process.platform === 'darwin'
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
    const debugCropPath = await saveDebugCrop(debugDir, width, height, pixels)
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
  opts?: {
    includeResults?: boolean
    idleOnly?: boolean
    debugDir?: string
    capture?: RatingCaptureSettings
    mode?: 'lobby' | 'results' | 'play'
  }
): Promise<RatingOcrCapture> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return {
      observation: { rating: null, delta: null },
      rawText: '',
      error: 'Rating OCR is only supported on Windows and macOS',
      debugCropPath: null
    }
  }
  const capture = opts?.capture ?? DEFAULT_RATING_CAPTURE
  const mode = opts?.mode
  // Lobby mode: OCR the large bare MMR number in the BG lobby screen
  if (mode === 'lobby') {
    const region = lobbyCaptureRect(client, capture.lobby)
    return ocrRegion(region, false, opts?.debugDir, true)
  }
  const includeResults = mode === 'results' || Boolean(opts?.includeResults)
  const regions = includeResults
    ? resultCaptureRects(client, capture)
    : ratingCaptureRects(client, capture.play)
  const parts: RatingObservation[] = []
  let rawText = ''
  let error: string | null = null
  let debugCropPath: string | null = null
  for (const [i, region] of regions.entries()) {
    const plaque = includeResults && i === 0
    const captured = await ocrRegion(region, plaque, opts?.debugDir)
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
