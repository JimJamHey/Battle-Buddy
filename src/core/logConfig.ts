const REQUIRED_SECTIONS: Record<string, Record<string, string>> = {
  Power: {
    LogLevel: '1',
    FilePrinting: 'true',
    ConsolePrinting: 'false',
    ScreenPrinting: 'false',
    Verbose: 'true'
  },
  LoadingScreen: {
    LogLevel: '1',
    FilePrinting: 'true',
    ConsolePrinting: 'false',
    ScreenPrinting: 'false',
    Verbose: 'false'
  },
  GameNet: {
    LogLevel: '1',
    FilePrinting: 'true',
    ConsolePrinting: 'false',
    ScreenPrinting: 'false',
    Verbose: 'false'
  }
}

function parseIni(text: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>()
  let current: Map<string, string> | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const section = line.match(/^\[(.+)]$/)
    if (section) {
      current = sections.get(section[1]) ?? new Map()
      sections.set(section[1], current)
      continue
    }
    const eq = line.indexOf('=')
    if (eq < 0 || !current) continue
    current.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim())
  }
  return sections
}

function serializeIni(sections: Map<string, Map<string, string>>): string {
  const chunks: string[] = []
  for (const [name, keys] of sections) {
    chunks.push(`[${name}]`)
    for (const [k, v] of keys) {
      chunks.push(`${k}=${v}`)
    }
    chunks.push('')
  }
  return chunks.join('\n').trimEnd() + '\n'
}

export function mergeLogConfig(existing: string): { next: string; changed: boolean } {
  const sections = parseIni(existing)
  let changed = false
  for (const [sectionName, required] of Object.entries(REQUIRED_SECTIONS)) {
    let section = sections.get(sectionName)
    if (!section) {
      section = new Map()
      sections.set(sectionName, section)
      changed = true
    }
    for (const [key, value] of Object.entries(required)) {
      const current = section.get(key)
      if (!current || current.toLowerCase() !== value.toLowerCase()) {
        section.set(key, value)
        changed = true
      }
    }
  }
  return { next: serializeIni(sections), changed }
}
