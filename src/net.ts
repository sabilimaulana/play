// Room socket shared by every game: stable anonymous player id + auto-reconnect.

const fresh = () => crypto.randomUUID().replaceAll("-", "")

export const playerId = (): string => {
  try {
    const saved = localStorage.getItem("pid")
    if (saved) return saved
    const pid = fresh()
    localStorage.setItem("pid", pid)
    return pid
  } catch {
    return fresh()
  }
}

export const connectRoom = <V, M>(game: string, room: string, onView: (view: V) => void, onDrop: () => void) => {
  let socket: WebSocket | undefined
  // Sent while (re)connecting: held and flushed on open, so an early click isn't silently lost.
  let pending: string[] = []
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws"
    socket = new WebSocket(`${proto}://${location.host}/api/${game}/${room}/ws?pid=${playerId()}`)
    socket.onopen = () => {
      for (const msg of pending) socket!.send(msg)
      pending = []
    }
    socket.onmessage = (e) => onView(JSON.parse(e.data as string) as V)
    socket.onclose = () => {
      onDrop()
      setTimeout(open, 1000)
    }
  }
  open()
  return (msg: M) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
    else pending = [...pending.slice(-31), JSON.stringify(msg)] // capped: a long outage keeps only the latest
  }
}
