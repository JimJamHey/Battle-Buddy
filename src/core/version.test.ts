import { describe, expect, it } from 'vitest'
import { isNewerVersion, versionParts } from './version'

describe('version compare', () => {
  it('treats a later test build as newer', () => {
    expect(isNewerVersion('0.1.0-test.12', '0.1.0-test.4')).toBe(true)
    expect(isNewerVersion('0.1.0-test.4', '0.1.0-test.12')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(versionParts('v0.1.0-test.8')).toEqual([0, 1, 0, 8])
  })
})
