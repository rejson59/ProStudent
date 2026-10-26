export type SoundId = "rain" | "brown" | "waves" | "fire";

type Chain = { gain: GainNode; stop: () => void };

class Ambient {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  chains: Partial<Record<SoundId, Chain>> = {};

  /** Zwraca kontekst audio albo `null`, jeśli przeglądarka go nie wspiera / zablokowała. */
  private context(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") {
        // Autoplay policy: obietnica może zostać odrzucona, gdy brak gestu użytkownika.
        void this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  ensure() {
    return this.context();
  }

  noise(kind: "white" | "pink" | "brown", seconds = 5): AudioBuffer | null {
    const ctx = this.context();
    if (!ctx) return null;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === "white") d[i] = w * 0.5;
        else if (kind === "brown") {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      }
    }
    return buf;
  }

  crackles(seconds = 7): AudioBuffer | null {
    const ctx = this.context();
    if (!ctx) return null;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let i = 0;
    while (i < len) {
      i += Math.floor(ctx.sampleRate * (0.03 + Math.random() * 0.35));
      const amp = 0.2 + Math.random() * 0.8;
      const dur = Math.floor(ctx.sampleRate * (0.002 + Math.random() * 0.012));
      for (let j = 0; j < dur && i + j < len; j++) {
        d[i + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (dur / 4));
      }
    }
    return buf;
  }

  build(id: SoundId): Chain | null {
    const ctx = this.context();
    if (!ctx || !this.master) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master!);
    const stops: (() => void)[] = [];
    const src = (buf: AudioBuffer | null) => {
      if (!buf) return null;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      stops.push(() => s.stop());
      return s;
    };

    const connect = (source: AudioNode | null, ...nodes: AudioNode[]) => {
      if (!source) return false;
      let node: AudioNode = source;
      for (const next of nodes) node = node.connect(next);
      return true;
    };

    if (id === "rain") {
      const s = src(this.noise("pink"));
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6500;
      connect(s, hp, lp, out);
      const drops = src(this.crackles(5));
      const dg = ctx.createGain();
      dg.gain.value = 0.25;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3000;
      connect(drops, bp, dg, out);
    } else if (id === "brown") {
      const s = src(this.noise("brown"));
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      connect(s, lp, out);
    } else if (id === "waves") {
      const s = src(this.noise("pink"));
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      const wg = ctx.createGain();
      wg.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.48;
      lfo.connect(lfoG).connect(wg.gain);
      lfo.start();
      stops.push(() => lfo.stop());
      connect(s, lp, wg, out);
    } else {
      const base = src(this.noise("brown"));
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 350;
      const bg = ctx.createGain();
      bg.gain.value = 0.6;
      connect(base, lp, bg, out);
      const c = src(this.crackles());
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1200;
      const cg = ctx.createGain();
      cg.gain.value = 0.7;
      connect(c, hp, cg, out);
    }

    return {
      gain: out,
      stop: () => {
        stops.forEach((f) => f());
        out.disconnect();
      },
    };
  }

  set(id: SoundId, volume: number) {
    const ctx = this.context();
    if (!ctx) return;
    let chain = this.chains[id];
    if (volume <= 0) {
      if (chain) {
        chain.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        const c = chain;
        delete this.chains[id];
        setTimeout(() => c.stop(), 1200);
      }
      return;
    }
    if (!chain) {
      const built = this.build(id);
      if (!built) return;
      chain = built;
      this.chains[id] = chain;
    }
    chain.gain.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.3);
  }

  chime() {
    const ctx = this.context();
    if (!ctx || !this.master) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + 1.7);
    });
  }
}

export const ambient = new Ambient();
