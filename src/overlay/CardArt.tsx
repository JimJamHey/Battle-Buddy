import { useEffect, useMemo, useState } from 'react'
import { boardCardUrls, cardArtUrls, cardFaceUrls, cardTileUrls } from '../core/cards'
import { firstAvailable, firstCached, warmUrls } from './imageCache'
import { isMostlyBlankImage, knockoutDarkBackdrop } from './knockout'

export function CardArt({
  cardId,
  className,
  variant = 'portrait',
  hideIfMissing = false,
  name,
  dbfId
}: {
  cardId: string
  className?: string
  variant?: 'portrait' | 'tile' | 'render' | 'golden' | 'face'
  hideIfMissing?: boolean
  name?: string
  dbfId?: number
}) {
  const wait = variant === 'render' || variant === 'golden' || variant === 'face'
  const urls = useMemo(() => {
    if (variant === 'tile') return cardTileUrls(cardId)
    if (variant === 'face') return cardFaceUrls(cardId)
    if (variant === 'portrait') return cardArtUrls(cardId)
    return boardCardUrls(cardId, name, dbfId, variant === 'golden')
  }, [cardId, variant, name, dbfId])
  const [src, setSrc] = useState<string | null>(() => firstCached(urls) ?? (wait ? null : urls[0] ?? null))

  useEffect(() => {
    let live = true
    const show = (url: string) => {
      if (!live || !url) return
      if (variant === 'golden' && url.includes('hsbg.cards')) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          if (live) setSrc(knockoutDarkBackdrop(img) ?? url)
        }
        img.onerror = () => {
          if (live) setSrc(url)
        }
        img.src = url
        return
      }
      if (!hideIfMissing) {
        setSrc(url)
        return
      }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (!live) return
        if (isMostlyBlankImage(img)) {
          const i = urls.indexOf(url)
          const next = i >= 0 ? urls[i + 1] : undefined
          if (next && next !== url) show(next)
          else setSrc(null)
          return
        }
        setSrc(url)
      }
      img.onerror = () => {
        if (!live) return
        const i = urls.indexOf(url)
        const next = i >= 0 ? urls[i + 1] : undefined
        if (next && next !== url) show(next)
        else if (hideIfMissing) setSrc(null)
        else setSrc(url)
      }
      img.src = url
    }
    const cached = firstCached(urls)
    if (cached) {
      show(cached)
      return () => {
        live = false
      }
    }
    if (!wait) setSrc(urls[0] ?? null)
    warmUrls(urls)
    void firstAvailable(urls).then((url) => {
      if (url) show(url)
    })
    return () => {
      live = false
    }
  }, [urls, wait, variant, hideIfMissing])

  if (!cardId || !src) {
    if (hideIfMissing) return null
    return <div className={`card-art missing ${className ?? ''}`} />
  }

  return (
    <img
      className={className}
      src={src}
      alt={name || ''}
      draggable={false}
      decoding="async"
      fetchPriority={wait ? 'high' : 'low'}
      onError={() => {
        const i = urls.indexOf(src)
        const next = i >= 0 ? urls[i + 1] : urls[0]
        if (next && next !== src) setSrc(next)
      }}
    />
  )
}
