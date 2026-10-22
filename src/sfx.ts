// Chiptune sound effects synthesized with Web Audio: square/triangle blips, no audio files.
// Muted state persists per browser. Audio starts on the first user gesture (browser rule).

// "noise" = a band-passed white-noise burst centred on freq (swishes, clacks, thuds); freq 0 = a rest.
type Note = readonly [freq: number, ms: number, wave?: OscillatorType | "noise"]

const SOUNDS = {
  tap: [[660, 40], [880, 50]],
  place: [[392, 50, "triangle"], [523, 70, "triangle"]],
  deal: [[1200, 25, "triangle"]],
  chip: [[1568, 30], [2093, 40]],
  turn: [[523, 70], [659, 70], [784, 110]],
  tick: [[1000, 30]],
  timesup: [[392, 120, "sawtooth"], [262, 220, "sawtooth"]],
  error: [[180, 90, "sawtooth"]],
  win: [[523, 80], [659, 80], [784, 80], [1047, 200]],
  lose: [[392, 120, "triangle"], [330, 120, "triangle"], [262, 240, "triangle"]],
  draw: [[440, 100, "triangle"], [440, 140, "triangle"]],
  // Poker table
  swish: [[3200, 70, "noise"]], // a card lands
  flip: [[5200, 18, "noise"], [1760, 22, "triangle"]],
  clack: [[2600, 22, "noise"], [2637, 25]], // chips hit the felt
  clackBig: [[2600, 22, "noise"], [2200, 22, "noise"], [2637, 30], [3136, 30]],
  rake: [[2600, 22, "noise"], [2900, 22, "noise"], [2300, 22, "noise"], [2700, 22, "noise"], [2500, 30, "noise"]],
  cascade: [[2093, 40], [2349, 40], [2637, 40], [3136, 40], [3520, 40], [4186, 90]],
  ding: [[880, 110, "triangle"]],
  knock: [[180, 40, "triangle"], [0, 60], [180, 40, "triangle"]],
  thud: [[500, 80, "noise"], [110, 70, "triangle"]],
  allin: [[196, 90, "sawtooth"], [247, 90, "sawtooth"], [294, 90, "sawtooth"], [392, 240]],
  pop: [[1200, 30, "triangle"], [1800, 45, "triangle"]],
  alarm: [[880, 90, "sawtooth"], [660, 90, "sawtooth"], [880, 90, "sawtooth"], [660, 120, "sawtooth"]],
  gavel: [[300, 40, "noise"], [130, 140, "triangle"]]
} satisfies Record<string, ReadonlyArray<Note>>

export type Sound = keyof typeof SOUNDS

let ctx: AudioContext | undefined
let muted = (() => {
  try {
    return localStorage.getItem("muted") === "1"
  } catch {
    return false
  }
})()

const unlock = () => {
  ctx ??= new AudioContext()
  void ctx.resume()
}
addEventListener("pointerdown", unlock, { once: true })
addEventListener("keydown", unlock, { once: true })

let noise: AudioBuffer | undefined
const noiseBurst = (ctx: AudioContext, freq: number, t: number, ms: number) => {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = "bandpass"
  band.frequency.value = freq
  band.Q.value = 1.2
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.25, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000)
  src.connect(band).connect(gain).connect(ctx.destination)
  src.start(t)
  src.stop(t + ms / 1000)
}

/** Plays a sound, optionally later (ms) and higher/lower (pitch multiplies every frequency). */
export const play = (name: Sound, { delay = 0, pitch = 1 }: { delay?: number; pitch?: number } = {}) => {
  if (muted || !ctx || ctx.state !== "running") return
  let t = ctx.currentTime + delay / 1000
  for (const [hz, ms, wave = "square"] of SOUNDS[name]) {
    const freq = hz * pitch
    if (!hz || wave === "noise") {
      if (hz) noiseBurst(ctx, freq, t, ms)
      t += ms / 1000
      continue
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = wave
    osc.frequency.value = freq
    // Short attack and release so blips don't click.
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.06, t + 0.005)
    gain.gain.setValueAtTime(0.06, t + ms / 1000 - 0.01)
    gain.gain.linearRampToValueAtTime(0, t + ms / 1000)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + ms / 1000)
    t += ms / 1000
  }
}

export const isMuted = () => muted
export const setMuted = (value: boolean) => {
  muted = value
  try {
    localStorage.setItem("muted", value ? "1" : "0")
  } catch {}
}
