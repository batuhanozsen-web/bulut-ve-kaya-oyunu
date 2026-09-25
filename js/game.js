// Bulut ve Kaya Macerası — ana oyun döngüsü, çizim ve kurallar.
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
  };

  // ---------- Girdi ----------
  const keys = { duck: false };
  let touchDuck = false;

  function doJump() {
    if (mode !== 'play') return;
    if (player.jumpH > 0.5) return;
    player.vy = JUMP_V * U;
    player.jumpH = 0.01;
    Sound.jump();
    // Yaklaşmakta olan kaya varsa "atlandı" say (çocuklar için cömert zamanlama).
    for (const o of obstacles) {
      if (o.type !== 'rock' || o.state !== 'come') continue;
      const dx = o.x - player.x;
      if (dx > -0.3 * U && dx < 1.7 * U) o.cleared = true;
    }
  }

  function doKick() {
    if (mode !== 'play') return;
    if (player.kickT > 0) return;
    player.kickT = KICK_DUR;
    Sound.whoosh();
  }

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 's') keys.duck = true;
    else if (k === 'arrowup' || k === 'w' || k === ' ') { doJump(); e.preventDefault(); }
    else if (k === 'arrowright' || k === 'd' || k === 'k') doKick();
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
    Object.assign(player, { jumpH: 0, vy: 0, crouch: 0, kickT: 0, wobbleT: 0, surpriseT: 0 });
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

  function goMenu() {
    mode = 'menu';
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
  function spawn() {
    let type = Math.random() < 0.5 ? 'cloud' : 'rock';
    if (lastTypes.length >= 2 && lastTypes[0] === lastTypes[1]) type = lastTypes[0] === 'cloud' ? 'rock' : 'cloud';
    lastTypes.unshift(type);
    lastTypes.length = Math.min(lastTypes.length, 2);
    if (type === 'cloud') {
      obstacles.push({ type, x: W + U, w: 1.25 * U, h: 0.5 * U, hit: false, done: false, stormT: 0, hinted: false, wob: rand(0, 6) });
    } else {
      const r = 0.17 * U;
      const shape = [];
      for (let i = 0; i < 9; i++) shape.push(rand(0.85, 1.08));
      obstacles.push({ type, x: W + U, y: groundY - r, r, shape, state: 'come', rot: 0, vx: 0, vy: 0, cleared: false, done: false, hinted: false });
    }
  }

  function updateObstacles(dt, v, moving) {
    const g = girlGeom(player);
    for (const o of obstacles) {
      if (o.type === 'cloud') {
        if (moving) o.x -= v * dt;
        if (o.stormT > 0) {
          o.stormT -= dt;
          // yağmur damlaları
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
          Sound.thunder();
          addText('Fırtına! ⛈️', player.x, g.top - 0.2 * U, '#5b6b8c');
        }
        if (!o.hit && !o.done && o.x < player.x - 0.6 * U) {
          o.done = true;
          success('Süper eğildin!', player.x, g.top - 0.2 * U);
        }
      } else {
        if (o.state === 'come') {
          if (moving) o.x -= v * dt;
          const dx = o.x - player.x;
          if (player.jumpH > 0.3 * U && Math.abs(dx) < 0.4 * U) o.cleared = true;
          // tekme
          if (player.kickT > 0 && dx > -0.2 * U && dx < 1.1 * U) {
            o.state = 'broken';
            o.done = true;
            breakRock(o);
            success('Güçlü tekme!', o.x, o.y - 0.5 * U);
            continue;
          }
          // çarpma → kaya yuvarlanarak üstünden geçer
          if (!o.cleared && Math.abs(dx) < 0.3 * U && player.jumpH < 0.25 * U) {
            o.state = 'roll';
            o.vx = -1.7 * U * speedF;
            o.vy = -2.6 * U;
            player.wobbleT = 0.8;
            player.surpriseT = 1;
            Sound.thump();
            burst(o.x, groundY, 8, 'dust', ['#d9c7a3', '#c9b48c']);
            addText('Hoppala! 🙃', player.x, g.top - 0.2 * U, '#8a6d3b');
          }
          if (o.cleared && !o.done && dx < -0.5 * U) {
            o.done = true;
            success('Harika zıpladın!', player.x, g.top - 0.2 * U);
          }
        } else if (o.state === 'roll') {
          o.x += o.vx * dt;
          o.vy += GRAVITY * U * dt;
          o.y += o.vy * dt;
          o.rot += (o.vx / o.r) * dt;
          if (o.y > groundY - o.r) {
            o.y = groundY - o.r;
            if (Math.abs(o.vy) > 0.5 * U) {
              burst(o.x, groundY, 4, 'dust', ['#d9c7a3', '#c9b48c']);
              Sound.thump();
            }
            o.vy = -o.vy * 0.45;
          }
        }
      }
    }
    obstacles = obstacles.filter(o => o.x > -2 * U && o.state !== 'broken');
  }

  function breakRock(o) {
    Sound.crunch();
    flash = Math.max(flash, 0.3);
    for (let i = 0; i < 10; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rand(1.2, 2.8) * U;
      particles.push({
        kind: 'shard', x: o.x + rand(-0.5, 0.5) * o.r, y: o.y + rand(-0.5, 0.5) * o.r,
        vx: Math.cos(a) * sp + 1.2 * U, vy: Math.sin(a) * sp, rot: rand(0, 6), vr: rand(-10, 10),
        size: rand(0.25, 0.5) * o.r, life: 0, max: 1.3, color: i % 2 ? '#9aa0a6' : '#7d848b',
      });
    }
    burst(o.x, o.y, 8, 'dust', ['#e0dcd5', '#c7c2ba']);
  }

  function cloudY() { return groundY - (CLOUD_BOTTOM + 0.25) * U; }

  // ---------- Güncelleme ----------
  function update(dt, now) {
    time += dt;

    if (useCamera) {
      PoseInput.update(now);
      if (PoseInput.consumeJump()) doJump();
      if (PoseInput.consumeKick()) doKick();
      $('camState').textContent = PoseInput.state.label;
    }

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
    const target = player.wantDuck && player.jumpH <= 0 ? 1 : 0;
    player.crouch += (target - player.crouch) * Math.min(1, dt * 14);
    if (player.jumpH > 0) {
      let g = GRAVITY * U;
      // atlanan kayanın üstünde biraz süzül
      const assist = obstacles.some(o => o.type === 'rock' && o.cleared && o.state === 'come' &&
        o.x - player.x > -0.45 * U && o.x - player.x < 0.8 * U);
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
        if (!o.hinted && dx > 0 && dx < 3.4 * U && (o.type === 'cloud' || o.state === 'come')) {
          o.hinted = true;
          hint = { type: o.type, t: 2.2 };
          Sound.speak(o.type === 'cloud' ? 'Bulut geliyor, eğil!' : 'Kaya geliyor! Zıpla ya da tekme at!');
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
      if (p.kind === 'shard' || p.kind === 'confetti' || p.kind === 'star') p.vy += (p.kind === 'shard' ? 5 : 2) * U * dt;
      if (p.kind === 'dust') { p.vy *= 0.9; p.vx *= 0.9; }
      if (p.vr) p.rot += p.vr * dt;
      if (p.kind === 'shard' && p.y > groundY) { p.y = groundY; p.vy *= -0.3; p.vx *= 0.6; }
      if (p.kind === 'rain' && p.y > groundY) p.life = p.max;
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
    const y = cloudY() + Math.sin(time * 2 + o.wob) * 0.03 * U;
    const storm = o.stormT > 0;
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

  function drawRock(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    // gölge
    if (o.state === 'come') {
      ctx.fillStyle = 'rgba(0, 0, 0, .15)';
      ctx.beginPath(); ctx.ellipse(0, o.r, o.r * 1.1, o.r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.rotate(o.rot);
    const grad = ctx.createRadialGradient(-o.r * 0.3, -o.r * 0.4, o.r * 0.1, 0, 0, o.r * 1.1);
    grad.addColorStop(0, '#c4c9cf');
    grad.addColorStop(1, '#7d848b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    o.shape.forEach((k, i) => {
      const a = i / o.shape.length * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * o.r * k, Math.sin(a) * o.r * k * 0.92);
    });
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5f666d';
    ctx.lineWidth = 0.02 * U;
    ctx.stroke();
    // yosun ve çatlak
    ctx.fillStyle = '#7bbf5a';
    ctx.beginPath(); ctx.ellipse(o.r * 0.2, -o.r * 0.75, o.r * 0.35, o.r * 0.14, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5f666d';
    ctx.lineWidth = 0.012 * U;
    ctx.beginPath(); ctx.moveTo(o.r * 0.3, o.r * 0.1); ctx.lineTo(o.r * 0.5, o.r * 0.35); ctx.lineTo(o.r * 0.4, o.r * 0.6); ctx.stroke();
    // sevimli yüz (oyuncuya bakar)
    ctx.fillStyle = '#2d2d2d';
    ctx.beginPath(); circle(-o.r * 0.45, -o.r * 0.1, o.r * 0.1); circle(-o.r * 0.05, -o.r * 0.1, o.r * 0.1); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); circle(-o.r * 0.48, -o.r * 0.14, o.r * 0.035); circle(-o.r * 0.08, -o.r * 0.14, o.r * 0.035); ctx.fill();
    ctx.strokeStyle = '#2d2d2d';
    ctx.lineWidth = 0.014 * U;
    ctx.beginPath();
    if (o.state === 'roll') circle(-o.r * 0.25, o.r * 0.25, o.r * 0.1);
    else ctx.arc(-o.r * 0.25, o.r * 0.12, o.r * 0.15, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();
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
    if (p.wobbleT > 0) {
      const a = Math.sin(p.wobbleT * 25) * 0.15 * (p.wobbleT / 0.8);
      ctx.translate(g.hipX, g.bottom);
      ctx.rotate(a);
      ctx.translate(-g.hipX, -g.bottom);
    }

    const air = p.jumpH > 0.5;
    const ph = p.runPhase;
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

    // elbise
    ctx.fillStyle = '#ff5fa2';
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
    // yüz
    ctx.fillStyle = '#3b2a4a';
    ctx.beginPath(); circle(hx + 0.005 * s, hy + 0.02 * s, 0.018 * s); circle(hx + 0.085 * s, hy + 0.02 * s, 0.018 * s); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); circle(hx + 0.0 * s, hy + 0.013 * s, 0.006 * s); circle(hx + 0.08 * s, hy + 0.013 * s, 0.006 * s); ctx.fill();
    ctx.fillStyle = 'rgba(255, 120, 150, .45)';
    ctx.beginPath(); circle(hx - 0.03 * s, hy + 0.06 * s, 0.022 * s); circle(hx + 0.12 * s, hy + 0.06 * s, 0.022 * s); ctx.fill();
    ctx.strokeStyle = '#a0344f';
    ctx.lineWidth = 0.012 * s;
    ctx.beginPath();
    if (p.surpriseT > 0) circle(hx + 0.045 * s, hy + 0.08 * s, 0.018 * s);
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
      } else if (p.kind === 'shard') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.6); ctx.lineTo(p.size, -p.size * 0.3); ctx.lineTo(p.size * 0.3, p.size * 0.8); ctx.closePath(); ctx.fill();
        ctx.restore();
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
    for (const o of obstacles) if (o.type === 'rock') drawRock(o);
    drawGirl(player);
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
      bubble(hint.type === 'cloud' ? '☁️ EĞİL! ⬇️' : '⬆️ ZIPLA ya da TEKME 🦶', topY, hint.type === 'cloud' ? '#2a7fc2' : '#8a5a2b', true);
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
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test/hata ayıklama için
  window.__game = {
    get state() {
      return {
        mode, score,
        obstacles: obstacles.map(o => ({ type: o.type, dx: (o.x - player.x) / U, state: o.state || (o.hit ? 'hit' : 'come') })),
        player: { ...player },
      };
    },
  };
})();
