import { describe, expect, it } from 'vitest'
import { releasePageUrl, semverReleaseTag, testReleaseFeedUrl } from './release'

describe('releasePageUrl', () => {
  it('links test-channel installs to the rolling test release', () => {
    expect(releasePageUrl('0.1.0-test.15', null)).toBe(
      'https://github.com/JimJamHey/Battle-Buddy/releases/tag/test'
    )
    expect(releasePageUrl('0.1.0', '0.1.0-test.26')).toBe(
      'https://github.com/JimJamHey/Battle-Buddy/releases/tag/test'
    )
  })

  it('links stable installs to versioned or latest releases', () => {
    expect(releasePageUrl('0.1.0', '0.2.0')).toBe(
      'https://github.com/JimJamHey/Battle-Buddy/releases/tag/v0.2.0'
    )
    expect(releasePageUrl('0.1.0', null)).toBe(
      'https://github.com/JimJamHey/Battle-Buddy/releases/latest'
    )
  })
})

describe('testReleaseFeedUrl', () => {
  it('points electron-updater at the rolling test channel', () => {
    expect(testReleaseFeedUrl()).toBe(
      'https://github.com/JimJamHey/Battle-Buddy/releases/download/test'
    )
  })
})

describe('semverReleaseTag', () => {
  it('gives GitHub-provider clients a parseable prerelease tag', () => {
    expect(semverReleaseTag('0.1.0-test.26')).toBe('v0.1.0-test.26')
    expect(semverReleaseTag('v0.1.0-test.30')).toBe('v0.1.0-test.30')
  })
})
