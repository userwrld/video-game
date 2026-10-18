// Topple: tap to drop the sliding block. Overhang gets sliced off. Stack as high as you can.
(() => {
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  let W, H, dpr;
  const BH = 30;               // block height
  const FONT = '800 {s}px -apple-system, "Segoe UI", Roboto, system-ui, sans-serif';
  const font = s => FONT.replace('{s}', s);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();

  let best = 0;
  try { best = +localStorage.getItem('topple-best') || 0; } catch (e) {}

  // audio
  let ac = null;
  function tone(f, d, type = 'sine', v = 0.12) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
  }
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const note = i => 261.6 * Math.pow(2, SCALE[i % SCALE.length] / 12 + Math.floor(i / SCALE.length));

  let state = 'menu', stack, cur, dir, speed, cam, camT, debris, parts, pops, streak, score, shake, over_t, isBest;
  const hue = n => (n * 9 + 250) % 360;

  function start() {
    const w = Math.min(W * 0.55, 240);
    stack = [{ x: W / 2 - w / 2, w }];
    score = 0; streak = 0; cam = 0; camT = 0; debris = []; parts = []; pops = []; shake = 0; isBest = false;
    next();
    state = 'play';
  }
  function next() {
    const top = stack[stack.length - 1];
    dir = stack.length % 2 ? 1 : -1;
    speed = Math.min(150 + stack.length * 7, 520);
    cur = { x: dir > 0 ? -top.w : W, w: top.w };
  }
  function yOf(level) { return H * 0.62 + (cam - level) * BH; }

  function drop() {
    const top = stack[stack.length - 1];
    const l = Math.max(cur.x, top.x), r = Math.min(cur.x + cur.w, top.x + top.w), ov = r - l;
    const n = stack.length;
    if (ov <= 0) {                       // missed completely
      debris.push({ x: cur.x, w: cur.w, y: yOf(n), vy: 0, vx: dir * 40, rot: 0, h: hue(n) });
      return end();
    }
    if (Math.abs(cur.x - top.x) < 6) {   // perfect
      streak++;
      cur.x = top.x;
      let w = cur.w;
      if (streak >= 3) { w = Math.min(w + 6, Math.min(W * 0.8, 340)); cur.x -= (w - cur.w) / 2; cur.w = w; }
      pops.push({ t: 0, text: streak >= 3 ? 'PERFECT x' + streak : 'PERFECT', x: W / 2, y: yOf(n) });
      ring(cur.x + cur.w / 2, yOf(n) + BH / 2, hue(n));
      tone(note(Math.min(streak, 9) + 3), 0.35, 'triangle', 0.15);
      tone(note(Math.min(streak, 9) + 3) * 2, 0.25, 'sine', 0.06);
    } else {                              // slice
      streak = 0;
      const cutL = cur.x < top.x ? { x: cur.x, w: l - cur.x } : { x: r, w: cur.x + cur.w - r };
      debris.push({ x: cutL.x, w: cutL.w, y: yOf(n), vy: 0, vx: (cur.x < top.x ? -1 : 1) * 30, rot: 0, h: hue(n) });
      cur.x = l; cur.w = ov;
      tone(note(Math.floor(score / 2) % 5), 0.12, 'square', 0.06);
    }
    cur.h = hue(n);
    stack.push({ x: cur.x, w: cur.w });
    score++;
    shake = 0.08;
    next();
  }
  function ring(x, y, h) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28, s = 90 + Math.random() * 140;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.6, h });
    }
  }
  function end() {
    state = 'over'; over_t = 0; shake = 0.35;
    tone(130, 0.5, 'sawtooth', 0.12); tone(98, 0.6, 'sawtooth', 0.1);
    if (score > best) { best = score; isBest = true; try { localStorage.setItem('topple-best', best); } catch (e) {} }
    if (navigator.vibrate) navigator.vibrate(60);
  }

  function press(e) {
    if (e) e.preventDefault();
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
    if (ac && ac.state === 'suspended') ac.resume();
    if (state === 'play') drop();
    else if (state === 'menu' || (state === 'over' && over_t > 0.5)) start();
  }
  cv.addEventListener('pointerdown', press);
  addEventListener('keydown', e => { if (e.code === 'Space' || e.key === 'Enter') press(e); });

  function update(dt) {
    if (state === 'play') {
      cur.x += dir * speed * dt;
      if (cur.x + cur.w > W + 40) dir = -1;
      if (cur.x < -40) dir = 1;
    }
    if (state === 'over') over_t += dt;
    camT = Math.max(0, stack ? stack.length - 1 : 0);
    cam += (camT - cam) * Math.min(1, dt * 5);
    for (const d of debris) { d.vy += 1800 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.rot += d.vx * dt * 0.01; }
    debris = debris.filter(d => d.y < H + 100);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
    parts = parts.filter(p => p.life > 0);
    for (const p of pops) p.t += dt;
    pops = pops.filter(p => p.t < 0.9);
    shake = Math.max(0, shake - dt);
  }

  function block(x, y, w, h, hu) {
    ctx.fillStyle = `hsl(${hu} 75% 58%)`; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = `hsl(${hu} 75% 70%)`; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = `hsl(${hu} 70% 40%)`; ctx.fillRect(x, y + h - 4, w, 4);
  }
  function label(s, x, y, size, color, align = 'center') {
    ctx.font = font(size); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
  }

  function draw() {
    const lvl = stack ? stack.length : 0;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${hue(lvl) + 20} 55% 16%)`); g.addColorStop(1, `hsl(${hue(lvl) - 30} 60% 30%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * shake * 40, (Math.random() - .5) * shake * 40);
    if (stack) {
      stack.forEach((b, i) => block(b.x, yOf(i), b.w, BH, hue(i)));
      if (state === 'play') block(cur.x, yOf(stack.length), cur.w, BH, hue(stack.length));
      for (const d of debris) { ctx.save(); ctx.translate(d.x + d.w / 2, d.y + BH / 2); ctx.rotate(d.rot); ctx.globalAlpha = 0.9; block(-d.w / 2, -BH / 2, d.w, BH, d.h); ctx.restore(); }
      for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / 0.6); ctx.fillStyle = `hsl(${p.h} 90% 75%)`; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
      ctx.globalAlpha = 1;
      for (const p of pops) { ctx.globalAlpha = 1 - p.t / 0.9; label(p.text, p.x, p.y - 20 - p.t * 50, 22, '#fff'); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (state === 'play') {
      label(String(score), W / 2, 96, 64, 'rgba(255,255,255,.92)');
      label('BEST ' + best, W / 2, 138, 14, 'rgba(255,255,255,.55)');
    }
    if (state === 'menu') {
      label('TOPPLE', W / 2, H * 0.24, Math.min(64, W * 0.17), '#fff');
      label('Tap to drop the block.', W / 2, H * 0.24 + 52, 17, 'rgba(255,255,255,.8)');
      label('Line it up to keep it wide.', W / 2, H * 0.24 + 78, 17, 'rgba(255,255,255,.8)');
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 280);
      label('TAP TO START', W / 2, H * 0.78, 26, '#ffd76a'); ctx.globalAlpha = 1;
      if (best) label('BEST ' + best, W / 2, H * 0.78 + 40, 16, 'rgba(255,255,255,.6)');
    }
    if (state === 'over') {
      ctx.fillStyle = 'rgba(15,8,35,.55)'; ctx.fillRect(0, 0, W, H);
      label('TOPPLED', W / 2, H * 0.28, Math.min(46, W * 0.12), '#ff7a8a');
      label(String(score), W / 2, H * 0.42, 88, '#fff');
      label(isBest ? 'NEW BEST!' : 'BEST ' + best, W / 2, H * 0.42 + 64, 20, isBest ? '#ffd76a' : 'rgba(255,255,255,.6)');
      if (over_t > 0.5) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 280); label('TAP TO RETRY', W / 2, H * 0.72, 26, '#ffd76a'); ctx.globalAlpha = 1; }
    }
  }

  stack = [{ x: W / 2 - 100, w: 200 }]; debris = []; parts = []; pops = []; cam = 0; score = 0;
  // demo stack on the menu
  for (let i = 0; i < 6; i++) stack.push({ x: W / 2 - 100 + (Math.random() - .5) * 30, w: 200 - i * 6 });
  cam = camT = stack.length - 1;
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); draw(); requestAnimationFrame(loop);
  })(last);
})();
