// Pixi side of the art: crisp textures from painted canvases, and the two motions we allow.
import { Texture, type Container } from "pixi.js"

export const texture = (canvas: HTMLCanvasElement): Texture => {
  const t = Texture.from(canvas)
  t.source.scaleMode = "nearest"
  return t
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Renderer-only motion, ticked from the Pixi ticker:
 * - glide: nodes ease toward their target (~200ms) — cards travelling from the deck.
 * - pop: a node scales in once (~120ms) — a mark being placed.
 * With reduced motion both snap.
 */
export const makeMotion = () => {
  const glides = new Map<Container, { x: number; y: number; tx: number; ty: number }>()
  const pops = new Map<Container, { scale: number; t: number }>()
  return {
    glide(node: Container, tx: number, ty: number, from?: { readonly x: number; readonly y: number }) {
      const current = glides.get(node)
      const start = current ?? from ?? { x: tx, y: ty }
      if (reduced()) Object.assign(start, { x: tx, y: ty })
      glides.set(node, { x: start.x, y: start.y, tx, ty })
      node.position.set(Math.round(start.x), Math.round(start.y))
    },
    pop(node: Container, scale: number) {
      if (reduced()) return node.scale.set(scale)
      pops.set(node, { scale, t: 0 })
      node.scale.set(scale * 0.6)
    },
    tick(ms: number) {
      const k = 1 - Math.exp(-ms / 55)
      for (const [node, g] of glides) {
        if (node.destroyed) {
          glides.delete(node)
          continue
        }
        g.x += (g.tx - g.x) * k
        g.y += (g.ty - g.y) * k
        if (Math.abs(g.tx - g.x) < 0.5 && Math.abs(g.ty - g.y) < 0.5) Object.assign(g, { x: g.tx, y: g.ty })
        node.position.set(Math.round(g.x), Math.round(g.y))
      }
      for (const [node, p] of pops) {
        if (node.destroyed) {
          pops.delete(node)
          continue
        }
        p.t = Math.min(1, p.t + ms / 120)
        const eased = 1 - (1 - p.t) ** 3
        node.scale.set(p.scale * (0.6 + 0.4 * eased))
        if (p.t === 1) pops.delete(node)
      }
    }
  }
}
export type Motion = ReturnType<typeof makeMotion>
