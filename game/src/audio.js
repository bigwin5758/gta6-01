// Synthesised sound for Solmar City 3D: every sound is built with WebAudio
// oscillators and filtered noise, so the game ships no audio files. Includes
// 3 synth radio stations (step sequencer, absolute-time scheduling).
// The context is created lazily on the first user gesture (browsers block
// audio before one) and every call is a no-op until it exists.
import { RADIO } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;

  // Radio state.
  let radioGain = null;
  let radioIsOn = false;
  let stationIndex = 0;
  let radioStep = 0;
  let nextStepTime = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      radioGain = ctx.createGain();
      radioGain.gain.value = 0.16;
      radioGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  /** Call from a user gesture (start button, keypress) to unlock audio. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Audio is decoration; a failure never breaks the game.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // Ignore.
    }
  }

  function noteAt(freq, when, dur, type, vol) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, when);
      gain.gain.setValueAtTime(vol, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
      osc.connect(gain);
      gain.connect(radioGain);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    } catch {
      // Ignore.
    }
  }

  function hatAt(when) {
    if (!ctx) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * 0.04));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(radioGain);
      src.start(when);
    } catch {
      // Ignore.
    }
  }

  function scheduleStep(station, step, when) {
    const root = station.root;
    const wave = station.wave;
    // Bass on 0, 4, 8, 12; fifth on 10.
    if (step % 4 === 0) noteAt(root, when, 0.22, wave, 0.5);
    if (step === 10) noteAt(root * 1.5, when, 0.22, wave, 0.45);
    if (station.id === 'solmar') {
      if (step % 4 === 2) {
        const f = root * [4, 5, 6, 5][Math.floor(step / 4) % 4] / 2;
        noteAt(f, when, 0.18, 'triangle', 0.22);
      }
    } else if (station.id === 'rumba') {
      if (step % 2 === 1) {
        const f = root * [2, 2.5, 3, 3.56][step % 4];
        noteAt(f, when, 0.09, 'square', 0.25);
      }
    } else if (station.id === 'night') {
      if (step === 0 || step === 3 || step === 6 || step === 10 || step === 12) {
        const f = root * [1, 1.19, 1.5, 1.78][step % 4] * 2;
        noteAt(f, when, 0.5, 'sine', 0.14);
      }
      if (step === 0 || step === 8) noteAt(root / 2, when, 0.5, 'sine', 0.4);
    }
    if (step % 2 === 1) hatAt(when);
  }

  return {
    unlock,
    /** Short UI click. */
    click() {
      if (!ensure()) return;
      tone(660, 0.06, 'square', 0.12);
    },
    /** Gunshot: sharp noise crack + low thump. */
    shot() {
      if (!ensure()) return;
      noise(0.12, 0.5, 3000);
      tone(160, 0.1, 'sine', 0.35, 60);
    },
    /** Punch: dull thud. */
    punch() {
      if (!ensure()) return;
      noise(0.09, 0.35, 500);
      tone(110, 0.09, 'sine', 0.3, 55);
    },
    /** Crash: heavy noise + low boom. */
    crash() {
      if (!ensure()) return;
      noise(0.25, 0.5, 700);
      tone(90, 0.25, 'sine', 0.4, 40);
    },
    /** Pickup / coin: two bright beeps. */
    pickup() {
      if (!ensure()) return;
      tone(880, 0.08, 'sine', 0.2);
      setTimeout(() => tone(1320, 0.12, 'sine', 0.2), 70);
    },
    /** Mission complete: little major arpeggio. */
    jingle() {
      if (!ensure()) return;
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        setTimeout(() => tone(freq, 0.16, 'triangle', 0.25), i * 110);
      });
    },
    /** Mission failed / busted sting: descending minor. */
    sting() {
      if (!ensure()) return;
      const notes = [392, 330, 262];
      notes.forEach((freq, i) => {
        setTimeout(() => tone(freq, 0.22, 'triangle', 0.22), i * 140);
      });
    },
    /** Continuous engine hum; speed 0..1 sets pitch and volume. Call every frame. */
    engine(speed) {
      if (!ensure()) return;
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 900;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setValueAtTime(55 + speed * 130, ctx.currentTime);
        engineGain.gain.setValueAtTime(speed > 0.02 ? 0.05 + speed * 0.06 : 0, ctx.currentTime);
      } catch {
        // Ignore.
      }
    },
    /** Police siren on/off; alternates two tones while on. */
    siren(on) {
      if (!ensure()) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = 'sine';
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0.06;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          sirenTimer = setInterval(() => {
            sirenHigh = !sirenHigh;
            if (sirenOsc) sirenOsc.frequency.setValueAtTime(sirenHigh ? 880 : 660, ctx.currentTime);
          }, 380);
        } else if (!on && sirenOsc) {
          clearInterval(sirenTimer);
          sirenTimer = null;
          sirenOsc.stop();
          sirenOsc = null;
          sirenGain = null;
        }
      } catch {
        // Ignore.
      }
    },
    /** Radio: start the current station. */
    radioOn() {
      if (!ensure()) return;
      radioIsOn = true;
      radioStep = 0;
      nextStepTime = ctx.currentTime + 0.05;
    },
    /** Radio: stop. */
    radioOff() {
      radioIsOn = false;
    },
    /** Radio: next station. Returns the new station name. */
    cycleRadio() {
      stationIndex = (stationIndex + 1) % RADIO.stations.length;
      radioStep = 0;
      if (ctx) nextStepTime = ctx.currentTime + 0.05;
      return RADIO.stations[stationIndex].name;
    },
    /** Current station name, or '' when the radio is off. */
    radioName() {
      return radioIsOn ? RADIO.stations[stationIndex].name : '';
    },
    /** Called every frame: schedule radio steps ahead of the playhead. */
    radioTick() {
      if (!radioIsOn || !ctx || ctx.state !== 'running') return;
      try {
        const station = RADIO.stations[stationIndex];
        const stepDur = 60 / station.bpm / 2;
        if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
        while (nextStepTime < ctx.currentTime + 0.15) {
          scheduleStep(station, radioStep, nextStepTime);
          radioStep = (radioStep + 1) % 16;
          nextStepTime += stepDur;
        }
      } catch {
        // Ignore.
      }
    },
  };
}
