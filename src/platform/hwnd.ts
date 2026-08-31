export function hwndFromNativeHandle(handle: Buffer): bigint {
  if (handle.length >= 8) return handle.readBigUInt64LE(0)
  if (handle.length >= 4) return BigInt(handle.readUInt32LE(0))
  return 0n
}

export function isGameForeground(input: {
  foreground: bigint
  game: bigint
  foregroundPid: number
  gamePid: number
  foregroundRoot?: bigint
}): boolean {
  if (input.game === 0n || input.foreground === 0n) return false
  if (input.foreground === input.game) return true
  if (input.foregroundRoot && input.foregroundRoot === input.game) return true
  return input.gamePid !== 0 && input.gamePid === input.foregroundPid
}
