import { describe, expect, it } from 'vitest'
import { ensureWindowedGraphics } from './hsOptions'

describe('Hearthstone options.txt', () => {
  it('turns exclusive fullscreen off without touching other keys', () => {
    const { next, changed } = ensureWindowedGraphics(
      'graphicsfullscreen=True\ngraphicswidth=2560\ngraphicsheight=1440\n'
    )
    expect(changed).toBe(true)
    expect(next).toContain('graphicsfullscreen=False')
    expect(next).toContain('graphicswidth=2560')
  })

  it('leaves an already-windowed file alone', () => {
    const src = 'graphicsfullscreen=False\ngraphicswidth=2560\n'
    const { next, changed } = ensureWindowedGraphics(src)
    expect(changed).toBe(false)
    expect(next).toBe(src)
  })

  it('creates graphicsfullscreen=False when options.txt is missing', () => {
    const { next, changed } = ensureWindowedGraphics('')
    expect(changed).toBe(true)
    expect(next).toContain('graphicsfullscreen=False')
  })
})
