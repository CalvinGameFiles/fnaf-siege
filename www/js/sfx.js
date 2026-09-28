'use strict';
// All sounds are synthesised with WebAudio, so the game ships no audio files.
const Sfx = (() => {
  let ac = null, master = null, noiseBuf = null;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = Store.get('volume');
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  // the first touch anywhere unlocks audio (mobile browsers demand a gesture)
  window.addEventListener('pointerdown', init, { capture: true });

  function setVolume(v) { if (master) master.gain.value = v; }

  function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.3, freq = 1000, q = 1, type = 'lowpass', delay = 0) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  let lastHit = {};
  const SOUNDS = {
    click: () => tone(660, 0.06, 'square', 0.08),
    back: () => tone(440, 0.07, 'square', 0.08, 330),
    boom: () => { noise(0.6, 0.6, 400); tone(90, 0.4, 'sine', 0.5, 40); },
    blast: () => { noise(0.9, 0.8, 600); tone(70, 0.6, 'sine', 0.6, 30); },
    stone: () => { noise(0.25, 0.35, 700); tone(120, 0.15, 'triangle', 0.2, 70); },
    wood: () => { noise(0.18, 0.3, 1400, 2, 'bandpass'); tone(220, 0.1, 'triangle', 0.15, 140); },
    glass: () => { noise(0.35, 0.25, 5000, 1, 'highpass'); tone(2400, 0.2, 'sine', 0.06, 3200); tone(3100, 0.25, 'sine', 0.05, 2000, 0.03); },
    thud: () => noise(0.12, 0.15, 300),
    fire: () => noise(0.5, 0.25, 900, 0.7, 'bandpass'),
    magic: () => { tone(880, 0.3, 'sine', 0.15, 1760); tone(1320, 0.3, 'sine', 0.1, 660, 0.05); },
    dice: () => { for (let i = 0; i < 6; i++) noise(0.04, 0.2, 2500, 3, 'bandpass', i * 0.07); },
    step: () => tone(300, 0.07, 'square', 0.07, 420),
    place: () => tone(200, 0.08, 'triangle', 0.15, 260),
    bad: () => tone(160, 0.15, 'square', 0.08, 110),
    death: () => { tone(500, 0.35, 'sawtooth', 0.12, 80); noise(0.2, 0.2, 1200); },
    flee: () => { tone(700, 0.12, 'square', 0.08, 1100); tone(900, 0.12, 'square', 0.08, 1400, 0.12); },
    turn: () => { tone(523, 0.1, 'square', 0.08); tone(784, 0.15, 'square', 0.08, null, 0.1); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'square', 0.1, null, i * 0.15)),
    draw: () => [523, 523, 440].forEach((f, i) => tone(f, 0.25, 'square', 0.1, null, i * 0.18)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'square', 0.1, null, i * 0.2)),
  };
  function play(name) {
    if (!ac || !SOUNDS[name]) return;
    const now = performance.now();
    if (now - (lastHit[name] || 0) < 45) return;   // a collapsing tower would otherwise fire 100 sounds at once
    lastHit[name] = now;
    SOUNDS[name]();
  }
  return { play, setVolume, init };
})();
