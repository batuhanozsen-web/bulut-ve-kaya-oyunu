// Kameradan vücut hareketlerini algılar (MediaPipe Pose Landmarker).
// Çıktılar: eğilme (sürekli durum), zıplama ve tekme (tek seferlik olaylar).
window.PoseInput = (() => {
  const MP_VER = '0.10.14';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const CALIB_FRAMES = 30;

  // Eşikler, kalibrasyonda ölçülen gövde boyuna (omuz→kalça) oranla verilir.
  const DUCK_ON = 0.35;   // omuz/burun bu kadar aşağı inerse "eğildi"
  const DUCK_OFF = 0.20;
  const JUMP_RISE = 0.15; // kalça ve omuz bu kadar yükselirse "zıpladı"
  const KNEE_UP = 0.35;   // diz, kalçanın bu kadar altına kadar kalkarsa "tekme"
  const ANKLE_DIFF = 0.45;

  const state = {
    visible: false,
    lastSeen: 0,
    duck: false,
    calibrated: false,
    calibProgress: 0,
    label: '',
  };

  let landmarker = null;
  let video = null;
  let overlay = null;
  let octx = null;
  let stream = null;
  let lastVideoTime = -1;
  let base = null;
  let samples = [];
  let jumpQ = false, kickQ = false;
  let jumpArmed = true, kickArmed = true;
  let lastJumpAt = 0, lastKickAt = 0;
  let flashLabel = '', flashUntil = 0;

  const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16],
    [23, 25], [25, 27], [24, 26], [26, 28]];

  async function init(videoEl, overlayEl, onStatus) {
    video = videoEl;
    overlay = overlayEl;
    octx = overlay.getContext('2d');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Bu tarayıcı kameraya erişemiyor. Sayfayı https:// ya da localhost üzerinden açın.');
    }
    onStatus('Kamera açılıyor…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
      // bazı kameralar istenen ayarları desteklemez: en basit istekle tekrar dene
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    video.srcObject = stream;
    await video.play();

    if (!landmarker) {
      onStatus('Hareket algılayıcı yükleniyor… (ilk seferde biraz sürebilir)');
      const vision = await import(`${CDN}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const opts = delegate => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try {
        landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch (e) {
        landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    }
    recalibrate();
  }

  function stop() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) video.srcObject = null;
    state.visible = false;
  }

  function recalibrate() {
    base = null;
    samples = [];
    state.calibrated = false;
    state.calibProgress = 0;
    state.duck = false;
    jumpQ = kickQ = false;
  }

  function update(now) {
    if (!landmarker || !video || video.readyState < 2) return;
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    let res;
    try {
      res = landmarker.detectForVideo(video, now);
    } catch (e) {
      return;
    }
    const lm = res && res.landmarks && res.landmarks[0];
    if (lm) analyse(lm, now);
    else state.visible = false;
    updateLabel(now);
    draw(lm);
  }

  function analyse(lm, now) {
    const v = i => (lm[i].visibility == null ? 1 : lm[i].visibility);
    if (Math.min(v(11), v(12), v(23), v(24)) < 0.5) {
      state.visible = false;
      if (!base) { samples = []; state.calibProgress = 0; }
      return;
    }
    const sh = (lm[11].y + lm[12].y) / 2;
    const hip = (lm[23].y + lm[24].y) / 2;
    const nose = lm[0].y;
    const torso = hip - sh;
    if (torso < 0.05) { state.visible = false; return; }
    state.visible = true;
    state.lastSeen = now;

    // Kalibrasyon: dik dururken ortalama duruşu kaydet.
    if (!base) {
      const prev = samples[samples.length - 1];
      if (prev && Math.abs(prev.sh - sh) > 0.08 * torso) samples = []; // kıpırdadı, baştan
      samples.push({ sh, hip, nose, torso });
      state.calibProgress = samples.length / CALIB_FRAMES;
      if (samples.length >= CALIB_FRAMES) {
        const avg = k => samples.reduce((a, s) => a + s[k], 0) / samples.length;
        base = { sh: avg('sh'), hip: avg('hip'), nose: avg('nose'), torso: avg('torso') };
        state.calibrated = true;
      }
      return;
    }

    const T = base.torso;
    // Eğilme: omuzlar ya da burun belirgin şekilde aşağı indi mi?
    const drop = Math.max(sh - base.sh, (nose - base.nose) * 0.8) / T;
    if (!state.duck && drop > DUCK_ON) state.duck = true;
    else if (state.duck && drop < DUCK_OFF) state.duck = false;

    // Zıplama: kalça VE omuz birlikte yükseldi mi?
    const rise = Math.min(base.hip - hip, base.sh - sh) / T;
    if (rise > JUMP_RISE && jumpArmed && !state.duck && now - lastJumpAt > 600) {
      jumpQ = true;
      jumpArmed = false;
      lastJumpAt = now;
      flash('Zıpladı ⬆️', now);
    }
    if (rise < 0.06) jumpArmed = true;

    // Tekme: bir diz kalçaya doğru kalktı ya da ayak bilekleri arasında büyük yükseklik farkı var.
    let kick = false;
    if (v(25) > 0.5 && lm[25].y < hip + KNEE_UP * torso) kick = true;
    if (v(26) > 0.5 && lm[26].y < hip + KNEE_UP * torso) kick = true;
    if (v(27) > 0.5 && v(28) > 0.5 && Math.abs(lm[27].y - lm[28].y) > ANKLE_DIFF * torso) kick = true;
    if (drop > DUCK_OFF || rise > 0.1) kick = false; // çömelme/zıplama tekme sayılmasın
    if (kick && kickArmed && now - lastKickAt > 500) {
      kickQ = true;
      kickArmed = false;
      lastKickAt = now;
      flash('Tekme 🦶', now);
    }
    if (!kick) kickArmed = true;

    // Çocuk biraz yer değiştirirse referansı yavaşça güncelle.
    if (!state.duck && !kick && Math.abs(drop) < 0.1 && Math.abs(rise) < 0.08) {
      const a = 0.02;
      base.sh += (sh - base.sh) * a;
      base.hip += (hip - base.hip) * a;
      base.nose += (nose - base.nose) * a;
      base.torso += (torso - base.torso) * a;
    }
  }

  function flash(text, now) { flashLabel = text; flashUntil = now + 600; }

  function updateLabel(now) {
    if (!state.visible) state.label = 'Görünmüyor 👀';
    else if (!state.calibrated) state.label = 'Dik dur 🧍';
    else if (now < flashUntil) state.label = flashLabel;
    else if (state.duck) state.label = 'Eğildi ⬇️';
    else state.label = 'Ayakta 🧍';
  }

  function draw(lm) {
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (overlay.width !== w) { overlay.width = w; overlay.height = h; }
    octx.clearRect(0, 0, w, h);
    if (!lm) return;
    const color = !state.visible ? '#ff6b6b' : state.duck ? '#ffd23f' : '#6bff95';
    octx.lineWidth = Math.max(3, w / 120);
    octx.strokeStyle = color;
    octx.lineCap = 'round';
    for (const [a, b] of BONES) {
      octx.beginPath();
      octx.moveTo(lm[a].x * w, lm[a].y * h);
      octx.lineTo(lm[b].x * w, lm[b].y * h);
      octx.stroke();
    }
    octx.fillStyle = '#fff';
    for (const i of [0, 11, 12, 23, 24, 25, 26, 27, 28]) {
      octx.beginPath();
      octx.arc(lm[i].x * w, lm[i].y * h, w / 110, 0, Math.PI * 2);
      octx.fill();
    }
  }

  return {
    init,
    stop,
    update,
    recalibrate,
    state,
    consumeJump() { const j = jumpQ; jumpQ = false; return j; },
    consumeKick() { const k = kickQ; kickQ = false; return k; },
  };
})();
