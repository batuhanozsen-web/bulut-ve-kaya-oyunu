// Mikrofondan üfleme algılama.
// Üfleme sesi gürültü gibidir: frekanslara düzgün yayılır (konuşma ise belirli tonlarda
// yoğunlaşır). Ses seviyesi ortam gürültüsünün belirgin üstündeyse ve spektrum "düz" ise
// üfleme sayılır. Oyunun kendi sesleri ve konuşması çalarken mikrofon yok sayılır.
window.BlowMic = (() => {
  const LEVEL_DB = 16;    // ortam gürültüsünün kaç dB üstü
  const FLATNESS = 0.18;  // spektral düzlük eşiği (0 = saf ton, 1 = beyaz gürültü)
  const HOLD = 0.18;      // en az bu kadar saniye sürmeli

  const state = { active: false, level: 0 };
  let an = null, buf = null, stream = null;
  let floor = null, calib = [];
  let hot = 0, q = false, lastAt = 0, lastT = 0;

  async function init(ctx) {
    if (an || !ctx || !navigator.mediaDevices) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    const src = ctx.createMediaStreamSource(stream);
    an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.2;
    src.connect(an);
    buf = new Float32Array(an.frequencyBinCount);
    floor = null;
    calib = [];
    state.active = true;
  }

  function stop() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    an = null;
    state.active = false;
  }

  function update(now, ignore) {
    if (!an) return;
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    an.getFloatFrequencyData(buf);
    const binHz = an.context.sampleRate / an.fftSize;
    const i0 = Math.max(1, Math.floor(150 / binHz));
    const i1 = Math.min(buf.length - 1, Math.ceil(6000 / binHz));
    let sum = 0, sumLog = 0, n = 0;
    for (let i = i0; i <= i1; i++) {
      const p = Math.pow(10, buf[i] / 10) + 1e-20;
      sum += p;
      sumLog += Math.log(p);
      n++;
    }
    const mean = sum / n;
    const flat = Math.exp(sumLog / n) / mean;
    const db = 10 * Math.log10(mean);
    if (!isFinite(db)) return;

    if (floor === null) {
      calib.push(db);
      if (calib.length >= 30) floor = calib.sort((a, b) => a - b)[15];
      return;
    }
    const over = db - floor;
    state.level = Math.max(0, Math.min(1, over / 30));
    // sessizken ortam seviyesini yavaşça takip et
    if (over < 6) floor += (db - floor) * 0.02;

    const blowing = !ignore && over > LEVEL_DB && flat > FLATNESS;
    hot = blowing ? hot + dt : Math.max(0, hot - dt * 2);
    if (hot > HOLD && now - lastAt > 900) {
      q = true;
      lastAt = now;
      hot = 0;
    }
  }

  return {
    init,
    stop,
    update,
    state,
    consume() { const b = q; q = false; return b; },
  };
})();
