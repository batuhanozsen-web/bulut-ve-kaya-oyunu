// Bulut, Top ve Su Macerası — ana oyun döngüsü, çizim ve kurallar.
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Ekran ölçüleri ----------
  // U: karakterin boyu (tüm ölçüler buna göre), groundY: zemin çizgisi.
  let W = 0, H = 0, U = 100, groundY = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H * 0.8;
    U = Math.min(H * 0.34, W * 0.25);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Oyun durumu ----------
  const KICK_DUR = 0.55;
  const FLIP_DUR = 0.95;  // takla süresi (s)
  const BLOW_DUR = 0.9;
  const WET_DUR = 5;
  const GRAVITY = 6;     // U / s²
  const JUMP_V = 3.1;    // U / s
  const LEG = 0.16;      // bacak parçası uzunluğu (U)
  const CLOUD_BOTTOM = 0.7; // bulutun alt kenarı zeminden bu kadar yukarıda (U)

  let mode = 'menu'; // menu | calib | countdown | play | paused
  let useCamera = false;
  let score = 0;
  let scroll = 0;
  let speedF = 1;
  let obstacles = [];
  let particles = [];
  let texts = [];
  let spawnTimer = 2.5;
  let lastTypes = [];
  let hint = null;
  let countdown = 0;
  let lastCount = 0;
  let flash = 0;
  let lostT = 0;
  let time = 0;

  const player = {
    x: 0, jumpH: 0, vy: 0, crouch: 0, runPhase: 0,
    kickT: 0, wobbleT: 0, surpriseT: 0, wantDuck: false,
    flipT: 0, blowT: 0, wetT: 0,
  };

  // ---------- Girdi ----------
  const keys = { duck: false };
  let touchDuck = false;

  function doJump() {
    if (mode !== 'play') return;
    if (player.jumpH > 0.5 || player.flipT > 0) return;
    player.vy = JUMP_V * U;
    player.jumpH = 0.01;
    Sound.jump();
    // Yaklaşan su birikintisi ya da top varsa "atlandı" say (çocuklar için cömert zamanlama).
    for (const o of obstacles) {
      if ((o.type !== 'puddle' && o.type !== 'ball') || o.state !== 'come') continue;
      const dx = o.x - player.x;
      if (dx > -0.3 * U && dx < 1.7 * U) o.cleared = true;
    }
  }

  function doKick() {
    if (mode !== 'play') return;
    if (player.kickT > 0 || player.flipT > 0) return;
    player.kickT = KICK_DUR;
    Sound.whoosh();
  }

  // Üfleme: ağızdan rüzgâr çıkar; yaklaşan bulut varsa uçup gider.
  function doBlow() {
    if (mode !== 'play') return;
    if (player.blowT > 0 || player.flipT > 0) return;
    player.blowT = BLOW_DUR;
    Sound.wind();
    const g = girlGeom(player);
    for (let i = 0; i < 16; i++) {
      particles.push({
        kind: 'wind', x: g.headX + 0.14 * U, y: g.headY + 0.06 * U + rand(-0.08, 0.08) * U,
        vx: rand(3, 5.5) * U, vy: rand(-1.2, 0.1) * U, life: 0, max: rand(0.5, 0.9),
        size: rand(0.08, 0.18) * U, rot: rand(0, 6), color: '#ffffff',
      });
    }
    for (const o of obstacles) {
      if (o.type !== 'cloud' || o.hit || o.done || o.blown) continue;
      const dx = o.x - player.x;
      if (dx > -0.2 * U && dx < 3.8 * U) {
        o.blown = true;
        o.done = true;
        o.vx = 3.2 * U;
        o.vy = -1.3 * U;
        success('Bulutu uçurdun!', o.x, cloudY() - 0.2 * U);
        break;
      }
    }
  }

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 's') keys.duck = true;
    else if (k === 'arrowup' || k === 'w' || k === ' ') { doJump(); e.preventDefault(); }
    else if (k === 'arrowright' || k === 'd' || k === 'k') doKick();
    else if (k === 'b' || k === 'u') doBlow();
    else if (k === 'p' || k === 'escape') togglePause();
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 's') keys.duck = false;
  });

  function holdButton(el, on, off) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); on(); });
    const end = () => { el.classList.remove('on'); if (off) off(); };
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.addEventListener(t, end));
  }
  holdButton($('tDuck'), () => { touchDuck = true; }, () => { touchDuck = false; });
  holdButton($('tJump'), doJump);
  holdButton($('tKick'), doKick);
  holdButton($('tBlow'), doBlow);

  // ---------- Ekran akışı ----------
  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  function resetGame() {
    score = 0;
    $('scoreNum').textContent = '0';
    obstacles = [];
    particles = [];
    texts = [];
    spawnTimer = 2.5;
    lastTypes = [];
    hint = null;
    speedF = 1;
    lostT = 0;
    Object.assign(player, { jumpH: 0, vy: 0, crouch: 0, kickT: 0, wobbleT: 0, surpriseT: 0, flipT: 0, blowT: 0, wetT: 0 });
  }

  function startCountdown() {
    show('startScreen', false);
    show('calibScreen', false);
    show('pauseScreen', false);
    show('hud', true);
    show('btnRecal', useCamera);
    show('touchControls', !useCamera);
    show('camBox', useCamera);
    $('camBox').classList.remove('large');
    mode = 'countdown';
    countdown = 3.4;
    lastCount = 0;
    Sound.speak('Hazır mısın? Başlıyoruz!');
  }

  // Ayar ekranındaki kamera listesi ve zoom kaydırıcısı
  async function refreshCamControls() {
    const sel = $('camSelect');
    const cams = await PoseInput.listCameras();
    sel.innerHTML = '';
    for (const c of cams) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = /ultra|geniş|wide|0[.,]5/i.test(c.label) ? `${c.label} ⭐ geniş açı` : c.label;
      sel.appendChild(o);
    }
    if (PoseInput.currentDeviceId) sel.value = PoseInput.currentDeviceId;
    show('camControls', cams.length > 1 || !!PoseInput.zoomCaps);
    sel.parentElement.classList.toggle('hidden', cams.length < 2);
    const z = PoseInput.zoomCaps;
    show('zoomWrap', !!z);
    if (z) {
      const r = $('zoomRange');
      r.min = z.min; r.max = z.max; r.step = z.step || 0.1;
      r.value = PoseInput.state.zoom ?? z.min;
      $('zoomVal').textContent = Number(r.value).toFixed(1) + 'x';
    }
    $('camBox').classList.toggle('rear', PoseInput.state.rearCamera);
  }

  $('camSelect').addEventListener('change', async e => {
    try {
      await PoseInput.switchCamera(e.target.value);
    } catch (err) {
      console.error(err);
    }
    refreshCamControls();
  });
  $('zoomRange').addEventListener('input', e => {
    const v = Number(e.target.value);
    $('zoomVal').textContent = v.toFixed(1) + 'x';
    PoseInput.setZoom(v);
  });

  function goCalib() {
    mode = 'calib';
    refreshCamControls();
    PoseInput.recalibrate();
    show('startScreen', false);
    show('pauseScreen', false);
    show('hud', false);
    show('touchControls', false);
    show('calibScreen', true);
    show('camBox', true);
    $('camBox').classList.add('large');
    Sound.speak('Kameraya bak ve dik dur.');
  }

  // Mikrofon isteğe bağlı: izin verilmezse oyun üflemeyi sadece yüzden algılar.
  async function startMic() {
    try {
      await BlowMic.init(Sound.context());
    } catch (e) {
      console.warn('Mikrofon açılamadı', e);
    }
  }

  function goMenu() {
    mode = 'menu';
    BlowMic.stop();
    if (useCamera) PoseInput.stop();
    useCamera = false;
    resetGame();
    ['hud', 'touchControls', 'camBox', 'calibScreen', 'pauseScreen'].forEach(id => show(id, false));
    show('startScreen', true);
  }

  function togglePause() {
    if (mode === 'play' || mode === 'countdown') {
      mode = 'paused';
      $('pauseScore').textContent = score;
      show('pauseScreen', true);
    } else if (mode === 'paused') {
      show('pauseScreen', false);
      mode = 'play';
    }
  }

  $('btnCamera').addEventListener('click', async () => {
    Sound.unlock();
    show('startError', false);
    useCamera = true;
    resetGame();
    show('startScreen', false);
    show('calibScreen', true);
    show('camBox', true);
    $('camBox').classList.add('large');
    $('calibTitle').textContent = 'Hazırlanıyoruz…';
    $('calibBar').style.width = '0%';
    mode = 'loading';
    try {
      await PoseInput.init($('cam'), $('camOverlay'), msg => { $('calibText').textContent = msg; });
      $('calibText').textContent = 'Mikrofon açılıyor… (bulutu üflemek için)';
      await startMic();
      if (mode === 'loading') goCalib();
    } catch (err) {
      console.error(err);
      goMenu();
      const name = err && err.name;
      const msg = name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Kamera izni verilmedi. Adres çubuğundaki kamera simgesinden izin verip tekrar deneyin.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'Bu cihazda kamera bulunamadı. Kameranın takılı ve açık olduğundan emin olun (Windows: Ayarlar → Gizlilik → Kamera).'
          : name === 'NotReadableError' || name === 'AbortError'
            ? 'Kamera başka bir uygulama tarafından kullanılıyor (Zoom, Teams, Skype vb.). O uygulamayı kapatıp tekrar deneyin.'
            : 'Kamera başlatılamadı: ' + (err && err.message ? err.message : err);
      $('startError').textContent = msg + ' İsterseniz "Dokunarak Oyna" ile oynayabilirsiniz.';
      show('startError', true);
    }
  });

  $('btnTouch').addEventListener('click', () => {
    Sound.unlock();
    useCamera = false;
    resetGame();
    startCountdown();
    startMic();
  });

  $('btnCalibCancel').addEventListener('click', goMenu);
  $('btnPause').addEventListener('click', togglePause);
  $('btnResume').addEventListener('click', togglePause);
  $('btnMenu').addEventListener('click', goMenu);
  $('btnRecal').addEventListener('click', goCalib);
  $('btnSound').addEventListener('click', () => {
    Sound.setMuted(!Sound.isMuted());
    $('btnSound').textContent = Sound.isMuted() ? '🔇' : '🔊';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (mode === 'play' || mode === 'countdown')) togglePause();
  });

  // ---------- Puan ve efektler ----------
  function addText(text, x, y, color = '#ff5fa2', size = 0.22) {
    texts.push({ text, x, y, t: 0, max: 1.4, color, size });
  }

  function burst(x, y, n, kind, colors) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.6, 2.2) * U;
      particles.push({
        kind, x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - U,
        rot: rand(0, 6), vr: rand(-8, 8),
        size: rand(0.03, 0.07) * U,
        life: 0, max: rand(0.8, 1.4),
        color: colors[i % colors.length],
      });
    }
  }

  function success(msg, x, y) {
    score++;
    $('scoreNum').textContent = score;
    const s = $('score');
    s.classList.remove('pop');
    void s.offsetWidth;
    s.classList.add('pop');
    addText(msg, x, y);
    burst(x, y, 10, 'star', ['#ffd23f', '#ffb347', '#fff38a']);
    Sound.chime();
    if (score % 10 === 0) {
      burst(W / 2, H * 0.3, 60, 'confetti', ['#ff5fa2', '#4cb3ff', '#ffd23f', '#6bd66b', '#b57bff']);
      addText(`${score} yıldız! 🎉`, W / 2, H * 0.35, '#b57bff', 0.3);
      Sound.fanfare();
      Sound.speak(`Harikasın! ${score} yıldız topladın!`);
    } else {
      Sound.speak(msg.replace(/[^\p{L}\s!]/gu, '').trim());
    }
  }

  // ---------- Engeller ----------
  // bulut: eğil ya da üfle · top: vur (tekme) · su birikintisi: zıpla
  function spawn() {
    const types = ['cloud', 'ball', 'puddle'].filter(t => t !== lastTypes[0]);
    const type = types[Math.floor(Math.random() * types.length)];
    lastTypes.unshift(type);
    lastTypes.length = Math.min(lastTypes.length, 2);
    const x = W + U;
    if (type === 'cloud') {
      obstacles.push({ type, x, w: 1.25 * U, h: 0.5 * U, hit: false, blown: false, done: false, stormT: 0, hinted: false, wob: rand(0, 6), by: 0, vx: 0, vy: 0, spin: 0 });
    } else if (type === 'ball') {
      const r = 0.16 * U;
      obstacles.push({ type, x, y: groundY - r, r, state: 'come', rot: 0, vx: 0, vy: 0, cleared: false, done: false, hinted: false, life: 0 });
    } else {
      obstacles.push({ type, x, w: 1.0 * U, state: 'come', cleared: false, done: false, hinted: false });
    }
  }

  function updateObstacles(dt, v, moving) {
    const g = girlGeom(player);
    const textY = g.top - 0.2 * U;
    for (const o of obstacles) {
      if (o.type === 'cloud') updateCloud(o, dt, v, moving, g, textY);
      else if (o.type === 'ball') updateBall(o, dt, v, moving, textY);
      else updatePuddle(o, dt, v, moving, textY);
    }
    obstacles = obstacles.filter(o => o.x > -2 * U && o.x < W + 3 * U && !(o.type === 'ball' && o.life > 4));
  }

  function updateCloud(o, dt, v, moving, g, textY) {
    if (o.blown) {
      // üflenen bulut dönerek uzaklaşır
      o.x += o.vx * dt;
      o.by += o.vy * dt;
      o.spin += dt * 2.5;
      return;
    }
    if (moving) o.x -= v * dt;
    if (o.stormT > 0) {
      o.stormT -= dt;
      for (let i = 0; i < 3; i++) {
        particles.push({
          kind: 'rain', x: o.x + rand(-0.4, 0.4) * o.w, y: cloudY() + 0.2 * U,
          vx: -0.3 * U, vy: rand(3, 4) * U, life: 0, max: 0.6, size: 0.08 * U, color: '#7fc4ff',
        });
      }
    }
    const dx = Math.abs(o.x - player.x);
    if (!o.hit && !o.done && dx < o.w * 0.35 + 0.12 * U && g.top < groundY - CLOUD_BOTTOM * U) {
      o.hit = true;
      o.stormT = 2.2;
      flash = 1;
      player.surpriseT = 1.2;
      player.wobbleT = 0.6;
      player.wetT = Math.max(player.wetT, 3);
      Sound.thunder();
      addText('Fırtına! ⛈️', player.x, textY, '#5b6b8c');
    }
    if (!o.hit && !o.done && o.x < player.x - 0.6 * U) {
      o.done = true;
      success('Süper eğildin!', player.x, textY);
    }
  }

  function updateBall(o, dt, v, moving, textY) {
    if (o.state === 'come') {
      if (moving) {
        o.x -= v * dt;
        o.rot -= (v / o.r) * dt; // sola yuvarlanır
      }
      const dx = o.x - player.x;
      if (player.jumpH > 0.3 * U && Math.abs(dx) < 0.4 * U) o.cleared = true;
      // vuruş: top havaya uçar
      if (player.kickT > 0 && dx > -0.2 * U && dx < 1.1 * U) {
        o.state = 'kicked';
        o.done = true;
        o.vx = 3.6 * U;
        o.vy = -3.4 * U;
        Sound.kickBall();
        burst(o.x, o.y, 8, 'star', ['#ffd23f', '#fff38a']);
        success('Süper vuruş!', o.x, o.y - 0.6 * U);
        return;
      }
      // vuramazsa: topa çarpar ve bir takla atar
      if (!o.cleared && Math.abs(dx) < 0.3 * U && player.jumpH < 0.25 * U) {
        o.state = 'bounce';
        o.done = true;
        o.vx = 1.8 * U;
        o.vy = -2.4 * U;
        player.flipT = FLIP_DUR;
        player.kickT = 0;
        player.surpriseT = FLIP_DUR + 0.3;
        Sound.boing();
        burst(player.x, groundY, 6, 'dust', ['#d9c7a3', '#c9b48c']);
        addText('Takla! 🤸', player.x, textY - 0.3 * U, '#b5338a');
      }
      if (o.cleared && !o.done && dx < -0.5 * U) {
        o.done = true;
        success('Harika zıpladın!', player.x, textY);
      }
    } else {
      o.life += dt;
      o.x += o.vx * dt;
      o.vy += GRAVITY * U * dt;
      o.y += o.vy * dt;
      o.rot += (o.vx / o.r) * dt;
      if (o.y > groundY - o.r) {
        o.y = groundY - o.r;
        if (Math.abs(o.vy) > 0.6 * U) Sound.thump();
        o.vy = -o.vy * 0.6;
        o.vx *= 0.9;
      }
      if (o.state === 'kicked' && Math.random() < 0.5) {
        particles.push({ kind: 'star', x: o.x, y: o.y, vx: 0, vy: 0, rot: 0, vr: 3, size: 0.03 * U, life: 0, max: 0.5, color: '#fff38a' });
      }
    }
  }

  function updatePuddle(o, dt, v, moving, textY) {
    if (moving) o.x -= v * dt;
    if (o.state !== 'come') return;
    const dx = o.x - player.x;
    if (player.jumpH > 0.2 * U && Math.abs(dx) < 0.45 * U) o.cleared = true;
    // zıplamazsa: şlap! su sıçrar, karakter ıslanır
    if (!o.cleared && Math.abs(dx) < 0.3 * U && player.jumpH < 0.15 * U) {
      o.state = 'splashed';
      o.done = true;
      player.wetT = WET_DUR;
      player.surpriseT = 1;
      Sound.splash();
      for (let i = 0; i < 26; i++) {
        particles.push({
          kind: 'drop', x: player.x + rand(-0.3, 0.3) * U, y: groundY,
          vx: rand(-1.2, 1.2) * U, vy: rand(-3.6, -1.8) * U, life: 0, max: 1.2,
          size: rand(0.025, 0.05) * U, color: i % 2 ? '#5ec8ff' : '#a9e2ff',
        });
      }
      addText('Şlap! Islandık 💦', player.x, textY, '#2a7fc2');
    }
    if (o.cleared && !o.done && dx < -0.6 * U) {
      o.done = true;
      success('Harika zıpladın!', player.x, textY);
    }
  }

  const HINTS = {
    cloud: { text: '☁️ EĞİL ⬇️ ya da ÜFLE 💨', say: 'Bulut geliyor! Eğil ya da üfle!', color: '#5b6b8c' },
    ball: { text: '⚽ TOPA VUR! 🦶', say: 'Top geliyor, vur!', color: '#e2468f' },
    puddle: { text: '💧 ZIPLA! ⬆️', say: 'Su birikintisi! Zıpla!', color: '#2a7fc2' },
  };

  function cloudY() { return groundY - (CLOUD_BOTTOM + 0.25) * U; }

  // ---------- Güncelleme ----------
  function update(dt, now) {
    time += dt;

    if (useCamera) {
      PoseInput.update(now);
      if (PoseInput.consumeJump()) doJump();
      if (PoseInput.consumeKick()) doKick();
      if (PoseInput.consumeBlow()) doBlow();
      $('camState').textContent = PoseInput.state.label + (BlowMic.state.active ? ' 🎤' : '');
    }
    BlowMic.update(now, Sound.busy() || mode !== 'play');
    if (BlowMic.consume()) doBlow();

    if (mode === 'calib') {
      const st = PoseInput.state;
      $('calibBar').style.width = Math.round(clamp(st.calibProgress, 0, 1) * 100) + '%';
      if (!st.visible) {
        $('calibIcon').textContent = '👀';
        $('calibTitle').textContent = 'Seni göremiyorum';
        $('calibText').textContent = 'Kameradan geri çekil. Başından dizlerine kadar görünmen yeterli. Sığmıyorsan aşağıdan geniş açılı kamerayı seç.';
      } else {
        $('calibIcon').textContent = '🧍‍♀️';
        $('calibTitle').textContent = 'Harika! Kıpırdamadan dur…';
        $('calibText').textContent = 'Kollarını yanına koy ve dik dur.';
      }
      if (st.calibrated) startCountdown();
    }

    if (mode === 'countdown') {
      countdown -= dt;
      const n = Math.ceil(countdown - 0.4);
      if (n !== lastCount && n >= 1 && n <= 3) { Sound.beep(false); lastCount = n; }
      if (countdown <= 0) { mode = 'play'; Sound.beep(true); }
    }

    // kamera modunda çocuk kadrajdan çıkarsa dünya bekler
    let moving = mode === 'play';
    if (mode === 'play' && useCamera) {
      lostT = PoseInput.state.visible ? 0 : lostT + dt;
      if (lostT > 1) moving = false;
    }

    speedF = Math.min(1.35, 1 + score * 0.012);
    const v = mode === 'menu' || mode === 'loading' || mode === 'calib' || mode === 'countdown'
      ? 0.6 * U
      : moving ? speedF * U : 0;
    scroll += v * dt;

    // oyuncu
    player.x = W * 0.26;
    player.wantDuck = keys.duck || touchDuck || (useCamera && PoseInput.state.duck && mode === 'play');
    const flipping = player.flipT > 0;
    const target = flipping ? 1 : player.wantDuck && player.jumpH <= 0 ? 1 : 0;
    player.crouch += (target - player.crouch) * Math.min(1, dt * 14);
    if (flipping) {
      // takla: küçük bir sıçrayışla havada tam tur
      player.flipT = Math.max(0, player.flipT - dt);
      const k = 1 - player.flipT / FLIP_DUR;
      player.jumpH = 0.6 * U * Math.sin(Math.PI * k);
      player.vy = 0;
      if (player.flipT === 0) {
        player.jumpH = 0;
        burst(player.x, groundY, 5, 'dust', ['#d9c7a3', '#c9b48c']);
      }
    } else if (player.jumpH > 0) {
      let g = GRAVITY * U;
      // atlanan su birikintisinin / topun üstünde biraz süzül
      const assist = obstacles.some(o => (o.type === 'puddle' || o.type === 'ball') && o.cleared && o.state === 'come' &&
        o.x - player.x > -0.55 * U && o.x - player.x < 0.8 * U);
      if (assist && player.jumpH < 0.45 * U) player.vy = Math.max(player.vy, (0.45 * U - player.jumpH) * 4);
      else if (assist && player.vy < 0) g *= 0.25;
      player.vy -= g * dt;
      player.jumpH += player.vy * dt;
      if (player.jumpH <= 0) {
        player.jumpH = 0;
        player.vy = 0;
        burst(player.x, groundY, 5, 'dust', ['#d9c7a3', '#c9b48c']);
      }
    }
    player.runPhase += dt * (v > 0 ? 9 * (v / U) : 0);
    if (player.kickT > 0) player.kickT = Math.max(0, player.kickT - dt);
    if (player.wobbleT > 0) player.wobbleT = Math.max(0, player.wobbleT - dt);
    if (player.surpriseT > 0) player.surpriseT = Math.max(0, player.surpriseT - dt);
    if (player.blowT > 0) player.blowT = Math.max(0, player.blowT - dt);
    if (player.wetT > 0) {
      player.wetT = Math.max(0, player.wetT - dt);
      // ıslak: saçtan ve elbiseden damlalar
      if (Math.random() < dt * 10) {
        const g = girlGeom(player);
        particles.push({
          kind: 'drop', x: player.x + rand(-0.18, 0.18) * U, y: rand(g.top + 0.05 * U, g.hipY), vx: 0, vy: 0.3 * U,
          life: 0, max: 0.8, size: 0.022 * U, color: '#5ec8ff',
        });
      }
    }

    // engeller
    if (mode === 'play') {
      if (moving) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawn();
          spawnTimer = rand(3.8, 5.0) / speedF;
        }
      }
      updateObstacles(dt, v, moving);
      // uyarı
      for (const o of obstacles) {
        const dx = o.x - player.x;
        if (!o.hinted && dx > 0 && dx < 3.4 * U && !o.done) {
          o.hinted = true;
          hint = { type: o.type, t: 2.2 };
          Sound.speak(HINTS[o.type].say);
        }
      }
    } else if (mode === 'paused') {
      // hiçbir şey
    }
    if (hint) { hint.t -= dt; if (hint.t <= 0) hint = null; }

    // parçacıklar
    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'drop') p.vy += 6 * U * dt;
      if (p.kind === 'confetti' || p.kind === 'star') p.vy += 2 * U * dt;
      if (p.kind === 'dust') { p.vy *= 0.9; p.vx *= 0.9; }
      if (p.kind === 'wind') { p.vx *= 0.97; }
      if (p.vr) p.rot += p.vr * dt;
      if ((p.kind === 'rain' || p.kind === 'drop') && p.y > groundY && p.vy > 0) p.life = p.max;
    }
    particles = particles.filter(p => p.life < p.max);
    for (const t of texts) t.t += dt;
    texts = texts.filter(t => t.t < t.max);
    flash = Math.max(0, flash - dt * 2.5);
  }

  // ---------- Çizim yardımcıları ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }

  function cloudPath(x, y, w, h) {
    const r = h * 0.5;
    ctx.beginPath();
    circle(x - w * 0.3, y + h * 0.1, r * 0.8);
    circle(x - w * 0.1, y - h * 0.15, r);
    circle(x + w * 0.15, y - h * 0.1, r * 0.9);
    circle(x + w * 0.33, y + h * 0.1, r * 0.7);
    ctx.moveTo(x + w * 0.45, y + h * 0.15);
    ctx.ellipse(x, y + h * 0.15, w * 0.45, h * 0.3, 0, 0, Math.PI * 2);
  }

  function star(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  // ---------- Arka plan ----------
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#6ec6ff');
    sky.addColorStop(1, '#d7f1ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // güneş
    const sx = W * 0.86, sy = H * 0.17, sr = 0.28 * U;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(time * 0.3);
    ctx.fillStyle = 'rgba(255, 220, 90, .5)';
    for (let i = 0; i < 10; i++) {
      ctx.rotate(Math.PI / 5);
      ctx.beginPath();
      ctx.moveTo(sr * 1.15, -sr * 0.12);
      ctx.lineTo(sr * 1.6, 0);
      ctx.lineTo(sr * 1.15, sr * 0.12);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); circle(sx, sy, sr); ctx.fill();
    ctx.fillStyle = '#7a5a00';
    ctx.beginPath(); circle(sx - sr * 0.3, sy - sr * 0.1, sr * 0.08); circle(sx + sr * 0.3, sy - sr * 0.1, sr * 0.08); ctx.fill();
    ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = sr * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(sx, sy + sr * 0.1, sr * 0.35, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();

    // uzak süs bulutları
    ctx.fillStyle = 'rgba(255, 255, 255, .8)';
    for (let i = 0; i < 4; i++) {
      const span = W + 2 * U;
      const x = ((i * span / 4 - scroll * 0.15) % span + span) % span - U;
      const y = H * (0.1 + (i % 2) * 0.12);
      cloudPath(x, y, 0.8 * U, 0.3 * U);
      ctx.fill();
    }

    // tepeler
    hills(0.2, H * 0.62, 0.12 * H, '#a8e08f', 1.3);
    hills(0.45, H * 0.7, 0.09 * H, '#86d06f', 0.8);

    // zemin
    ctx.fillStyle = '#6cbf4f';
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = '#e8d3a2';
    ctx.fillRect(0, groundY + 0.06 * U, W, 0.12 * U);
    ctx.fillStyle = '#58a83e';
    ctx.fillRect(0, groundY, W, 0.05 * U);
    // çimen ve çiçekler
    const step = 0.9 * U;
    const off = scroll % step;
    for (let x = -off; x < W + step; x += step) {
      const idx = Math.round((x + scroll) / step);
      ctx.fillStyle = '#4f9a37';
      ctx.beginPath();
      ctx.moveTo(x, groundY + 0.35 * U);
      ctx.lineTo(x + 0.05 * U, groundY + 0.22 * U);
      ctx.lineTo(x + 0.1 * U, groundY + 0.35 * U);
      ctx.fill();
      if (idx % 3 === 0) {
        const fx = x + 0.4 * U, fy = groundY + 0.5 * U;
        ctx.fillStyle = ['#ff8fc2', '#fff', '#ffd84a'][Math.abs(idx) % 3];
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = k * Math.PI * 2 / 5;
          circle(fx + Math.cos(a) * 0.05 * U, fy + Math.sin(a) * 0.05 * U, 0.04 * U);
        }
        ctx.fill();
        ctx.fillStyle = '#ffb000';
        ctx.beginPath(); circle(fx, fy, 0.03 * U); ctx.fill();
      }
    }
  }

  function hills(par, baseY, amp, color, freq) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= W + 10; x += 10) {
      const wx = (x + scroll * par) / (U * 3) * freq;
      ctx.lineTo(x, baseY - amp * (0.5 + 0.35 * Math.sin(wx) + 0.15 * Math.sin(wx * 2.3 + 1)));
    }
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- Engel çizimi ----------
  function drawCloudObstacle(o) {
    const y = cloudY() + o.by + Math.sin(time * 2 + o.wob) * 0.03 * U;
    const storm = o.stormT > 0;
    ctx.save();
    if (o.blown) {
      const sc = Math.max(0.3, 1 - o.spin * 0.25);
      ctx.translate(o.x, y);
      ctx.rotate(o.spin);
      ctx.scale(sc, sc);
      ctx.translate(-o.x, -y);
    }
    if (storm) {
      // şimşek
      if (Math.sin(time * 30) > 0.2) drawBolt(o.x + 0.1 * o.w, y + 0.2 * U, groundY - 0.2 * U);
      if (Math.sin(time * 23 + 1) > 0.5) drawBolt(o.x - 0.25 * o.w, y + 0.2 * U, groundY - 0.4 * U);
    }
    const grad = ctx.createLinearGradient(0, y - o.h, 0, y + o.h * 0.5);
    if (storm) { grad.addColorStop(0, '#7b8497'); grad.addColorStop(1, '#434b5c'); }
    else { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#dbe9f7'); }
    // kenar çizgisi önce, dolgu üstüne: iç daire çizgileri görünmesin
    cloudPath(o.x, y, o.w, o.h);
    ctx.strokeStyle = storm ? '#2f3542' : '#b9cde3';
    ctx.lineWidth = 0.04 * U;
    ctx.stroke();
    ctx.fillStyle = grad;
    ctx.fill();
    // yüz
    const ex = o.x - 0.12 * o.w, ey = y;
    ctx.fillStyle = storm ? '#fff' : '#3b2a4a';
    ctx.beginPath();
    if (storm) {
      circle(ex, ey, 0.035 * U); circle(ex + 0.2 * o.w, ey, 0.035 * U);
    } else {
      ctx.ellipse(ex, ey, 0.025 * U, 0.035 * U, 0, 0, Math.PI * 2);
      ctx.moveTo(ex + 0.2 * o.w + 0.025 * U, ey);
      ctx.ellipse(ex + 0.2 * o.w, ey, 0.025 * U, 0.035 * U, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.strokeStyle = storm ? '#fff' : '#3b2a4a';
    ctx.lineWidth = 0.018 * U;
    ctx.beginPath();
    if (storm) { circle(o.x - 0.02 * o.w, y + 0.09 * U, 0.03 * U); }
    else ctx.arc(o.x - 0.02 * o.w, y + 0.05 * U, 0.05 * U, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    if (!storm) {
      ctx.fillStyle = 'rgba(255, 140, 180, .45)';
      ctx.beginPath(); circle(ex - 0.06 * U, ey + 0.05 * U, 0.03 * U); circle(ex + 0.2 * o.w + 0.06 * U, ey + 0.05 * U, 0.03 * U); ctx.fill();
    }
    ctx.restore();
  }

  function drawBolt(x, y1, y2) {
    const seed = Math.floor(time * 12);
    let s = seed * 9301 + 49297;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    ctx.save();
    ctx.strokeStyle = '#fff59a';
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 0.15 * U;
    ctx.lineWidth = 0.045 * U;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y1);
    const n = 6;
    for (let i = 1; i <= n; i++) ctx.lineTo(x + (r() - 0.5) * 0.35 * U, y1 + (y2 - y1) * i / n);
    ctx.stroke();
    ctx.restore();
  }

  function drawBall(o) {
    // gölge
    const lift = clamp(1 - (groundY - o.r - o.y) / (2 * U), 0.2, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, .15)';
    ctx.beginPath(); ctx.ellipse(o.x, groundY + 0.01 * U, o.r * 1.05 * lift, o.r * 0.22 * lift, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    // renkli plaj topu dilimleri
    const cols = ['#ff4d6d', '#ffd23f', '#4cb3ff', '#ffffff', '#6bd66b', '#ffffff'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, o.r, i * Math.PI / 3, (i + 1) * Math.PI / 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); circle(0, 0, o.r * 0.2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0, 0, 0, .25)';
    ctx.lineWidth = 0.015 * U;
    ctx.beginPath(); circle(o.x, o.y, o.r); ctx.stroke();
    // parlaklık (dönmez)
    ctx.fillStyle = 'rgba(255, 255, 255, .55)';
    ctx.beginPath(); ctx.ellipse(o.x - o.r * 0.35, o.y - o.r * 0.4, o.r * 0.28, o.r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
  }

  function drawPuddle(o) {
    const splashed = o.state === 'splashed';
    const w = o.w * (splashed ? 0.75 : 1);
    const cy = groundY + 0.035 * U;
    const grad = ctx.createLinearGradient(0, cy - 0.06 * U, 0, cy + 0.06 * U);
    grad.addColorStop(0, '#9fe0ff');
    grad.addColorStop(1, '#3d9be0');
    ctx.fillStyle = 'rgba(40, 110, 170, .35)';
    ctx.beginPath(); ctx.ellipse(o.x, cy + 0.01 * U, w / 2 + 0.03 * U, 0.075 * U, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(o.x, cy, w / 2, 0.065 * U, 0, 0, Math.PI * 2); ctx.fill();
    // dalgacıklar
    ctx.strokeStyle = 'rgba(255, 255, 255, .7)';
    ctx.lineWidth = 0.012 * U;
    for (let i = 0; i < 2; i++) {
      const k = (time * 0.8 + i * 0.5) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.ellipse(o.x + (i ? 0.15 : -0.12) * U, cy, 0.05 * U + k * 0.18 * U, 0.012 * U + k * 0.035 * U, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, .8)';
    ctx.beginPath(); ctx.ellipse(o.x - w * 0.22, cy - 0.025 * U, 0.06 * U, 0.012 * U, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- Karakter ----------
  function girlGeom(p) {
    const s = U, c = p.crouch;
    const bottom = groundY - p.jumpH;
    const hipY = bottom - 2 * LEG * s * Math.cos(1.1 * c);
    const hipX = p.x;
    const lean = 0.12 * s * c;
    const torso = 0.3 * s * (1 - 0.3 * c);
    const shX = hipX + lean, shY = hipY - torso;
    const headR = 0.16 * s;
    const headX = shX + lean * 0.5, headY = shY - headR * 0.95 + 0.08 * s * c;
    return { bottom, hipX, hipY, shX, shY, headX, headY, headR, top: headY - headR - 0.03 * s };
  }

  function segs(x, y, len, a1, a2) {
    const kx = x + Math.sin(a1) * len, ky = y + Math.cos(a1) * len;
    return [kx, ky, kx + Math.sin(a2) * len, ky + Math.cos(a2) * len];
  }

  function limb(x, y, pts, w, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(pts[0], pts[1]);
    ctx.lineTo(pts[2], pts[3]);
    ctx.stroke();
  }

  function drawGirl(p) {
    const g = girlGeom(p);
    const s = U, c = p.crouch;
    const skin = '#ffd9b8', skinDark = '#f2c29c';

    // gölge
    const sh = clamp(1 - p.jumpH / (1.2 * U), 0.3, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, .18)';
    ctx.beginPath(); ctx.ellipse(p.x, groundY + 0.02 * U, 0.22 * U * sh, 0.05 * U * sh, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    if (p.flipT > 0) {
      // takla: gövdenin ortası etrafında geriye doğru tam tur
      const k = 1 - p.flipT / FLIP_DUR;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const cx = g.hipX + 0.05 * U, cy = g.hipY - 0.1 * U;
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI * 2 * e);
      ctx.translate(-cx, -cy);
    }
    if (p.wobbleT > 0) {
      const a = Math.sin(p.wobbleT * 25) * 0.15 * (p.wobbleT / 0.8);
      ctx.translate(g.hipX, g.bottom);
      ctx.rotate(a);
      ctx.translate(-g.hipX, -g.bottom);
    }

    const air = p.jumpH > 0.5 && p.flipT <= 0;
    const ph = p.runPhase;
    const wet = p.wetT > 0;
    const kickA = p.kickT > 0 ? Math.sin(Math.PI * (1 - p.kickT / KICK_DUR)) : 0;

    // bacak açıları [uyluk, baldır] — pozitif = ileri
    let legs;
    if (air) legs = [[0.8, -0.1], [-0.3, -1.0]];
    else {
      const sw = 0.55 * (1 - c);
      const a1 = Math.sin(ph) * sw + 1.1 * c;
      const a2 = -Math.sin(ph) * sw + 1.1 * c;
      legs = [
        [a1, a1 - 2.2 * c - 0.7 * Math.max(0, -Math.sin(ph)) * (1 - c)],
        [a2, a2 - 2.2 * c - 0.7 * Math.max(0, Math.sin(ph)) * (1 - c)],
      ];
    }
    if (kickA > 0) {
      legs[0] = [legs[0][0] * (1 - kickA) + 1.5 * kickA, legs[0][1] * (1 - kickA) + 1.5 * kickA];
      legs[1] = [legs[1][0] * (1 - kickA) - 0.25 * kickA, legs[1][1] * (1 - kickA) - 0.25 * kickA];
    }

    // kol açıları (aşağıdan ölçülür)
    let arms;
    if (air) arms = [[2.7, 3.0], [2.5, 2.9]];
    else if (c > 0.3) arms = [[2.4 * c, 2.9 * c], [2.2 * c, 2.8 * c]];
    else {
      const sw = 0.7;
      arms = [[-Math.sin(ph) * sw, -Math.sin(ph) * sw + 0.5], [Math.sin(ph) * sw, Math.sin(ph) * sw + 0.5]];
    }
    if (kickA > 0) arms = [[-1.2 * kickA, -0.8 * kickA], [1.1 * kickA, 1.5 * kickA]];
    if (p.surpriseT > 0 && !air && c < 0.3) arms = [[2.6, 2.4], [2.3, 2.1]];

    const legW = 0.075 * s, armW = 0.06 * s;
    const aY = g.shY + 0.04 * s;

    // arka kol ve bacak
    const back = segs(g.hipX - 0.03 * s, g.hipY, LEG * s, legs[1][0], legs[1][1]);
    limb(g.hipX - 0.03 * s, g.hipY, back, legW, skinDark);
    shoe(back[2], back[3], legs[1][1]);
    const bArm = segs(g.shX - 0.05 * s, aY, 0.13 * s, arms[1][0], arms[1][1]);
    limb(g.shX - 0.05 * s, aY, bArm, armW, skinDark);

    // elbise (ıslanınca koyulaşır)
    ctx.fillStyle = wet ? '#d93d86' : '#ff5fa2';
    ctx.beginPath();
    ctx.moveTo(g.shX - 0.085 * s, g.shY);
    ctx.lineTo(g.shX + 0.085 * s, g.shY);
    ctx.lineTo(g.hipX + 0.19 * s, g.hipY + 0.06 * s);
    ctx.quadraticCurveTo(g.hipX, g.hipY + 0.11 * s, g.hipX - 0.19 * s, g.hipY + 0.06 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .7)';
    ctx.beginPath();
    circle((g.shX + g.hipX) / 2, (g.shY + g.hipY) / 2, 0.02 * s);
    circle(g.hipX - 0.09 * s, g.hipY + 0.02 * s, 0.02 * s);
    circle(g.hipX + 0.1 * s, g.hipY + 0.03 * s, 0.02 * s);
    ctx.fill();

    // ön bacak
    const front = segs(g.hipX + 0.03 * s, g.hipY, LEG * s, legs[0][0], legs[0][1]);
    limb(g.hipX + 0.03 * s, g.hipY, front, legW, skin);
    shoe(front[2], front[3], legs[0][1]);
    if (kickA > 0.6) {
      ctx.fillStyle = 'rgba(255, 230, 80, .8)';
      star(front[2] + 0.08 * s, front[3], 0.08 * s * kickA, time * 5);
      ctx.fill();
    }

    // kafa
    const hx = g.headX, hy = g.headY, hr = g.headR;
    const bob = Math.sin(ph * 2) * 0.015 * s;
    ctx.fillStyle = '#6b3e26';
    ctx.beginPath();
    circle(hx - hr * 1.0, hy - 0.01 * s + bob, 0.075 * s);  // kuyruklar
    circle(hx + hr * 0.95, hy - 0.03 * s - bob, 0.07 * s);
    ctx.fill();
    ctx.fillStyle = '#ff5fa2';
    ctx.beginPath(); circle(hx - hr * 0.8, hy - 0.05 * s + bob, 0.025 * s); circle(hx + hr * 0.78, hy - 0.07 * s - bob, 0.025 * s); ctx.fill();
    ctx.fillStyle = '#6b3e26';
    ctx.beginPath(); circle(hx, hy - 0.01 * s, hr * 1.05); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); circle(hx + 0.02 * s, hy + 0.025 * s, hr * 0.86); ctx.fill();
    // kâkül
    ctx.fillStyle = '#6b3e26';
    ctx.beginPath();
    ctx.ellipse(hx - 0.03 * s, hy - 0.09 * s, hr * 0.75, hr * 0.32, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // fiyonk
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(hx + 0.02 * s, hy - hr * 1.02);
    ctx.lineTo(hx - 0.06 * s, hy - hr * 1.3);
    ctx.lineTo(hx - 0.06 * s, hy - hr * 0.8);
    ctx.closePath();
    ctx.moveTo(hx + 0.02 * s, hy - hr * 1.02);
    ctx.lineTo(hx + 0.1 * s, hy - hr * 1.3);
    ctx.lineTo(hx + 0.1 * s, hy - hr * 0.8);
    ctx.closePath();
    ctx.fill();
    // ıslak saçta su damlaları
    if (wet) {
      ctx.fillStyle = '#7fd0ff';
      for (const [ox, oy] of [[-0.09, -0.12], [0.05, -0.15], [-0.14, 0.02]]) {
        ctx.beginPath();
        ctx.moveTo(hx + ox * s, hy + oy * s - 0.03 * s);
        ctx.quadraticCurveTo(hx + ox * s + 0.02 * s, hy + oy * s, hx + ox * s, hy + oy * s + 0.012 * s);
        ctx.quadraticCurveTo(hx + ox * s - 0.02 * s, hy + oy * s, hx + ox * s, hy + oy * s - 0.03 * s);
        ctx.fill();
      }
    }
    // yüz
    ctx.fillStyle = '#3b2a4a';
    ctx.beginPath(); circle(hx + 0.005 * s, hy + 0.02 * s, 0.018 * s); circle(hx + 0.085 * s, hy + 0.02 * s, 0.018 * s); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); circle(hx + 0.0 * s, hy + 0.013 * s, 0.006 * s); circle(hx + 0.08 * s, hy + 0.013 * s, 0.006 * s); ctx.fill();
    const blowing = p.blowT > 0;
    ctx.fillStyle = 'rgba(255, 120, 150, .45)';
    const cheek = blowing ? 0.036 * s : 0.022 * s; // üflerken yanaklar şişer
    ctx.beginPath(); circle(hx - 0.03 * s, hy + 0.06 * s, cheek); circle(hx + 0.12 * s, hy + 0.06 * s, cheek); ctx.fill();
    ctx.strokeStyle = '#a0344f';
    ctx.lineWidth = 0.012 * s;
    ctx.beginPath();
    if (blowing) circle(hx + 0.07 * s, hy + 0.075 * s, 0.013 * s);
    else if (p.surpriseT > 0) circle(hx + 0.045 * s, hy + 0.08 * s, 0.018 * s);
    else ctx.arc(hx + 0.045 * s, hy + 0.05 * s, 0.035 * s, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // ön kol
    const fArm = segs(g.shX + 0.05 * s, aY, 0.13 * s, arms[0][0], arms[0][1]);
    limb(g.shX + 0.05 * s, aY, fArm, armW, skin);

    ctx.restore();
  }

  function shoe(x, y, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-a * 0.6);
    ctx.fillStyle = '#b5338a';
    ctx.beginPath(); ctx.ellipse(0.025 * U, 0, 0.055 * U, 0.03 * U, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- Parçacıklar, yazılar, uyarılar ----------
  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = clamp(a * 1.5, 0, 1);
      if (p.kind === 'rain') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.015 * U;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 0.02 * U, p.y + p.size); ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        star(p.x, p.y, p.size * 1.3, p.rot); ctx.fill();
      } else if (p.kind === 'confetti') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        ctx.restore();
      } else if (p.kind === 'drop') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); circle(p.x, p.y, p.size); ctx.fill();
      } else if (p.kind === 'wind') {
        // kıvrımlı rüzgâr çizgisi
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.02 * U;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - p.size, p.y);
        ctx.quadraticCurveTo(p.x - p.size * 0.4, p.y - p.size * 0.35, p.x, p.y);
        ctx.arc(p.x, p.y - p.size * 0.15, p.size * 0.15, Math.PI / 2, Math.PI / 2 - 4 - p.rot * 0.2, true);
        ctx.stroke();
      } else if (p.kind === 'dust') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); circle(p.x, p.y, p.size * (1 + p.life * 2)); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of texts) {
      const k = t.t / t.max;
      const scale = k < 0.15 ? k / 0.15 : 1;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `800 ${Math.round(t.size * U * scale)}px 'Baloo 2', 'Comic Sans MS', sans-serif`;
      const y = t.y - k * 0.5 * U;
      ctx.lineWidth = 0.05 * U;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(t.text, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, y);
    }
    ctx.globalAlpha = 1;
  }

  function bubble(text, y, color, pulse) {
    const sc = 1 + (pulse ? Math.sin(time * 8) * 0.05 : 0);
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(sc, sc);
    ctx.font = `800 ${Math.round(0.26 * U)}px 'Baloo 2', 'Comic Sans MS', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 0.5 * U;
    const h = 0.5 * U;
    ctx.fillStyle = 'rgba(255, 255, 255, .92)';
    roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.lineWidth = 0.04 * U;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0.02 * U);
    ctx.restore();
  }

  // ---------- Ana çizim ----------
  function draw() {
    drawBackground();
    for (const o of obstacles) if (o.type === 'puddle') drawPuddle(o);
    for (const o of obstacles) if (o.type === 'ball' && o.state === 'come') drawBall(o);
    drawGirl(player);
    for (const o of obstacles) if (o.type === 'ball' && o.state !== 'come') drawBall(o);
    for (const o of obstacles) if (o.type === 'cloud') drawCloudObstacle(o);
    drawParticles();
    drawTexts();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 230, ${flash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }

    const topY = Math.max(0.45 * U, H * 0.2);
    if (mode === 'play' && useCamera && lostT > 1) {
      bubble('Seni göremiyorum 👀 Kameraya gel!', H * 0.4, '#e2468f', true);
    } else if (hint && mode === 'play') {
      bubble(HINTS[hint.type].text, topY, HINTS[hint.type].color, true);
    }

    if (mode === 'countdown') {
      const n = Math.ceil(countdown - 0.4);
      const label = n >= 1 ? String(n) : 'BAŞLA!';
      const frac = (countdown - 0.4) % 1;
      const sc = n >= 1 ? 1 + frac * 0.4 : 1.1;
      ctx.save();
      ctx.translate(W / 2, H * 0.42);
      ctx.scale(sc, sc);
      ctx.font = `800 ${Math.round(0.8 * U)}px 'Baloo 2', 'Comic Sans MS', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 0.08 * U;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(label, 0, 0);
      ctx.fillStyle = '#ff5fa2';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  // ---------- Döngü ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode !== 'paused') update(dt, now);
    else if (useCamera) {
      // molada algılanan hareketler devam edince tetiklenmesin
      PoseInput.update(now);
      PoseInput.consumeJump();
      PoseInput.consumeKick();
      PoseInput.consumeBlow();
    }
    if (mode === 'paused') { BlowMic.update(now, true); BlowMic.consume(); }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test/hata ayıklama için
  window.__game = {
    get state() {
      return {
        mode, score,
        obstacles: obstacles.map(o => ({ type: o.type, dx: (o.x - player.x) / U, state: o.state || (o.hit ? 'hit' : o.blown ? 'blown' : 'come') })),
        player: { ...player },
      };
    },
  };
})();
