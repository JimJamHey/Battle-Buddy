import { describe, expect, it } from 'vitest'
import { findMonoModule, type ProcessModule } from './winMemory'

function mod(name: string, base = 0x1000n): ProcessModule {
  return { name, base, size: 0x1000, path: `C:\\Hearthstone\\${name}` }
}

describe('findMonoModule', () => {
  it('prefers the versioned mono runtime Hearthstone ships', () => {
    const modules = [mod('Hearthstone.exe'), mod('mono-2.0-bdwgc.dll'), mod('MonoPosixHelper.dll')]
    expect(findMonoModule(modules)?.name).toBe('mono-2.0-bdwgc.dll')
  })

  it('falls back to any bdwgc build when the name is versioned differently', () => {
    const modules = [mod('Hearthstone.exe'), mod('libmonobdwgc-2.0.dll')]
    expect(findMonoModule(modules)?.name).toBe('libmonobdwgc-2.0.dll')
  })

  it('falls back to any mono-named module', () => {
    expect(findMonoModule([mod('kernel32.dll'), mod('mono.dll')])?.name).toBe('mono.dll')
  })

  it('returns null when no mono module is loaded', () => {
    expect(findMonoModule([mod('kernel32.dll'), mod('user32.dll')])).toBeNull()
  })

  it('returns null for an empty module list', () => {
    expect(findMonoModule([])).toBeNull()
  })
})
