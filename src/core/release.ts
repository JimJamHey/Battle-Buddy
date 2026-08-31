import { isPrerelease } from './version'

export const GITHUB_REPO = { owner: 'JimJamHey', repo: 'Battle-Buddy' } as const

export function releasePageUrl(currentVersion: string, availableVersion: string | null): string {
  const base = `https://github.com/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/releases`
  if (isPrerelease(currentVersion) || (availableVersion && isPrerelease(availableVersion))) {
    return `${base}/tag/test`
  }
  if (availableVersion && !isPrerelease(availableVersion)) {
    return `${base}/tag/v${availableVersion.replace(/^v/i, '')}`
  }
  return `${base}/latest`
}

export function testReleaseFeedUrl(): string {
  return `https://github.com/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/releases/download/test`
}

/** Tag already-installed GitHub-provider clients can parse from releases.atom (`test` is not semver). */
export function semverReleaseTag(version: string): string {
  return `v${version.trim().replace(/^v/i, '')}`
}
