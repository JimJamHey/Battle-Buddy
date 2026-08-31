import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { unlink, writeFile } from 'node:fs/promises'
import { encodeBmp32, parseRatingObservation, ratingCaptureRects, resultCaptureRects, mergeRatingObservations, type CaptureRect, type RatingObservation } from '../core/playRating'
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

async function ocrRegion(region: CaptureRect, allowLoneDelta = false): Promise<RatingObservation> {
  const width = Math.round(region.width)
  const height = Math.round(region.height)
  if (width < 40 || height < 40) return { rating: null, delta: null }
  if (process.platform === 'darwin') {
    const text = await macOcrRegion(region.x, region.y, width, height)
    return parseRatingObservation(text, { allowLoneDelta })
  }
  if (process.platform !== 'win32') return { rating: null, delta: null }
  const pixels = captureGameClientBgra(region.x, region.y, width, height)
  if (!pixels) return { rating: null, delta: null }
  const bmp = encodeBmp32(width, height, pixels)
  const imagePath = join(tmpdir(), `battle-buddy-rating-${process.pid}-${Date.now()}.bmp`)
  await writeFile(imagePath, bmp)
  try {
    return parseRatingObservation(await ocrImage(imagePath), { allowLoneDelta })
  } finally {
    await unlink(imagePath).catch(() => undefined)
  }
}

export async function readRatingObservation(
  client: CaptureRect,
  opts?: { includeResults?: boolean }
): Promise<RatingObservation> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return { rating: null, delta: null }
  const includeResults = Boolean(opts?.includeResults)
  const regions = includeResults ? resultCaptureRects(client) : ratingCaptureRects(client)
  const parts: RatingObservation[] = []
  for (const region of regions) {
    const observed = await ocrRegion(region, includeResults)
    parts.push(observed)
    if (observed.rating != null && observed.delta != null) return observed
  }
  return mergeRatingObservations(parts)
}

export async function readPlayRating(client: CaptureRect): Promise<number | null> {
  return (await readRatingObservation(client)).rating
}

export async function cleanupOcrTemps(): Promise<void> {
  if (!ocrScriptPath) return
  const path = ocrScriptPath
  ocrScriptPath = null
  await unlink(path).catch(() => undefined)
}
