// Basit ses efektleri (WebAudio ile üretilir, dosya gerekmez) + Türkçe sesli yönlendirme.
window.Sound = (() => {
  let ac = null;
  let master = null;
  let muted = false;
  let trVoice = null;

  function ensure() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
      } catch (e) {
        ac = null;
      }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo = null) {
    if (muted || !ensure()) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, freq, vol = 0.3, filterType = 'lowpass', when = 0) {
    if (muted || !ensure()) return;
    const t = ac.currentTime + when;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    trVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('tr')) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function speak(text) {
    if (muted || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'tr-TR';
      if (trVoice) u.voice = trVoice;
      u.rate = 1.0;
      u.pitch = 1.25;
      speechSynthesis.speak(u);
    } catch (e) { /* ses yoksa sessizce devam */ }
  }

  return {
    unlock: ensure,
    speak,
    chime() { tone(660, 0.15, 'triangle', 0.3); tone(990, 0.3, 'triangle', 0.3, 0.12); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, i * 0.12)); },
    jump() { tone(300, 0.25, 'sine', 0.25, 0, 750); },
    whoosh() { noise(0.18, 1400, 0.2, 'bandpass'); },
    crunch() { noise(0.35, 900, 0.6, 'bandpass'); tone(160, 0.2, 'square', 0.08, 0, 60); },
    thunder() { noise(1.4, 180, 0.9, 'lowpass'); noise(0.25, 2000, 0.15, 'highpass'); },
    thump() { tone(150, 0.3, 'sine', 0.5, 0, 50); noise(0.15, 400, 0.3); },
    beep(high) { tone(high ? 880 : 520, 0.18, 'sine', 0.25); },
    setMuted(m) { muted = m; if (m && 'speechSynthesis' in window) speechSynthesis.cancel(); },
    isMuted() { return muted; },
  };
})();
