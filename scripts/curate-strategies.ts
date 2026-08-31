import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogFromCardsJson, type RawCard } from '../src/core/cards'
import {
  diffSnapshots,
  latestHsjsonBuild,
  parseHsjsonBuild,
  reviewCurated,
  snapshotFromCatalog,
  strategyCandidates,
  summarizeDiff,
  type CuratedFile,
  type PoolSnapshot
} from '../src/core/strategy'

const CARDS_URL = 'https://api.hearthstonejson.com/v1/latest/enUS/cards.json'
const INDEX_URL = 'https://api.hearthstonejson.com/v1/'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = join(root, 'data', 'pool-snapshot.json')
const candidatesPath = join(root, 'data', 'strategy-candidates.json')
const diffPath = join(root, 'data', 'pool-diff.json')
const curatedPath = join(root, 'data', 'strategies', 'curated.json')
const statusPath = join(root, 'data', 'strategies', 'status.json')

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function resolveBuild(cardsUrl: string): Promise<string | null> {
  const fromUrl = parseHsjsonBuild(cardsUrl)
  if (fromUrl) return fromUrl
  const index = await fetch(INDEX_URL, { headers: { 'user-agent': 'BattleBuddy/0.1' } })
  if (!index.ok) return null
  return latestHsjsonBuild(await index.text())
}

async function main(): Promise<void> {
  const res = await fetch(CARDS_URL, { headers: { 'user-agent': 'BattleBuddy/0.1' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`cards.json HTTP ${res.status}`)
  const build = await resolveBuild(res.url)
  const json = (await res.json()) as RawCard[]
  const catalog = catalogFromCardsJson(json)
  const previous = await readJson<PoolSnapshot>(snapshotPath)
  const snapshot = snapshotFromCatalog(catalog, { source: CARDS_URL, build })
  const diff = diffSnapshots(previous, snapshot)
  const candidates = strategyCandidates(catalog)
  const curatedFile =
    (await readJson<CuratedFile>(curatedPath)) ?? ({ skillBand: 'mid', comps: [] } satisfies CuratedFile)
  const curated = reviewCurated(curatedFile, catalog)
  const stale = curated.filter((row) => row.status === 'stale')

  await mkdir(dirname(curatedPath), { recursive: true })
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  await writeFile(candidatesPath, `${JSON.stringify({ build, generatedAt: snapshot.fetchedAt, comps: candidates }, null, 2)}\n`)
  await writeFile(diffPath, `${JSON.stringify(diff, null, 2)}\n`)
  await writeFile(
    statusPath,
    `${JSON.stringify(
      {
        build,
        fetchedAt: snapshot.fetchedAt,
        poolSize: catalog.length,
        candidates: candidates.length,
        curated: curated.length,
        stale: stale.map((row) => ({ id: row.id, reason: row.reason }))
      },
      null,
      2
    )}\n`
  )

  console.log(summarizeDiff(diff))
  console.log(`${candidates.length} candidate comps → ${candidatesPath}`)
  console.log(`${curated.length} curated comps, ${stale.length} stale`)
  for (const row of stale) console.log(`  stale ${row.id}: ${row.reason}`)
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
