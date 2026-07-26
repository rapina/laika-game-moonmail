export type MoonmailSound =
    | 'launch' | 'flipper' | 'target' | 'bumper' | 'lane' | 'ramp'
    | 'scoop' | 'lock' | 'save' | 'drain' | 'job' | 'jackpot' | 'super' | 'nudge'

export class MoonmailAudio {
    private ctx: AudioContext | null = null
    private master: GainNode | null = null
    private muted = false
    private lastFlipper = 0

    unlock(): void {
        if (!this.ctx) {
            try {
                this.ctx = new AudioContext()
                this.master = this.ctx.createGain()
                this.master.gain.value = this.muted ? 0 : 0.34
                this.master.connect(this.ctx.destination)
            } catch {
                return
            }
        }
        if (this.ctx.state === 'suspended') void this.ctx.resume()
    }

    setMuted(value: boolean): void {
        this.muted = value
        if (this.master) this.master.gain.value = value ? 0 : 0.34
    }

    setPaused(value: boolean): void {
        if (!this.ctx) return
        if (value) void this.ctx.suspend()
        else if (!this.muted) void this.ctx.resume()
    }

    play(sound: MoonmailSound): void {
        if (!this.ctx || !this.master || this.muted) return
        if (sound === 'flipper') {
            const nowMs = performance.now()
            if (nowMs - this.lastFlipper < 35) return
            this.lastFlipper = nowMs
        }
        const notes: Record<MoonmailSound, [number, number, OscillatorType, number][]> = {
            launch: [[120, 0.05, 'square', 0], [260, 0.09, 'triangle', 0.035]],
            flipper: [[92, 0.045, 'square', 0]],
            target: [[680, 0.07, 'square', 0], [920, 0.04, 'square', 0.04]],
            bumper: [[180, 0.05, 'triangle', 0], [1240, 0.035, 'square', 0]],
            lane: [[740, 0.08, 'triangle', 0], [980, 0.09, 'triangle', 0.07]],
            ramp: [[410, 0.06, 'square', 0], [620, 0.08, 'triangle', 0.055]],
            scoop: [[220, 0.16, 'sine', 0], [330, 0.12, 'triangle', 0.09]],
            lock: [[130, 0.18, 'square', 0], [520, 0.15, 'triangle', 0.14]],
            save: [[520, 0.08, 'triangle', 0], [780, 0.12, 'triangle', 0.08]],
            drain: [[170, 0.16, 'sawtooth', 0], [96, 0.24, 'sawtooth', 0.12]],
            job: [[392, 0.11, 'triangle', 0], [523, 0.11, 'triangle', 0.1], [784, 0.25, 'triangle', 0.2]],
            jackpot: [[523, 0.08, 'square', 0], [784, 0.12, 'triangle', 0.07], [1046, 0.18, 'triangle', 0.15]],
            super: [[392, 0.12, 'triangle', 0], [523, 0.12, 'triangle', 0.1], [659, 0.12, 'triangle', 0.2], [1046, 0.45, 'square', 0.3]],
            nudge: [[74, 0.07, 'sine', 0]],
        }
        for (const [freq, duration, type, delay] of notes[sound]) this.tone(freq, duration, type, delay)
        if (['target', 'bumper', 'flipper', 'nudge'].includes(sound)) this.noise(sound === 'nudge' ? 0.025 : 0.012)
    }

    private tone(freq: number, duration: number, type: OscillatorType, delay: number): void {
        const ctx = this.ctx
        const master = this.master
        if (!ctx || !master) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const start = ctx.currentTime + delay
        osc.type = type
        osc.frequency.setValueAtTime(freq, start)
        if (type === 'sawtooth') osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.65), start + duration)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.004)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
        osc.connect(gain).connect(master)
        osc.start(start)
        osc.stop(start + duration + 0.02)
    }

    private noise(duration: number): void {
        const ctx = this.ctx
        const master = this.master
        if (!ctx || !master) return
        const frames = Math.max(1, Math.floor(ctx.sampleRate * duration))
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
        const source = ctx.createBufferSource()
        const filter = ctx.createBiquadFilter()
        const gain = ctx.createGain()
        source.buffer = buffer
        filter.type = 'bandpass'
        filter.frequency.value = 1100
        gain.gain.value = 0.18
        source.connect(filter).connect(gain).connect(master)
        source.start()
    }
}
