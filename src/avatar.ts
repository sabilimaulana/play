// Random-but-stable pixel avatars from Pixabots (pixabots.com, @pixabots/core is MIT).
// The bot id is a hash of the anonymous player id, so a player keeps their bot in every game.
import { seededId } from "@pixabots/core"

export const avatarOf = (pid: string): string => seededId(pid)

/** A display name typed by a player: control chars stripped, spaces collapsed, max 14 chars. "" if nothing's left. */
export const cleanName = (raw: unknown): string =>
  typeof raw === "string" ? raw.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 14).trim() : ""

/** 32x32 art; 64 = 2x, matching the rest of the pixel grid. Animated = idle-loop GIF. */
export const avatarUrl = (id: string, animated = false, size = 64) =>
  `https://pixabots.com/api/pixabot/${id}?size=${size}${animated ? "&animated=true" : ""}`

