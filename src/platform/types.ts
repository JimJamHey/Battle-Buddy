export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface GameHost {
  findHearthstone(): Promise<bigint | null>
  findInstallFromRunningProcess(): Promise<string | null>
  getClientBounds(): Promise<Rect | null>
  isForeground(): Promise<boolean>
  logConfigPath(): string
  defaultInstallPath(): string | null
  processName(): string
}
