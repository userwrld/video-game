// Banana Breach: clear rooms of opps, pick one of three upgrades, beat a boss every 15 rooms.
// Drag anywhere with your thumb to move. Your monkey starts at the bottom, opps drop in from the top, and it auto-fires.
(() => {
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  let W, H, S, AW, AH, dpr;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = innerWidth; H = innerHeight;
    S = Math.min(W / 360, H / 640);
    AW = W / S; AH = H / S;
    cv.width = W * dpr; cv.height = H * dpr;
  }
  addEventListener('resize', resize); resize();

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const TOP = 96, PAD = 16;               // arena top edge leaves room for the HUD
  const FONT = s => `800 ${s}px -apple-system, "Segoe UI", Roboto, system-ui, sans-serif`;

  // ---------- save data ----------
  let save = { ban: 0, owned: { rusty: 1, neon: 1 }, best: 0, sel: 0 };
  try { Object.assign(save, JSON.parse(localStorage.getItem('banana-breach') || '{}')); } catch (e) {}
  const persist = () => { try { localStorage.setItem('banana-breach', JSON.stringify(save)); } catch (e) {} };

  // ---------- audio ----------
  let ac = null;
  function tone(f, d, type = 'square', v = 0.04, slide = 0) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
  }

  // ---------- weapons and characters ----------
  const WEAP = {
    gun:     { name: 'Blaster',      desc: 'Fast single shots. Great with multishot.', dmg: 10, rate: 3.2, count: 1, spread: 0.2, speed: 520, life: 0.9, pierce: 0, reach: 420, col: '#ffe066' },
    laser:   { name: 'Laser Eyes',   desc: 'Piercing beams that cut through lines of opps.', dmg: 15, rate: 1.5, count: 1, spread: 0.3, len: 320, width: 6, reach: 320, col: '#ff3df2' },
    flame:   { name: 'Flamethrower', desc: 'Short range cone that sets opps on fire.', dmg: 3.4, rate: 10, range: 105, cone: 0.8, burn: 4, reach: 105, col: '#ff8a2a' },
    shotgun: { name: 'Scattergun',   desc: 'Pellet spray. Brutal up close.', dmg: 6, rate: 1.1, count: 5, spread: 0.6, speed: 480, life: 0.38, pierce: 0, reach: 190, col: '#ffd0a0' },
    rocket:  { name: 'Rocket Pod',   desc: 'Slow rockets with splash damage.', dmg: 24, rate: 0.85, count: 1, spread: 0.12, speed: 300, life: 1.5, boom: 52, reach: 420, col: '#ff5a5a' },
    zap:     { name: 'Volt Staff',   desc: 'Lightning that jumps between opps.', dmg: 11, rate: 2, chain: 2, range: 190, chainRange: 110, reach: 190, col: '#7df9ff' },
  };
  const CHARS = [
    { id: 'rusty', name: 'Rusty',  weapon: 'gun',     cost: 0,   fur: '#8a5a2b', skin: '#d9b48a', acc: 'bucket',  hp: 100, spd: 150 },
    { id: 'neon',  name: 'Neon',   weapon: 'laser',   cost: 0,   fur: '#23232f', skin: '#8d8da8', acc: 'visor',   hp: 90,  spd: 155 },
    { id: 'ash',   name: 'Ash',    weapon: 'flame',   cost: 150, fur: '#b8382b', skin: '#f0b9a0', acc: 'band',    hp: 120, spd: 145 },
    { id: 'boomer',name: 'Boomer', weapon: 'shotgun', cost: 300, fur: '#e3cf9a', skin: '#fff1cf', acc: 'cap',     hp: 110, spd: 150 },
    { id: 'blitz', name: 'Blitz',  weapon: 'rocket',  cost: 500, fur: '#3e6fb5', skin: '#a9c6ee', acc: 'helmet',  hp: 105, spd: 140 },
    { id: 'sparks',name: 'Sparks', weapon: 'zap',     cost: 800, fur: '#d9a82b', skin: '#fff0a0', acc: 'wizard',  hp: 95,  spd: 160 },
  ];

  // ---------- upgrades ----------
  const ALL = ['all'];
  const PROJ = ['gun', 'shotgun', 'rocket'];
  const UPG = [
    { id: 'hp',    n: 'Thick Fur',        d: '+25 max HP and heal 25',           t: ALL, max: 8, f: p => { p.hpMax += 25; p.hp = Math.min(p.hpMax, p.hp + 25); } },
    { id: 'spd',   n: 'Fast Feet',        d: '+10% move speed',                  t: ALL, max: 5, f: p => { p.speed *= 1.1; } },
    { id: 'dmg',   n: 'Heavy Hitter',     d: '+15% damage',                      t: ALL, max: 12, f: p => { p.dmg *= 1.15; } },
    { id: 'rate',  n: 'Quick Trigger',    d: '+15% fire rate',                   t: ALL, max: 8, f: p => { p.rate *= 1.15; } },
    { id: 'crit',  n: 'Lucky Banana',     d: '+10% crit chance (crits do 2x)',   t: ALL, max: 6, f: p => { p.crit += 0.1; } },
    { id: 'mag',   n: 'Banana Magnet',    d: 'Bigger pickup range, +15% bananas', t: ALL, max: 4, f: p => { p.magnet += 45; p.bmult *= 1.15; } },
    { id: 'heal',  n: 'Banana Smoothie',  d: 'Heal 40% of your HP now',          t: ALL, max: 99, f: p => { p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.4); } },
    { id: 'dr',    n: 'Iron Peel',        d: 'Take 8% less damage',              t: ALL, max: 5, f: p => { p.dr += 0.08; } },
    { id: 'vamp',  n: 'Bloodthirst',      d: 'Heal 1 HP for every kill',         t: ALL, max: 5, f: p => { p.vamp += 1; } },
    { id: 'tail',  n: 'Tail Whip',        d: 'Stay safe longer after a hit',     t: ALL, max: 3, f: p => { p.invT += 0.2; } },

    { id: 'multi', n: 'Multishot',        d: '+1 projectile per shot',           t: PROJ, max: 5, f: p => { p.count += 1; p.spread += 0.12; } },
    { id: 'pierce',n: 'Piercing Rounds',  d: 'Shots pass through 1 more opp',    t: ['gun', 'shotgun'], max: 4, f: p => { p.pierce += 1; } },
    { id: 'rico',  n: 'Ricochet',         d: 'Shots bounce off walls once more', t: ['gun', 'shotgun'], max: 3, f: p => { p.rico += 1; p.life += 0.3; } },
    { id: 'home',  n: 'Heat Seeking',     d: 'Shots curve toward opps',          t: ['gun', 'rocket'], max: 3, f: p => { p.homing += 1; } },
    { id: 'expl',  n: 'Explosive Rounds', d: 'Shots pop with a small blast',     t: ['gun', 'shotgun'], max: 3, f: p => { p.explo += 26; } },
    { id: 'choke', n: 'Slug Choke',       d: 'Tighter spread, +10% damage',      t: ['shotgun'], max: 3, f: p => { p.spread *= 0.8; p.dmg *= 1.1; } },
    { id: 'boom',  n: 'Bigger Boom',      d: 'Rocket blast radius +20',          t: ['rocket'], max: 4, f: p => { p.boom += 20; } },
    { id: 'clust', n: 'Cluster Bombs',    d: 'Rockets scatter mini blasts',      t: ['rocket'], max: 2, f: p => { p.cluster += 1; } },
    { id: 'wide',  n: 'Wide Beam',        d: 'Beams are thicker',                t: ['laser'], max: 4, f: p => { p.width += 4; } },
    { id: 'long',  n: 'Long Beam',        d: 'Beams reach farther',              t: ['laser'], max: 3, f: p => { p.len += 80; p.reach += 80; } },
    { id: 'twin',  n: 'Twin Beams',       d: '+1 beam per shot',                 t: ['laser'], max: 4, f: p => { p.count += 1; p.spread += 0.12; } },
    { id: 'sear',  n: 'Searing Beam',     d: 'Beams set opps on fire',           t: ['laser'], max: 3, f: p => { p.burn += 3; } },
    { id: 'lflame',n: 'Long Flames',      d: 'Flame reaches 30 farther',         t: ['flame'], max: 4, f: p => { p.range += 30; p.reach += 30; } },
    { id: 'fan',   n: 'Wide Fan',         d: 'Flame cone is wider',              t: ['flame'], max: 3, f: p => { p.cone += 0.35; } },
    { id: 'inf',   n: 'Inferno',          d: 'Burn damage +4 per second',        t: ['flame'], max: 5, f: p => { p.burn += 4; } },
    { id: 'nap',   n: 'Napalm',           d: 'Burning opps ignite their neighbors', t: ['flame', 'laser'], max: 1, f: p => { p.spreadFire = 1; } },
    { id: 'chain', n: 'Chain Link',       d: 'Lightning jumps to 2 more opps',   t: ['zap'], max: 5, f: p => { p.chain += 2; } },
    { id: 'over',  n: 'Overload',         d: '+25% lightning damage',            t: ['zap'], max: 4, f: p => { p.dmg *= 1.25; } },
    { id: 'rod',   n: 'Storm Rod',        d: 'Lightning reaches 40 farther',     t: ['zap'], max: 3, f: p => { p.range += 40; p.reach += 40; p.chainRange += 20; } },
    { id: 'static',n: 'Static Shock',     d: 'Zapped opps are stunned briefly',  t: ['zap'], max: 2, f: p => { p.stun += 0.35; } },
  ];

  // ---------- opps ----------
  const TYPES = {
    runt:    { r: 10, hp: 14,  sp: 82,  dmg: 6,  val: 1, col: '#ff6b6b' },
    brute:   { r: 17, hp: 48,  sp: 56,  dmg: 11, val: 3, col: '#ff9f43' },
    tank:    { r: 27, hp: 150, sp: 36,  dmg: 18, val: 8, col: '#a55eea' },
    shooter: { r: 12, hp: 22,  sp: 48,  dmg: 6,  val: 3, col: '#4bcffa' },
    dasher:  { r: 11, hp: 18,  sp: 60,  dmg: 9,  val: 2, col: '#7bed9f' },
  };

  // ---------- state ----------
  let state = 'menu', sel = Math.min(save.sel, CHARS.length - 1);
  let run, P, enemies = [], pbul = [], ebul = [], pickups = [], fx = [], queue, spawnT, clearT, bannerT, shake, flash, msg;
  let offer = [], t0 = 0;
  let btns = [];
  const joy = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
  const pen = {};
  const keys = {};

  function startRun() {
    const ch = CHARS[sel], w = WEAP[ch.weapon];
    P = Object.assign({}, w, {
      ch, x: AW / 2, y: AH - 110, r: 14, hp: ch.hp, hpMax: ch.hp, speed: ch.spd, inv: 1, cd: 0.4, aim: -Math.PI / 2, tick: 0,
      crit: 0.05, magnet: 60, bmult: 1, dr: 0, vamp: 0, invT: 0.7, rico: 0, homing: 0, explo: 0, cluster: 0, burn: w.burn || 0,
      spreadFire: 0, stun: 0, boom: w.boom || 0, lives: 2,
    });
    run = { room: 1, ban: 0, kills: 0, stacks: {} };
    for (const k in pen) delete pen[k];
    startRoom();
    state = 'play';
  }
  function bossRoom(n) { return n % 15 === 0; }
  function startRoom() {
    enemies = []; pbul = []; ebul = []; pickups = []; fx = []; clearT = 0; spawnT = 0.8; bannerT = 1.4; shake = 0; flash = 0;
    P.x = AW / 2; P.y = AH - 110; P.inv = Math.max(P.inv, 1);
    const room = run.room;
    queue = [];
    if (bossRoom(room)) queue.push('boss');
    else {
      const n = Math.min(4 + Math.floor(room * 1.3), 26);
      const pool = [['runt', 5]];
      if (room >= 2) pool.push(['brute', 3]);
      if (room >= 3) pool.push(['shooter', 2]);
      if (room >= 5) pool.push(['dasher', 2]);
      if (room >= 6) pool.push(['tank', 1]);
      const tot = pool.reduce((a, b) => a + b[1], 0);
      for (let i = 0; i < n; i++) {
        let r = Math.random() * tot, k = pool[0][0];
        for (const [name, wt] of pool) { r -= wt; if (r <= 0) { k = name; break; } }
        queue.push(k);
      }
    }
  }
  function spawn(kind, x, y) {
    const room = run.room, hs = 1 + 0.17 * (room - 1), ds = 1 + 0.05 * (room - 1);
    let e;
    if (kind === 'boss') {
      const bn = room / 15;
      const hp = 800 * (1 + 0.9 * (bn - 1)) * (1 + 0.1 * (room - 1));
      e = { kind, boss: 1, bn, r: 52, hp, max: hp, sp: 30, dmg: 18 + bn * 6, bdmg: 9 + bn * 3, val: 40 * bn, col: '#e84393', pt: 2, sum: 6 };
    } else {
      const T = TYPES[kind];
      e = { kind, r: T.r, hp: T.hp * hs, max: T.hp * hs, sp: T.sp, dmg: T.dmg * ds, bdmg: 6 * ds, val: T.val, col: T.col, cd: rand(1, 2), st: 0, stt: 0 };
    }
    e.x = x; e.y = y; e.spawn = 0.8; e.flash = 0; e.burn = 0; e.burnT = 0; e.stun = 0; e.vx = 0; e.vy = 0;
    enemies.push(e);
  }

  // ---------- helpers ----------
  function burst(x, y, col, n = 10, sp = 140) {
    for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(sp * 0.3, sp); fx.push({ k: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), max: 0.6, col }); }
  }
  function hitEnemy(e, d, o = {}) {
    if (e.spawn > 0 || e.hp <= 0) return;
    if (!o.nocrit && Math.random() < P.crit) { d *= 2; fx.push({ k: 'c', x: e.x, y: e.y - e.r, life: 0.4 }); }
    e.hp -= d; e.flash = 0.08;
    if (o.burn) { e.burn = Math.max(e.burn, o.burn); e.burnT = 2; }
    if (o.stun) e.stun = Math.max(e.stun, o.stun);
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    burst(e.x, e.y, e.col, e.boss ? 40 : 10 + e.r / 3, e.boss ? 260 : 150);
    run.kills++;
    const n = e.boss ? 12 : 1, each = Math.max(1, Math.round(e.val * P.bmult / n));
    for (let i = 0; i < n; i++) pickups.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), v: each, vx: rand(-60, 60), vy: rand(-60, 60) });
    if (P.vamp) P.hp = Math.min(P.hpMax, P.hp + P.vamp);
    tone(e.boss ? 90 : 240, e.boss ? 0.6 : 0.1, 'sawtooth', 0.05, -120);
    if (e.boss) { shake = 0.6; ebul = []; }
  }
  function blast(x, y, r, d) {
    fx.push({ k: 'r', x, y, r, life: 0.3, max: 0.3 });
    burst(x, y, '#ffb347', 10, 150);
    for (const e of enemies) if (Math.hypot(e.x - x, e.y - y) < r + e.r) hitEnemy(e, d);
    shake = Math.max(shake, 0.1);
    tone(110, 0.2, 'sawtooth', 0.06, -60);
  }
  function hurtPlayer(d) {
    if (P.inv > 0 || state !== 'play') return;
    P.hp -= d * (1 - Math.min(0.7, P.dr)); P.inv = P.invT; shake = 0.25; flash = 0.25;
    tone(150, 0.25, 'sawtooth', 0.08, -80);
    if (navigator.vibrate) navigator.vibrate(30);
    if (P.hp <= 0) {
      P.lives--;
      if (P.lives > 0) {                      // second life: back up at full health
        P.hp = P.hpMax; P.inv = 2; ebul = []; burst(P.x, P.y, '#fff', 30, 260); flash = 0.6; msg = { t: 1.6, s: 'LAST LIFE!' };
        for (const e of enemies) if (!e.boss && Math.hypot(e.x - P.x, e.y - P.y) < 110) { e.x += (e.x - P.x) * 1.2; }
      } else die();
    }
  }
  function die() {
    state = 'over'; t0 = 0;
    if (run.room > save.best) save.best = run.room;
    persist();
  }
  function nearest() {
    let best = null, bd = 1e9;
    for (const e of enemies) { if (e.spawn > 0) continue; const d = Math.hypot(e.x - P.x, e.y - P.y) - e.r; if (d < bd) { bd = d; best = e; } }
    return bd <= P.reach ? best : null;
  }

  // ---------- firing ----------
  function aimAngles(a, n, spread) {
    if (n === 1) return [a + rand(-0.04, 0.04)];
    const out = [];
    for (let i = 0; i < n; i++) out.push(a + (i / (n - 1) - 0.5) * spread);
    return out;
  }
  function fire(tg) {
    const a = Math.atan2(tg.y - P.y, tg.x - P.x);
    P.aim = a;
    const k = P.ch.weapon, mx = P.x + Math.cos(a) * 18, my = P.y + Math.sin(a) * 18;
    if (k === 'gun' || k === 'shotgun' || k === 'rocket') {
      for (const an of aimAngles(a, P.count, P.spread + (k === 'shotgun' ? 0 : 0))) {
        pbul.push({ x: mx, y: my, vx: Math.cos(an) * WEAP[k].speed, vy: Math.sin(an) * WEAP[k].speed, dmg: P.dmg, life: P.life, pierce: P.pierce, rico: P.rico, hit: new Set(), r: k === 'rocket' ? 7 : 4, boom: k === 'rocket' ? P.boom : 0, col: WEAP[k].col, k });
      }
      tone(k === 'rocket' ? 180 : k === 'shotgun' ? 140 : 700, 0.06, 'square', 0.03);
    } else if (k === 'laser') {
      for (const an of aimAngles(a, P.count, P.spread)) {
        const x2 = P.x + Math.cos(an) * P.len, y2 = P.y + Math.sin(an) * P.len;
        fx.push({ k: 'l', x1: P.x, y1: P.y, x2, y2, w: P.width, life: 0.12, max: 0.12, col: P.col });
        for (const e of enemies) {
          const dx = x2 - P.x, dy = y2 - P.y, l2 = dx * dx + dy * dy;
          const u = clamp(((e.x - P.x) * dx + (e.y - P.y) * dy) / l2, 0, 1);
          if (Math.hypot(P.x + dx * u - e.x, P.y + dy * u - e.y) < e.r + P.width / 2) hitEnemy(e, P.dmg, { burn: P.burn });
        }
      }
      tone(900, 0.12, 'sawtooth', 0.03, -500);
    } else if (k === 'zap') {
      let cur = tg, from = { x: P.x, y: P.y }; const hit = new Set();
      for (let i = 0; i <= P.chain && cur; i++) {
        hit.add(cur);
        fx.push({ k: 'z', x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, life: 0.14, max: 0.14 });
        hitEnemy(cur, P.dmg * Math.pow(0.9, i), { stun: P.stun });
        from = { x: cur.x, y: cur.y };
        let nx = null, nd = P.chainRange;
        for (const e of enemies) { if (hit.has(e) || e.spawn > 0 || e.hp <= 0) continue; const d = Math.hypot(e.x - from.x, e.y - from.y); if (d < nd) { nd = d; nx = e; } }
        cur = nx;
      }
      tone(500, 0.08, 'sawtooth', 0.03, 300);
    }
  }
  function flameTick(tg) {
    const a = Math.atan2(tg.y - P.y, tg.x - P.x); P.aim = a;
    for (const e of enemies) {
      if (e.spawn > 0) continue;
      const d = Math.hypot(e.x - P.x, e.y - P.y);
      if (d > P.range + e.r) continue;
      let da = Math.atan2(e.y - P.y, e.x - P.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < P.cone / 2 + Math.atan2(e.r, Math.max(d, 1))) hitEnemy(e, P.dmg, { burn: P.burn, nocrit: Math.random() > 0.15 });
    }
  }

  // ---------- update ----------
  function update(dt) {
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt);
    for (const f of fx) { f.life -= dt; if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.96; f.vy *= 0.96; } else if (f.k === 'f') { f.x += f.vx * dt; f.y += f.vy * dt; } }
    fx = fx.filter(f => f.life > 0);
    if (state === 'over') { t0 += dt; return; }
    if (state !== 'play' && state !== 'clear') return;
    if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
    bannerT = Math.max(0, bannerT - dt);

    // move player (floating thumb stick or keys)
    let mx = joy.dx, my = joy.dy;
    if (keys.ArrowLeft || keys.a) mx -= 1; if (keys.ArrowRight || keys.d) mx += 1;
    if (keys.ArrowUp || keys.w) my -= 1; if (keys.ArrowDown || keys.s) my += 1;
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    P.x = clamp(P.x + mx * P.speed * dt, PAD + P.r, AW - PAD - P.r);
    P.y = clamp(P.y + my * P.speed * dt, TOP + P.r, AH - PAD - P.r);
    P.inv = Math.max(0, P.inv - dt);

    // spawns: opps drop in from the top of the room
    if (state === 'play') {
      spawnT -= dt;
      const alive = enemies.length, cap = Math.min(6 + Math.floor(run.room / 3), 14);
      if (queue.length && spawnT <= 0 && alive < cap) {
        const kind = queue.shift();
        if (kind === 'boss') spawn(kind, AW / 2, TOP + 70);
        else {
          let x, y, tries = 0;
          do { x = rand(PAD + 24, AW - PAD - 24); y = rand(TOP + 24, TOP + Math.min(220, (AH - TOP) * 0.4)); tries++; } while (Math.hypot(x - P.x, y - P.y) < 130 && tries < 12);
          spawn(kind, x, y);
        }
        spawnT = 0.4;
      }
    }

    // opps
    for (const e of enemies) {
      e.flash = Math.max(0, e.flash - dt);
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      if (e.burnT > 0) {
        e.burnT -= dt; e.hp -= e.burn * dt;
        if (Math.random() < dt * 8) fx.push({ k: 'p', x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: 0, vy: -30, life: 0.3, max: 0.3, col: '#ff8a2a' });
        if (P.spreadFire) for (const o of enemies) if (o !== e && o.burnT <= 0 && Math.hypot(o.x - e.x, o.y - e.y) < e.r + o.r + 16) { o.burn = e.burn; o.burnT = 1.5; }
        if (e.hp <= 0) { killEnemy(e); continue; }
      }
      if (e.stun > 0) { e.stun -= dt; continue; }
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      let sp = e.sp, vx = 0, vy = 0;
      if (e.boss) {
        vx = ux * sp; vy = uy * sp * 0.6;
        e.pt -= dt;
        if (e.pt <= 0) {
          e.pt = Math.max(1.1, 2.4 - e.bn * 0.2);
          const m = e.pat = ((e.pat || 0) + 1) % 3;
          const n = 12 + e.bn * 4;
          if (m === 0) for (let i = 0; i < n; i++) { const a = i / n * 6.28 + rand(0, 0.3); ebul.push({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, dmg: e.bdmg, r: 6, life: 6 }); }
          else if (m === 1) { const a0 = Math.atan2(dy, dx); for (let i = -2; i <= 2; i++) { const a = a0 + i * 0.16; ebul.push({ x: e.x, y: e.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, dmg: e.bdmg, r: 6, life: 6 }); } }
          else if (e.hp < e.max * 0.6) for (let i = 0; i < 3; i++) spawn('runt', clamp(e.x + rand(-60, 60), PAD + 12, AW - PAD - 12), clamp(e.y + 60, TOP + 12, AH - 60));
          tone(120, 0.3, 'sawtooth', 0.06);
        }
      } else if (e.kind === 'shooter') {
        if (d > 190) { vx = ux * sp; vy = uy * sp; } else if (d < 140) { vx = -ux * sp; vy = -uy * sp; } else { vx = -uy * sp * 0.6; vy = ux * sp * 0.6; }
        e.cd -= dt;
        if (e.cd <= 0) { e.cd = rand(1.8, 2.6); ebul.push({ x: e.x, y: e.y, vx: ux * 170, vy: uy * 170, dmg: e.bdmg, r: 5, life: 5 }); }
      } else if (e.kind === 'dasher') {
        if (e.st === 0) { vx = ux * sp; vy = uy * sp; e.cd -= dt; if (d < 230 && e.cd <= 0) { e.st = 1; e.stt = 0.6; } }
        else if (e.st === 1) { e.stt -= dt; e.dx = ux; e.dy = uy; if (e.stt <= 0) { e.st = 2; e.stt = 0.5; } }
        else { vx = e.dx * 400; vy = e.dy * 400; e.stt -= dt; if (e.stt <= 0) { e.st = 0; e.cd = rand(1.5, 2.5); } }
      } else { vx = ux * sp; vy = uy * sp; }
      for (const o of enemies) {                       // keep opps from stacking
        if (o === e || o.spawn > 0) continue;
        const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy) || 1, mn = e.r + o.r;
        if (od < mn) { vx += ox / od * 60; vy += oy / od * 60; }
      }
      e.x = clamp(e.x + vx * dt, PAD + e.r * 0.5, AW - PAD - e.r * 0.5);
      e.y = clamp(e.y + vy * dt, TOP + e.r * 0.5, AH - PAD - e.r * 0.5);
      if (Math.hypot(P.x - e.x, P.y - e.y) < e.r + P.r - 3) {
        hurtPlayer(e.dmg);
        if (P.inv > 0) { const k = 40 * dt * 60; e.x -= ux * k * 0.2; e.y -= uy * k * 0.2; }
      }
    }
    enemies = enemies.filter(e => e.hp > 0);

    // auto-fire at the nearest opp
    P.cd -= dt;
    const tg = nearest();
    if (tg) {
      P.aim = Math.atan2(tg.y - P.y, tg.x - P.x);
      if (P.ch.weapon === 'flame') {
        P.tick -= dt;
        while (P.tick <= 0) { P.tick += 1 / P.rate; flameTick(tg); }
        if (Math.random() < 0.9) { const a = P.aim + rand(-P.cone / 2, P.cone / 2), s = rand(150, 260); fx.push({ k: 'f', x: P.x + Math.cos(P.aim) * 16, y: P.y + Math.sin(P.aim) * 16, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: P.range / s * 0.9, max: P.range / s * 0.9 }); }
      } else if (P.cd <= 0) { P.cd = 1 / P.rate; fire(tg); }
    }

    // player bullets
    for (const b of pbul) {
      if (P.homing && b.k !== 'zap') {
        let best = null, bd = 220;
        for (const e of enemies) { if (e.spawn > 0) continue; const d = Math.hypot(e.x - b.x, e.y - b.y); if (d < bd) { bd = d; best = e; } }
        if (best) {
          const sp = Math.hypot(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx);
          let da = Math.atan2(best.y - b.y, best.x - b.x) - cur; da = Math.atan2(Math.sin(da), Math.cos(da));
          const na = cur + clamp(da, -dt * 2.2 * P.homing, dt * 2.2 * P.homing);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.k === 'rocket' && Math.random() < 0.6) fx.push({ k: 'p', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, col: '#ffcf6e' });
      let wall = false;
      if (b.x < PAD || b.x > AW - PAD) { if (b.rico > 0) { b.vx = -b.vx; b.x = clamp(b.x, PAD, AW - PAD); b.rico--; } else wall = true; }
      if (b.y < TOP || b.y > AH - PAD) { if (b.rico > 0) { b.vy = -b.vy; b.y = clamp(b.y, TOP, AH - PAD); b.rico--; } else wall = true; }
      if (wall) { b.dead = true; if (b.boom) boomAt(b); continue; }
      for (const e of enemies) {
        if (e.spawn > 0 || b.hit.has(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          b.hit.add(e);
          if (b.boom) { boomAt(b); b.dead = true; break; }
          hitEnemy(e, b.dmg, { burn: 0 });
          if (P.explo) blast(b.x, b.y, P.explo, b.dmg * 0.5);
          tone(300, 0.04, 'square', 0.02);
          if (b.pierce-- <= 0) { b.dead = true; break; }
        }
      }
      if (b.life <= 0) { b.dead = true; if (b.boom) boomAt(b); }
    }
    pbul = pbul.filter(b => !b.dead);

    // enemy bullets
    for (const b of ebul) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < 0 || b.x > AW || b.y < 0 || b.y > AH) b.life = 0;
      if (Math.hypot(P.x - b.x, P.y - b.y) < P.r - 2 + b.r && P.inv <= 0) { b.life = 0; hurtPlayer(b.dmg); }
    }
    ebul = ebul.filter(b => b.life > 0);

    // bananas
    for (const p of pickups) {
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; p.vx *= 0.9; p.vy *= 0.9;
      const d = Math.hypot(P.x - p.x, P.y - p.y);
      if (d < P.magnet || state === 'clear') { const s = 380 * dt; p.x += (P.x - p.x) / (d || 1) * s; p.y += (P.y - p.y) / (d || 1) * s; }
      if (d < P.r + 8) { p.got = 1; run.ban += p.v; save.ban += p.v; tone(900, 0.06, 'triangle', 0.04); }
    }
    pickups = pickups.filter(p => !p.got);

    // room cleared
    if (state === 'play' && !queue.length && !enemies.length) { state = 'clear'; clearT = 1.1; ebul = []; P.hp = Math.min(P.hpMax, P.hp + P.hpMax * (bossRoom(run.room) ? 0.3 : 0.08)); }
    if (state === 'clear') {
      clearT -= dt;
      if (clearT <= 0) { persist(); makeOffer(); state = 'upgrade'; }
    }
  }
  function boomAt(b) {
    blast(b.x, b.y, P.boom, b.dmg);
    for (let i = 0; i < P.cluster * 3; i++) { const a = i / (P.cluster * 3) * 6.28, d = P.boom * 0.9; setTimeout(() => state === 'play' && blast(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, P.boom * 0.5, b.dmg * 0.5), 120); }
  }

  // ---------- upgrade offers ----------
  function makeOffer() {
    const wk = P.ch.weapon;
    let pool = UPG.filter(u => (u.t === ALL || u.t.includes(wk)) && (run.stacks[u.id] || 0) < u.max);
    const w = u => (u.t === ALL ? 1 : 3) * (pen[u.id] || 1);
    offer = [];
    while (offer.length < 3 && pool.length) {
      const tot = pool.reduce((a, u) => a + w(u), 0);
      let r = Math.random() * tot, pick = pool[0];
      for (const u of pool) { r -= w(u); if (r <= 0) { pick = u; break; } }
      offer.push(pick); pool = pool.filter(u => u !== pick);
    }
  }
  function choose(u) {
    for (const o of offer) if (o !== u) pen[o.id] = (pen[o.id] || 1) * (o.t === ALL ? 0.2 : 0.7);   // passed-over picks fade, weapon ones fade less
    run.stacks[u.id] = (run.stacks[u.id] || 0) + 1;
    u.f(P); tone(520, 0.2, 'triangle', 0.06, 400);
    run.room++; startRoom(); state = 'play';
  }

  // ---------- input ----------
  const toLogical = e => ({ x: e.clientX / S, y: e.clientY / S });
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
    if (ac && ac.state === 'suspended') ac.resume();
    const { x, y } = toLogical(e);
    for (let i = btns.length - 1; i >= 0; i--) { const b = btns[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.cb(); return; } }
    if ((state === 'play' || state === 'clear') && !joy.on) {
      joy.on = true; joy.id = e.pointerId; joy.ox = joy.x = x; joy.oy = joy.y = y; joy.dx = joy.dy = 0;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!joy.on || e.pointerId !== joy.id) return;
    const { x, y } = toLogical(e);
    let dx = x - joy.ox, dy = y - joy.oy; const d = Math.hypot(dx, dy), R = 46;
    if (d > R) { joy.ox += dx / d * (d - R); joy.oy += dy / d * (d - R); dx = x - joy.ox; dy = y - joy.oy; }   // stick follows the thumb
    joy.x = x; joy.y = y; joy.dx = clamp(dx / R, -1, 1); joy.dy = clamp(dy / R, -1, 1);
  });
  const up = e => { if (joy.on && e.pointerId === joy.id) { joy.on = false; joy.dx = joy.dy = 0; } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => { keys[e.key] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.key] = false; });

  // ---------- drawing ----------
  function txt(s, x, y, size, col, al = 'center') { ctx.font = FONT(size); ctx.fillStyle = col; ctx.textAlign = al; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function button(x, y, w, h, label, cb, o = {}) {
    btns.push({ x, y, w, h, cb: o.off ? () => {} : cb });
    rr(x, y, w, h, 14); ctx.fillStyle = o.off ? '#3a3552' : (o.col || '#ffd34d'); ctx.fill();
    txt(label, x + w / 2, y + h / 2 + 1, o.size || 22, o.off ? '#8c86a6' : '#1c1235');
  }

  function drawApe(g, x, y, r, ch, aim, bob = 0) {
    const sv = ctx; // draw with the shared context
    sv.save(); sv.translate(x, y + bob);
    const fur = ch.fur, skin = ch.skin;
    sv.fillStyle = fur;
    sv.beginPath(); sv.ellipse(0, r * 1.05, r * 0.85, r * 0.55, 0, 0, 6.28); sv.fill();             // shoulders
    sv.beginPath(); sv.arc(-r * 0.95, -r * 0.05, r * 0.32, 0, 6.28); sv.arc(r * 0.95, -r * 0.05, r * 0.32, 0, 6.28); sv.fill();   // ears
    sv.fillStyle = skin; sv.beginPath(); sv.arc(-r * 0.95, -r * 0.05, r * 0.18, 0, 6.28); sv.arc(r * 0.95, -r * 0.05, r * 0.18, 0, 6.28); sv.fill();
    sv.fillStyle = fur; sv.beginPath(); sv.arc(0, 0, r, 0, 6.28); sv.fill();                          // head
    sv.fillStyle = skin; sv.beginPath(); sv.ellipse(0, r * 0.38, r * 0.62, r * 0.46, 0, 0, 6.28); sv.fill();   // muzzle
    sv.beginPath(); sv.ellipse(-r * 0.3, -r * 0.12, r * 0.28, r * 0.24, 0, 0, 6.28); sv.ellipse(r * 0.3, -r * 0.12, r * 0.28, r * 0.24, 0, 0, 6.28); sv.fill();
    const look = aim == null ? 0 : Math.cos(aim) * r * 0.06, lookY = aim == null ? 0 : Math.sin(aim) * r * 0.05;
    for (const sx of [-1, 1]) {                                                                           // bored half-lidded eyes
      sv.fillStyle = '#fff'; sv.beginPath(); sv.arc(sx * r * 0.3, -r * 0.1, r * 0.17, 0, 6.28); sv.fill();
      sv.fillStyle = '#111'; sv.beginPath(); sv.arc(sx * r * 0.3 + look, -r * 0.05 + lookY, r * 0.08, 0, 6.28); sv.fill();
      sv.fillStyle = fur; sv.fillRect(sx * r * 0.3 - r * 0.2, -r * 0.3, r * 0.4, r * 0.2);
    }
    sv.strokeStyle = '#2b1a10'; sv.lineWidth = Math.max(1.5, r * 0.06); sv.beginPath(); sv.moveTo(-r * 0.2, r * 0.5); sv.lineTo(r * 0.2, r * 0.52); sv.stroke();   // flat mouth
    sv.fillStyle = '#2b1a10'; sv.fillRect(-r * 0.12, r * 0.22, r * 0.05, r * 0.07); sv.fillRect(r * 0.07, r * 0.22, r * 0.05, r * 0.07);
    const a = ch.acc;
    if (a === 'bucket') { sv.fillStyle = '#4c8dff'; sv.beginPath(); sv.moveTo(-r * 0.75, -r * 0.55); sv.lineTo(-r * 0.55, -r * 1.15); sv.lineTo(r * 0.55, -r * 1.15); sv.lineTo(r * 0.75, -r * 0.55); sv.closePath(); sv.fill(); sv.fillRect(-r * 1, -r * 0.62, r * 2, r * 0.14); }
    else if (a === 'visor') { sv.fillStyle = '#ff3df2'; rr(-r * 0.68, -r * 0.3, r * 1.36, r * 0.3, r * 0.1); sv.fill(); sv.fillStyle = '#fff'; sv.fillRect(-r * 0.3, -r * 0.2, r * 0.12, r * 0.08); sv.fillRect(r * 0.18, -r * 0.2, r * 0.12, r * 0.08); }
    else if (a === 'band') { sv.fillStyle = '#ffeb3b'; sv.fillRect(-r * 0.98, -r * 0.62, r * 1.96, r * 0.2); sv.fillRect(r * 0.9, -r * 0.62, r * 0.4, r * 0.1); }
    else if (a === 'cap') { sv.fillStyle = '#2d7d46'; sv.beginPath(); sv.arc(0, -r * 0.55, r * 0.8, Math.PI, 0); sv.fill(); sv.fillRect(-r * 0.2, -r * 0.62, r * 1.3, r * 0.14); }
    else if (a === 'helmet') { sv.fillStyle = '#5b6b7a'; sv.beginPath(); sv.arc(0, -r * 0.2, r * 1.04, Math.PI * 1.05, Math.PI * 1.95); sv.fill(); sv.fillStyle = '#ffcf6e'; sv.fillRect(-r * 0.1, -r * 1.1, r * 0.2, r * 0.3); }
    else if (a === 'wizard') { sv.fillStyle = '#6c3fc9'; sv.beginPath(); sv.moveTo(-r * 0.85, -r * 0.55); sv.lineTo(0, -r * 1.9); sv.lineTo(r * 0.85, -r * 0.55); sv.closePath(); sv.fill(); sv.fillStyle = '#ffd34d'; sv.fillRect(-r * 0.9, -r * 0.62, r * 1.8, r * 0.14); }
    if (aim != null) {                                                                                  // weapon in hand
      sv.rotate(aim); sv.fillStyle = '#d0d0dc';
      const w = ch.weapon;
      if (w === 'flame') { sv.fillRect(r * 0.5, -3, r * 1.1, 6); sv.fillStyle = '#ff8a2a'; sv.fillRect(r * 1.5, -4, 5, 8); }
      else if (w === 'rocket') { sv.fillStyle = '#6b7280'; sv.fillRect(r * 0.4, -5, r * 1.3, 10); sv.fillStyle = '#ff5a5a'; sv.fillRect(r * 1.6, -5, 5, 10); }
      else if (w === 'zap') { sv.fillStyle = '#8a5a2b'; sv.fillRect(r * 0.4, -2, r * 1.3, 4); sv.fillStyle = '#7df9ff'; sv.beginPath(); sv.arc(r * 1.75, 0, 5, 0, 6.28); sv.fill(); }
      else if (w === 'laser') { /* eyes fire it */ }
      else { sv.fillRect(r * 0.5, -3, r * (w === 'shotgun' ? 1.3 : 0.9), w === 'shotgun' ? 6 : 5); }
    }
    sv.restore();
  }
  function drawOpp(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.spawn > 0) {
      ctx.strokeStyle = e.col; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(e.spawn * 30); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, e.r * (0.6 + e.spawn), 0, 6.28); ctx.stroke(); ctx.restore(); return;
    }
    const r = e.r, tele = e.st === 1;
    ctx.fillStyle = e.flash > 0 ? '#fff' : (tele ? '#fff' : e.col);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill();
    if (e.burnT > 0) { ctx.fillStyle = 'rgba(255,138,42,.35)'; ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(0, r * 0.25, r * 0.85, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.55, -r * 0.3, r * 0.4, r * 0.3); ctx.fillRect(r * 0.15, -r * 0.3, r * 0.4, r * 0.3);   // angry eyes
    ctx.fillStyle = '#111'; ctx.fillRect(-r * 0.4, -r * 0.22, r * 0.14, r * 0.2); ctx.fillRect(r * 0.28, -r * 0.22, r * 0.14, r * 0.2);
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath(); ctx.moveTo(-r * 0.65, -r * 0.55); ctx.lineTo(-r * 0.1, -r * 0.32); ctx.moveTo(r * 0.65, -r * 0.55); ctx.lineTo(r * 0.1, -r * 0.32); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.fillRect(-r * 0.4, r * 0.35, r * 0.8, r * 0.14);
    if (e.kind === 'tank' || e.boss) { ctx.fillStyle = '#222'; ctx.fillRect(-r * 0.9, -r * 0.95, r * 1.8, r * 0.22); }
    if (e.boss) { ctx.fillStyle = '#ffd34d'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.36 - 7, -r * 0.95); ctx.lineTo(i * r * 0.36, -r * 1.3); ctx.lineTo(i * r * 0.36 + 7, -r * 0.95); ctx.fill(); } }
    if (e.hp < e.max && !e.boss) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-r, r + 5, r * 2, 3); ctx.fillStyle = '#7bed9f'; ctx.fillRect(-r, r + 5, r * 2 * Math.max(0, e.hp / e.max), 3); }
    ctx.restore();
  }


  // ---------- environments: every room gets its own look ----------
  const ENVS = [
    { n: 'Jungle Temple',  bg: ['#0f2a1a', '#1d4a2c'], floor: '#1b3a24', grid: 'rgba(190,255,190,.07)', edge: '#5fbf6a', amb: 'fireflies', prop: 'tree' },
    { n: 'Neon Alley',     bg: ['#12062a', '#2a0a4a'], floor: '#170b32', grid: 'rgba(255,61,242,.16)',  edge: '#ff3df2', amb: 'rain',      prop: 'sign' },
    { n: 'Frozen Cavern',  bg: ['#0b2236', '#1b4a6b'], floor: '#17405c', grid: 'rgba(200,240,255,.12)', edge: '#8fe3ff', amb: 'snow',      prop: 'crystal' },
    { n: 'Lava Foundry',   bg: ['#2a0c06', '#5a1a0a'], floor: '#3a1a12', grid: 'rgba(255,140,60,.12)',  edge: '#ff6a2a', amb: 'embers',    prop: 'vent' },
    { n: 'Space Station',  bg: ['#050814', '#101a3a'], floor: '#161d36', grid: 'rgba(120,170,255,.14)', edge: '#6aa3ff', amb: 'stars',     prop: 'panel' },
    { n: 'Desert Ruins',   bg: ['#4a2f12', '#a8742f'], floor: '#8a5f2a', grid: 'rgba(60,30,0,.16)',     edge: '#e6b35a', amb: 'dust',      prop: 'pillar' },
    { n: 'Haunted Manor',  bg: ['#14101e', '#2b2140'], floor: '#2a2038', grid: 'rgba(190,170,255,.08)', edge: '#9b86d6', amb: 'ghosts',    prop: 'tomb' },
    { n: 'Coral Reef',     bg: ['#04243a', '#0a5a7a'], floor: '#0d4a63', grid: 'rgba(140,255,240,.09)', edge: '#4de0d0', amb: 'bubbles',   prop: 'coral' },
  ];
  const envOf = room => ENVS[(room - 1) % ENVS.length];
  function seeded(n) { let a = n * 9301 + 7; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function drawProp(kind, x, y, sz, env) {
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 0.55;
    if (kind === 'tree') { ctx.fillStyle = '#4a2f18'; ctx.fillRect(-2, 0, 4, sz * 0.6); ctx.fillStyle = '#2f7a3a'; ctx.beginPath(); ctx.arc(0, -sz * 0.1, sz * 0.55, 0, 6.28); ctx.arc(-sz * 0.3, sz * 0.1, sz * 0.38, 0, 6.28); ctx.arc(sz * 0.3, sz * 0.1, sz * 0.38, 0, 6.28); ctx.fill(); }
    else if (kind === 'sign') { ctx.fillStyle = env.edge; ctx.fillRect(-sz * 0.4, -sz * 0.2, sz * 0.8, sz * 0.4); ctx.fillStyle = env.floor; ctx.fillRect(-sz * 0.32, -sz * 0.12, sz * 0.64, sz * 0.24); ctx.fillStyle = '#7df9ff'; ctx.fillRect(-sz * 0.2, -sz * 0.04, sz * 0.4, 3); }
    else if (kind === 'crystal') { ctx.fillStyle = '#b8eeff'; ctx.beginPath(); ctx.moveTo(0, -sz * 0.6); ctx.lineTo(sz * 0.25, sz * 0.2); ctx.lineTo(-sz * 0.25, sz * 0.2); ctx.fill(); ctx.fillStyle = '#7fd1f5'; ctx.beginPath(); ctx.moveTo(sz * 0.3, -sz * 0.2); ctx.lineTo(sz * 0.5, sz * 0.2); ctx.lineTo(sz * 0.12, sz * 0.2); ctx.fill(); }
    else if (kind === 'vent') { ctx.fillStyle = '#1a0c08'; ctx.beginPath(); ctx.ellipse(0, 0, sz * 0.5, sz * 0.28, 0, 0, 6.28); ctx.fill(); ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.ellipse(0, 0, sz * 0.32, sz * 0.15, 0, 0, 6.28); ctx.fill(); }
    else if (kind === 'panel') { ctx.fillStyle = '#26315a'; ctx.fillRect(-sz * 0.45, -sz * 0.3, sz * 0.9, sz * 0.6); ctx.fillStyle = '#6aa3ff'; ctx.fillRect(-sz * 0.35, -sz * 0.2, 6, 4); ctx.fillStyle = '#7bed9f'; ctx.fillRect(-sz * 0.1, -sz * 0.2, 6, 4); ctx.fillStyle = '#ff6b6b'; ctx.fillRect(sz * 0.15, -sz * 0.2, 6, 4); ctx.fillStyle = '#0b1230'; ctx.fillRect(-sz * 0.35, 0, sz * 0.7, sz * 0.18); }
    else if (kind === 'pillar') { ctx.fillStyle = '#d2a566'; ctx.fillRect(-sz * 0.2, -sz * 0.5, sz * 0.4, sz); ctx.fillStyle = '#b98a4c'; ctx.fillRect(-sz * 0.32, -sz * 0.55, sz * 0.64, sz * 0.12); ctx.fillRect(-sz * 0.32, sz * 0.42, sz * 0.64, sz * 0.12); }
    else if (kind === 'tomb') { ctx.fillStyle = '#6f6a85'; ctx.beginPath(); ctx.moveTo(-sz * 0.3, sz * 0.4); ctx.lineTo(-sz * 0.3, -sz * 0.1); ctx.arc(0, -sz * 0.1, sz * 0.3, Math.PI, 0); ctx.lineTo(sz * 0.3, sz * 0.4); ctx.fill(); ctx.fillStyle = '#4b4761'; ctx.fillRect(-2, -sz * 0.2, 4, sz * 0.3); ctx.fillRect(-sz * 0.12, -sz * 0.1, sz * 0.24, 4); }
    else if (kind === 'coral') { ctx.strokeStyle = '#ff7aa8'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, sz * 0.4); ctx.lineTo(0, -sz * 0.2); ctx.moveTo(0, sz * 0.1); ctx.lineTo(-sz * 0.3, -sz * 0.2); ctx.moveTo(0, 0); ctx.lineTo(sz * 0.3, -sz * 0.35); ctx.stroke(); }
    ctx.restore();
  }
  function drawBackdrop(room, now) {
    const env = envOf(room), boss = bossRoom(room);
    const g = ctx.createLinearGradient(0, 0, 0, AH); g.addColorStop(0, env.bg[0]); g.addColorStop(1, env.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, AW, AH);
    if (boss) { const v = ctx.createRadialGradient(AW / 2, AH / 2, AH * 0.2, AW / 2, AH / 2, AH * 0.8); v.addColorStop(0, 'rgba(232,67,147,0)'); v.addColorStop(1, 'rgba(232,67,147,.28)'); ctx.fillStyle = v; ctx.fillRect(0, 0, AW, AH); }
  }
  function drawFloor(room) {
    const env = envOf(room), boss = bossRoom(room);
    ctx.fillStyle = env.floor; rr(PAD - 6, TOP - 6, AW - PAD * 2 + 12, AH - TOP - PAD + 12, 16); ctx.fill();
    ctx.strokeStyle = env.grid; ctx.lineWidth = 1;
    const step = env.prop === 'pillar' ? 48 : 36;
    for (let x = PAD; x < AW - PAD; x += step) { ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, AH - PAD); ctx.stroke(); }
    for (let y = TOP; y < AH - PAD; y += step) { ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(AW - PAD, y); ctx.stroke(); }
    const rnd = seeded(room);                                          // props sit along the walls so they never block the fight
    for (let i = 0; i < 10; i++) {
      const left = i % 2 === 0, y = TOP + 30 + rnd() * (AH - TOP - PAD - 60), sz = 18 + rnd() * 14;
      drawProp(env.prop, left ? PAD + 12 + rnd() * 6 : AW - PAD - 12 - rnd() * 6, y, sz, env);
    }
    ctx.strokeStyle = boss ? '#e84393' : env.edge; ctx.lineWidth = 4; rr(PAD - 6, TOP - 6, AW - PAD * 2 + 12, AH - TOP - PAD + 12, 16); ctx.stroke();
  }
  function drawAmbient(room, now) {
    const env = envOf(room), t = now / 1000, rnd = seeded(room + 99);
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const sx = rnd(), sy = rnd(), sp = 0.4 + rnd() * 0.8;
      let x = sx * AW, y = sy * AH;
      switch (env.amb) {
        case 'snow':    y = (sy * AH + t * 28 * sp) % AH; x += Math.sin(t + i) * 12; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x, y, 2.5, 2.5); break;
        case 'rain':    y = (sy * AH + t * 420 * sp) % AH; ctx.strokeStyle = i % 2 ? 'rgba(125,249,255,.35)' : 'rgba(255,61,242,.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14); ctx.stroke(); break;
        case 'embers':  y = AH - (sy * AH + t * 40 * sp) % AH; x += Math.sin(t * 2 + i) * 10; ctx.fillStyle = `rgba(255,${120 + (i * 9) % 100},40,.75)`; ctx.fillRect(x, y, 3, 3); break;
        case 'stars':   ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t * sp + i))})`; ctx.fillRect(x, y, 2, 2); break;
        case 'dust':    x = (sx * AW + t * 30 * sp) % AW; y += Math.sin(t + i) * 6; ctx.fillStyle = 'rgba(255,230,170,.35)'; ctx.fillRect(x, y, 2.5, 2.5); break;
        case 'fireflies': x += Math.sin(t * sp + i) * 24; y += Math.cos(t * sp * 0.8 + i) * 24; ctx.fillStyle = `rgba(220,255,120,${0.3 + 0.6 * Math.abs(Math.sin(t * 1.5 + i))})`; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 6.28); ctx.fill(); break;
        case 'ghosts':  y = AH - (sy * AH + t * 20 * sp) % AH; x += Math.sin(t + i) * 16; ctx.fillStyle = 'rgba(210,200,255,.14)'; ctx.beginPath(); ctx.arc(x, y, 10 + (i % 3) * 4, 0, 6.28); ctx.fill(); break;
        case 'bubbles': y = AH - (sy * AH + t * 34 * sp) % AH; x += Math.sin(t * 1.5 + i) * 8; ctx.strokeStyle = 'rgba(200,255,250,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 2 + (i % 4) * 1.5, 0, 6.28); ctx.stroke(); break;
      }
    }
    ctx.restore();
  }

  function draw(now) {
    btns = [];
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    if (state === 'menu') {
      const g = ctx.createLinearGradient(0, 0, 0, AH); g.addColorStop(0, '#1d1235'); g.addColorStop(1, '#2d1b4e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, AW, AH);
      return drawMenu(now);
    }
    drawBackdrop(run.room, now);

    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 24, rand(-1, 1) * shake * 24);
    drawFloor(run.room);
    drawAmbient(run.room, now);
    if (state === 'clear') { ctx.fillStyle = '#ffd34d'; rr(AW / 2 - 30, TOP - 9, 60, 8, 3); ctx.fill(); }    // door opens at the top

    for (const p of pickups) { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 7, 4, -0.6, 0, 6.28); ctx.fill(); }
    for (const e of enemies) drawOpp(e);
    for (const f of fx) {
      const a = Math.max(0, f.life / (f.max || 1));
      if (f.k === 'p') { ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
      else if (f.k === 'f') { ctx.globalAlpha = a * 0.8; ctx.fillStyle = a > 0.5 ? '#ffd34d' : '#ff5a1f'; ctx.beginPath(); ctx.arc(f.x, f.y, 4 + (1 - a) * 6, 0, 6.28); ctx.fill(); }
      else if (f.k === 'r') { ctx.globalAlpha = a; ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - a * 0.6), 0, 6.28); ctx.stroke(); }
      else if (f.k === 'l') { ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = f.w * a + 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, f.w * a * 0.4); ctx.stroke(); }
      else if (f.k === 'z') { ctx.globalAlpha = a; ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); const n = 5; for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(f.x1 + (f.x2 - f.x1) * u + rand(-8, 8), f.y1 + (f.y2 - f.y1) * u + rand(-8, 8)); } ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
      else if (f.k === 'c') { ctx.globalAlpha = a; txt('CRIT', f.x, f.y - (1 - a) * 18, 12, '#ffd34d'); }
      ctx.globalAlpha = 1;
    }
    for (const b of pbul) { ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.28); ctx.fill(); }
    for (const b of ebul) { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, 6.28); ctx.fill(); }
    if (state === 'play' || state === 'clear') {
      const blink = P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0;
      ctx.globalAlpha = blink ? 0.35 : 1;
      drawApe(ctx, P.x, P.y, P.r, P.ch, P.aim);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // thumb stick
    if (joy.on) {
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 46, 0, 6.28); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(joy.ox + joy.dx * 46, joy.oy + joy.dy * 46, 18, 0, 6.28); ctx.fill();
    } else if (state === 'play' && run.room === 1 && bannerT > 0) txt('Drag with your thumb to move', AW / 2, AH - 40, 15, 'rgba(255,255,255,.7)');

    if (flash > 0) { ctx.fillStyle = `rgba(255,70,110,${flash * 0.6})`; ctx.fillRect(0, 0, AW, AH); }
    drawHud();
    if (bannerT > 0 && state === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT);
      if (bossRoom(run.room)) { txt('BOSS', AW / 2, AH * 0.45, 56, '#e84393'); txt(envOf(run.room).n.toUpperCase() + '  -  ROOM ' + run.room, AW / 2, AH * 0.45 + 44, 16, '#fff'); }
      else { txt('ROOM ' + run.room, AW / 2, AH * 0.45, 40, '#fff'); txt(envOf(run.room).n.toUpperCase(), AW / 2, AH * 0.45 + 38, 16, envOf(run.room).edge); }
      ctx.globalAlpha = 1;
    }
    if (msg) txt(msg.s, AW / 2, AH * 0.5, 34, '#ffd34d');
    if (state === 'clear') txt(bossRoom(run.room) ? 'BOSS DOWN!' : 'ROOM CLEAR', AW / 2, AH * 0.45, 36, '#7bed9f');
    if (state === 'upgrade') drawUpgrade();
    if (state === 'over') drawOver();
  }

  function drawHud() {
    const y = 44;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(16, y - 8, AW - 32, 16, 8); ctx.fill();
    ctx.fillStyle = P.hp / P.hpMax > 0.35 ? '#7bed9f' : '#ff6b6b'; rr(16, y - 8, Math.max(0, (AW - 32) * P.hp / P.hpMax), 16, 8); ctx.fill();
    txt(Math.ceil(P.hp) + ' / ' + P.hpMax, AW / 2, y + 1, 11, '#10101a');
    txt('ROOM ' + run.room, 16, y + 26, 15, '#fff', 'left');
    for (let i = 0; i < 2; i++) { ctx.fillStyle = i < P.lives ? '#ff4d6d' : 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.arc(AW / 2 - 12 + i * 24, y + 27, 8, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(AW - 90, y + 26, 7, 4, -0.6, 0, 6.28); ctx.fill();
    txt(String(save.ban), AW - 16, y + 26, 15, '#ffd34d', 'right');
    const boss = enemies.find(e => e.boss);
    if (boss) { ctx.fillStyle = 'rgba(0,0,0,.4)'; rr(16, y + 44, AW - 32, 10, 5); ctx.fill(); ctx.fillStyle = '#e84393'; rr(16, y + 44, Math.max(0, (AW - 32) * boss.hp / boss.max), 10, 5); ctx.fill(); }
  }

  function drawMenu(now) {
    const ch = CHARS[sel], w = WEAP[ch.weapon], owned = save.owned[ch.id];
    txt('BANANA', AW / 2, 80, Math.min(54, AW * 0.15), '#ffd34d'); txt('BREACH', AW / 2, 80 + Math.min(54, AW * 0.15) * 0.95, Math.min(54, AW * 0.15), '#fff');
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(AW - 86, 28, 7, 4, -0.6, 0, 6.28); ctx.fill(); txt(String(save.ban), AW - 16, 28, 16, '#ffd34d', 'right');
    const cy = Math.max(300, AH * 0.42);
    ctx.save(); if (!owned) ctx.globalAlpha = 0.6;
    drawApe(ctx, AW / 2, cy, 64, ch, null, Math.sin(now / 500) * 4);
    ctx.restore();
    if (!owned) txt('LOCKED', AW / 2, cy + 120, 16, '#ff9f43');
    txt(ch.name.toUpperCase(), AW / 2, cy + 150, 30, '#fff');
    txt(w.name + '  -  ' + w.desc, AW / 2, cy + 180, 12, '#c9bdf0');
    txt('HP ' + ch.hp + '    SPEED ' + ch.spd, AW / 2, cy + 202, 13, '#9d8fd0');
    button(10, cy - 24, 56, 48, '<', () => { sel = (sel + CHARS.length - 1) % CHARS.length; }, { col: '#4a3a7a', size: 26 });
    button(AW - 66, cy - 24, 56, 48, '>', () => { sel = (sel + 1) % CHARS.length; }, { col: '#4a3a7a', size: 26 });
    for (let i = 0; i < CHARS.length; i++) { ctx.fillStyle = i === sel ? '#ffd34d' : (save.owned[CHARS[i].id] ? '#7a6cb0' : '#3a3552'); ctx.beginPath(); ctx.arc(AW / 2 + (i - (CHARS.length - 1) / 2) * 18, cy + 226, 4.5, 0, 6.28); ctx.fill(); }
    const by = Math.min(AH - 100, cy + 250);
    if (owned) button(40, by, AW - 80, 58, 'PLAY', () => { save.sel = sel; persist(); startRun(); });
    else button(40, by, AW - 80, 58, save.ban >= ch.cost ? `BUY  ${ch.cost} BANANAS` : `NEED ${ch.cost} BANANAS`, () => { save.ban -= ch.cost; save.owned[ch.id] = 1; persist(); tone(600, 0.3, 'triangle', 0.08, 500); }, { off: save.ban < ch.cost, col: '#7bed9f', size: 18 });
    txt('Best room: ' + save.best, AW / 2, by + 80, 13, '#9d8fd0');
  }

  function drawUpgrade() {
    ctx.fillStyle = 'rgba(15,8,35,.86)'; ctx.fillRect(0, 0, AW, AH);
    txt('ROOM ' + run.room + ' CLEARED', AW / 2, 80, 16, '#9d8fd0');
    txt('PICK ONE UPGRADE', AW / 2, 112, 26, '#fff');
    const ch = Math.min(124, (AH - 200) / 3 - 14);
    offer.forEach((u, i) => {
      const y = 150 + i * (ch + 14), wk = u.t !== ALL;
      button(20, y, AW - 40, ch, '', () => choose(u), { col: wk ? '#3b2a6e' : '#2c2350' });
      ctx.strokeStyle = wk ? P.col : '#6c5aa8'; ctx.lineWidth = 2; rr(20, y, AW - 40, ch, 14); ctx.stroke();
      txt(wk ? P.ch.weapon.toUpperCase() + ' UPGRADE' : 'GENERAL', 36, y + 22, 11, wk ? P.col : '#9d8fd0', 'left');
      const s = run.stacks[u.id] || 0; if (s) txt('x' + s + ' owned', AW - 36, y + 22, 11, '#9d8fd0', 'right');
      txt(u.n, 36, y + ch / 2, 22, '#fff', 'left');
      txt(u.d, 36, y + ch - 26, 13, '#d4c9f5', 'left');
    });
  }
  function drawOver() {
    ctx.fillStyle = 'rgba(15,8,35,.82)'; ctx.fillRect(0, 0, AW, AH);
    txt('OUT OF LIVES', AW / 2, AH * 0.22, 36, '#ff6b6b');
    txt('Reached room ' + run.room, AW / 2, AH * 0.22 + 52, 24, '#fff');
    txt(run.kills + ' opps beaten', AW / 2, AH * 0.22 + 84, 15, '#c9bdf0');
    txt('+' + run.ban + ' bananas banked', AW / 2, AH * 0.22 + 108, 15, '#ffd34d');
    txt(run.room >= save.best ? 'NEW BEST ROOM' : 'Best room ' + save.best, AW / 2, AH * 0.22 + 134, 14, '#9d8fd0');
    if (t0 > 0.5) {
      button(40, AH * 0.52, AW - 80, 56, 'TRY AGAIN', () => startRun());
      button(40, AH * 0.52 + 70, AW - 80, 56, 'CHANGE MONKEY', () => { state = 'menu'; }, { col: '#7bed9f' });
    }
  }

  // ---------- loop ----------
  window.__bb = { hurt: d => { P.inv = 0; hurtPlayer(d); }, pick: i => { sel = i; }, start: () => startRun(), skip: () => { enemies = []; queue = []; }, room: n => { run.room = n; startRoom(); }, god: () => { P.hpMax = P.hp = 1e6; }, st: () => ({ state, run, P }) };
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); draw(now); requestAnimationFrame(loop);
  })(last);
})();
