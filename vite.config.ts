import { defineConfig } from "vite"

// `bun run dev` serves the Worker on :8787; Vite proxies the websocket API to it.
export default defineConfig({
  server: { proxy: { "/api": { target: "http://localhost:8787", ws: true } } }
})
