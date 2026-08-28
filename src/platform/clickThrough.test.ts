import { describe, expect, it } from 'vitest'
import { WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_EX_TRANSPARENT, overlayExStyle } from './clickThrough'

describe('overlay click-through style', () => {
  it('sets WS_EX_TRANSPARENT so empty overlay space reaches the game', () => {
    const next = overlayExStyle(0, true)
    expect(next & WS_EX_TRANSPARENT).toBeTruthy()
    expect(next & WS_EX_LAYERED).toBeTruthy()
    expect(next & WS_EX_TOPMOST).toBeTruthy()
    expect(next & WS_EX_NOACTIVATE).toBeTruthy()
  })

  it('clears WS_EX_TRANSPARENT only while a HUD control needs the mouse', () => {
    const capturing = overlayExStyle(WS_EX_TRANSPARENT | WS_EX_LAYERED, false)
    expect(capturing & WS_EX_TRANSPARENT).toBeFalsy()
    expect(overlayExStyle(capturing, true) & WS_EX_TRANSPARENT).toBeTruthy()
  })
})
