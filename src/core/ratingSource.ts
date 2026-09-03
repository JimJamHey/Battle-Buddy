import type { MemoryProbeReport } from './types'

/**
 * Single description of a rating-source probe, shared by the main process log and
 * the launcher so the two can never drift apart.
 *
 * The probe currently resolves the path into Hearthstone's Mono runtime as far as
 * the `Assembly-CSharp` image. It does not yet read the rating field itself, so
 * the success wording deliberately says what was reached rather than implying the
 * rating is now live.
 */
export function describeProbe(probe: MemoryProbeReport): string {
  switch (probe.failure) {
    case null: {
      if (probe.rating && probe.rating.solo != null) {
        const duos = probe.rating.duos != null ? `, duos ${probe.rating.duos.toLocaleString('en-US')}` : ''
        return `Reading your rating from the game: ${probe.rating.solo.toLocaleString('en-US')}${duos}.`
      }
      if (probe.ratingFailure === 'no-dependency-builder' || probe.ratingFailure === 'no-netcache') {
        return 'Found the game\u2019s runtime, but the rating is not loaded yet. Open the Battlegrounds menu and check again.'
      }
      return `Found the game\u2019s runtime (${probe.assemblyCount} assemblies) but could not reach the rating${probe.ratingFailure ? ` (${probe.ratingFailure})` : ''}. Still reading from screen.`
    }
    case 'not-windows':
      return 'Reading the game\u2019s memory is Windows-only right now.'
    case 'no-process':
      return 'Hearthstone is not running.'
    case 'no-handle':
      return 'Could not open Hearthstone for reading. Try running BattleBuddy as administrator.'
    case 'wow64':
      return 'Hearthstone is running as a 32-bit process, which is not supported.'
    case 'timeout':
      return 'Gave up while searching the game\u2019s memory.'
    case 'no-mono-module':
      return `No Mono runtime found among ${probe.moduleCount} loaded modules.`
    case 'no-export-table':
    case 'no-root-domain-export':
    case 'no-root-domain-global':
    case 'no-root-domain':
      return 'Found the Mono runtime but could not locate its root domain.'
    case 'no-assembly-list':
    case 'no-assembly-csharp':
    case 'no-assembly-image':
      return 'Reached the Mono runtime but could not find the game\u2019s code assembly.'
    default:
      return 'Could not read the rating from the game.'
  }
}
