import { describe, expect, it } from 'vitest'
import { mergeLogConfig, trackerBanner } from './logConfig'

describe('logConfig', () => {
  it('adds Power and LoadingScreen without wiping other sections', () => {
    const { next, changed } = mergeLogConfig('[Arena]\nLogLevel=1\n')
    expect(changed).toBe(true)
    expect(next).toContain('[Arena]')
    expect(next).toContain('[Power]')
    expect(next).toContain('FilePrinting=true')
    expect(next).toContain('[LoadingScreen]')
    expect(next).toContain('[GameNet]')
  })

  it('is idempotent when already configured', () => {
    const first = mergeLogConfig('')
    const second = mergeLogConfig(first.next)
    expect(second.changed).toBe(false)
  })

  it('asks testers to restart Hearthstone when logs are not live yet', () => {
    expect(trackerBanner({ hearthstoneFound: false, needsHearthstoneRestart: false })).toBe(
      'Waiting for Hearthstone…'
    )
    expect(trackerBanner({ hearthstoneFound: true, needsHearthstoneRestart: true })).toBe(
      'Restart Hearthstone to start live tracking.'
    )
    expect(trackerBanner({ hearthstoneFound: true, needsHearthstoneRestart: false })).toBeNull()
  })
})
