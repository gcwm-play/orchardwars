// Rain and thunder, synthesized with the Web Audio API (no sound files).

export class RainSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private dripTimer = 0;
  muted = false;

  /** Must be called from a click or tap (browsers only allow sound after one). */
  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = this.noise.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    // Steady downpour: a hiss and a softer roar.
    this.bed(3200, 0.6, 0.18);
    this.bed(700, 0.7, 0.22);
    this.bed(220, 0.9, 0.12);
    this.dripTimer = window.setInterval(() => this.drip(), 45);
  }

  private bed(freq: number, q: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    // Slow swells, like gusts.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + Math.random() * 0.08;
    const lg = ctx.createGain();
    lg.gain.value = gain * 0.35;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    src.connect(f).connect(g).connect(this.master!);
    src.start(0, Math.random() * 2);
  }

  /** Single drops hitting awnings and puddles nearby. */
  private drip() {
    const ctx = this.ctx!;
    if (this.muted || Math.random() < 0.4) return;
    const t = ctx.currentTime + Math.random() * 0.04;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500 + Math.random() * 4500;
    f.Q.value = 8;
    const g = ctx.createGain();
    const v = 0.05 + Math.random() * 0.12;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    src.connect(f).connect(g).connect(pan).connect(this.master!);
    src.start(t, Math.random() * 2, 0.1);
  }

  /** A roll of thunder; `distance` 0 (close, sharp crack) to 1 (far, low rumble). */
  thunder(distance: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const dur = 4 + distance * 4;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900 - distance * 600, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.4 - distance * 0.7, t + 0.08 + distance * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  stop() {
    clearInterval(this.dripTimer);
    void this.ctx?.close();
  }
}
