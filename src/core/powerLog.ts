import { canonTag, powerPayload, zoneName } from './tags'

export interface EntityRef {
  id: number
  cardId?: string
  name?: string
  zone?: string
  zonePos?: number
  player?: number
}

export interface CreatingHit {
  id: number
  cardId?: string
}

export interface UpdatingHit {
  id?: number
  ref?: string
  cardId?: string
}

export interface TagChangeHit {
  entityId?: number
  entityName?: string
  playerId?: number
  tag: string
  value: string
  ref?: string
}

export function parseCreating(payload: string): CreatingHit | null {
  const m = payload.match(/FULL_ENTITY - Creating ID=(\d+)(?:\s+CardID=([A-Za-z0-9_]+))?/i)
  if (!m) return null
  return { id: Number(m[1]), cardId: m[2] }
}

export function parseGameEntity(payload: string): number | null {
  const m = payload.match(/^\s*GameEntity EntityID=(\d+)/i)
  return m ? Number(m[1]) : null
}

export function parsePlayerEntity(payload: string): { entityId: number; playerId: number } | null {
  const m = payload.match(/^\s*Player EntityID=(\d+) PlayerID=(\d+)/i)
  if (!m) return null
  return { entityId: Number(m[1]), playerId: Number(m[2]) }
}

export function parseUpdating(payload: string): UpdatingHit | null {
  const m = payload.match(
    /(?:FULL_ENTITY|SHOW_ENTITY|CHANGE_ENTITY) - Updating (?:Entity=)?(?:\[([^\]]+)\]|(\d+))(?:\s+CardID=([A-Za-z0-9_]+))?/i
  )
  if (!m) return null
  return {
    ref: m[1],
    id: m[2] ? Number(m[2]) : undefined,
    cardId: m[3]
  }
}

export function parseNestedTag(payload: string): { tag: string; value: string } | null {
  const m = payload.match(/^(?:\s+)?tag=([A-Z0-9_]+)\s+value=(\S+)/i)
  if (!m) return null
  return { tag: canonTag(m[1]), value: m[2].replace(/,$/, '') }
}

export function parseEntityRef(ref: string, cardId?: string): EntityRef | null {
  const idMatch = ref.match(/\bid=(\d+)/i)
  if (!idMatch) return null
  const name = ref.match(/entityName=([^\]\n]+?)\s+id=/i)?.[1]?.trim()
  const zone = ref.match(/\bzone=([A-Z]+)/i)?.[1]
  const zonePos = ref.match(/\bzonePos=(\d+)/i)?.[1]
  const player = ref.match(/\bplayer=(\d+)/i)?.[1]
  const cid = cardId || ref.match(/\bcardId=([A-Za-z0-9_]+)/i)?.[1]
  return {
    id: Number(idMatch[1]),
    cardId: cid,
    name: name && !/^unknown/i.test(name) ? name : undefined,
    zone: zone ? zoneName(zone) : undefined,
    zonePos: zonePos ? Number(zonePos) : undefined,
    player: player ? Number(player) : undefined
  }
}

export function parseTagChangeLine(line: string): TagChangeHit | null {
  if (!line.includes('TAG_CHANGE') || !line.includes('tag=')) return null
  const tagMatch = line.match(/\btag=([A-Z0-9_]+)\s+value=(\S+)/i)
  if (!tagMatch) return null
  const bracketInner = line.match(/Entity=\[(.+)\]\s+tag=/i)?.[1]
  const namedMatch = bracketInner ? null : line.match(/Entity=(.+?)\s+tag=/i)
  const playerMatch = line.match(/\bplayer=(\d+)/i)
  const idMatch = (bracketInner ?? line).match(/\bid=(\d+)/i)
  let entityId = idMatch ? Number(idMatch[1]) : undefined
  if (!entityId && namedMatch && /^\d+$/.test(namedMatch[1].trim())) {
    entityId = Number(namedMatch[1].trim())
  }
  const entityName = namedMatch?.[1]?.trim() || parseEntityName(bracketInner ?? line)
  const playerId = playerMatch ? Number(playerMatch[1]) : undefined
  return {
    entityId: Number.isFinite(entityId as number) ? entityId : undefined,
    entityName,
    playerId: Number.isFinite(playerId as number) ? playerId : undefined,
    tag: canonTag(tagMatch[1]),
    value: tagMatch[2].replace(/,$/, ''),
    ref: bracketInner
  }
}

export function parseEntityName(text: string): string | undefined {
  const m = text.match(/entityName=(.+?)\s+id=\d+/i)
  return m?.[1]?.trim()
}

export function payloadOf(line: string): string {
  return powerPayload(line)
}
