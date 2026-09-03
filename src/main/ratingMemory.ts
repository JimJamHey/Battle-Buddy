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
import {
  readBattlegroundsRating,
  JOBS_CLASS,
  JOBS_NAMESPACE,
  type BattlegroundsRating
} from '../core/hearthstoneRating'
import { findClass } from '../core/monoClasses'
import { describeProbe } from '../core/ratingSource'
import type { MemoryProbeReport } from '../core/types'
import { findMonoModule, ProcessMemory, type ProcessModule } from '../platform/winMemory'
import { gameProcessId } from '../platform/windows'

export type { MemoryProbeReport }

/**
 * Wall-clock ceiling for the manual probe. Scanning every class in Assembly-CSharp
 * is inherently slow, and the probe is an explicit user action, so it is allowed to
 * take noticeably longer than a background read.
 */
const PROBE_BUDGET_MS = 8000

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
    rating: null,
    ratingFailure: null,
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
    const diagnostics = [...result.diagnostics]

    // Only worth walking managed objects once the runtime itself resolved.
    let rating: BattlegroundsRating | null = null
    let ratingFailure: string | null = null
    if (result.runtime) {
      const read = readBattlegroundsRating(reader, result.runtime.assemblyCSharpImage)
      diagnostics.push(...read.diagnostics)
      rating = read.rating
      ratingFailure = read.failure
    }

    const timedOut =
      (result.failure != null || ratingFailure != null) && Date.now() - started >= PROBE_BUDGET_MS

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
      rating,
      ratingFailure,
      failure: timedOut ? 'timeout' : result.failure,
      diagnostics,
      at: Date.now()
    }
  } finally {
    memory.close()
  }
}

export { describeProbe }

/**
 * Resolved runtime for the live client. The Boehm collector Mono uses here is
 * non-moving, so once resolved these pointers stay valid for the process lifetime
 * and each poll only costs the object walk rather than a full resolution.
 */
let live: { pid: number; memory: ProcessMemory; image: bigint; jobsClass: bigint } | null = null

function disposeLive(): void {
  live?.memory.close()
  live = null
}

/**
 * One-time resolution scans every class in Assembly-CSharp, which is tens of
 * thousands of entries, so it gets a far larger budget than a steady-state read.
 */
const RESOLVE_BUDGET_MS = 15000
const READ_BUDGET_MS = 1500

/** Avoid re-running a failed resolution on every poll. */
const RESOLVE_RETRY_MS = 30000
let lastResolveAttempt = 0

function resolveLive(): typeof live {
  if (live) return live

  const pid = gameProcessId()
  if (!pid) return null
  const now = Date.now()
  if (now - lastResolveAttempt < RESOLVE_RETRY_MS) return null
  lastResolveAttempt = now

  const memory = ProcessMemory.open(pid)
  if (!memory) return null
  if (memory.isWow64()) {
    memory.close()
    return null
  }
  const mono = findMonoModule(memory.modules())
  if (!mono) {
    memory.close()
    return null
  }

  const reader = deadlineReader(cachedReader(memory), RESOLVE_BUDGET_MS)
  const probe = probeMonoRuntime(reader, mono.base, mono.size)
  if (!probe.runtime) {
    memory.close()
    return null
  }
  const jobsClass = findClass(reader, probe.runtime.assemblyCSharpImage, JOBS_CLASS, JOBS_NAMESPACE)
  if (jobsClass == null) {
    memory.close()
    return null
  }

  live = { pid, memory, image: probe.runtime.assemblyCSharpImage, jobsClass }
  return live
}

/**
 * Reads the current rating straight from the client, or null when unavailable.
 *
 * Cheap enough to poll: the class-cache scan happens once per game process, and
 * every later read is a short walk from a cached root.
 */
export function readLiveRating(): BattlegroundsRating | null {
  if (process.platform !== 'win32') return null

  const pid = gameProcessId()
  if (!pid) {
    disposeLive()
    return null
  }
  if (live && live.pid !== pid) disposeLive()

  const resolved = resolveLive()
  if (!resolved) return null

  // A fresh page cache per read: the rating changes, so cached pages would go stale.
  const result = readBattlegroundsRating(
    deadlineReader(cachedReader(resolved.memory), READ_BUDGET_MS),
    resolved.image,
    resolved.jobsClass
  )
  if (result.failure === 'no-jobs-class') {
    // The cached class pointer no longer resolves — the client likely restarted.
    disposeLive()
  }
  return result.rating
}

/** Releases the cached process handle. Call on shutdown. */
export function closeRatingMemory(): void {
  disposeLive()
}
