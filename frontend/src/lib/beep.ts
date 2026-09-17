let ctx: AudioContext | null = null

/** Two short falling tones: audible over the flywheel without being alarming. */
export function beep(): void {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    ;[880, 660].forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.15)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 0.16)
    })
  } catch {
    /* audio unavailable */
  }
}
