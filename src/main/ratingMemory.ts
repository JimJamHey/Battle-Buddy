/**
 * Locates the Battlegrounds rating inside the running Hearthstone process.
 *
 * Screen OCR has never been dependable: it depends on the client's language, UI
 * scale, which monitor the player is on, and whether anything is drawn over the
 * rating plaque. The rating itself lives in managed memory, which is where
 * Hearthstone Deck Tracker reads it from (via HearthMirror).
 *
 * What this module does today: it establishes and validates the chain
 *   process -> Mono runtime module -> root domain -> Assembly-CSharp image
 * and reports exactly how far it got. It does **not** yet read the rating value;
 * that needs the class and field offsets for a specific Mono build, which have to
 * be observed on a real client. The probe report is what makes that a mechanical
 * next step rather than guesswork. OCR remains the live rating source meanwhile.
 *
 * Nothing here writes to Hearthstone; the process is opened read-only.
 */

import { cachedReader, deadlineReader } from '../core/processMemory'
import { probeMonoRuntime } from '../core/mono'
import { describeProbe } from '../core/ratingSource'
import type { MemoryProbeReport } from '../core/types'
import { findMonoModule, ProcessMemory, type ProcessModule } from '../platform/winMemory'
import { gameProcessId } from '../platform/windows'

export type { MemoryProbeReport }

/**
 * Wall-clock ceiling for the whole walk. The probe runs synchronously on the main
 * thread, so this is the worst-case UI stall.
 */
const PROBE_BUDGET_MS = 750

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
 * Runs the probe against the live client and reports what resolved.
 * Never throws. Bounded by `PROBE_BUDGET_MS`.
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
    if (memory.isWow64()) {
      const report = emptyReport('wow64')
      report.pid = pid
      return report
    }

    const modules = memory.modules()
    const mono = findMonoModule(modules)
    if (!mono) {
      const report = emptyReport('no-mono-module')
      report.pid = pid
      report.moduleCount = modules.length
      return report
    }

    // Calibration re-reads the same structures repeatedly, so cache pages; the
    // deadline stops a bogus pointer from turning that into a long walk.
    const started = Date.now()
    const reader = deadlineReader(cachedReader(memory), PROBE_BUDGET_MS)
    const result = probeMonoRuntime(reader, mono.base, mono.size)
    const timedOut = result.failure != null && Date.now() - started >= PROBE_BUDGET_MS

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
      failure: timedOut ? 'timeout' : result.failure,
      diagnostics: result.diagnostics,
      at: Date.now()
    }
  } finally {
    memory.close()
  }
}

export { describeProbe }
