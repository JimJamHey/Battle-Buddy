import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeImage } from 'electron'

const here = dirname(fileURLToPath(import.meta.url))

export function appIcon() {
  const candidates = [
    join(process.cwd(), 'resources', 'icon.png'),
    join(here, '../../resources/icon.png'),
    join(process.resourcesPath || '', 'icon.png')
  ]
  for (const path of candidates) {
    if (existsSync(path)) return nativeImage.createFromPath(path)
  }
  return nativeImage.createEmpty()
}
