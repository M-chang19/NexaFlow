// src/SoundEngine.js
// Procedural Web Audio Ambient Sound Generator (100% offline, zero network requests)

class AmbientSoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.currentSource = null;
    this.currentType = "off";
    this.volume = 0.4;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      try {
        this.ctx.resume().catch(() => {});
      } catch {}
    }
    return this.ctx;
  }

  createNoiseBuffer(type = "white") {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const bufferSize = ctx.sampleRate * 4; // 4 second looped buffer
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;

      if (type === "brown") {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5;
      } else if (type === "pink" || type === "rain") {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = pink * 0.11;
      } else {
        data[i] = white * 0.2;
      }
    }
    return buffer;
  }

  start(type) {
    if (type === "off" || !type) {
      this.stop();
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    this.stop();
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
    }
    this.currentType = type;

    if (type === "drone") {
      // Harmonic Zen Drone
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const droneFilter = ctx.createBiquadFilter();
      droneFilter.type = "lowpass";
      droneFilter.frequency.setValueAtTime(320, ctx.currentTime);

      const droneGain = ctx.createGain();
      droneGain.gain.setValueAtTime(0.18, ctx.currentTime);

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(110, ctx.currentTime); // A2
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(164.81, ctx.currentTime); // E3

      osc1.connect(droneGain);
      osc2.connect(droneGain);
      droneGain.connect(droneFilter);
      droneFilter.connect(this.masterGain);

      osc1.start();
      osc2.start();
      this.currentSource = {
        stop: () => {
          try {
            osc1.stop();
            osc2.stop();
            osc1.disconnect();
            osc2.disconnect();
          } catch {}
        }
      };
      return;
    }

    // Rain or Brown noise
    const buffer = this.createNoiseBuffer(type === "rain" ? "rain" : "brown");
    if (!buffer) return;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    if (type === "rain") {
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1200, ctx.currentTime);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);
    } else {
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(450, ctx.currentTime);
    }

    noise.connect(filter);
    filter.connect(this.masterGain);
    noise.start();

    this.currentSource = {
      stop: () => {
        try {
          noise.stop();
          noise.disconnect();
        } catch {}
      }
    };
  }

  stop() {
    if (this.currentSource) {
      if (this.masterGain && this.ctx) {
        try {
          this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
        } catch {}
      }
      const src = this.currentSource;
      this.currentSource = null;
      setTimeout(() => {
        try {
          src.stop();
        } catch {}
      }, 60);
    }
    this.currentType = "off";
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, Number(val) || 0));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }
}

export const soundEngine = new AmbientSoundEngine();
