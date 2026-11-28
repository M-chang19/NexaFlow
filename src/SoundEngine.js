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

    if (type === "campfire") {
      // Warm brown noise base + crackle bursts
      const brownBuf = this.createNoiseBuffer("brown");
      if (!brownBuf) return;
      const noise = ctx.createBufferSource();
      noise.buffer = brownBuf;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(380, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, ctx.currentTime);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start();

      let crackleTimer = null;
      const playCrackle = () => {
        if (!this.currentSource || this.currentType !== "campfire") return;
        try {
          const osc = ctx.createOscillator();
          const popGain = ctx.createGain();
          const popFilter = ctx.createBiquadFilter();

          osc.type = Math.random() > 0.5 ? "triangle" : "sawtooth";
          osc.frequency.setValueAtTime(600 + Math.random() * 1400, ctx.currentTime);

          popFilter.type = "highpass";
          popFilter.frequency.setValueAtTime(800, ctx.currentTime);

          popGain.gain.setValueAtTime(0.06 + Math.random() * 0.08, ctx.currentTime);
          popGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04 + Math.random() * 0.06);

          osc.connect(popFilter);
          popFilter.connect(popGain);
          popGain.connect(this.masterGain);

          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        } catch {}

        const nextDelay = 120 + Math.random() * 450;
        crackleTimer = setTimeout(playCrackle, nextDelay);
      };
      playCrackle();

      this.currentSource = {
        stop: () => {
          if (crackleTimer) clearTimeout(crackleTimer);
          try {
            noise.stop();
            noise.disconnect();
          } catch {}
        }
      };
      return;
    }

    if (type === "stream") {
      // Gentle bubbling water stream: pink noise with resonant bandpass + undulating LFO
      const pinkBuf = this.createNoiseBuffer("pink");
      if (!pinkBuf) return;
      const noise = ctx.createBufferSource();
      noise.buffer = pinkBuf;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(550, ctx.currentTime);
      filter.Q.setValueAtTime(2.2, ctx.currentTime);

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.35, ctx.currentTime);
      lfoGain.gain.setValueAtTime(140, ctx.currentTime);
      lfo.connect(filter.frequency);
      lfo.start();

      const streamGain = ctx.createGain();
      streamGain.gain.setValueAtTime(0.38, ctx.currentTime);

      noise.connect(filter);
      filter.connect(streamGain);
      streamGain.connect(this.masterGain);
      noise.start();

      this.currentSource = {
        stop: () => {
          try {
            lfo.stop();
            lfo.disconnect();
            noise.stop();
            noise.disconnect();
          } catch {}
        }
      };
      return;
    }

    if (type === "forest") {
      // Airy forest wind + soft procedural chirps
      const pinkBuf = this.createNoiseBuffer("pink");
      if (!pinkBuf) return;
      const noise = ctx.createBufferSource();
      noise.buffer = pinkBuf;
      noise.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = "lowpass";
      windFilter.frequency.setValueAtTime(650, ctx.currentTime);

      const windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0.18, ctx.currentTime);

      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.masterGain);
      noise.start();

      let chirpTimer = null;
      const playChirp = () => {
        if (!this.currentSource || this.currentType !== "forest") return;
        try {
          const chirpOsc = ctx.createOscillator();
          const chirpGain = ctx.createGain();
          const t = ctx.currentTime;
          const baseFreq = 2400 + Math.random() * 800;

          chirpOsc.type = "sine";
          chirpOsc.frequency.setValueAtTime(baseFreq, t);
          chirpOsc.frequency.exponentialRampToValueAtTime(baseFreq + 1200, t + 0.08);
          chirpOsc.frequency.exponentialRampToValueAtTime(baseFreq + 400, t + 0.18);

          chirpGain.gain.setValueAtTime(0.001, t);
          chirpGain.gain.linearRampToValueAtTime(0.04, t + 0.04);
          chirpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

          chirpOsc.connect(chirpGain);
          chirpGain.connect(this.masterGain);

          chirpOsc.start(t);
          chirpOsc.stop(t + 0.24);
        } catch {}

        const nextChirp = 3200 + Math.random() * 4500;
        chirpTimer = setTimeout(playChirp, nextChirp);
      };
      chirpTimer = setTimeout(playChirp, 1800);

      this.currentSource = {
        stop: () => {
          if (chirpTimer) clearTimeout(chirpTimer);
          try {
            noise.stop();
            noise.disconnect();
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
