/**
 * Reads Battlegrounds rating straight out of the Hearthstone process.
 *
 * Screen OCR has never been dependable: it depends on the client's language, UI
 * scale, which screen the player is on, and whether anything is drawn over the
 * rating plaque. The rating itself lives in managed memory, which is where
 * Hearthstone Deck Tracker reads it from (via HearthMirror). This module is the
 * Windows-side transport plus runtime calibration for that approach.
 *
 * Scope today: it establishes and validates the chain
 *   process -> mono module -> root domain -> Assembly-CSharp image
 * and reports precisely how far it got. That report is what turns the remaining
 * class/field walk into a mechanical step instead of guesswork, because the
 * offsets differ per Mono build and have to be observed on a real client.
 *
 * Nothing here writes to Hearthstone; the process is opened read-only.
 */

import { cachedReader } from '../core/processMemory'
import { probeMonoRuntime } from '../core/mono'
import type { MemoryProbeReport } from '../core/types'
import { findMonoModule, ProcessMemory, type ProcessModule } from '../platform/winMemory'
import { gameProcessId } from '../platform/windows'

export type { MemoryProbeReport }

function emptyReport(failure: MemoryProbeReport['failure']): MemoryProbeReport {
  return {
    supported: process.platform === 'win32',
    pid: 0,
    monoModule: null,
    moduleCount: 0,
    rootDomain: null,
    assemblyCount: 0,
    assemblyCSharpImage: null,
    imageName: null,
    offsets: null,
    failure,
    diagnostics: [],
    at: Date.now()
  }
}

function describeModule(module: ProcessModule): MemoryProbeReport['monoModule'] {
  return { name: module.name, base: `0x${module.base.toString(16)}`, size: module.size }
}

/**
 * Runs the full probe against the live client and reports what resolved.
 * Safe to call at any time: it never throws and never blocks on the game.
 */
export function probeRatingMemory(): MemoryProbeReport {
  if (process.platform !== 'win32') return emptyReport('not-windows')

  const pid = gameProcessId()
  if (!pid) return emptyReport('no-process')

  const memory = ProcessMemory.open(pid)
  if (!memory) {
    const report = emptyReport('no-handle')
    report.pid = pid
    return report
  }

  try {
    const modules = memory.modules()
    const mono = findMonoModule(modules)
    if (!mono) {
      const report = emptyReport('no-mono-module')
      report.pid = pid
      report.moduleCount = modules.length
      return report
    }

    // Traversal re-reads the same structures while calibrating; cache pages so the
    // probe costs a handful of syscalls rather than hundreds.
    const result = probeMonoRuntime(cachedReader(memory), mono.base)

    return {
      supported: true,
      pid,
      monoModule: describeModule(mono),
      moduleCount: modules.length,
      rootDomain: result.runtime ? `0x${result.runtime.rootDomain.toString(16)}` : null,
      assemblyCount: result.runtime?.assemblies.length ?? 0,
      assemblyCSharpImage: result.runtime
        ? `0x${result.runtime.assemblyCSharpImage.toString(16)}`
        : null,
      imageName: result.runtime?.imageName ?? null,
      offsets: result.runtime?.offsets ?? null,
      failure: result.failure,
      diagnostics: result.diagnostics,
      at: Date.now()
    }
  } finally {
    memory.close()
  }
}

/** One-line summary for logs and the settings panel. */
export function summarizeProbe(report: MemoryProbeReport): string {
  if (report.failure === 'not-windows') return 'Memory read is Windows-only right now.'
  if (report.failure === 'no-process') return 'Hearthstone is not running.'
  if (report.failure === 'no-handle') return 'Could not open the Hearthstone process for reading.'
  if (report.failure === 'no-mono-module') {
    return `No Mono runtime module found among ${report.moduleCount} loaded modules.`
  }
  if (report.failure) return `Stopped at: ${report.failure}.`
  return `Reached ${report.imageName ?? 'Assembly-CSharp'} via ${report.assemblyCount} assemblies.`
}
