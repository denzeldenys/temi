// Audio manager: one Web Audio context shared by the shell and every game.
// Sounds are decoded up front so they play instantly and work offline.

const MUTE_KEY = "temi.muted";

class AudioManager {
  constructor() {
    this.buffers = new Map();
    this.active = new Set();
    this.log = []; // last few sounds played (handy when testing)
    this.muted = false;
    try { this.muted = localStorage.getItem(MUTE_KEY) === "1"; } catch {}
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = Ctx ? new Ctx() : null;
    if (this.ctx) {
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    // Go quiet when the app is in the background, come back when it returns.
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx || !this.unlocked) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  /** Call from a user gesture: browsers keep audio blocked until then. */
  async unlock() {
    this.unlocked = true;
    if (this.ctx && this.ctx.state !== "running") {
      try { await this.ctx.resume(); } catch {}
    }
  }

  async load(key, url) {
    if (!this.ctx || this.buffers.has(key)) return;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const data = await res.arrayBuffer();
    const buffer = await new Promise((ok, fail) => {
      const p = this.ctx.decodeAudioData(data, ok, fail); // callback form for old Safari
      if (p && p.catch) p.catch(fail);
    });
    this.buffers.set(key, buffer);
  }

  has(key) { return this.buffers.has(key); }

  /** Play a loaded sound. Resolves when it has finished (or straight away if it can't play). */
  play(key, { volume = 1 } = {}) {
    const buffer = this.buffers.get(key);
    this.log.push({ key, at: Math.round(performance.now()), ok: !!buffer });
    if (this.log.length > 60) this.log.shift();
    if (!buffer) return Promise.resolve();
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.buffer = buffer;
      src.connect(gain).connect(this.master);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.active.delete(src);
        resolve();
      };
      // Safety net so the game never gets stuck if "ended" doesn't fire.
      const timer = setTimeout(finish, buffer.duration * 1000 + 400);
      src.onended = finish;
      src.stopNow = () => { try { src.stop(); } catch {} finish(); };
      this.active.add(src);
      src.start();
    });
  }

  stopAll() {
    for (const src of [...this.active]) src.stopNow();
  }

  setMuted(muted) {
    this.muted = !!muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0"); } catch {}
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
  }
}

export const audio = new AudioManager();
