export const WS_EX_DLGMODALFRAME = 0x00000001
export const WS_EX_TOPMOST = 0x00000008
export const WS_EX_TRANSPARENT = 0x00000020
export const WS_EX_TOOLWINDOW = 0x00000080
export const WS_EX_WINDOWEDGE = 0x00000100
export const WS_EX_CLIENTEDGE = 0x00000200
export const WS_EX_LAYERED = 0x00080000
export const WS_EX_NOACTIVATE = 0x08000000

/** Keep the overlay topmost without eating Hearthstone clicks unless a HUD control is hovered. */
export function overlayExStyle(ex: number, passClicks: boolean): number {
  let next = (ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_LAYERED) >>> 0
  if (passClicks) next = (next | WS_EX_TRANSPARENT) >>> 0
  else next = (next & ~WS_EX_TRANSPARENT) >>> 0
  return next
}
