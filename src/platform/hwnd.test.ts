import { describe, expect, it } from 'vitest'
import { hwndFromNativeHandle, isGameForeground } from './hwnd'

describe('hwndFromNativeHandle', () => {
  it('reads a 64-bit HWND', () => {
    const buf = Buffer.alloc(8)
    buf.writeBigUInt64LE(0x00000000aaaabbbbn)
    expect(hwndFromNativeHandle(buf)).toBe(0x00000000aaaabbbbn)
  })

  it('reads a 32-bit HWND', () => {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(0x12345678)
    expect(hwndFromNativeHandle(buf)).toBe(0x12345678n)
  })
})

describe('isGameForeground', () => {
  it('matches the game window itself', () => {
    expect(
      isGameForeground({
        foreground: 10n,
        game: 10n,
        foregroundPid: 1,
        gamePid: 1
      })
    ).toBe(true)
  })

  it('matches a child/root window of the game', () => {
    expect(
      isGameForeground({
        foreground: 11n,
        game: 10n,
        foregroundPid: 99,
        gamePid: 1,
        foregroundRoot: 10n
      })
    ).toBe(true)
  })

  it('matches another window from the same process (exclusive fullscreen)', () => {
    expect(
      isGameForeground({
        foreground: 22n,
        game: 10n,
        foregroundPid: 7,
        gamePid: 7
      })
    ).toBe(true)
  })

  it('does not match a different app', () => {
    expect(
      isGameForeground({
        foreground: 22n,
        game: 10n,
        foregroundPid: 8,
        gamePid: 7
      })
    ).toBe(false)
  })
})
