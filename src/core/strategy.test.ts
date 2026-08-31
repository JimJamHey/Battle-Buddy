import { describe, expect, it } from 'vitest'
import type { BgMinion } from './types'
import {
  diffSnapshots,
  latestHsjsonBuild,
  markStale,
  parseHsjsonBuild,
  reviewCurated,
  snapshotFromCatalog,
  strategyCandidates,
  strategyCatalog
} from './strategy'

function card(partial: Partial<BgMinion> & Pick<BgMinion, 'id' | 'name'>): BgMinion {
  return {
    dbfId: 1,
    text: '',
    attack: 1,
    health: 1,
    techLevel: 1,
    tribes: [],
    tileUrl: '',
    goldenId: `${partial.id}_G`,
    kind: 'minion',
    cost: 0,
    mechanics: [],
    ...partial
  }
}

const mechs: BgMinion[] = [
  card({ id: 'm1', name: 'Gearling', tribes: ['Mech'], techLevel: 1, mechanics: ['Magnetic'] }),
  card({ id: 'm2', name: 'Boltbox', tribes: ['Mech'], techLevel: 2, mechanics: ['Magnetic'] }),
  card({ id: 'm3', name: 'Coil', tribes: ['Mech'], techLevel: 3, mechanics: ['Magnetic'] }),
  card({ id: 'm4', name: 'Cannon', tribes: ['Mech'], techLevel: 4, mechanics: ['Magnetic'] }),
  card({ id: 'm5', name: 'Fortress', tribes: ['Mech'], techLevel: 5, mechanics: ['Magnetic'] }),
  card({ id: 'm6', name: 'Titan', tribes: ['Mech'], techLevel: 6, mechanics: ['Magnetic'] }),
  card({ id: 'd1', name: 'Whelp', tribes: ['Dragon'], techLevel: 1, mechanics: ['Battlecry'] })
]

describe('strategy candidates', () => {
  it('clusters a tribe around a payoff mechanic', () => {
    const comps = strategyCandidates(mechs)
    expect(comps.map((row) => row.id)).toContain('mech-magnetic')
    const mech = comps.find((row) => row.id === 'mech-magnetic')
    expect(mech?.core.map((row) => row.name)).toEqual(['Cannon', 'Fortress', 'Titan'])
    expect(mech?.support.map((row) => row.name)).toEqual(['Gearling', 'Boltbox', 'Coil'])
    expect(comps.some((row) => row.id.startsWith('dragon-'))).toBe(false)
  })

  it('parses the HSJSON build from the redirected URL', () => {
    expect(parseHsjsonBuild('https://api.hearthstonejson.com/v1/219197/enUS/cards.json')).toBe('219197')
    expect(parseHsjsonBuild('https://api.hearthstonejson.com/v1/latest/enUS/cards.json')).toBeNull()
  })

  it('picks the highest numbered folder from the /v1/ index', () => {
    const html = '<a href="/v1/190920/">190920</a><a href="/v1/219197/">219197</a><a href="/v1/latest/">latest</a>'
    expect(latestHsjsonBuild(html)).toBe('219197')
  })

  it('diffs pool snapshots by id', () => {
    const prev = snapshotFromCatalog(mechs, { source: 'test', build: '1' })
    const next = snapshotFromCatalog(
      [
        ...mechs.filter((row) => row.id !== 'm1'),
        card({ id: 'm7', name: 'Nuke', tribes: ['Mech'], techLevel: 7, mechanics: ['Magnetic'] }),
        card({ id: 'm5', name: 'Fortress', tribes: ['Mech'], techLevel: 4, mechanics: ['Magnetic'], text: 'nerfed' })
      ],
      { source: 'test', build: '2' }
    )
    const diff = diffSnapshots(prev, next)
    expect(diff.removed.map((row) => row.id)).toEqual(['m1'])
    expect(diff.added.map((row) => row.id)).toEqual(['m7'])
    expect(diff.changed).toEqual([{ id: 'm5', name: 'Fortress', fields: ['text', 'techLevel'] }])
  })

  it('marks curated comps stale when a core card leaves the pool', () => {
    const [comp] = strategyCandidates(mechs)
    const stale = markStale([comp], new Set(mechs.filter((row) => row.id !== 'm6').map((row) => row.id)))
    expect(stale[0].status).toBe('stale')
    expect(stale[0].reason).toMatch(/Titan/)
  })

  it('reviews a curated file against the live pool', () => {
    const reviewed = reviewCurated(
      {
        skillBand: 'mid',
        comps: [{
          id: 'mech-magnetic',
          name: 'Mech Magnetic',
          tribes: ['Mech'],
          coreIds: ['m5', 'gone'],
          supportIds: ['m1'],
          why: 'Magnets stack forever.',
          essential: [{ id: 'm5', role: 'Carry' }],
          phases: [{ stage: 'early', tiers: 'T1-2', goal: 'Start small.', cardIds: ['m1'] }]
        }]
      },
      mechs
    )
    expect(reviewed[0].status).toBe('stale')
    expect(reviewed[0].why).toBe('Magnets stack forever.')
    expect(reviewed[0].essential[0]).toMatchObject({ id: 'm5', name: 'Fortress', role: 'Carry' })
    expect(reviewed[0].phases[0].cards[0].name).toBe('Gearling')
    expect(reviewed[0].core[0].name).toBe('Fortress')
    expect(reviewed[0].support[0].name).toBe('Gearling')
  })

  it('lists the full catalog with lobby matches first', () => {
    const rows = strategyCatalog(mechs, ['Mech'], { skillBand: 'mid', comps: [] })
    expect(rows.some((row) => row.id === 'mech-magnetic' && row.inLobby)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('marks every catalog row available when there is no lobby filter', () => {
    const rows = strategyCatalog(mechs, [], { skillBand: 'mid', comps: [] })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.inLobby)).toBe(true)
  })
})
