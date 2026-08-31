import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const SRCCOPY = 0x00cc0020
const DIB_RGB_COLORS = 0

type Koffi = typeof import('koffi')

const PW_RENDERFULLCONTENT = 2
const WINDOW_TITLES = ['Hearthstone', '하스스톤', '《爐石戰記》', '炉石传说']

interface CaptureApi {
  FindWindowW: (cls: string | null, name: string | null) => unknown
  IsWindow: (hwnd: unknown) => number
  GetWindowRect: (hwnd: unknown, rect: { left: number; top: number; right: number; bottom: number }) => number
  PrintWindow: (hwnd: unknown, hdc: unknown, flags: number) => number
  GetDC: (hwnd: unknown) => unknown
  ReleaseDC: (hwnd: unknown, hdc: unknown) => number
  CreateCompatibleDC: (hdc: unknown) => unknown
  CreateCompatibleBitmap: (hdc: unknown, w: number, h: number) => unknown
  SelectObject: (hdc: unknown, obj: unknown) => unknown
  BitBlt: (
    dest: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    src: unknown,
    sx: number,
    sy: number,
    rop: number
  ) => number
  GetDIBits: (
    hdc: unknown,
    bitmap: unknown,
    start: number,
    lines: number,
    bits: Buffer,
    info: unknown,
    usage: number
  ) => number
  DeleteObject: (obj: unknown) => number
  DeleteDC: (hdc: unknown) => number
  info: unknown
}

let api: CaptureApi | null = null

function hwndOk(value: unknown): boolean {
  return value != null && value !== 0 && value !== 0n
}

function loadApi(): CaptureApi {
  if (api) return api
  const koffi = require('koffi') as Koffi
  const user32 = koffi.load('user32.dll')
  const gdi32 = koffi.load('gdi32.dll')
  const RECT = koffi.struct('RECT', {
    left: 'long',
    top: 'long',
    right: 'long',
    bottom: 'long'
  })
  const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
    biSize: 'uint32',
    biWidth: 'int32',
    biHeight: 'int32',
    biPlanes: 'uint16',
    biBitCount: 'uint16',
    biCompression: 'uint32',
    biSizeImage: 'uint32',
    biXPelsPerMeter: 'int32',
    biYPelsPerMeter: 'int32',
    biClrUsed: 'uint32',
    biClrImportant: 'uint32'
  })
  api = {
    FindWindowW: user32.func('void* __stdcall FindWindowW(str16 className, str16 windowName)'),
    IsWindow: user32.func('bool __stdcall IsWindow(void *hWnd)'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hWnd, _Out_ RECT *lpRect)'),
    PrintWindow: user32.func('bool __stdcall PrintWindow(void *hwnd, void *hdcBlt, uint32 nFlags)'),
    GetDC: user32.func('void* __stdcall GetDC(void *hWnd)'),
    ReleaseDC: user32.func('int32 __stdcall ReleaseDC(void *hWnd, void *hDC)'),
    CreateCompatibleDC: gdi32.func('void* __stdcall CreateCompatibleDC(void *hdc)'),
    CreateCompatibleBitmap: gdi32.func('void* __stdcall CreateCompatibleBitmap(void *hdc, int32 cx, int32 cy)'),
    SelectObject: gdi32.func('void* __stdcall SelectObject(void *hdc, void *h)'),
    BitBlt: gdi32.func(
      'bool __stdcall BitBlt(void *hdc, int32 x, int32 y, int32 cx, int32 cy, void *src, int32 x1, int32 y1, uint32 rop)'
    ),
    GetDIBits: gdi32.func(
      'int32 __stdcall GetDIBits(void *hdc, void *hbm, uint32 start, uint32 lines, void *bits, _Inout_ BITMAPINFOHEADER *info, uint32 usage)'
    ),
    DeleteObject: gdi32.func('bool __stdcall DeleteObject(void *ho)'),
    DeleteDC: gdi32.func('bool __stdcall DeleteDC(void *hdc)'),
    info: BITMAPINFOHEADER
  }
  void BITMAPINFOHEADER
  void RECT
  return api
}

function findHsWindow(): unknown | null {
  const gdi = loadApi()
  for (const title of WINDOW_TITLES) {
    const hwnd = gdi.FindWindowW('UnityWndClass', title)
    if (hwndOk(hwnd) && gdi.IsWindow(hwnd)) return hwnd
  }
  return null
}

function readDib(gdi: CaptureApi, hdcMem: unknown, hbmp: unknown, w: number, h: number): Buffer | null {
  const info = {
    biSize: 40,
    biWidth: w,
    biHeight: -h,
    biPlanes: 1,
    biBitCount: 32,
    biCompression: 0,
    biSizeImage: w * h * 4,
    biXPelsPerMeter: 0,
    biYPelsPerMeter: 0,
    biClrUsed: 0,
    biClrImportant: 0
  }
  const bits = Buffer.alloc(w * h * 4)
  let rows = gdi.GetDIBits(hdcMem, hbmp, 0, h, bits, info, DIB_RGB_COLORS)
  if (rows <= 0) {
    info.biHeight = h
    rows = gdi.GetDIBits(hdcMem, hbmp, 0, h, bits, info, DIB_RGB_COLORS)
    if (rows <= 0) return null
    const stride = w * 4
    const flipped = Buffer.alloc(bits.length)
    for (let y = 0; y < h; y++) {
      bits.copy(flipped, y * stride, (h - 1 - y) * stride, (h - y) * stride)
    }
    return flipped
  }
  return bits
}

function isMostlyBlack(bgra: Buffer): boolean {
  if (bgra.length < 16) return true
  let sum = 0
  let n = 0
  for (let i = 0; i + 2 < bgra.length; i += 64) {
    sum += bgra[i] + bgra[i + 1] + bgra[i + 2]
    n += 1
  }
  return n > 0 && sum / n < 18
}

function cropBgra(src: Buffer, srcW: number, x: number, y: number, w: number, h: number): Buffer {
  const out = Buffer.alloc(w * h * 4)
  const srcStride = srcW * 4
  const dstStride = w * 4
  for (let row = 0; row < h; row++) {
    const srcStart = (y + row) * srcStride + x * 4
    src.copy(out, row * dstStride, srcStart, srcStart + dstStride)
  }
  return out
}

/** Capture the Hearthstone window itself so our overlay is not in the OCR bitmap. */
export function captureGameClientBgra(x: number, y: number, width: number, height: number): Buffer | null {
  if (process.platform !== 'win32') return null
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const gdi = loadApi()
  const hwnd = findHsWindow()
  if (!hwndOk(hwnd)) return captureScreenBgra(x, y, w, h)
  const box = { left: 0, top: 0, right: 0, bottom: 0 }
  if (!gdi.GetWindowRect(hwnd, box)) return captureScreenBgra(x, y, w, h)
  const ww = box.right - box.left
  const wh = box.bottom - box.top
  if (ww < 80 || wh < 80) return captureScreenBgra(x, y, w, h)
  const cropX = Math.max(0, Math.min(ww - 1, Math.round(x) - box.left))
  const cropY = Math.max(0, Math.min(wh - 1, Math.round(y) - box.top))
  const cropW = Math.max(1, Math.min(w, ww - cropX))
  const cropH = Math.max(1, Math.min(h, wh - cropY))
  const hdcScreen = gdi.GetDC(null)
  if (!hwndOk(hdcScreen)) return captureScreenBgra(x, y, w, h)
  const hdcMem = gdi.CreateCompatibleDC(hdcScreen)
  const hbmp = gdi.CreateCompatibleBitmap(hdcScreen, ww, wh)
  let old: unknown = null
  try {
    if (!hwndOk(hdcMem) || !hwndOk(hbmp)) return captureScreenBgra(x, y, w, h)
    old = gdi.SelectObject(hdcMem, hbmp)
    if (!gdi.PrintWindow(hwnd, hdcMem, PW_RENDERFULLCONTENT)) return captureScreenBgra(x, y, w, h)
    const full = readDib(gdi, hdcMem, hbmp, ww, wh)
    if (!full || isMostlyBlack(full)) return captureScreenBgra(x, y, w, h)
    const cropped = cropBgra(full, ww, cropX, cropY, cropW, cropH)
    if (isMostlyBlack(cropped)) return captureScreenBgra(x, y, w, h)
    if (cropW === w && cropH === h) return cropped
    const out = Buffer.alloc(w * h * 4)
    const srcStride = cropW * 4
    const dstStride = w * 4
    const copyH = Math.min(cropH, h)
    const copyBytes = Math.min(srcStride, dstStride)
    for (let row = 0; row < copyH; row++) {
      cropped.copy(out, row * dstStride, row * srcStride, row * srcStride + copyBytes)
    }
    return out
  } finally {
    if (old) gdi.SelectObject(hdcMem, old)
    if (hwndOk(hbmp)) gdi.DeleteObject(hbmp)
    if (hwndOk(hdcMem)) gdi.DeleteDC(hdcMem)
    gdi.ReleaseDC(null, hdcScreen)
  }
}

export function captureScreenBgra(x: number, y: number, width: number, height: number): Buffer | null {
  if (process.platform !== 'win32') return null
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const gdi = loadApi()
  const hdcScreen = gdi.GetDC(null)
  if (!hwndOk(hdcScreen)) return null
  const hdcMem = gdi.CreateCompatibleDC(hdcScreen)
  const hbmp = gdi.CreateCompatibleBitmap(hdcScreen, w, h)
  let old: unknown = null
  try {
    if (!hwndOk(hdcMem) || !hwndOk(hbmp)) return null
    old = gdi.SelectObject(hdcMem, hbmp)
    if (!gdi.BitBlt(hdcMem, 0, 0, w, h, hdcScreen, Math.round(x), Math.round(y), SRCCOPY)) return null
    const info = {
      biSize: 40,
      biWidth: w,
      biHeight: -h,
      biPlanes: 1,
      biBitCount: 32,
      biCompression: 0,
      biSizeImage: w * h * 4,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0
    }
    const bits = Buffer.alloc(w * h * 4)
    let rows = gdi.GetDIBits(hdcMem, hbmp, 0, h, bits, info, DIB_RGB_COLORS)
    if (rows <= 0) {
      info.biHeight = h
      rows = gdi.GetDIBits(hdcMem, hbmp, 0, h, bits, info, DIB_RGB_COLORS)
      if (rows <= 0) return null
      const stride = w * 4
      const flipped = Buffer.alloc(bits.length)
      for (let y = 0; y < h; y++) {
        bits.copy(flipped, y * stride, (h - 1 - y) * stride, (h - y) * stride)
      }
      return flipped
    }
    return bits
  } finally {
    if (old) gdi.SelectObject(hdcMem, old)
    if (hwndOk(hbmp)) gdi.DeleteObject(hbmp)
    if (hwndOk(hdcMem)) gdi.DeleteDC(hdcMem)
    gdi.ReleaseDC(null, hdcScreen)
  }
}
