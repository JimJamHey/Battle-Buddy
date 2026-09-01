import { existsSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { isCombatSpectatorCreateGame, parseLoadingScreenScene } from '../core/parser'

export class LogTailer {
  private timer: NodeJS.Timeout | null = null
  private powerOffset = 0
  private loadingOffset = 0
  private netOffset = 0
  private powerCarry = ''
  private loadingCarry = ''
  private netCarry = ''
  private powerPath = ''
  private loadingPath = ''
  private netPath = ''
  private lastPowerWrite = 0
  private polling = false
  stopped = true

  constructor(
    private readonly onPowerLine: (line: string) => void,
    private readonly onLoadingLine: (line: string) => void,
    private readonly onNetLine?: (line: string) => void
  ) {}

  async start(logsDirectory: string): Promise<{ catchupLines: number; powerExists: boolean }> {
    await this.stop()
    this.powerPath = join(logsDirectory, 'Power.log')
    this.loadingPath = join(logsDirectory, 'LoadingScreen.log')
    this.netPath = join(logsDirectory, 'GameNetLogger.log')
    this.stopped = false
    this.powerCarry = ''
    this.loadingCarry = ''
    this.netCarry = ''
    this.powerOffset = 0
    this.loadingOffset = 0
    this.netOffset = 0

    let catchupLines = 0
    if (existsSync(this.powerPath)) {
      const caught = await this.catchupPower()
      catchupLines = caught
    }
    if (existsSync(this.loadingPath)) {
      const st = await stat(this.loadingPath)
      this.loadingOffset = st.size
      await this.readLastLoadingLines()
    }
    if (existsSync(this.netPath)) {
      const st = await stat(this.netPath)
      this.netOffset = st.size
    }

    this.timer = setInterval(() => {
      void this.poll()
    }, 250)
    return { catchupLines, powerExists: existsSync(this.powerPath) }
  }

  async startFromEnd(logsDirectory: string): Promise<void> {
    await this.stop()
    this.powerPath = join(logsDirectory, 'Power.log')
    this.loadingPath = join(logsDirectory, 'LoadingScreen.log')
    this.netPath = join(logsDirectory, 'GameNetLogger.log')
    this.stopped = false
    this.powerCarry = ''
    this.loadingCarry = ''
    this.netCarry = ''
    this.powerOffset = existsSync(this.powerPath) ? (await stat(this.powerPath)).size : 0
    this.loadingOffset = existsSync(this.loadingPath) ? (await stat(this.loadingPath)).size : 0
    this.netOffset = existsSync(this.netPath) ? (await stat(this.netPath)).size : 0
    if (existsSync(this.powerPath)) this.lastPowerWrite = (await stat(this.powerPath)).mtimeMs
    this.timer = setInterval(() => {
      void this.poll()
    }, 250)
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    const deadline = Date.now() + 2000
    while (this.polling && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  isLive(now = Date.now()): boolean {
    return now - this.lastPowerWrite < 45_000
  }

  private async catchupPower(): Promise<number> {
    const st = await stat(this.powerPath)
    this.lastPowerWrite = st.mtimeMs
    const start = await this.lastCreateGameFileOffset(st.size)
    const fh = await open(this.powerPath, 'r')
    let lines = 0
    try {
      let offset = start
      let carry = ''
      while (offset < st.size) {
        const length = Math.min(4 * 1024 * 1024, st.size - offset)
        const buf = Buffer.alloc(length)
        await fh.read(buf, 0, length, offset)
        const combined = carry + buf.toString('utf8')
        const parts = combined.split(/\r?\n/)
        carry = combined.endsWith('\n') || combined.endsWith('\r') ? '' : (parts.pop() ?? '')
        for (const line of parts) {
          if (!line) continue
          this.onPowerLine(line)
          lines++
          if (lines % 50 === 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
          }
        }
        offset += length
      }
      this.powerCarry = carry
      this.powerOffset = st.size
      return lines
    } finally {
      await fh.close()
    }
  }

  private async lastCreateGameFileOffset(fileSize: number): Promise<number> {
    const needle = Buffer.from('GameState.DebugPrintPower() - CREATE_GAME')
    const chunkSize = 2 * 1024 * 1024
    const fallback = Math.max(0, fileSize - 12 * 1024 * 1024)
    const fh = await open(this.powerPath, 'r')
    try {
      let pos = fileSize
      let tail = Buffer.alloc(0)
      while (pos > 0) {
        const begin = Math.max(0, pos - chunkSize)
        const buf = Buffer.alloc(pos - begin)
        await fh.read(buf, 0, buf.length, begin)
        const combined = Buffer.concat([buf, tail])
        const idx = combined.lastIndexOf(needle)
        if (idx >= 0 && idx < buf.length) {
          const abs = begin + idx
          if (await this.createGameIsSpectatorCombat(fh, abs)) {
            pos = abs
            tail = Buffer.alloc(0)
            continue
          }
          const lookback = 64 * 1024
          const from = Math.max(0, abs - lookback)
          const probe = Buffer.alloc(abs - from)
          if (probe.length) await fh.read(probe, 0, probe.length, from)
          const text = probe.toString('utf8')
          const spectateAt = text.lastIndexOf('Begin Spectating')
          const endAt = Math.max(text.lastIndexOf('End Spectator'), text.lastIndexOf('End Spectating'))
          if (spectateAt >= 0 && spectateAt > endAt) {
            const nl = text.lastIndexOf('\n', spectateAt)
            return from + (nl >= 0 ? nl + 1 : spectateAt)
          }
          const lineNl = text.lastIndexOf('\n')
          return lineNl >= 0 ? from + lineNl + 1 : from
        }
        tail = combined.subarray(0, Math.min(needle.length - 1, combined.length))
        pos = begin
      }
      return fallback
    } finally {
      await fh.close()
    }
  }

  private async createGameIsSpectatorCombat(
    fh: { read: (buf: Buffer, offset: number, length: number, position: number) => Promise<unknown> },
    abs: number
  ): Promise<boolean> {
    const probeStart = Math.max(0, abs - 8192)
    const afterLen = 4096
    const probe = Buffer.alloc(abs - probeStart + afterLen)
    if (!probe.length) return false
    await fh.read(probe, 0, probe.length, probeStart)
    return isCombatSpectatorCreateGame(probe.toString('utf8'))
  }

  private async readLastLoadingLines(): Promise<void> {
    const st = await stat(this.loadingPath)
    const start = Math.max(0, st.size - 64_000)
    const fh = await open(this.loadingPath, 'r')
    try {
      const buf = Buffer.alloc(st.size - start)
      await fh.read(buf, 0, buf.length, start)
      let last: string | null = null
      for (const line of buf.toString('utf8').split(/\r?\n/)) {
        if (line && parseLoadingScreenScene(line)) last = line
      }
      if (last) this.onLoadingLine(last)
    } finally {
      await fh.close()
    }
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.polling) return
    this.polling = true
    try {
      await this.pollFile(this.powerPath, 'power')
      await this.pollFile(this.loadingPath, 'loading')
      await this.pollFile(this.netPath, 'net')
    } finally {
      this.polling = false
    }
  }

  private async pollFile(path: string, kind: 'power' | 'loading' | 'net'): Promise<void> {
    if (!existsSync(path)) return
    try {
      const st = await stat(path)
      let offset = kind === 'power' ? this.powerOffset : kind === 'loading' ? this.loadingOffset : this.netOffset
      if (st.size < offset) {
        offset = 0
        if (kind === 'power') this.powerCarry = ''
        else if (kind === 'loading') this.loadingCarry = ''
        else this.netCarry = ''
      }
      if (st.size === offset) return
      if (kind === 'power') this.lastPowerWrite = st.mtimeMs
      const fh = await open(path, 'r')
      try {
        const length = st.size - offset
        const buf = Buffer.alloc(length)
        await fh.read(buf, 0, length, offset)
        const carryIn = kind === 'power' ? this.powerCarry : kind === 'loading' ? this.loadingCarry : this.netCarry
        const combined = carryIn + buf.toString('utf8')
        const lines = combined.split(/\r?\n/)
        const carry = combined.endsWith('\n') || combined.endsWith('\r') ? '' : (lines.pop() ?? '')
        if (kind === 'power') {
          this.powerCarry = carry
          this.powerOffset = st.size
          for (const line of lines) if (line) this.onPowerLine(line)
        } else if (kind === 'loading') {
          this.loadingCarry = carry
          this.loadingOffset = st.size
          for (const line of lines) if (line) this.onLoadingLine(line)
        } else {
          this.netCarry = carry
          this.netOffset = st.size
          for (const line of lines) if (line) this.onNetLine?.(line)
        }
      } finally {
        await fh.close()
      }
    } catch {
      /* file may rotate mid-read */
    }
  }
}
