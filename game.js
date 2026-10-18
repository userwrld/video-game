// Banana Breach: clear rooms of opps, pick one of three upgrades, beat a boss every 15 rooms.
// Drag anywhere with your thumb to move. Your monkey starts at the bottom, opps drop in from the top, and it auto-fires.
(() => {
  const cv = document.getElementById('c'); let ctx = cv.getContext('2d'); const mainCtx = ctx;
  let W, H, S, AW, AH, dpr, hudY = 44, UIY = 0;
  let TOP = 96, BOT = 16;                 // arena edges: top clears the HUD and notch, bottom clears the home bar
  const PAD = 16;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;
    S = Math.min(W / 360, H / 640);
    AW = W / S; AH = H / S;
    const probe = document.getElementById('probe'), cs = probe ? getComputedStyle(probe) : null;      // phone notch and home bar
    const sat = cs ? (parseFloat(cs.paddingTop) || 0) / S : 0, sab = cs ? (parseFloat(cs.paddingBottom) || 0) / S : 0;
    hudY = Math.max(30, sat + 24); TOP = hudY + 62; BOT = Math.max(14, sab + 8); UIY = Math.max(0, sat - 20);
    cv.width = W * dpr; cv.height = H * dpr;
  }
  const onResize = () => {
    resize();
    if (typeof P !== 'undefined' && P) { P.x = clamp(P.x, PAD + P.r, AW - PAD - P.r); P.y = clamp(P.y, TOP + P.r, AH - BOT - P.r); }
    for (const e of enemies) { e.x = clamp(e.x, PAD, AW - PAD); e.y = clamp(e.y, TOP, AH - BOT); }
    if (typeof run !== 'undefined' && run && typeof P !== 'undefined' && P && state !== 'menu' && state !== 'shop') { genWalls(run.room); if (inWall(P.x, P.y, P.r)) { P.x = AW / 2; P.y = AH - BOT - 70; } floorCache.key = ''; }
  };
  addEventListener('resize', onResize); addEventListener('orientationchange', () => setTimeout(onResize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  resize();

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const FONT = s => `800 ${s}px -apple-system, "Segoe UI", Roboto, system-ui, sans-serif`;

  // ---------- save data ----------
  let save = { ban: 0, owned: { rusty: 1, neon: 1 }, best: 0, sel: 0, perm: {}, snap: null };
  const CHAR_IDS = ['rusty', 'neon', 'ash', 'boomer', 'blitz', 'sparks', 'slash', 'don', 'disco', 'robin', 'dyna'], PERM_IDS = ['hp', 'dmg', 'rate', 'spd', 'ban', 'crit'];
  try {
    const raw = JSON.parse(localStorage.getItem('banana-breach') || '{}');       // only accept values of the expected shape
    const num = (v, max) => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);
    save.ban = num(raw.ban, 1e9); save.best = num(raw.best, 1e6); save.sel = num(raw.sel, 10);
    if (raw.owned && typeof raw.owned === 'object') for (const id of CHAR_IDS) if (raw.owned[id] === 1) save.owned[id] = 1;
    if (raw.perm && typeof raw.perm === 'object') for (const id of CHAR_IDS) { const o = raw.perm[id]; if (o && typeof o === 'object') { save.perm[id] = {}; for (const k of PERM_IDS) save.perm[id][k] = num(o[k], 10); } }
    if (raw.snap && typeof raw.snap === 'object' && CHAR_IDS.includes(raw.snap.ch) && Number.isFinite(raw.snap.room)) save.snap = raw.snap;     // checked again before use
  } catch (e) {}
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
    cd:      { name: 'CD Slinger',   desc: 'Spinning CDs that bounce off walls and slice through opps.', dmg: 11, rate: 2.3, count: 1, spread: 0.22, speed: 400, life: 1.9, pierce: 3, rico: 2, reach: 400, col: '#cfe9ff' },
    bow:     { name: 'Hunter Bow',   desc: 'Fast arrows that punch through whole lines of opps.', dmg: 19, rate: 1.5, count: 1, spread: 0.2, speed: 700, life: 0.85, pierce: 2, reach: 450, col: '#e6d49a' },
    nade:    { name: 'Dynamite',     desc: 'Lobbed sticks that blow up after a short fuse.', dmg: 30, rate: 0.8, count: 1, spread: 0.16, speed: 270, life: 1, boom: 60, reach: 390, col: '#ff6b4a' },
    blade:   { name: 'Combat Knife', desc: 'Close-range slashes hit everything in front of you.', dmg: 16, rate: 3, range: 66, cone: 1.7, burn: 0, knives: 0, reach: 66, col: '#d7dbe6' },
    tommy:   { name: 'Tommy Gun',    desc: 'Rapid-fire spray. Messy but relentless.', dmg: 5.5, rate: 9, count: 1, spread: 0.14, speed: 560, life: 0.8, pierce: 0, reach: 380, col: '#ffd37a' },
    zap:     { name: 'Volt Staff',   desc: 'Lightning that jumps between opps.', dmg: 11, rate: 2, chain: 2, range: 190, chainRange: 110, reach: 190, col: '#7df9ff' },
  };
  const CHARS = [
    { id: 'rusty', name: 'Rusty',  weapon: 'gun',     cost: 0,   fur: '#8a5a2b', skin: '#d9b48a', acc: 'bucket',  hp: 100, spd: 150 },
    { id: 'neon',  name: 'Neon',   weapon: 'laser',   cost: 0,   fur: '#23232f', skin: '#8d8da8', acc: 'visor',   hp: 90,  spd: 155 },
    { id: 'ash',   name: 'Ash',    weapon: 'flame',   cost: 150, fur: '#b8382b', skin: '#f0b9a0', acc: 'band',    hp: 120, spd: 145 },
    { id: 'boomer',name: 'Boomer', weapon: 'shotgun', cost: 300, fur: '#e3cf9a', skin: '#fff1cf', acc: 'cap',     hp: 110, spd: 150 },
    { id: 'blitz', name: 'Blitz',  weapon: 'rocket',  cost: 500, fur: '#3e6fb5', skin: '#a9c6ee', acc: 'helmet',  hp: 105, spd: 140 },
    { id: 'sparks',name: 'Sparks', weapon: 'zap',     cost: 800, fur: '#d9a82b', skin: '#fff0a0', acc: 'wizard',  hp: 95,  spd: 160 },
    { id: 'slash', name: 'Slash',  weapon: 'blade',   cost: 250, fur: '#5a4636', skin: '#c9a27a', acc: 'scar',    hp: 130, spd: 172 },
    { id: 'disco', name: 'Disco',  weapon: 'cd',      cost: 350, fur: '#9b5de5', skin: '#f0c8ff', acc: 'phones',  hp: 105, spd: 158 },
    { id: 'robin', name: 'Robin',  weapon: 'bow',     cost: 450, fur: '#4f7a3a', skin: '#d9c9a0', acc: 'hood',    hp: 100, spd: 162 },
    { id: 'dyna',  name: 'Dyna',   weapon: 'nade',    cost: 700, fur: '#c4602d', skin: '#f0c8a0', acc: 'hardhat', hp: 115, spd: 148 },
    { id: 'don',   name: 'Don',    weapon: 'tommy',   cost: 650, fur: '#7a5a3a', skin: '#d9b48a', acc: 'fedora',  hp: 110, spd: 150, cigar: 1 },
  ];

  // ---------- upgrades ----------
  const ALL = ['all'];
  const PROJ = ['gun', 'shotgun', 'rocket', 'tommy', 'cd', 'bow', 'nade'];
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
    { id: 'pierce',n: 'Piercing Rounds',  d: 'Shots pass through 1 more opp',    t: ['gun', 'shotgun', 'tommy', 'cd', 'bow'], max: 4, f: p => { p.pierce += 1; } },
    { id: 'rico',  n: 'Ricochet',         d: 'Shots bounce off walls once more', t: ['gun', 'shotgun', 'tommy', 'cd', 'bow'], max: 3, f: p => { p.rico += 1; p.life += 0.3; } },
    { id: 'home',  n: 'Heat Seeking',     d: 'Shots curve toward opps',          t: ['gun', 'rocket', 'tommy', 'cd', 'bow'], max: 3, f: p => { p.homing += 1; } },
    { id: 'expl',  n: 'Explosive Rounds', d: 'Shots pop with a small blast',     t: ['gun', 'shotgun', 'tommy', 'cd', 'bow'], max: 3, f: p => { p.explo += 26; } },
    { id: 'choke', n: 'Slug Choke',       d: 'Tighter spread, +10% damage',      t: ['shotgun'], max: 3, f: p => { p.spread *= 0.8; p.dmg *= 1.1; } },
    { id: 'boom',  n: 'Bigger Boom',      d: 'Rocket blast radius +20',          t: ['rocket', 'nade'], max: 4, f: p => { p.boom += 20; } },
    { id: 'clust', n: 'Cluster Bombs',    d: 'Rockets scatter mini blasts',      t: ['rocket', 'nade'], max: 2, f: p => { p.cluster += 1; } },
    { id: 'wide',  n: 'Wide Beam',        d: 'Beams are thicker',                t: ['laser'], max: 4, f: p => { p.width += 4; } },
    { id: 'long',  n: 'Long Beam',        d: 'Beams reach farther',              t: ['laser'], max: 3, f: p => { p.len += 80; p.reach += 80; } },
    { id: 'twin',  n: 'Twin Beams',       d: '+1 beam per shot',                 t: ['laser'], max: 4, f: p => { p.count += 1; p.spread += 0.12; } },
    { id: 'sear',  n: 'Searing Beam',     d: 'Beams set opps on fire',           t: ['laser'], max: 3, f: p => { p.burn += 3; } },
    { id: 'lflame',n: 'Long Flames',      d: 'Flame reaches 30 farther',         t: ['flame'], max: 4, f: p => { p.range += 30; p.reach += 30; } },
    { id: 'fan',   n: 'Wide Fan',         d: 'Flame cone is wider',              t: ['flame'], max: 3, f: p => { p.cone += 0.35; } },
    { id: 'inf',   n: 'Inferno',          d: 'Burn damage +4 per second',        t: ['flame'], max: 5, f: p => { p.burn += 4; } },
    { id: 'nap',   n: 'Napalm',           d: 'Burning opps ignite their neighbors', t: ['flame', 'laser', 'blade'], max: 1, f: p => { p.spreadFire = 1; } },
    { id: 'lblade', n: 'Long Blade',      d: 'Slashes reach 16 farther',          t: ['blade'], max: 4, f: p => { p.range += 16; p.reach += 16; } },
    { id: 'wslash', n: 'Wide Slash',      d: 'Slash arc is much wider',           t: ['blade'], max: 3, f: p => { p.cone += 0.55; } },
    { id: 'serr',   n: 'Serrated Edge',   d: 'Cuts keep hurting for 4 a second',  t: ['blade'], max: 5, f: p => { p.burn += 4; } },
    { id: 'knives', n: 'Throwing Knives', d: '+1 knife thrown with each slash',   t: ['blade'], max: 5, f: p => { p.knives += 1; } },
    { id: 'drum',   n: 'Drum Mag',        d: '+20% fire rate and +10% damage',    t: ['tommy'], max: 4, f: p => { p.rate *= 1.2; p.dmg *= 1.1; } },
    { id: 'fuse',  n: 'Short Fuse',      d: 'Dynamite blows up sooner and +15% damage', t: ['nade'], max: 3, f: p => { p.dmg *= 1.15; p.fuseT = (p.fuseT || 0.5) - 0.08; } },
    { id: 'chain', n: 'Chain Link',       d: 'Lightning jumps to 2 more opps',   t: ['zap'], max: 5, f: p => { p.chain += 2; } },
    { id: 'over',  n: 'Overload',         d: '+25% lightning damage',            t: ['zap'], max: 4, f: p => { p.dmg *= 1.25; } },
    { id: 'rod',   n: 'Storm Rod',        d: 'Lightning reaches 40 farther',     t: ['zap'], max: 3, f: p => { p.range += 40; p.reach += 40; p.chainRange += 20; } },
    { id: 'static',n: 'Static Shock',     d: 'Zapped opps are stunned briefly',  t: ['zap'], max: 2, f: p => { p.stun += 0.35; } },
  ];

  // ---------- permanent upgrades, bought in the shop for one monkey at a time ----------
  const PERM = [
    { id: 'hp',   n: 'Tough Hide',   d: '+10 max HP each level',        max: 10, base: 40, f: (p, l) => { p.hpMax += 10 * l; } },
    { id: 'dmg',  n: 'Sharp Claws',  d: '+6% damage each level',        max: 10, base: 60, f: (p, l) => { p.dmg *= 1 + 0.06 * l; } },
    { id: 'rate', n: 'Quick Hands',  d: '+4% fire rate each level',     max: 10, base: 60, f: (p, l) => { p.rate *= 1 + 0.04 * l; } },
    { id: 'spd',  n: 'Nimble Paws',  d: '+3% move speed each level',    max: 6,  base: 50, f: (p, l) => { p.speed *= 1 + 0.03 * l; } },
    { id: 'ban',  n: 'Banana Nose',  d: '+6% bananas each level',       max: 10, base: 45, f: (p, l) => { p.bmult *= 1 + 0.06 * l; } },
    { id: 'crit', n: 'Lucky Streak', d: '+2% crit chance each level',   max: 8,  base: 70, f: (p, l) => { p.crit += 0.02 * l; } },
  ];
  const permLevel = (cid, k) => (save.perm[cid] && save.perm[cid][k]) || 0;
  const permCost = (u, l) => Math.round(u.base * (1 + l * 0.9 + l * l * 0.15));

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
  let offer = [], t0 = 0, roomT = 0;
  let btns = [];
  const joy = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
  const pen = {};
  const keys = {};

  function buildPlayer() {
    const ch = CHARS[sel], w = WEAP[ch.weapon];
    P = Object.assign({}, w, {
      ch, x: AW / 2, y: AH - BOT - 70, r: 14, hp: ch.hp, hpMax: ch.hp, speed: ch.spd, inv: 1, cd: 0.4, aim: -Math.PI / 2, tick: 0,
      crit: 0.05, magnet: 60, bmult: 1, dr: 0, vamp: 0, invT: 0.7, rico: w.rico || 0, homing: 0, explo: 0, cluster: 0, burn: w.burn || 0,
      spreadFire: 0, stun: 0, boom: w.boom || 0, lives: 2,
    });
    for (const u of PERM) { const l = permLevel(ch.id, u.id); if (l) u.f(P, l); }       // shop upgrades for this monkey
    P.hp = P.hpMax;
  }
  function startRun() {
    buildPlayer();
    run = { room: 1, ban: 0, kills: 0, stacks: {} };
    for (const k in pen) delete pen[k];
    save.snap = null;
    startRoom();
    state = 'play';
  }
  const SNAPKEYS = ['knives', 'hp', 'hpMax', 'speed', 'dmg', 'rate', 'count', 'spread', 'pierce', 'life', 'len', 'width', 'range', 'cone', 'burn', 'chain', 'chainRange', 'reach', 'boom', 'crit', 'magnet', 'bmult', 'dr', 'vamp', 'invT', 'rico', 'homing', 'explo', 'cluster', 'spreadFire', 'stun', 'lives'];
  function takeSnap() {                                   // checkpoint at the start of every room
    const p = {}; for (const k of SNAPKEYS) if (Number.isFinite(P[k])) p[k] = P[k];
    save.snap = { ch: P.ch.id, room: run.room, run: { ban: run.ban, kills: run.kills, stacks: Object.assign({}, run.stacks) }, pen: Object.assign({}, pen), P: p };
    persist();
  }
  function continueRun() {
    const sn = save.snap, idx = sn ? CHARS.findIndex(c => c.id === sn.ch) : -1;
    if (idx < 0 || !save.owned[sn.ch]) { save.snap = null; persist(); return; }
    sel = idx; buildPlayer();
    const f = v => (Number.isFinite(v) ? v : null);
    if (sn.P && typeof sn.P === 'object') for (const k of SNAPKEYS) { const v = f(sn.P[k]); if (v !== null && k in P) P[k] = Math.min(1e9, Math.max(0, v)); }
    P.hpMax = Math.max(1, P.hpMax); P.hp = clamp(P.hp, 1, P.hpMax); P.lives = clamp(Math.round(P.lives), 1, 3);
    const rs = sn.run || {}, stacks = {};
    for (const u of UPG) { const n = f(rs.stacks && rs.stacks[u.id]); if (n) stacks[u.id] = Math.min(u.max, Math.max(0, Math.floor(n))); }
    run = { room: clamp(Math.floor(sn.room), 1, 9999), ban: Math.max(0, f(rs.ban) || 0), kills: Math.max(0, f(rs.kills) || 0), stacks };
    for (const k in pen) delete pen[k];
    for (const u of UPG) { const n = sn.pen && f(sn.pen[u.id]); if (n) pen[u.id] = clamp(n, 0.01, 1); }
    startRoom(); state = 'play';
  }
  function bossRoom(n) { return n % 15 === 0; }
  function startRoom() {
    enemies = []; pbul = []; ebul = []; pickups = []; fx = []; clearT = 0; spawnT = 0.8; bannerT = 1.4; shake = 0; flash = 0;
    P.x = AW / 2; P.y = AH - BOT - 70; P.inv = Math.max(P.inv, 1);
    const room = run.room;
    genWalls(room); roomT = 0;
    takeSnap();
    queue = [];
    if (bossRoom(room)) queue.push('boss');
    else {
      const n = Math.min(5 + Math.floor(room * 1.8), 70);
      const pool = [['runt', Math.max(1.5, 5 - room * 0.12)]];
      if (room >= 2) pool.push(['brute', 3 + room * 0.1]);
      if (room >= 3) pool.push(['shooter', 2 + room * 0.1]);
      if (room >= 5) pool.push(['dasher', 2 + room * 0.1]);
      if (room >= 6) pool.push(['tank', 1 + room * 0.12]);
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
      const hp = 1100 * (1 + 1.0 * (bn - 1)) * (1 + 0.1 * (room - 1));
      e = { kind, boss: 1, bn, r: 52, hp, max: hp, sp: 30, dmg: 22 + bn * 7, bdmg: 11 + bn * 4, val: 40 * bn, col: '#e84393', pt: 2, sum: 6 };
    } else {
      const T = TYPES[kind];
      e = { kind, r: T.r, hp: T.hp * hs, max: T.hp * hs, sp: T.sp, dmg: T.dmg * ds, bdmg: 6 * ds, val: T.val, col: T.col, cd: rand(1, 2), st: 0, stt: 0 };
    }
    const LK = { runt: ['monkey', 'rat', 'bat'], brute: ['gorilla', 'boar'], tank: ['rhino', 'hippo'], shooter: ['parrot', 'mandrill'], dasher: ['jaguar', 'wolf'] };
    if (kind !== 'boss') {
      let gun = null;
      if (kind === 'shooter') gun = room >= 8 && Math.random() < 0.4 ? 'smg' : (Math.random() < 0.5 ? 'rifle' : 'pistol');
      else if (kind === 'runt' && room >= 3 && Math.random() < Math.min(0.6, 0.2 + room * 0.02)) gun = 'pistol';
      else if (kind === 'brute' && room >= 4 && Math.random() < Math.min(0.8, 0.35 + room * 0.02)) gun = Math.random() < 0.5 ? 'smg' : 'shotgun';
      else if (kind === 'tank') gun = 'cannon';
      e.gun = gun; e.out = Math.floor(rand(0, 5)); e.burst = 0; e.bt = 0;
      if (room >= 8 && Math.random() < Math.min(0.35, (room - 6) * 0.03)) { e.elite = 1; e.r *= 1.3; e.hp = e.max = e.hp * 2.4; e.dmg *= 1.3; e.bdmg *= 1.3; e.val *= 3; }
      e.melee = gun ? null : (kind === 'dasher' ? 'blades' : kind === 'brute' ? 'bat' : kind === 'runt' ? (Math.random() < 0.5 ? 'knife' : 'club') : null);
    }
    e.look = kind === 'boss' ? ['kingGorilla', 'kingLion', 'kingBull'][(e.bn - 1) % 3] : LK[kind][Math.floor(Math.random() * LK[kind].length)];
    e.v = Math.floor(Math.random() * 3); e.ph = rand(0, 6.28);
    if (e.boss) {                                                  // each boss has its own build
      const B = { kingGorilla: { name: 'KINGPIN KONG', hp: 1.25, sp: 28, dmg: 1 }, kingLion: { name: 'LORD LEO', hp: 0.9, sp: 62, dmg: 1 }, kingBull: { name: 'BARON BULL', hp: 1.05, sp: 36, dmg: 1.3 } }[e.look];
      e.name = B.name; e.hp = e.max = e.max * B.hp; e.sp = B.sp; e.dmg *= B.dmg; e.mode = 'idle'; e.mt = 1.2; e.pat = 0; e.dx = 0; e.dy = 1; e.sa = 0; e.et = 0;
    }
    e.x = x; e.y = y; if (!e.boss && walls.length) pushOut(e, e.r + 4);
    e.spawn = 0.3; e.flash = 0; e.burn = 0; e.burnT = 0; e.stun = 0; e.vx = 0; e.vy = 0;
    enemies.push(e);
  }


  // ---------- walls: some rooms have cover that blocks movement and every shot ----------
  let walls = [];
  function genWalls(room) {
    walls = [];
    const rnd = seeded(room * 131 + 17), boss = bossRoom(room), gap = boss ? 80 : 48;
    if (room < 2 && !boss) return;
    if (!boss && rnd() < 0.3) return;                                  // some rooms stay wide open
    const n = boss ? 2 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * Math.min(5, 2 + room / 6));
    const xa = PAD + 34, xb = AW - PAD - 34, ya = TOP + 24, yb = AH - BOT - 24;
    const OBJ = { 'Jungle Temple': ['statue', 'boulder', 'crate'], 'Neon Alley': ['barrel', 'crate'], 'Frozen Cavern': ['ice', 'boulder'], 'Lava Foundry': ['boulder', 'barrel', 'pillar'], 'Space Station': ['crate', 'barrel', 'pillar'], 'Desert Ruins': ['pillar', 'boulder', 'crate'], 'Haunted Manor': ['tomb', 'crate', 'statue'], 'Coral Reef': ['coral', 'boulder', 'barrel'] }[envOf(room).n];
    const SIZE = { barrel: [26, 26], crate: [36, 36], boulder: [48, 40], pillar: [30, 30], statue: [32, 32], tomb: [30, 36], coral: [42, 36], ice: [40, 40] };
    for (let tries = 0; walls.length < n && tries < 120; tries++) {
      if (rnd() < 0.5) {                                                // a single object instead of a slab
        const k = OBJ[Math.floor(rnd() * OBJ.length)], [ow, oh] = SIZE[k];
        const ox = xa + rnd() * Math.max(1, xb - xa - ow), oy = ya + rnd() * Math.max(1, yb - ya - oh);
        if (oy < TOP + 110 && ox < AW / 2 + 90 && ox + ow > AW / 2 - 90) continue;
        if (oy + oh > AH - BOT - 130 && ox < AW / 2 + 80 && ox + ow > AW / 2 - 80) continue;
        if (walls.some(o => ox < o.x + o.w + gap && ox + ow > o.x - gap && oy < o.y + o.h + gap && oy + oh > o.y - gap)) continue;
        walls.push({ x: ox, y: oy, w: ow, h: oh, i: walls.length, k });
        continue;
      }
      const kind = rnd(), w = kind < 0.45 ? 56 + rnd() * 70 : kind < 0.75 ? 22 + rnd() * 16 : 34 + rnd() * 12;
      const h = kind < 0.45 ? 20 + rnd() * 10 : kind < 0.75 ? 56 + rnd() * 60 : w;
      const x = xa + rnd() * Math.max(1, xb - xa - w), y = ya + rnd() * Math.max(1, yb - ya - h);
      if (y < TOP + 110 && x < AW / 2 + 90 && x + w > AW / 2 - 90) continue;                        // keep the exit door clear
      if (y + h > AH - BOT - 130 && x < AW / 2 + 80 && x + w > AW / 2 - 80) continue;               // and the spot you walk in on
      if (walls.some(o => x < o.x + o.w + gap && x + w > o.x - gap && y < o.y + o.h + gap && y + h > o.y - gap)) continue;
      walls.push({ x, y, w, h, i: walls.length });
    }
    buildNav(); updateNav();
  }
  function pushOut(o, rad) {
    for (const w of walls) {
      const cx = clamp(o.x, w.x, w.x + w.w), cy = clamp(o.y, w.y, w.y + w.h), dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
      if (d < rad) {
        if (d > 0.0001) { o.x = cx + dx / d * rad; o.y = cy + dy / d * rad; }
        else { const l = o.x - w.x, r = w.x + w.w - o.x, t = o.y - w.y, b = w.y + w.h - o.y, m = Math.min(l, r, t, b); if (m === l) o.x = w.x - rad; else if (m === r) o.x = w.x + w.w + rad; else if (m === t) o.y = w.y - rad; else o.y = w.y + w.h + rad; }
      }
    }
  }
  function moveBy(o, dx, dy, rad) { o.x += dx; pushOut(o, rad); o.y += dy; pushOut(o, rad); }
  function inWall(x, y, pad = 0) { for (const w of walls) if (x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad) return w; return null; }
  function rayT(x1, y1, x2, y2) {                                    // 0..1 along the segment where it first meets a wall, or 1
    let best = 1; const dx = x2 - x1, dy = y2 - y1;
    for (const w of walls) {
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, q, lo, hi] of [[dx, x1, w.x, w.x + w.w], [dy, y1, w.y, w.y + w.h]]) {
        if (Math.abs(p) < 1e-9) { if (q < lo || q > hi) { ok = false; break; } }
        else { let a = (lo - q) / p, b = (hi - q) / p; if (a > b) { const tmp = a; a = b; b = tmp; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { ok = false; break; } }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }
  const clearShot = (x1, y1, x2, y2) => !walls.length || rayT(x1, y1, x2, y2) >= 1;

  // ---------- path finding: opps walk around cover to reach you ----------
  const CELL = 16;
  let nav = { cols: 0, rows: 0, blocked: null, dist: null }, navT = 0;
  function buildNav() {
    const cols = Math.ceil(AW / CELL), rows = Math.ceil(AH / CELL), blocked = new Uint8Array(cols * rows);
    for (const w of walls) {
      const x0 = Math.max(0, Math.floor((w.x - 18) / CELL)), x1 = Math.min(cols - 1, Math.floor((w.x + w.w + 18) / CELL)), y0 = Math.max(0, Math.floor((w.y - 18) / CELL)), y1 = Math.min(rows - 1, Math.floor((w.y + w.h + 18) / CELL));
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL, dx = Math.max(w.x - cx, 0, cx - (w.x + w.w)), dy = Math.max(w.y - cy, 0, cy - (w.y + w.h));
        if (Math.hypot(dx, dy) < 17) blocked[j * cols + i] = 1;
      }
    }
    nav = { cols, rows, blocked, dist: new Int16Array(cols * rows).fill(-1) };
  }
  function updateNav() {
    if (!walls.length) return;
    const { cols, rows, blocked, dist } = nav; dist.fill(-1);
    let si = clamp(Math.floor(P.x / CELL), 0, cols - 1), sj = clamp(Math.floor(P.y / CELL), 0, rows - 1);
    if (blocked[sj * cols + si]) {                                   // start from the closest open cell
      let bd = 1e9, bi = si, bj = sj;
      for (let j = Math.max(0, sj - 3); j <= Math.min(rows - 1, sj + 3); j++) for (let i = Math.max(0, si - 3); i <= Math.min(cols - 1, si + 3); i++) if (!blocked[j * cols + i]) { const d = (i - si) ** 2 + (j - sj) ** 2; if (d < bd) { bd = d; bi = i; bj = j; } }
      si = bi; sj = bj;
    }
    const q = [sj * cols + si]; dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], ci = c % cols, cj = (c / cols) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = nj * cols + ni; if (dist[n] !== -1 || blocked[n]) continue;
        if (di && dj && (blocked[cj * cols + ni] || blocked[nj * cols + ci])) continue;               // no cutting corners
        dist[n] = dist[c] + 1; q.push(n);
      }
    }
  }
  function navDir(x, y) {                                            // unit vector toward the neighbour cell closest to you
    const { cols, rows, blocked, dist } = nav; if (!dist) return null;
    const i = clamp(Math.floor(x / CELL), 0, cols - 1), j = clamp(Math.floor(y / CELL), 0, rows - 1);
    let best = null, bd = dist[j * cols + i] === -1 ? 1e9 : dist[j * cols + i];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const n = nj * cols + ni, dd = dist[n]; if (dd === -1 || blocked[n]) continue;
      if (di && dj && (blocked[j * cols + ni] || blocked[nj * cols + i])) continue;
      if (dd < bd) { bd = dd; best = [(ni + 0.5) * CELL - x, (nj + 0.5) * CELL - y]; }
    }
    if (!best) return null; const l = Math.hypot(best[0], best[1]) || 1; return [best[0] / l, best[1] / l];
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
  let prevState = 'play';
  function pauseGame() { if (state === 'play' || state === 'clear') { prevState = state; state = 'pause'; joy.on = false; joy.dx = joy.dy = 0; } }
  function saveAndExit() { takeSnap(); state = 'menu'; }
  function die() {
    state = 'over'; t0 = 0; save.snap = null;
    if (run.room > save.best) save.best = run.room;
    persist();
  }
  function nearest() {
    let best = null, bd = 1e9;
    for (const e of enemies) { if (e.spawn > 0) continue; const d = Math.hypot(e.x - P.x, e.y - P.y) - e.r; if (d < bd && clearShot(P.x, P.y, e.x, e.y)) { bd = d; best = e; } }
    return bd <= P.reach ? best : null;
  }

  // ---------- firing ----------
  function aimAngles(a, n, spread, jit = 0.04) {
    if (n === 1) return [a + rand(-jit, jit)];
    const out = [];
    for (let i = 0; i < n; i++) out.push(a + (i / (n - 1) - 0.5) * spread);
    return out;
  }
  function fire(tg) {
    const a = Math.atan2(tg.y - P.y, tg.x - P.x);
    P.aim = a;
    const k = P.ch.weapon, mx = P.x + Math.cos(a) * 18, my = P.y + Math.sin(a) * 18;
    if (k !== 'zap') fx.push({ k: 'm', x: mx, y: my, life: 0.07, max: 0.07 });
    if (k === 'blade') {
      P.sl = 0.14; fx.push({ k: 's', x: P.x, y: P.y, a, r: P.range, cone: P.cone, life: 0.14, max: 0.14 });
      for (const e of enemies) {
        if (e.spawn > 0) continue;
        const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > P.range + e.r) continue;
        let da = Math.atan2(e.y - P.y, e.x - P.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < P.cone / 2 + Math.atan2(e.r, Math.max(d, 1)) && clearShot(P.x, P.y, e.x, e.y)) hitEnemy(e, P.dmg, { burn: P.burn });
      }
      for (let i = 0; i < P.knives; i++) { const an = a + (i - (P.knives - 1) / 2) * 0.28; pbul.push({ x: P.x, y: P.y, vx: Math.cos(an) * 540, vy: Math.sin(an) * 540, dmg: P.dmg * 0.7, life: 0.55, pierce: 0, rico: 0, hit: new Set(), r: 3.5, boom: 0, col: '#d7dbe6', k: 'gun' }); }
      tone(320, 0.08, 'sawtooth', 0.04, -170);
    } else if (k === 'gun' || k === 'shotgun' || k === 'rocket' || k === 'tommy' || k === 'cd' || k === 'bow' || k === 'nade') {
      for (const an of aimAngles(a, P.count, P.spread, k === 'tommy' ? 0.12 : 0.04)) {
        const sp0 = WEAP[k].speed;
        const b = { x: mx, y: my, vx: Math.cos(an) * sp0, vy: Math.sin(an) * sp0, dmg: P.dmg, life: P.life, pierce: P.pierce, rico: P.rico, hit: new Set(), r: k === 'rocket' || k === 'cd' ? 7 : k === 'tommy' ? 3 : k === 'bow' ? 3.5 : 4, boom: k === 'rocket' || k === 'nade' ? P.boom : 0, col: WEAP[k].col, k: k === 'tommy' ? 'gun' : k, spin: rand(0, 6.28) };
        if (k === 'nade') { const dist = Math.hypot(tg.x - mx, tg.y - my); b.dist = dist; b.trav = 0; b.nohit = true; b.life = dist / sp0 + (P.fuseT || 0.5); b.ang = an; }
        pbul.push(b);
      }
      tone(k === 'rocket' ? 180 : k === 'shotgun' ? 140 : k === 'tommy' ? 520 : k === 'cd' ? 800 : k === 'bow' ? 260 : k === 'nade' ? 200 : 700, k === 'tommy' ? 0.04 : 0.06, k === 'bow' ? 'triangle' : 'square', k === 'tommy' ? 0.018 : 0.03);
    } else if (k === 'laser') {
      for (const an of aimAngles(a, P.count, P.spread)) {
        let x2 = P.x + Math.cos(an) * P.len, y2 = P.y + Math.sin(an) * P.len;
        const bt = rayT(P.x, P.y, x2, y2); if (bt < 1) { x2 = P.x + (x2 - P.x) * bt; y2 = P.y + (y2 - P.y) * bt; }
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
        for (const e of enemies) { if (hit.has(e) || e.spawn > 0 || e.hp <= 0) continue; const d = Math.hypot(e.x - from.x, e.y - from.y); if (d < nd && clearShot(from.x, from.y, e.x, e.y)) { nd = d; nx = e; } }
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
      if (!clearShot(P.x, P.y, e.x, e.y)) continue;
      let da = Math.atan2(e.y - P.y, e.x - P.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < P.cone / 2 + Math.atan2(e.r, Math.max(d, 1))) hitEnemy(e, P.dmg, { burn: P.burn, nocrit: Math.random() > 0.15 });
    }
  }


  function enemyShot(e) {
    const a = Math.atan2(P.y - e.y, P.x - e.x), g = e.gun, dm = e.bdmg;
    const b = (an, sp, d = dm, r = 5, life = 5) => ebul.push({ x: e.x + Math.cos(an) * e.r, y: e.y + Math.sin(an) * e.r, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, dmg: d, r, life });
    fx.push({ k: 'm', x: e.x + Math.cos(a) * e.r * 1.4, y: e.y + Math.sin(a) * e.r * 1.4, life: 0.07, max: 0.07 });
    if (g === 'pistol') { b(a, 190); e.cd = rand(2.4, 3.4); }
    else if (g === 'rifle') { b(a, 320, dm * 1.3, 4); e.cd = rand(1.8, 2.6); }
    else if (g === 'smg') { b(a + rand(-0.06, 0.06), 215, dm * 0.8, 4); }
    else if (g === 'shotgun') { for (let i = -2; i <= 2; i++) b(a + i * 0.12, 175, dm * 0.7, 4, 0.9); e.cd = rand(3, 3.8); }
    else if (g === 'cannon') { for (let i = -1; i <= 1; i++) b(a + i * 0.25, 135, dm * 1.6, 8); e.cd = rand(3, 4); }
    tone(g === 'cannon' ? 90 : 420, 0.08, 'square', 0.025);
  }
  // Each boss fights differently. Kong slams and throws, Leo spins bullet storms and pounces, Bull charges.
  function bossAI(e, dt, ux, uy, d) {
    const bn = e.bn, tier = 1 + (bn - 1) * 0.18, rage = e.hp < e.max * 0.5, frenzy = e.hp < e.max * 0.25;
    const aim = Math.atan2(P.y - e.y, P.x - e.x);
    const bul = (a, sp, dm = e.bdmg, r = 6) => ebul.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp * tier, vy: Math.sin(a) * sp * tier, dmg: dm, r, life: 6 });
    let vx = 0, vy = 0;
    e.mt -= dt * (frenzy ? 1.7 : rage ? 1.3 : 1);                    // bosses speed up as they get hurt
    if (e.look === 'kingGorilla') {
      vx = ux * e.sp * (rage ? 1.4 : 1); vy = uy * e.sp * 0.6 * (rage ? 1.4 : 1);
      if (e.mode === 'tele') {
        vx = vy = 0;
        if (e.mt <= 0) {
          const n = 20 + bn * 5 + (frenzy ? 8 : 0); for (let i = 0; i < n; i++) bul(i / n * 6.28, 150);
          fx.push({ k: 'r', x: e.x, y: e.y, r: 130, life: 0.4, max: 0.4 }); shake = 0.5; tone(70, 0.4, 'sawtooth', 0.09);
          if (d < 120) hurtPlayer(e.bdmg * 1.6);
          e.mode = 'idle'; e.mt = rage ? 1.1 : 1.8;
        }
      } else if (e.mt <= 0) {
        e.pat++;
        if (e.pat % 3 === 0) { e.mode = 'tele'; e.mt = 0.8; }
        else if (e.pat % 3 === 1) { for (let i = -(rage ? 2 : 1); i <= (rage ? 2 : 1); i++) bul(aim + i * 0.2, 225, e.bdmg * 1.4, 10); e.mt = 1.1; }
        else { if (enemies.length < 6) for (let i = 0; i < (rage ? 2 : 1); i++) spawn('brute', clamp(e.x + rand(-70, 70), PAD + 20, AW - PAD - 20), clamp(e.y + 70, TOP + 20, AH - 80)); e.mt = 1.2; }
      }
    } else if (e.look === 'kingLion') {
      if (e.mode === 'idle') {
        vx = ux * e.sp * 0.8; vy = uy * e.sp * 0.8;
        if (e.mt <= 0) { e.pat++; if (e.pat % 2) { e.mode = 'spiral'; e.mt = 2.4; e.sa = aim; e.et = 0; } else { e.mode = 'tele'; e.mt = 0.6; } }
      } else if (e.mode === 'spiral') {
        e.et -= dt;
        if (e.et <= 0) { e.et = 0.11; e.sa += 0.55; const arms = frenzy ? 4 : rage ? 3 : 2; for (let k = 0; k < arms; k++) bul(e.sa + k * 6.28 / arms, 185, e.bdmg * 0.8, 5); }
        if (e.mt <= 0) { e.mode = 'idle'; e.mt = 0.9; }
      } else if (e.mode === 'tele') {
        e.dx = ux; e.dy = uy;
        if (e.mt <= 0) { e.mode = 'dash'; e.mt = 0.55; }
      } else {
        vx = e.dx * 380 * tier; vy = e.dy * 380 * tier;
        if (e.mt <= 0) { e.mode = 'idle'; e.mt = rage ? 0.5 : 1; for (let i = -3; i <= 3; i++) bul(aim + i * 0.22, 215); }
      }
    } else {
      if (e.mode === 'idle') {
        vx = ux * e.sp; vy = uy * e.sp * 0.6;
        if (e.mt <= 0) {
          e.pat++;
          if (e.pat % 3 === 0) { for (let i = -4; i <= 4; i++) bul(aim + i * 0.14, 215); e.mt = 0.9; }
          else { e.mode = 'tele'; e.mt = rage ? 0.5 : 0.75; }
        }
      } else if (e.mode === 'tele') {
        e.dx = ux; e.dy = uy;
        if (e.mt <= 0) { e.mode = 'dash'; e.mt = 0.9; }
      } else {
        vx = e.dx * 430 * tier; vy = e.dy * 430 * tier;
        if (e.mt <= 0) { e.mode = 'idle'; e.mt = rage ? 0.6 : 1.2; for (let i = 0; i < (frenzy ? 16 : 12); i++) bul(i / (frenzy ? 16 : 12) * 6.28, 170); shake = 0.4; fx.push({ k: 'r', x: e.x, y: e.y, r: 90, life: 0.3, max: 0.3 }); }
      }
    }
    return [vx, vy];
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
    moveBy(P, mx * P.speed * dt, my * P.speed * dt, P.r * 0.8);
    P.x = clamp(P.x, PAD + P.r, AW - PAD - P.r);
    P.y = clamp(P.y, TOP + P.r, AH - BOT - P.r * 2.7);
    P.inv = Math.max(0, P.inv - dt); P.sl = Math.max(0, (P.sl || 0) - dt);
    P.mv = Math.min(1, Math.hypot(mx, my)); P.walk = (P.walk || 0) + dt * 11 * P.mv;

    navT -= dt; if (navT <= 0 && walls.length) { navT = 0.12; updateNav(); }
    if (state === 'play') { roomT += dt; if (roomT > 90 && !queue.length) for (const e of enemies) if (!e.boss && e.hp > 0) killEnemy(e); }

    // spawns: opps drop in from the top of the room
    if (state === 'play') {
      spawnT -= dt;
      const alive = enemies.length, cap = Math.min(6 + Math.floor(run.room / 2), 22);
      if (queue.length && spawnT <= 0 && alive < cap) {
        const kind = queue.shift();
        if (kind === 'boss') spawn(kind, AW / 2, TOP + 70);
        else {
          let x, y, tries = 0;
          do { x = rand(PAD + 24, AW - PAD - 24); y = rand(TOP + 24, TOP + Math.min(220, (AH - TOP) * 0.4)); tries++; } while ((Math.hypot(x - P.x, y - P.y) < 130 || inWall(x, y, 30)) && tries < 20);
          spawn(kind, x, y);
        }
        spawnT = Math.max(0.16, 0.4 - run.room * 0.01);
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
      if (e.stun > 0 && !e.boss) { e.stun -= dt; continue; }
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      let sp = e.sp, vx = 0, vy = 0, mux = ux, muy = uy, around = false;
      if (walls.length && d > 24 && !clearShot(e.x, e.y, P.x, P.y)) { const nd = navDir(e.x, e.y); if (nd) { mux = nd[0]; muy = nd[1]; around = true; } }   // no line to the player: follow the way around
      if (e.boss) {
        [vx, vy] = bossAI(e, dt, mux, muy, d);
      } else if (e.kind === 'shooter') {
        if (d > 190 || around) { vx = mux * sp; vy = muy * sp; } else if (d < 140) { vx = -ux * sp; vy = -uy * sp; } else { vx = -uy * sp * 0.6; vy = ux * sp * 0.6; }
      } else if (e.kind === 'dasher') {
        if (e.st === 0) { vx = mux * sp; vy = muy * sp; e.cd -= dt; if (d < 230 && e.cd <= 0) { e.st = 1; e.stt = 0.6; } }
        else if (e.st === 1) { e.stt -= dt; e.dx = mux; e.dy = muy; if (e.stt <= 0) { e.st = 2; e.stt = 0.5; } }
        else { vx = e.dx * 400; vy = e.dy * 400; e.stt -= dt; if (e.stt <= 0) { e.st = 0; e.cd = rand(1.5, 2.5); } }
      } else { vx = mux * sp; vy = muy * sp; }
      for (const o of enemies) {                       // keep opps from stacking
        if (o === e || o.spawn > 0) continue;
        const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy) || 1, mn = e.r + o.r;
        if (od < mn) { vx += ox / od * 60; vy += oy / od * 60; }
      }
      e.aimA = Math.atan2(dy, dx);
      if (e.gun) {                                                    // opps with guns
        if (e.burst > 0) { e.bt -= dt; if (e.bt <= 0) { enemyShot(e); e.burst--; e.bt = 0.11; if (!e.burst) e.cd = rand(2.6, 3.4); } }
        else { e.cd -= dt; if (e.cd <= 0 && e.y > TOP) { if (e.gun === 'smg') { e.burst = 3; e.bt = 0; } else enemyShot(e); } }
      }
      e.ph += dt * (6 + Math.hypot(vx, vy) / 30);
      if (!walls.length) { e.x += vx * dt; e.y += vy * dt; }
      else {
        const ox = e.x, oy = e.y, want = Math.hypot(vx, vy) * dt, rad = e.boss ? e.r * 0.42 : e.r * 0.8;
        moveBy(e, vx * dt, vy * dt, rad);
        const got = Math.hypot(e.x - ox, e.y - oy);
        if (want > 0.4 && got < want * 0.45) { e.side = e.side || (Math.random() < 0.5 ? 1 : -1); moveBy(e, -muy * e.side * 70 * dt, mux * e.side * 70 * dt, rad); }   // slide around cover
        else if (got > want * 0.85) e.side = 0;
        pushOut(e, rad);
      }
      e.x = clamp(e.x, PAD + e.r * 0.5, AW - PAD - e.r * 0.5);
      e.y = clamp(e.y, TOP + e.r * 0.5, AH - BOT - e.r * 0.5);
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
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.spin += dt * 22;
      if (b.k === 'nade') {
        b.trav += Math.hypot(b.vx, b.vy) * dt;
        if (b.trav >= b.dist) { b.vx = b.vy = 0; }
        if (b.life <= 0) { b.dead = true; boomAt(b); }
        continue;
      }
      if (b.k === 'rocket' && Math.random() < 0.6) fx.push({ k: 'p', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, col: '#ffcf6e' });
      let wall = false;
      const wl = walls.length ? inWall(b.x, b.y, b.r) : null;
      if (wl) {
        if (b.rico > 0) { const px = b.x - b.vx * dt, py = b.y - b.vy * dt; if (px < wl.x - b.r || px > wl.x + wl.w + b.r) b.vx = -b.vx; else b.vy = -b.vy; b.x += b.vx * dt * 2; b.y += b.vy * dt * 2; b.rico--; b.hit.clear(); }
        else { b.dead = true; if (b.boom) boomAt(b); continue; }
      }
      if (b.x < PAD || b.x > AW - PAD) { if (b.rico > 0) { b.vx = -b.vx; b.x = clamp(b.x, PAD, AW - PAD); b.rico--; b.hit.clear(); } else wall = true; }
      if (b.y < TOP || b.y > AH - BOT) { if (b.rico > 0) { b.vy = -b.vy; b.y = clamp(b.y, TOP, AH - BOT); b.rico--; b.hit.clear(); } else wall = true; }
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
      if (b.x < 0 || b.x > AW || b.y < 0 || b.y > AH || (walls.length && inWall(b.x, b.y, b.r))) b.life = 0;
      if (Math.hypot(P.x - b.x, P.y - b.y) < P.r - 2 + b.r && P.inv <= 0) { b.life = 0; hurtPlayer(b.dmg); }
    }
    ebul = ebul.filter(b => b.life > 0);

    // bananas
    for (const p of pickups) {
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; p.vx *= 0.9; p.vy *= 0.9; if (walls.length) pushOut(p, 7);
      const d = Math.hypot(P.x - p.x, P.y - p.y);
      if (d < P.magnet || state === 'clear') { const s = 380 * dt; p.x += (P.x - p.x) / (d || 1) * s; p.y += (P.y - p.y) / (d || 1) * s; }
      if (d < P.r + 8) { p.got = 1; run.ban += p.v; save.ban += p.v; tone(900, 0.06, 'triangle', 0.04); }
    }
    pickups = pickups.filter(p => !p.got);

    // room cleared
    if (state === 'play' && !queue.length && !enemies.length) { state = 'clear'; clearT = 0; bannerT = 3; ebul = []; P.hp = Math.min(P.hpMax, P.hp + P.hpMax * (bossRoom(run.room) ? 0.3 : 0.08)); persist(); tone(660, 0.3, 'triangle', 0.07, 400); }
    if (state === 'clear' && P.y < TOP + P.r + 12 && Math.abs(P.x - AW / 2) < 36) { persist(); makeOffer(); state = 'upgrade'; joy.on = false; joy.dx = joy.dy = 0; tone(440, 0.25, 'triangle', 0.06, 300); }
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  addEventListener('keydown', e => { if (e.key === 'p' || e.key === 'Escape') { if (state === 'pause') state = prevState; else pauseGame(); } keys[e.key] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.key] = false; });

  // ---------- drawing ----------
  const SERIF = size => `700 ${size}px Georgia, "Times New Roman", serif`;
  const GOLDS = ['#fff4c9', '#e8c872', '#b98a2e'];
  function txt(s, x, y, size, col, al = 'center') { ctx.font = size >= 28 ? SERIF(size) : FONT(size); ctx.fillStyle = col; ctx.textAlign = al; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
  function goldTxt(s, x, y, size, track = 0) {                        // engraved gold lettering
    ctx.font = SERIF(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = track + 'px';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(s, x + 1.5, y + 2.5);
    const g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5); g.addColorStop(0, GOLDS[0]); g.addColorStop(0.5, GOLDS[1]); g.addColorStop(1, GOLDS[2]);
    ctx.fillStyle = g; ctx.fillText(s, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  function ornament(cx, y, w) {                                       // hairline, diamond, hairline
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); g.addColorStop(0, 'rgba(232,200,114,0)'); g.addColorStop(0.5, 'rgba(232,200,114,.9)'); g.addColorStop(1, 'rgba(232,200,114,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - w / 2, y - 0.5, w, 1);
    ctx.fillStyle = '#e8c872'; ctx.beginPath(); ctx.moveTo(cx, y - 4); ctx.lineTo(cx + 4, y); ctx.lineTo(cx, y + 4); ctx.lineTo(cx - 4, y); ctx.closePath(); ctx.fill();
  }
  function panel(x, y, w, h, r = 12, glowCol) {                       // smoked glass with a gold hairline
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,.1)'); g.addColorStop(1, 'rgba(255,255,255,.03)');
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4; rr(x, y, w, h, r); ctx.fillStyle = 'rgba(18,10,36,.72)'; ctx.fill(); ctx.restore();
    rr(x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = glowCol || 'rgba(232,200,114,.38)'; ctx.lineWidth = 1; rr(x + 0.5, y + 0.5, w - 1, h - 1, r - 0.5); ctx.stroke();
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function button(x, y, w, h, label, cb, o = {}) {
    btns.push({ x, y: y + UIY, w, h, cb: o.off ? () => {} : cb, label: o.label || label });
    const base = o.off ? '#3a3552' : (!o.col || o.col === '#ffd34d' ? '#e0b84a' : o.col);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, shade(base, 0.42)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.38));
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4; rr(x, y, w, h, 14); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.strokeStyle = o.off ? 'rgba(255,255,255,.12)' : 'rgba(255,248,215,.55)'; ctx.lineWidth = 1; rr(x + 0.5, y + 0.5, w - 1, h - 1, 13.5); ctx.stroke();
    if (!o.off) { ctx.fillStyle = 'rgba(255,255,255,.2)'; rr(x + 5, y + 3, w - 10, h * 0.34, 10); ctx.fill(); }
    txt(label, x + w / 2, y + h / 2 + 1, o.size || 22, o.off ? '#8c86a6' : '#2a1a05');
  }


  // ---------- shading helpers ----------
  function shade(hex, a) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = a < 0 ? 0 : 255, k = Math.abs(a);
    return `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
  }
  function ball(x, y, r, col, sx = 1, sy = 1, rim = -0.5) {          // lit sphere: highlight top-left, dark rim
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, shade(col, 0.42)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, rim));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill(); ctx.restore();
  }
  function shadow(x, y, rx, ry) { ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.28); ctx.fill(); }
  const glowCache = {};
  function glow(col) {
    if (glowCache[col]) return glowCache[col];
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (glowCache[col] = c);
  }
  function glowAt(x, y, size, col, a = 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(glow(col), x - size / 2, y - size / 2, size, size); ctx.restore(); }
  function furTexture(r, col, seed) {                      // short strokes on the head so it reads as fur
    const rnd = seeded(seed); ctx.lineWidth = Math.max(1, r * 0.04); ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 6.28, d = r * (0.55 + rnd() * 0.4), x = Math.cos(a) * d, y = Math.sin(a) * d;
      ctx.strokeStyle = i % 2 ? shade(col, 0.25) : shade(col, -0.35); ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.14, y + Math.sin(a) * r * 0.14); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function angryEyes(r, ey, sp, sz, tint) {
    for (const sx of [-1, 1]) {
      ctx.fillStyle = tint || '#f4f1e8'; ctx.beginPath(); ctx.ellipse(sx * sp, ey, sz, sz * 0.8, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#120a06'; ctx.beginPath(); ctx.arc(sx * sp - sx * sz * 0.1, ey + sz * 0.1, sz * 0.5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx * sp - sx * sz * 0.1 - sz * 0.15, ey - sz * 0.08, sz * 0.16, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#150a05'; ctx.lineWidth = Math.max(1.6, r * 0.09); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx * (sp + sz * 1.2), ey - sz * 1.6); ctx.lineTo(sx * (sp - sz * 0.8), ey - sz * 0.7); ctx.stroke();
    }
  }
  function fangs(r, y, w) { ctx.fillStyle = '#f7f3e6'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * w, y); ctx.lineTo(sx * (w + r * 0.12), y); ctx.lineTo(sx * (w + r * 0.06), y + r * 0.2); ctx.fill(); } }

  function drawApe(g, x, y, r, ch, aim, bob = 0, walk = 0, mv = 0, swing = 0) {
    const sv = ctx; sv.save(); sv.translate(x, y + bob + Math.abs(Math.sin(walk)) * r * 0.1 * mv);
    const fur = ch.fur, skin = ch.skin, dark = shade(fur, -0.25);
    const hasAim = aim != null, w = ch.weapon;
    const chestY = r * 1.15, two = w === 'shotgun' || w === 'rocket' || w === 'flame' || w === 'tommy';
    shadow(0, r * 2.7, r * 1.1, r * 0.32);
    // legs: swing while moving, planted when still
    for (const sx of [-1, 1]) {
      const sw = Math.sin(walk + (sx > 0 ? Math.PI : 0)) * mv, hipX = sx * r * 0.42, hipY = r * 1.75;
      const kx = hipX + sx * r * 0.08, ky = hipY + r * 0.45, fx = hipX + sw * r * 0.2, fy = r * 2.55 - Math.max(0, sw) * r * 0.2;
      sv.lineCap = 'round'; sv.strokeStyle = dark; sv.lineWidth = r * 0.56;
      sv.beginPath(); sv.moveTo(hipX, hipY); sv.lineTo(kx, ky); sv.lineTo(fx, fy); sv.stroke();
      sv.strokeStyle = shade(fur, -0.05); sv.lineWidth = r * 0.4; sv.beginPath(); sv.moveTo(hipX, hipY); sv.lineTo(kx, ky); sv.lineTo(fx, fy); sv.stroke();
      ball(fx + sx * r * 0.08, fy + r * 0.05, r * 0.34, skin, 1.2, 0.7);                // foot
    }
    ball(0, chestY + r * 0.35, r * 0.78, dark, 1, 0.85, -0.3);                                  // hips
    // back arm swings at the side when it isn't holding anything
    const arm = (sx, hx, hy) => {
      const shx = sx * r * 0.82, shy = chestY - r * 0.1;
      sv.lineCap = 'round'; sv.strokeStyle = dark; sv.lineWidth = r * 0.5; sv.beginPath(); sv.moveTo(shx, shy); sv.lineTo(hx, hy); sv.stroke();
      sv.strokeStyle = fur; sv.lineWidth = r * 0.34; sv.beginPath(); sv.moveTo(shx, shy); sv.lineTo(hx, hy); sv.stroke();
      ball(hx, hy, r * 0.27, skin);
    };
    const ca = hasAim ? Math.cos(aim) : 0, sa = hasAim ? Math.sin(aim) : -1;
    const grip = d => [ca * d, chestY + sa * d];                                            // points along the aim line from the chest
    const gripL = grip(r * 0.7), gripR = grip(r * 1.3);
    if (!(hasAim && w !== 'laser')) arm(-1, -r * 1.0 + Math.sin(walk) * r * 0.3 * mv, chestY + r * 0.85);
    ball(0, chestY, r * 0.9, fur, 1.05, 0.9, -0.28);                                // torso
    ball(0, chestY + r * 0.12, r * 0.5, skin, 1, 0.9, -0.12);                         // chest patch
    if (hasAim && w !== 'laser') {                                                         // weapon, then hands on it
      sv.save(); sv.translate(0, chestY); sv.rotate(aim + (w === 'blade' ? swing : 0));
      const bar = (x0, h, w0, c) => { const gr = sv.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, shade(c, 0.35)); gr.addColorStop(1, shade(c, -0.45)); sv.fillStyle = gr; sv.fillRect(x0, -h / 2, w0, h); };
      if (w === 'gun') { bar(r * 0.55, 6, r * 1.0, '#b9bdca'); bar(r * 0.5, 9, r * 0.4, '#3a3d4a'); }
      else if (w === 'shotgun') { bar(r * 0.3, 8, r * 1.5, '#8a8f9c'); bar(r * 0.3, 9, r * 0.5, '#7a4a22'); bar(r * 1.7, 5, r * 0.15, '#222'); }
      else if (w === 'flame') { bar(r * 0.4, 8, r * 1.2, '#9aa0aa'); bar(r * 0.6, 11, r * 0.4, '#c44'); bar(r * 1.6, 10, 5, '#ff8a2a'); }
      else if (w === 'rocket') { bar(r * 0.2, 13, r * 1.5, '#5d6470'); bar(r * 1.7, 13, 5, '#ff5a5a'); bar(r * 0.2, 15, r * 0.25, '#2d3340'); }
      else if (w === 'zap') { bar(r * 0.2, 4, r * 1.6, '#8a5a2b'); ball(r * 1.9, 0, 5, '#7df9ff'); }
      else if (w === 'tommy') { bar(r * 0.1, 8, r * 1.6, '#2c2f3a'); bar(-r * 0.3, 9, r * 0.45, '#7a4a22'); ball(r * 0.85, r * 0.36, r * 0.3, '#3a3d4a'); bar(r * 1.65, 5, r * 0.25, '#15171d'); }
      else if (w === 'cd') { ball(r * 1.15, 0, r * 0.5, '#e9eef8', 1, 1, -0.3); sv.fillStyle = 'rgba(155,123,255,.6)'; sv.beginPath(); sv.moveTo(r * 1.15, 0); sv.arc(r * 1.15, 0, r * 0.46, 0, 1.6); sv.fill(); sv.fillStyle = '#1d1235'; sv.beginPath(); sv.arc(r * 1.15, 0, r * 0.1, 0, 6.28); sv.fill(); }
      else if (w === 'bow') { sv.strokeStyle = '#7a4a22'; sv.lineWidth = Math.max(2, r * 0.18); sv.lineCap = 'round'; sv.beginPath(); sv.arc(r * 0.8, 0, r * 0.9, -1.15, 1.15); sv.stroke(); sv.strokeStyle = 'rgba(255,255,255,.8)'; sv.lineWidth = 1; sv.beginPath(); sv.moveTo(r * 0.8 + Math.cos(-1.15) * r * 0.9, Math.sin(-1.15) * r * 0.9); sv.lineTo(r * 0.45, 0); sv.lineTo(r * 0.8 + Math.cos(1.15) * r * 0.9, Math.sin(1.15) * r * 0.9); sv.stroke(); bar(r * 0.45, 2.5, r * 1.1, '#8a5a2b'); }
      else if (w === 'nade') { sv.save(); sv.translate(r * 0.95, 0); sv.fillStyle = '#d63b3b'; rr(-r * 0.4, -r * 0.18, r * 0.8, r * 0.36, 3); sv.fill(); sv.fillStyle = 'rgba(0,0,0,.3)'; sv.fillRect(-r * 0.4, 0, r * 0.8, r * 0.18); sv.strokeStyle = '#f0e6c8'; sv.lineWidth = 1.5; sv.beginPath(); sv.moveTo(r * 0.4, 0); sv.quadraticCurveTo(r * 0.6, -r * 0.3, r * 0.75, -r * 0.15); sv.stroke(); glowAt(r * 0.75, -r * 0.15, r * 0.9, '#ffb347', 0.9); sv.restore(); }
      else if (w === 'blade') {
        bar(r * 0.45, 6, r * 0.45, '#2a1a10'); bar(r * 0.88, 11, 3, '#9aa0aa');
        const bl = sv.createLinearGradient(0, -r * 0.2, 0, r * 0.2); bl.addColorStop(0, '#f4f7ff'); bl.addColorStop(1, '#9aa7c0');
        sv.fillStyle = bl; sv.beginPath(); sv.moveTo(r * 0.9, -r * 0.16); sv.lineTo(r * 1.9, -r * 0.03); sv.lineTo(r * 0.9, r * 0.14); sv.closePath(); sv.fill();
        sv.fillStyle = 'rgba(255,255,255,.7)'; sv.fillRect(r * 0.95, -r * 0.05, r * 0.8, 1.4);
      }
      sv.restore();
      arm(1, gripL[0], gripL[1]);                                                          // trigger hand
      if (two) arm(-1, gripR[0], gripR[1]);                                                // second hand steadies it
    } else if (hasAim && w === 'laser') arm(1, r * 1.0 - Math.sin(walk) * r * 0.3 * mv, chestY + r * 0.85);
    // head
    sv.save(); sv.translate(0, 0);
    ball(-r * 0.98, -r * 0.02, r * 0.34, fur); ball(r * 0.98, -r * 0.02, r * 0.34, fur);
    ball(-r * 0.98, -r * 0.02, r * 0.2, shade(skin, -0.2)); ball(r * 0.98, -r * 0.02, r * 0.2, shade(skin, -0.2));
    ball(0, 0, r, fur);
    sv.save(); sv.beginPath(); sv.arc(0, 0, r, 0, 6.28); sv.clip(); furTexture(r, fur, ch.name.length * 31); sv.restore();
    ball(-r * 0.3, -r * 0.1, r * 0.3, skin, 1, 0.9); ball(r * 0.3, -r * 0.1, r * 0.3, skin, 1, 0.9);
    ball(0, r * 0.4, r * 0.6, skin, 1, 0.78);
    sv.fillStyle = 'rgba(30,15,8,.8)'; sv.beginPath(); sv.ellipse(-r * 0.1, r * 0.26, r * 0.045, r * 0.06, 0, 0, 6.28); sv.ellipse(r * 0.1, r * 0.26, r * 0.045, r * 0.06, 0, 0, 6.28); sv.fill();
    const lx = hasAim ? Math.cos(aim) * r * 0.06 : 0, ly = hasAim ? Math.sin(aim) * r * 0.05 : 0;
    for (const sx of [-1, 1]) {
      const ex = sx * r * 0.3;
      sv.fillStyle = '#efe9da'; sv.beginPath(); sv.arc(ex, -r * 0.1, r * 0.18, 0, 6.28); sv.fill();
      sv.fillStyle = '#4b2c14'; sv.beginPath(); sv.arc(ex + lx, -r * 0.06 + ly, r * 0.1, 0, 6.28); sv.fill();
      sv.fillStyle = '#0b0603'; sv.beginPath(); sv.arc(ex + lx, -r * 0.06 + ly, r * 0.055, 0, 6.28); sv.fill();
      sv.fillStyle = '#fff'; sv.beginPath(); sv.arc(ex + lx - r * 0.03, -r * 0.09 + ly, r * 0.025, 0, 6.28); sv.fill();
      sv.fillStyle = shade(fur, -0.1); sv.beginPath(); sv.rect(ex - r * 0.2, -r * 0.3, r * 0.4, r * 0.21); sv.fill();
      sv.strokeStyle = 'rgba(0,0,0,.45)'; sv.lineWidth = 1.2; sv.beginPath(); sv.moveTo(ex - r * 0.2, -r * 0.09); sv.lineTo(ex + r * 0.2, -r * 0.09); sv.stroke();
    }
    sv.strokeStyle = '#2b1a10'; sv.lineWidth = Math.max(1.3, r * 0.06); sv.lineCap = 'round'; sv.beginPath(); sv.moveTo(-r * 0.2, r * 0.52); sv.lineTo(r * 0.2, r * 0.54); sv.stroke();
    if (ch.cigar) {                                                   // cigar in the corner of the mouth, with a glowing tip and drifting smoke
      sv.save(); sv.translate(r * 0.18, r * 0.52); sv.rotate(-0.22);
      const cg = sv.createLinearGradient(0, -r * 0.06, 0, r * 0.06); cg.addColorStop(0, '#9a6232'); cg.addColorStop(1, '#4a2a12');
      sv.fillStyle = cg; sv.fillRect(0, -r * 0.065, r * 0.78, r * 0.13);
      sv.fillStyle = '#d9b35a'; sv.fillRect(r * 0.18, -r * 0.07, r * 0.07, r * 0.14);
      sv.fillStyle = '#d8d8d8'; sv.fillRect(r * 0.74, -r * 0.06, r * 0.07, r * 0.12);
      glowAt(r * 0.82, 0, r * 0.7, '#ff7a2a', 0.8);
      const tn = performance.now() / 1000;
      for (let i = 0; i < 4; i++) { const u = (tn * 0.55 + i * 0.25) % 1; sv.fillStyle = `rgba(215,215,225,${0.32 * (1 - u)})`; sv.beginPath(); sv.arc(r * 0.82 + Math.sin(u * 6 + i) * r * 0.22, -u * r * 1.3, r * (0.07 + u * 0.2), 0, 6.28); sv.fill(); }
      sv.restore();
    }
    const acc = ch.acc;
    if (acc === 'phones') { sv.strokeStyle = '#1b1b24'; sv.lineWidth = r * 0.2; sv.lineCap = 'round'; sv.beginPath(); sv.arc(0, -r * 0.05, r * 1.04, Math.PI * 1.05, Math.PI * 1.95); sv.stroke(); ball(-r * 1.02, -r * 0.02, r * 0.32, '#ff4fd8'); ball(r * 1.02, -r * 0.02, r * 0.32, '#ff4fd8'); sv.fillStyle = '#5ef2ff'; sv.fillRect(-r * 0.62, -r * 0.3, r * 1.24, r * 0.2); sv.fillStyle = 'rgba(255,255,255,.5)'; sv.fillRect(-r * 0.55, -r * 0.27, r * 0.4, r * 0.04); }
    else if (acc === 'hood') { sv.fillStyle = '#2f5a26'; sv.beginPath(); sv.arc(0, -r * 0.1, r * 1.12, Math.PI * 1.02, Math.PI * 1.98); sv.lineTo(r * 0.7, -r * 0.5); sv.lineTo(-r * 0.7, -r * 0.5); sv.closePath(); sv.fill(); ball(0, -r * 0.55, r * 0.85, '#3d7032', 1, 0.7); sv.fillStyle = '#d63b3b'; sv.beginPath(); sv.moveTo(r * 0.3, -r * 1.0); sv.lineTo(r * 1.1, -r * 1.5); sv.lineTo(r * 0.65, -r * 0.8); sv.fill(); }
    else if (acc === 'hardhat') { ball(0, -r * 0.5, r * 0.95, '#ffcf2e', 1, 0.72, -0.4); sv.fillStyle = '#d9a900'; sv.fillRect(-r * 1.1, -r * 0.55, r * 2.2, r * 0.16); sv.fillStyle = '#fff'; sv.beginPath(); sv.arc(0, -r * 0.85, r * 0.2, 0, 6.28); sv.fill(); glowAt(0, -r * 0.85, r * 1.2, '#fff6b0', 0.6); sv.fillStyle = 'rgba(40,40,48,.9)'; sv.fillRect(-r * 0.55, -r * 0.28, r * 1.1, r * 0.17); }
    else if (acc === 'scar') { sv.strokeStyle = '#8f3030'; sv.lineWidth = Math.max(1.3, r * 0.07); sv.lineCap = 'round'; sv.beginPath(); sv.moveTo(-r * 0.5, -r * 0.4); sv.lineTo(-r * 0.12, r * 0.08); sv.stroke(); sv.strokeStyle = 'rgba(255,220,220,.6)'; sv.lineWidth = 1; for (const t of [0.25, 0.5, 0.75]) { const px = -r * 0.5 + r * 0.38 * t, py = -r * 0.4 + r * 0.48 * t; sv.beginPath(); sv.moveTo(px - 2, py + 2); sv.lineTo(px + 2, py - 2); sv.stroke(); } sv.fillStyle = '#16161c'; sv.fillRect(-r * 0.98, -r * 0.64, r * 1.96, r * 0.2); sv.fillStyle = '#c0392b'; sv.fillRect(r * 0.9, -r * 0.64, r * 0.35, r * 0.1); sv.fillRect(r * 0.9, -r * 0.5, r * 0.28, r * 0.1); }
    else if (acc === 'fedora') { sv.fillStyle = 'rgba(0,0,0,.35)'; sv.beginPath(); sv.ellipse(0, -r * 0.5, r * 1.35, r * 0.34, 0, 0, 6.28); sv.fill(); ball(0, -r * 0.5, r * 1.25, '#2b2b33', 1, 0.28, -0.4); ball(0, -r * 0.92, r * 0.68, '#34343e', 1, 0.8, -0.4); sv.fillStyle = '#9a1f2a'; sv.fillRect(-r * 0.68, -r * 0.7, r * 1.36, r * 0.16); }
    else if (acc === 'bucket') { ball(0, -r * 0.82, r * 0.62, '#4c8dff', 1, 0.75); sv.fillStyle = shade('#4c8dff', -0.3); sv.fillRect(-r * 1.02, -r * 0.62, r * 2.04, r * 0.15); }
    else if (acc === 'visor') { sv.fillStyle = '#ff3df2'; rr(-r * 0.7, -r * 0.32, r * 1.4, r * 0.32, r * 0.1); sv.fill(); sv.fillStyle = 'rgba(255,255,255,.55)'; sv.fillRect(-r * 0.62, -r * 0.28, r * 1.24, r * 0.06); sv.fillStyle = '#fff'; sv.fillRect(-r * 0.3, -r * 0.18, r * 0.14, r * 0.08); sv.fillRect(r * 0.16, -r * 0.18, r * 0.14, r * 0.08); }
    else if (acc === 'band') { sv.fillStyle = '#ffeb3b'; sv.fillRect(-r * 0.98, -r * 0.62, r * 1.96, r * 0.2); sv.fillStyle = 'rgba(0,0,0,.2)'; sv.fillRect(-r * 0.98, -r * 0.46, r * 1.96, r * 0.04); sv.fillStyle = '#ffeb3b'; sv.fillRect(r * 0.9, -r * 0.62, r * 0.4, r * 0.1); }
    else if (acc === 'cap') { ball(0, -r * 0.5, r * 0.82, '#2d7d46', 1, 0.75); sv.fillStyle = shade('#2d7d46', -0.3); sv.fillRect(-r * 0.2, -r * 0.62, r * 1.3, r * 0.14); }
    else if (acc === 'helmet') { ball(0, -r * 0.35, r * 1.05, '#5b6b7a', 1, 0.8); sv.fillStyle = '#ffcf6e'; sv.fillRect(-r * 0.1, -r * 1.15, r * 0.2, r * 0.3); }
    else if (acc === 'wizard') { sv.fillStyle = '#6c3fc9'; sv.beginPath(); sv.moveTo(-r * 0.85, -r * 0.55); sv.lineTo(0, -r * 1.9); sv.lineTo(r * 0.85, -r * 0.55); sv.closePath(); sv.fill(); sv.fillStyle = 'rgba(255,255,255,.2)'; sv.beginPath(); sv.moveTo(-r * 0.3, -r * 0.7); sv.lineTo(0, -r * 1.85); sv.lineTo(-r * 0.1, -r * 0.7); sv.fill(); sv.fillStyle = '#ffd34d'; sv.fillRect(-r * 0.9, -r * 0.62, r * 1.8, r * 0.14); }
    sv.restore();
    sv.restore();
  }

  // ---------- opps: monkeys and animals, each lit like a small 3D model ----------
  const BASE = { monkey: ['#8a5a2b', '#6b6b78', '#c9a36a'], rat: ['#8d8d99', '#6f6a63', '#b7aa98'], bat: ['#5a3d8a', '#3d3d55', '#7a4a6a'], gorilla: ['#34353f', '#4a4b55', '#2c2c33'], boar: ['#8a4b3a', '#5d4a3e', '#a0643f'], rhino: ['#8b93a0', '#7a7f8c', '#9a8f84'], hippo: ['#7e6f9c', '#8a7aa3', '#6f7fa8'], parrot: ['#d63b3b', '#2fb36a', '#3b82d6'], mandrill: ['#6a4a2f', '#5c4a3a', '#7a5a3a'], jaguar: ['#e0902f', '#d4a24a', '#c97a2a'], wolf: ['#8f98a6', '#6d7482', '#a6a39a'] };
  BASE.kingGorilla = ['#3a3a46', '#4a4252', '#2c3a3a']; BASE.kingLion = ['#e0a040']; BASE.kingBull = ['#7a3b2a'];
  function drawOpp(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.spawn > 0) { ctx.restore(); return; }                      // nothing is drawn before an opp arrives
    const r = e.r, bob = Math.sin(e.ph) * r * 0.06, wob = Math.cos(e.ph * 0.5) * 0.05;
    if (e.boss && e.mode === 'tele') {                                // warning before a boss move
      const pul = 0.4 + 0.4 * Math.sin(e.mt * 40);
      if (e.look === 'kingGorilla') { ctx.strokeStyle = `rgba(255,80,80,${pul + 0.2})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 130 * (1 - Math.max(0, e.mt) / 0.8) + 20, 0, 6.28); ctx.stroke(); }
      else { ctx.strokeStyle = `rgba(255,80,80,${pul + 0.2})`; ctx.lineWidth = r * 0.6; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(e.dx * r, e.dy * r); ctx.lineTo(e.dx * 420, e.dy * 420); ctx.stroke(); }
    }
    shadow(0, r * 0.95, r * 0.95, r * 0.3);
    ctx.rotate(wob); ctx.translate(0, bob);
    if (!['bat', 'parrot'].includes(e.look)) for (const sx of [-1, 1]) { const st = Math.sin(e.ph + (sx > 0 ? Math.PI : 0)); ball(sx * r * 0.45 + st * r * 0.1, r * 0.92 + Math.max(0, st) * r * -0.12, r * 0.28, '#2a2230', 1.2, 0.7); }
    const col = (BASE[e.look] || ['#e84393'])[e.v % (BASE[e.look] ? BASE[e.look].length : 1)];
    beast(e, r, col);
    oppOutfit(e, r); oppWeapon(e, r);
    if (e.flash > 0 || e.st === 1) { ctx.fillStyle = e.flash > 0 ? 'rgba(255,255,255,.55)' : `rgba(255,255,255,${0.35 + 0.35 * Math.sin(e.stt * 40)})`; ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, 6.28); ctx.fill(); }
    if (e.burnT > 0) glowAt(0, 0, r * 3.2, '#ff8a2a', 0.7);
    if (e.elite) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, r * 1.08, 0, 6.28); ctx.stroke(); glowAt(0, 0, r * 3, '#ffd34d', 0.25); }
    ctx.restore();
    if (e.hp < e.max && !e.boss) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(e.x - e.r, e.y + e.r + 6, e.r * 2, 3); ctx.fillStyle = '#7bed9f'; ctx.fillRect(e.x - e.r, e.y + e.r + 6, e.r * 2 * Math.max(0, e.hp / e.max), 3); }
  }

  // opp skins and gear
  const EYEY = { monkey: -0.2, rat: -0.1, bat: -0.1, gorilla: -0.18, boar: -0.2, rhino: -0.28, hippo: -0.4, parrot: -0.2, mandrill: -0.2, jaguar: -0.15, wolf: -0.15 };
  function oppOutfit(e, r) {
    if (e.boss || !e.out) return;
    const ey = (EYEY[e.look] === undefined ? -0.2 : EYEY[e.look]) * r, c3 = ['#d63b3b', '#2f6fd6', '#e0a030'][e.v % 3];
    if (e.out === 1) { ctx.fillStyle = c3; ctx.fillRect(-r * 0.8, ey - r * 0.46, r * 1.6, r * 0.2); ctx.beginPath(); ctx.moveTo(r * 0.8, ey - r * 0.46); ctx.lineTo(r * 1.15, ey - r * 0.25); ctx.lineTo(r * 0.8, ey - r * 0.22); ctx.fill(); }
    else if (e.out === 2) { ctx.fillStyle = '#0b0b12'; rr(-r * 0.64, ey - r * 0.15, r * 1.28, r * 0.28, r * 0.08); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.38)'; ctx.fillRect(-r * 0.52, ey - r * 0.1, r * 0.34, r * 0.05); ctx.fillRect(r * 0.08, ey - r * 0.1, r * 0.2, r * 0.05); }
    else if (e.out === 3) { ball(0, ey - r * 0.55, r * 0.8, '#6a7380', 1, 0.7); ctx.fillStyle = '#464e59'; ctx.fillRect(-r * 0.8, ey - r * 0.42, r * 1.6, r * 0.12); }
    else if (e.out === 4) { ball(0, ey - r * 0.5, r * 0.75, c3, 1, 0.65); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-r * 0.2, ey - r * 0.42, r * 1.1, r * 0.1); }
  }
  function oppWeapon(e, r) {
    if (e.boss) return;
    const bar = (x0, h, w0, c) => { const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, shade(c, 0.35)); g.addColorStop(1, shade(c, -0.45)); ctx.fillStyle = g; ctx.fillRect(x0, -h / 2, w0, h); };
    ctx.save();
    if (e.gun) {
      const a = e.aimA === undefined ? Math.PI / 2 : e.aimA;
      ctx.translate(Math.cos(a) * r * 0.5, r * 0.25 + Math.sin(a) * r * 0.3); ctx.rotate(a);
      const g = e.gun;
      if (g === 'pistol') { bar(0, r * 0.28, r * 0.85, '#30333f'); bar(0, r * 0.42, r * 0.3, '#555a66'); }
      else if (g === 'rifle') { bar(0, r * 0.26, r * 1.7, '#3a3d4a'); bar(r * 0.4, r * 0.4, r * 0.35, '#7a4a22'); bar(r * 0.7, r * 0.18, r * 0.35, '#1c1f28'); }
      else if (g === 'smg') { bar(0, r * 0.34, r * 1.1, '#2c2f3a'); bar(r * 0.2, r * 0.6, r * 0.18, '#444'); }
      else if (g === 'shotgun') { bar(0, r * 0.3, r * 1.5, '#8a8f9c'); bar(-r * 0.1, r * 0.4, r * 0.5, '#7a4a22'); }
      else { bar(0, r * 0.55, r * 1.3, '#4a4f5c'); bar(r * 1.2, r * 0.7, r * 0.2, '#222'); }
      ball(0, 0, r * 0.2, '#c9a36a');
    } else if (e.melee === 'blades') {
      for (const sx of [-1, 1]) { ctx.save(); ctx.translate(sx * r * 0.95, r * 0.3); ctx.rotate(sx * 0.5 + Math.sin(e.ph * 1.3) * 0.2); ctx.fillStyle = '#d7dbe6'; ctx.beginPath(); ctx.moveTo(-r * 0.08, 0); ctx.lineTo(0, -r * 0.8); ctx.lineTo(r * 0.08, 0); ctx.fill(); ctx.restore(); }
    } else if (e.melee) {
      ctx.translate(r * 0.9, r * 0.35); ctx.rotate(-0.9 + Math.sin(e.ph * 1.3) * 0.4);
      if (e.melee === 'knife') { ctx.fillStyle = '#d7dbe6'; ctx.beginPath(); ctx.moveTo(-r * 0.07, 0); ctx.lineTo(0, -r * 0.85); ctx.lineTo(r * 0.09, 0); ctx.fill(); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-r * 0.08, 0, r * 0.16, r * 0.25); }
      else if (e.melee === 'club') { ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.moveTo(-r * 0.06, 0); ctx.lineTo(-r * 0.2, -r * 0.8); ctx.lineTo(r * 0.2, -r * 0.8); ctx.lineTo(r * 0.06, 0); ctx.fill(); }
      else { ctx.fillStyle = '#6b4a28'; ctx.beginPath(); ctx.moveTo(-r * 0.08, 0); ctx.lineTo(-r * 0.22, -r * 1.05); ctx.lineTo(r * 0.22, -r * 1.05); ctx.lineTo(r * 0.08, 0); ctx.fill(); ctx.fillStyle = '#c9ccd6'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(r * 0.2, -r * (0.35 + i * 0.2)); ctx.lineTo(r * 0.36, -r * (0.42 + i * 0.2)); ctx.lineTo(r * 0.2, -r * (0.5 + i * 0.2)); ctx.fill(); } }
      ball(0, r * 0.05, r * 0.2, '#c9a36a');
    }
    ctx.restore();
  }

  function beast(e, r, col) {
    const L = e.look, flap = Math.sin(e.ph * 1.6);
    const fur = ctx;
    if (L === 'monkey' || L === 'mandrill') {
      ball(-r * 0.95, 0, r * 0.36, col); ball(r * 0.95, 0, r * 0.36, col);
      ball(0, 0, r * 0.95, col); ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, 6.28); ctx.clip(); furTexture(r * 0.95, col, e.v + 5); ctx.restore();
      ball(0, r * 0.32, r * 0.55, L === 'mandrill' ? '#4a7bd6' : '#d9b48a', 1, 0.8);
      if (L === 'mandrill') { ctx.fillStyle = '#e03a3a'; ctx.fillRect(-r * 0.06, r * 0.05, r * 0.12, r * 0.5); }
      angryEyes(r, -r * 0.2, r * 0.3, r * 0.17); fangs(r, r * 0.5, r * 0.12);
    } else if (L === 'rat') {
      ctx.strokeStyle = '#c99'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r * 0.5, r * 0.6); ctx.quadraticCurveTo(r * 1.6, r * 0.6 + Math.sin(e.ph) * 4, r * 1.5, -r * 0.3); ctx.stroke();
      ball(-r * 0.7, -r * 0.55, r * 0.45, col); ball(r * 0.7, -r * 0.55, r * 0.45, col); ball(-r * 0.7, -r * 0.55, r * 0.26, '#e9a0b0'); ball(r * 0.7, -r * 0.55, r * 0.26, '#e9a0b0');
      ball(0, 0, r * 0.9, col, 1, 0.95); ball(0, r * 0.45, r * 0.4, shade(col, 0.15), 1, 0.8);
      ctx.fillStyle = '#e9a0b0'; ctx.beginPath(); ctx.arc(0, r * 0.38, r * 0.1, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; for (const sx of [-1, 1]) for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.2, r * 0.45); ctx.lineTo(sx * r * 0.95, r * 0.45 + k * r * 0.2); ctx.stroke(); }
      angryEyes(r, -r * 0.1, r * 0.3, r * 0.15, '#f6e0e0'); fangs(r, r * 0.62, r * 0.08);
    } else if (L === 'bat') {
      const wy = flap * r * 0.5;
      for (const sx of [-1, 1]) { ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.moveTo(sx * r * 0.5, 0); ctx.lineTo(sx * r * 1.9, -r * 0.7 - wy); ctx.lineTo(sx * r * 1.5, r * 0.1 - wy * 0.3); ctx.lineTo(sx * r * 1.6, r * 0.7 - wy * 0.2); ctx.lineTo(sx * r * 0.8, r * 0.5); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = shade(col, -0.1); for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.3, -r * 0.7); ctx.lineTo(sx * r * 0.65, -r * 1.3); ctx.lineTo(sx * r * 0.8, -r * 0.5); ctx.fill(); }
      ball(0, 0, r * 0.85, col); angryEyes(r, -r * 0.1, r * 0.3, r * 0.14, '#ffe08a'); fangs(r, r * 0.35, r * 0.1);
    } else if (L === 'gorilla' || L === 'kingGorilla') {
      const w = L === 'kingGorilla' ? 1.05 : 1;
      ball(0, r * 0.55, r * 1.0, shade(col, -0.1), 1.05, 0.78);                        // broad shoulders
      ball(-r * 1.0, r * 0.3, r * 0.4, col); ball(r * 1.0, r * 0.3, r * 0.4, col);        // fists
      ball(0, -r * 0.1, r * 0.72 * w, col);
      ctx.save(); ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.72, 0, 6.28); ctx.clip(); ctx.translate(0, -r * 0.1); furTexture(r * 0.72, col, 40 + e.v); ctx.restore();
      ball(0, r * 0.12, r * 0.45, shade(col, 0.15), 1, 0.8);
      ctx.fillStyle = shade(col, -0.4); ctx.fillRect(-r * 0.6, -r * 0.35, r * 1.2, r * 0.14);                  // brow ridge
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.ellipse(-r * 0.1, r * 0.08, r * 0.05, r * 0.07, 0, 0, 6.28); ctx.ellipse(r * 0.1, r * 0.08, r * 0.05, r * 0.07, 0, 0, 6.28); ctx.fill();
      angryEyes(r, -r * 0.18, r * 0.25, r * 0.12); fangs(r, r * 0.3, r * 0.14);
      ball(0, r * 0.72, r * 0.42, '#9a9aa8', 1, 0.55);
    } else if (L === 'boar') {
      ball(-r * 0.6, -r * 0.7, r * 0.3, col); ball(r * 0.6, -r * 0.7, r * 0.3, col);
      ball(0, 0, r * 0.95, col, 1, 0.95); ball(0, r * 0.35, r * 0.5, '#d9a0a0', 1, 0.75);
      ctx.fillStyle = '#4a2020'; ctx.beginPath(); ctx.arc(-r * 0.12, r * 0.35, r * 0.06, 0, 6.28); ctx.arc(r * 0.12, r * 0.35, r * 0.06, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#f4efe0'; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.4, r * 0.5); ctx.quadraticCurveTo(sx * r * 0.7, r * 0.7, sx * r * 0.7, r * 0.2); ctx.stroke(); }
      angryEyes(r, -r * 0.2, r * 0.3, r * 0.12, '#f2d0a0');
    } else if (L === 'rhino') {
      ball(-r * 0.7, -r * 0.7, r * 0.26, col); ball(r * 0.7, -r * 0.7, r * 0.26, col);
      ball(0, 0, r * 0.98, col, 1.05, 0.92); ball(0, r * 0.4, r * 0.58, shade(col, 0.12), 1.1, 0.72);
      ctx.fillStyle = '#d9d2bf'; ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.25); ctx.lineTo(0, -r * 0.55); ctx.lineTo(r * 0.2, r * 0.25); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.2); ctx.lineTo(-r * 0.02, -r * 0.4); ctx.lineTo(r * 0.02, r * 0.2); ctx.fill();
      angryEyes(r, -r * 0.28, r * 0.5, r * 0.09, '#f6e6c8');
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(-r * 0.55, r * 0.55, r * 1.1, r * 0.08);
    } else if (L === 'hippo') {
      ball(-r * 0.62, -r * 0.8, r * 0.22, col); ball(r * 0.62, -r * 0.8, r * 0.22, col);
      ball(0, 0, r * 0.98, col, 1, 0.92); ball(0, r * 0.4, r * 0.72, '#c98aa0', 1.05, 0.62);
      ctx.fillStyle = '#4a2438'; ctx.beginPath(); ctx.ellipse(-r * 0.22, r * 0.3, r * 0.07, r * 0.05, 0, 0, 6.28); ctx.ellipse(r * 0.22, r * 0.3, r * 0.07, r * 0.05, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#f7f3e6'; for (const sx of [-1, 1]) ctx.fillRect(sx * r * 0.4 - r * 0.06, r * 0.55, r * 0.12, r * 0.15);
      angryEyes(r, -r * 0.4, r * 0.38, r * 0.1, '#f3e4ee');
    } else if (L === 'parrot') {
      const wy = flap * r * 0.6;
      for (const sx of [-1, 1]) { ctx.fillStyle = shade(BASE.parrot[(e.v + 1) % 3], -0.1); ctx.beginPath(); ctx.moveTo(sx * r * 0.6, -r * 0.1); ctx.quadraticCurveTo(sx * r * 1.9, -r * 0.8 - wy, sx * r * 1.7, r * 0.6 - wy * 0.4); ctx.lineTo(sx * r * 0.7, r * 0.4); ctx.fill(); }
      ctx.fillStyle = BASE.parrot[(e.v + 2) % 3]; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.25 - r * 0.12, -r * 0.8); ctx.lineTo(i * r * 0.3, -r * 1.4 - Math.abs(i) * 0, ctx.lineWidth); ctx.lineTo(i * r * 0.25 + r * 0.12, -r * 0.8); ctx.fill(); }
      ball(0, 0, r * 0.85, col); ball(0, r * 0.3, r * 0.45, shade(col, 0.2), 1, 0.7);
      ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.05); ctx.quadraticCurveTo(0, -r * 0.1, r * 0.3, r * 0.05); ctx.quadraticCurveTo(r * 0.2, r * 0.7, 0, r * 0.85); ctx.quadraticCurveTo(-r * 0.2, r * 0.7, -r * 0.3, r * 0.05); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-r * 0.25, r * 0.28, r * 0.5, r * 0.05);
      angryEyes(r, -r * 0.2, r * 0.32, r * 0.13, '#fff7d6');
    } else if (L === 'jaguar' || L === 'wolf') {
      const spot = L === 'jaguar';
      ball(-r * 0.62, -r * 0.7, r * 0.3, col); ball(r * 0.62, -r * 0.7, r * 0.3, col);
      ball(0, 0, r * 0.92, col);
      if (spot) { ctx.fillStyle = 'rgba(40,20,5,.7)'; const rn = seeded(e.v + 3); for (let i = 0; i < 9; i++) { const a = rn() * 6.28, d = rn() * r * 0.7; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d - r * 0.1, r * 0.08, 0, 6.28); ctx.fill(); } }
      else { ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 6.28); ctx.clip(); furTexture(r * 0.92, col, 90 + e.v); ctx.restore(); }
      ball(0, r * 0.42, r * 0.48, spot ? '#f0d9a8' : shade(col, 0.2), 1, 0.8);
      ctx.fillStyle = '#1b0f0f'; ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.3); ctx.lineTo(r * 0.12, r * 0.3); ctx.lineTo(0, r * 0.42); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; for (const sx of [-1, 1]) for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.2, r * 0.45); ctx.lineTo(sx * r * 0.85, r * 0.45 + k * r * 0.15); ctx.stroke(); }
      angryEyes(r, -r * 0.15, r * 0.3, r * 0.13, '#e6ff9a'); fangs(r, r * 0.55, r * 0.14);
    } else if (L === 'kingLion') {
      const rn = seeded(7);
      for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; ball(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.3, i % 2 ? '#b5651d' : '#8a4a12'); }
      ball(0, 0, r * 0.75, '#e0a040'); ball(0, r * 0.3, r * 0.4, '#f3d9a0', 1, 0.8);
      ctx.fillStyle = '#2a0f0f'; ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.2); ctx.lineTo(r * 0.1, r * 0.2); ctx.lineTo(0, r * 0.32); ctx.fill();
      angryEyes(r, -r * 0.15, r * 0.25, r * 0.1, '#ffe9a0'); fangs(r, r * 0.42, r * 0.12);
    } else if (L === 'kingBull') {
      ctx.strokeStyle = '#efe6cc'; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.5, -r * 0.4); ctx.quadraticCurveTo(sx * r * 1.2, -r * 0.5, sx * r * 1.15, -r * 1.1); ctx.stroke(); }
      ball(0, 0, r * 0.9, '#7a3b2a'); ball(0, r * 0.38, r * 0.5, '#c9887a', 1.1, 0.7);
      ctx.strokeStyle = '#d8b04a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, r * 0.5, r * 0.14, 0, 3.14); ctx.stroke();
      angryEyes(r, -r * 0.18, r * 0.3, r * 0.12, '#ffd6c0');
    } else { ball(0, 0, r, col); angryEyes(r, -r * 0.2, r * 0.3, r * 0.15); }
    if (e.boss) {                                                                         // crown
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); const y0 = -r * 1.0;
      ctx.moveTo(-r * 0.55, y0); ctx.lineTo(-r * 0.62, y0 - r * 0.45); ctx.lineTo(-r * 0.3, y0 - r * 0.2); ctx.lineTo(0, y0 - r * 0.55); ctx.lineTo(r * 0.3, y0 - r * 0.2); ctx.lineTo(r * 0.62, y0 - r * 0.45); ctx.lineTo(r * 0.55, y0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-r * 0.5, y0 - r * 0.08, r * 1.0, r * 0.06);
      ctx.fillStyle = '#e84393'; ctx.beginPath(); ctx.arc(0, y0 - r * 0.12, r * 0.07, 0, 6.28); ctx.fill();
    }
    if (e.kind === 'tank' || e.boss) { /* heavy opps get a faint dark outline for weight */ ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, 6.28); ctx.stroke(); }
  }

  // ---------- environments: every room gets its own look ----------
  const ENVS = [
    { light: '#ffcf70', wall: ['#7a8a62', '#4a5a3d', 'stone'], n: 'Jungle Temple',  bg: ['#0f2a1a', '#1d4a2c'], floor: '#1b3a24', grid: 'rgba(190,255,190,.07)', edge: '#5fbf6a', amb: 'fireflies', prop: 'tree' },
    { light: '#ff3df2', wall: ['#4a3a72', '#241640', 'metal'], n: 'Neon Alley',     bg: ['#12062a', '#2a0a4a'], floor: '#170b32', grid: 'rgba(255,61,242,.16)',  edge: '#ff3df2', amb: 'rain',      prop: 'sign' },
    { light: '#8fe3ff', wall: ['#cdeeff', '#7fc3e8', 'ice'], n: 'Frozen Cavern',  bg: ['#0b2236', '#1b4a6b'], floor: '#17405c', grid: 'rgba(200,240,255,.12)', edge: '#8fe3ff', amb: 'snow',      prop: 'crystal' },
    { light: '#ff6a2a', wall: ['#5a4644', '#2a1f1d', 'stone'], n: 'Lava Foundry',   bg: ['#2a0c06', '#5a1a0a'], floor: '#3a1a12', grid: 'rgba(255,140,60,.12)',  edge: '#ff6a2a', amb: 'embers',    prop: 'vent' },
    { light: '#6aa3ff', wall: ['#6b7bb0', '#2f3a66', 'metal'], n: 'Space Station',  bg: ['#050814', '#101a3a'], floor: '#161d36', grid: 'rgba(120,170,255,.14)', edge: '#6aa3ff', amb: 'stars',     prop: 'panel' },
    { light: '#ffd9a0', wall: ['#e0bd82', '#a67c45', 'stone'], n: 'Desert Ruins',   bg: ['#4a2f12', '#a8742f'], floor: '#8a5f2a', grid: 'rgba(60,30,0,.16)',     edge: '#e6b35a', amb: 'dust',      prop: 'pillar' },
    { light: '#a98bff', wall: ['#8a8499', '#463f5a', 'crate'], n: 'Haunted Manor',  bg: ['#14101e', '#2b2140'], floor: '#2a2038', grid: 'rgba(190,170,255,.08)', edge: '#9b86d6', amb: 'ghosts',    prop: 'tomb' },
    { light: '#4de0d0', wall: ['#d98aa8', '#8a4a6a', 'stone'], n: 'Coral Reef',     bg: ['#04243a', '#0a5a7a'], floor: '#0d4a63', grid: 'rgba(140,255,240,.09)', edge: '#4de0d0', amb: 'bubbles',   prop: 'coral' },
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
  let floorCache = { key: '', cv: null };
  function drawFloor(room) {
    const key = room + '|' + W + 'x' + H + '|' + dpr + '|' + TOP + '|' + BOT;
    if (floorCache.key !== key) {
      const off = document.createElement('canvas'); off.width = Math.round(W * dpr); off.height = Math.round(H * dpr);
      ctx = off.getContext('2d'); ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
      try { paintRoom(room); } finally { ctx = mainCtx; }
      floorCache = { key, cv: off };
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(floorCache.cv, 0, 0); ctx.restore();
  }

  // each room type gets its own ground: moss and roots, wet asphalt, frost, lava cracks, deck plating, sand, boards, sea floor
  function floorDetail(env, room) {
    const r = seeded(room * 5 + 3), X = () => PAD + r() * (AW - PAD * 2), Y = () => TOP + r() * (AH - TOP - BOT);
    const patch = (x, y, rad, rgb, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
    ctx.lineCap = 'round';
    switch (env.amb) {
      case 'fireflies':
        for (let i = 0; i < 12; i++) patch(X(), Y(), 28 + r() * 40, '58,130,58', 0.3);
        for (let i = 0; i < 90; i++) { const x = X(), y = Y(); ctx.strokeStyle = `rgba(${70 + r() * 40},${150 + r() * 60},70,.55)`; ctx.lineWidth = 1.2; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 2, y); ctx.lineTo(x + k * 3.5, y - 5 - r() * 4); ctx.stroke(); } }
        ctx.strokeStyle = 'rgba(40,24,12,.6)'; ctx.lineWidth = 4; for (let i = 0; i < 3; i++) { let x = r() < 0.5 ? PAD : AW - PAD, y = Y(); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (x < AW / 2 ? 1 : -1) * (12 + r() * 14); y += (r() - 0.5) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
        break;
      case 'rain':
        for (let i = 0; i < 7; i++) { const x = X(), y = Y(), rw = 22 + r() * 28; const g = ctx.createRadialGradient(x, y, 2, x, y, rw); const c = i % 2 ? '255,61,242' : '60,230,255'; g.addColorStop(0, `rgba(${c},.45)`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rw, rw * 0.5, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, rw * 0.7, rw * 0.32, 0, 0, 6.28); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,214,90,.28)'; ctx.lineWidth = 3; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.moveTo(AW / 2, TOP); ctx.lineTo(AW / 2, AH - BOT); ctx.stroke(); ctx.setLineDash([]);
        break;
      case 'snow':
        for (let i = 0; i < 9; i++) patch(X(), Y(), 30 + r() * 40, '235,248,255', 0.28);
        for (let i = 0; i < 9; i++) { let x = X(), y = Y(); ctx.strokeStyle = 'rgba(190,235,255,.5)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 24; y += 8 + r() * 14; ctx.lineTo(x, y); } ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 12; for (let i = 0; i < 4; i++) { const x = X(); ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x - 90, AH - BOT); ctx.stroke(); }
        break;
      case 'embers':
        for (let i = 0; i < 8; i++) { let x = X(), y = Y(); const pts = [[x, y]]; for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 44; y += (r() - 0.35) * 40; pts.push([x, y]); }
          for (const [lw, col] of [[7, 'rgba(255,90,20,.18)'], [3.5, 'rgba(255,140,40,.6)'], [1.4, 'rgba(255,230,160,.95)']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
          glowAt(pts[2][0], pts[2][1], 70, '#ff6a2a', 0.35); }
        break;
      case 'stars':
        ctx.fillStyle = 'rgba(255,200,40,.55)'; for (const yy of [TOP + 2, AH - BOT - 14]) { ctx.save(); ctx.beginPath(); ctx.rect(PAD, yy, AW - PAD * 2, 12); ctx.clip(); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(PAD, yy, AW - PAD * 2, 12); ctx.fillStyle = '#e8b923'; for (let x = PAD - 12; x < AW - PAD; x += 22) { ctx.beginPath(); ctx.moveTo(x, yy + 12); ctx.lineTo(x + 11, yy + 12); ctx.lineTo(x + 23, yy); ctx.lineTo(x + 12, yy); ctx.fill(); } ctx.restore(); }
        ctx.fillStyle = 'rgba(200,220,255,.35)'; for (let x = PAD + 36; x < AW - PAD; x += 36) for (let y = TOP + 36; y < AH - BOT; y += 36) { ctx.fillRect(x - 5, y - 5, 2, 2); ctx.fillRect(x + 3, y - 5, 2, 2); ctx.fillRect(x - 5, y + 3, 2, 2); ctx.fillRect(x + 3, y + 3, 2, 2); }
        for (let i = 0; i < 3; i++) { const x = X(), y = Y(); ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(x - 16, y - 12, 32, 24, 3); ctx.fill(); ctx.strokeStyle = 'rgba(160,190,255,.45)'; ctx.lineWidth = 1; for (let k = -8; k <= 8; k += 5) { ctx.beginPath(); ctx.moveTo(x - 13, y + k * 0.8); ctx.lineTo(x + 13, y + k * 0.8); ctx.stroke(); } }
        break;
      case 'dust':
        ctx.strokeStyle = 'rgba(70,40,10,.18)'; ctx.lineWidth = 1.2; for (let i = 0; i < 40; i++) { const x = X(), y = Y(); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 18, y - 4, x + 36, y); ctx.stroke(); }
        for (let i = 0; i < 6; i++) patch(X(), Y(), 40 + r() * 40, '255,232,180', 0.25);
        for (let i = 0; i < 28; i++) { const x = X(), y = Y(); ctx.fillStyle = `rgba(${90 + r() * 40},${60 + r() * 30},30,.55)`; ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 3, 1.5 + r() * 2, 0, 0, 6.28); ctx.fill(); }
        break;
      case 'ghosts':
        for (let x = PAD; x < AW - PAD; x += 22) { ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.07})`; ctx.fillRect(x, TOP, 22, AH - TOP - BOT); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, TOP, 1, AH - TOP - BOT); }
        { const cx = AW / 2 - 46; ctx.fillStyle = 'rgba(110,20,40,.55)'; ctx.fillRect(cx, TOP, 92, AH - TOP - BOT); ctx.strokeStyle = 'rgba(214,170,70,.7)'; ctx.lineWidth = 2.5; ctx.strokeRect(cx + 5, TOP, 82, AH - TOP - BOT); ctx.strokeStyle = 'rgba(214,170,70,.35)'; ctx.lineWidth = 1; ctx.strokeRect(cx + 11, TOP, 70, AH - TOP - BOT); }
        break;
      case 'bubbles':
        ctx.strokeStyle = 'rgba(255,240,200,.14)'; ctx.lineWidth = 1.2; for (let i = 0; i < 36; i++) { const x = X(), y = Y(); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 14, y - 4, x + 28, y); ctx.stroke(); }
        for (let i = 0; i < 12; i++) { const x = X(), y = Y(); ctx.fillStyle = ['rgba(255,170,200,.7)', 'rgba(255,240,210,.7)', 'rgba(150,210,255,.6)'][i % 3]; ctx.beginPath(); ctx.arc(x, y, 3 + r() * 3, 0, 6.28); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 1, y + 1, 3, 1); }
        break;
    }
    // light fixtures along the walls spill coloured light onto the floor
    for (let i = 0; i < 5; i++) { const left = i % 2 === 0, y = TOP + 40 + (i + r() * 0.6) * (AH - TOP - BOT - 80) / 5; glowAt(left ? PAD : AW - PAD, y, 190, env.light, 0.36); ctx.fillStyle = env.light; ctx.beginPath(); ctx.arc(left ? PAD - 3 : AW - PAD + 3, y, 3, 0, 6.28); ctx.fill(); }
  }

  function paintRoom(room) {
    const env = envOf(room), boss = bossRoom(room);
    drawBackdrop(room, 0);
    const x0 = PAD - 6, y0 = TOP - 6, w = AW - PAD * 2 + 12, h = AH - TOP - BOT + 12;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24; ctx.fillStyle = env.floor; rr(x0, y0, w, h, 16); ctx.fill(); ctx.restore();
    ctx.save(); rr(x0, y0, w, h, 16); ctx.clip();
    const step = env.prop === 'pillar' ? 48 : 36, rnd = seeded(room * 3 + 1);
    for (let x = PAD; x < AW - PAD; x += step) for (let y = TOP; y < AH - BOT; y += step) {          // slightly different tiles with a lit bevel
      const v = rnd();
      ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.08})` : `rgba(0,0,0,${(0.5 - v) * 0.16})`; ctx.fillRect(x, y, step, step);
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(x, y, step, 1.5); ctx.fillRect(x, y, 1.5, step);
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, y + step - 1.5, step, 1.5); ctx.fillRect(x + step - 1.5, y, 1.5, step);
    }
    ctx.fillStyle = env.grid; for (let x = PAD; x < AW - PAD; x += step) ctx.fillRect(x - 0.5, TOP, 1, AH - TOP - BOT);
    for (let y = TOP; y < AH - BOT; y += step) ctx.fillRect(PAD, y - 0.5, AW - PAD * 2, 1);
    const n = seeded(room * 7 + 5);                                                            // grit and cracks
    for (let i = 0; i < 380; i++) { ctx.fillStyle = n() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)'; ctx.fillRect(PAD + n() * (AW - PAD * 2), TOP + n() * (AH - TOP - BOT), 1 + n() * 2, 1 + n() * 2); }
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { let cx = PAD + n() * (AW - PAD * 2), cy = TOP + n() * (AH - TOP - BOT); ctx.beginPath(); ctx.moveTo(cx, cy); for (let k = 0; k < 5; k++) { cx += (n() - 0.5) * 26; cy += (n() - 0.2) * 22; ctx.lineTo(cx, cy); } ctx.stroke(); }
    floorDetail(env, room);
    const lp = ctx.createRadialGradient(AW / 2, AH * 0.5, 20, AW / 2, AH * 0.5, AH * 0.62);       // light pool in the middle, dark corners
    lp.addColorStop(0, 'rgba(255,255,255,.1)'); lp.addColorStop(0.6, 'rgba(0,0,0,0)'); lp.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = lp; ctx.fillRect(x0, y0, w, h);
    const rn = seeded(room);                                                                   // props along the walls
    for (let i = 0; i < 10; i++) {
      const left = i % 2 === 0, py = TOP + 30 + rn() * (AH - TOP - BOT - 60), sz = 18 + rn() * 14, px = left ? PAD + 12 + rn() * 6 : AW - PAD - 12 - rn() * 6;
      shadow(px + 4, py + sz * 0.45, sz * 0.5, sz * 0.18); drawProp(env.prop, px, py, sz, env);
    }
    for (let i = 0; i < 9; i++) { ctx.strokeStyle = `rgba(0,0,0,${0.07 * (9 - i)})`; ctx.lineWidth = 2; rr(x0 + 1 + i * 2, y0 + 1 + i * 2, w - 2 - i * 4, h - 2 - i * 4, 14); ctx.stroke(); }   // inner shadow under the wall
    ctx.restore();
    ctx.strokeStyle = '#0b0714'; ctx.lineWidth = 9; rr(x0, y0, w, h, 16); ctx.stroke();           // wall frame
    ctx.strokeStyle = boss ? '#e84393' : env.edge; ctx.lineWidth = 3; rr(x0, y0, w, h, 16); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; rr(x0 + 2, y0 + 2, w - 4, h - 4, 14); ctx.stroke();
    ctx.fillStyle = '#0b0714'; rr(AW / 2 - 39, y0 - 12, 78, 20, 4); ctx.fill();                  // exit door, locked until the room is clear
    ctx.fillStyle = boss ? '#5a1a3a' : '#2a2246'; rr(AW / 2 - 34, y0 - 9, 68, 15, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(AW / 2 - 1, y0 - 9, 2, 15);
    ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(AW / 2, y0 + 12, 2.5, 0, 6.28); ctx.fill();
  }
  function drawDoorOpen(now) {
    const cx = AW / 2, y0 = TOP - 6, pulse = 0.6 + 0.4 * Math.sin(now / 250);
    const bm = ctx.createLinearGradient(0, y0, 0, y0 + 150); bm.addColorStop(0, 'rgba(123,237,159,.32)'); bm.addColorStop(1, 'rgba(123,237,159,0)');
    ctx.fillStyle = bm; ctx.beginPath(); ctx.moveTo(cx - 30, y0 + 6); ctx.lineTo(cx + 30, y0 + 6); ctx.lineTo(cx + 80, y0 + 150); ctx.lineTo(cx - 80, y0 + 150); ctx.fill();
    glowAt(cx, y0, 170, '#7bed9f', 0.55 * pulse);
    ctx.fillStyle = '#0b0714'; rr(cx - 39, y0 - 12, 78, 20, 4); ctx.fill();
    ctx.fillStyle = `rgba(150,255,185,${0.55 + 0.4 * pulse})`; rr(cx - 30, y0 - 8, 60, 14, 3); ctx.fill();
    ctx.strokeStyle = '#7bed9f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const o = (now / 7 + i * 26) % 78, yy = y0 + 112 - o; ctx.globalAlpha = Math.max(0, 1 - o / 78); ctx.beginPath(); ctx.moveTo(cx - 12, yy + 7); ctx.lineTo(cx, yy - 3); ctx.lineTo(cx + 12, yy + 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function drawAmbient(room, now) {
    const env = envOf(room), t = now / 1000, rnd = seeded(room + 99);
    ctx.save();
    if (env.amb === 'bubbles') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(120,255,235,.07)'; ctx.lineWidth = 3; for (let i = 0; i < 9; i++) { const y = TOP + 30 + i * 70 + Math.sin(t * 0.9 + i) * 14; ctx.beginPath(); for (let x = PAD; x <= AW - PAD; x += 14) { const yy = y + Math.sin(x * 0.05 + t * 1.3 + i) * 9; x === PAD ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); } ctx.globalCompositeOperation = 'source-over'; }
    else if (env.amb === 'embers') { glowAt(AW / 2, AH * 0.55, AW * 1.2, '#ff5a1f', 0.07 + 0.05 * Math.sin(t * 2.2)); }
    else if (env.amb === 'rain') { glowAt(AW * 0.25 + Math.sin(t) * 20, AH * 0.4, 260, '#ff3df2', 0.07); glowAt(AW * 0.75 - Math.sin(t) * 20, AH * 0.65, 260, '#3ce6ff', 0.07); }
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



  function drawObj(w) {
    if (w.k === 'crate') return drawSlab(w, ['#c9965a', '#8a5a2b', 'crate']);
    const env = envOf(run.room), cx = w.x + w.w / 2, by = w.y + w.h, k = w.k, W = w.w, Hh = w.h;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(cx + 5, by - 1, W * 0.62, Hh * 0.28, 0, 0, 6.28); ctx.fill();
    if (k === 'barrel') {
      const c = { 'Neon Alley': '#6a2fa0', 'Lava Foundry': '#8a3a22', 'Space Station': '#4a5a8a' }[env.n] || '#8a5a2b', top = by - 34;
      const g = ctx.createLinearGradient(w.x, 0, w.x + W, 0); g.addColorStop(0, shade(c, -0.35)); g.addColorStop(0.35, shade(c, 0.25)); g.addColorStop(1, shade(c, -0.5));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w.x + 2, top + 6); ctx.quadraticCurveTo(w.x - 3, (top + by) / 2, w.x + 2, by - 5); ctx.lineTo(w.x + W - 2, by - 5); ctx.quadraticCurveTo(w.x + W + 3, (top + by) / 2, w.x + W - 2, top + 6); ctx.fill();
      ctx.fillStyle = shade(c, 0.35); ctx.beginPath(); ctx.ellipse(cx, top + 6, W / 2 - 1, 6, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#1c1c24'; ctx.lineWidth = 2.5; for (const yy of [top + 14, by - 12]) { ctx.beginPath(); ctx.ellipse(cx, yy, W / 2, 4, 0, 0.05, 3.09); ctx.stroke(); }
      if (env.n === 'Lava Foundry' || env.n === 'Space Station') { ctx.fillStyle = '#ffd34d'; ctx.fillRect(cx - 6, top + 20, 12, 6); }
    } else if (k === 'boulder') {
      const c = shade(env.wall[0], -0.1), top = by - Hh * 1.05;
      const g = ctx.createRadialGradient(cx - W * 0.2, top + Hh * 0.3, 4, cx, by - Hh * 0.4, W * 0.7); g.addColorStop(0, shade(c, 0.35)); g.addColorStop(0.6, c); g.addColorStop(1, shade(c, -0.55));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w.x, by - 4); ctx.lineTo(w.x + 3, by - Hh * 0.6); ctx.lineTo(w.x + W * 0.25, top + 4); ctx.lineTo(w.x + W * 0.6, top); ctx.lineTo(w.x + W - 2, by - Hh * 0.55); ctx.lineTo(w.x + W, by - 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(w.x + W * 0.3, top + 6); ctx.lineTo(w.x + W * 0.45, by - Hh * 0.5); ctx.lineTo(w.x + W * 0.4, by - 6); ctx.stroke();
      if (env.n === 'Jungle Temple') { ctx.fillStyle = 'rgba(70,150,70,.6)'; ctx.beginPath(); ctx.ellipse(cx - W * 0.1, top + 6, W * 0.3, 5, 0, 0, 6.28); ctx.fill(); }
    } else if (k === 'pillar' || k === 'statue' || k === 'tomb') {
      const c = env.wall[0], tall = k === 'pillar' ? 54 : k === 'statue' ? 46 : 40, top = by - tall;
      ctx.fillStyle = shade(c, -0.45); ctx.fillRect(w.x - 2, by - 10, W + 4, 10);                       // plinth
      ctx.fillStyle = shade(c, 0.05); ctx.fillRect(w.x - 3, by - 14, W + 6, 5);
      const g = ctx.createLinearGradient(w.x, 0, w.x + W, 0); g.addColorStop(0, shade(c, -0.3)); g.addColorStop(0.4, shade(c, 0.3)); g.addColorStop(1, shade(c, -0.5));
      if (k === 'tomb') { ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w.x + 2, by - 10); ctx.lineTo(w.x + 2, top + 12); ctx.arc(cx, top + 12, W / 2 - 2, Math.PI, 0); ctx.lineTo(w.x + W - 2, by - 10); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(cx - 1.5, top + 10, 3, 14); ctx.fillRect(cx - 6, top + 15, 12, 3); }
      else if (k === 'pillar') { ctx.fillStyle = g; ctx.fillRect(w.x + 4, top + 6, W - 8, tall - 16); ctx.fillStyle = shade(c, 0.2); ctx.fillRect(w.x, top, W, 7); ctx.fillStyle = 'rgba(0,0,0,.2)'; for (let xx = w.x + 9; xx < w.x + W - 6; xx += 6) ctx.fillRect(xx, top + 8, 1.5, tall - 18); }
      else { ctx.fillStyle = g; ctx.fillRect(w.x + 6, top + 20, W - 12, tall - 32); ball(cx, top + 12, 11, shade(c, 0.1), 1, 1, -0.4); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(cx - 6, top + 10, 4, 3); ctx.fillRect(cx + 2, top + 10, 4, 3); }
    } else if (k === 'coral') {
      const cols = ['#ff7aa8', '#ffb347', '#c77dff'];
      for (let i = 0; i < 5; i++) { const x = w.x + 5 + i * (W - 10) / 4, hgt = 16 + (i % 3) * 10 + (i === 2 ? 8 : 0); const gg = ctx.createLinearGradient(0, by - hgt, 0, by); gg.addColorStop(0, shade(cols[i % 3], 0.3)); gg.addColorStop(1, shade(cols[i % 3], -0.35)); ctx.strokeStyle = gg; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, by - 3); ctx.quadraticCurveTo(x + (i % 2 ? 4 : -4), by - hgt * 0.6, x + (i % 2 ? 6 : -2), by - hgt); ctx.stroke(); ctx.fillStyle = shade(cols[i % 3], 0.4); ctx.beginPath(); ctx.arc(x + (i % 2 ? 6 : -2), by - hgt, 4.5, 0, 6.28); ctx.fill(); }
    } else if (k === 'ice') {
      const top = by - 46;
      for (const [dx, hh, ww] of [[-0.2, 1, 0.5], [0.15, 0.75, 0.45], [0.4, 0.55, 0.35]]) {
        const x0 = cx + dx * W - ww * W / 2, g = ctx.createLinearGradient(x0, 0, x0 + ww * W, 0); g.addColorStop(0, '#9ad8f5'); g.addColorStop(0.5, '#eaf9ff'); g.addColorStop(1, '#6fb6dc');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, by - 4); ctx.lineTo(x0 + ww * W * 0.15, by - 46 * hh); ctx.lineTo(x0 + ww * W * 0.55, by - 52 * hh); ctx.lineTo(x0 + ww * W, by - 4); ctx.closePath(); ctx.fill();
      }
      glowAt(cx, by - 20, W * 2, '#8fe3ff', 0.25);
    } else {                                                                                          // crate: reuse the box renderer
      drawSlab(w, ['#c9965a', '#8a5a2b', 'crate']);
    }
    ctx.restore();
  }

  function drawWall(w) { if (w.k === 'crate') drawSlab(w, ['#c9965a', '#8a5a2b', 'crate']); else if (w.k) drawObj(w); else drawSlab(w, envOf(run.room).wall); }
  function drawSlab(w, mat) {
    const env = envOf(run.room), [top, front, kind] = mat, D = 14, rnd = seeded(run.room * 17 + w.i * 5);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.moveTo(w.x, w.y + w.h); ctx.lineTo(w.x + w.w, w.y + w.h); ctx.lineTo(w.x + w.w + 22, w.y + w.h + 12); ctx.lineTo(w.x + 14, w.y + w.h + 12); ctx.closePath(); ctx.fill();   // cast shadow
    const fy = w.y + w.h - D, fh = D + 2;
    const fg = ctx.createLinearGradient(0, fy, 0, fy + fh); fg.addColorStop(0, shade(front, 0.05)); fg.addColorStop(1, shade(front, -0.45));
    ctx.fillStyle = fg; ctx.fillRect(w.x, fy, w.w, fh);                                                        // front face
    ctx.fillStyle = shade(front, -0.4); ctx.fillRect(w.x + w.w, w.y - D + 6, 6, w.h + D - 4);                    // right side
    const tg = ctx.createLinearGradient(w.x, w.y - D, w.x + w.w, w.y - D + w.h); tg.addColorStop(0, shade(top, 0.25)); tg.addColorStop(1, top);
    ctx.fillStyle = tg; ctx.fillRect(w.x, w.y - D, w.w, w.h);                                                   // lit top face
    ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y - D, w.w, w.h + D + 2); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
    if (kind === 'stone') {                                           // brick courses
      for (let yy = fy + 5; yy < fy + fh; yy += 6) { ctx.beginPath(); ctx.moveTo(w.x, yy); ctx.lineTo(w.x + w.w, yy); ctx.stroke(); }
      for (let yy = fy, k = 0; yy < fy + fh; yy += 6, k++) for (let xx = w.x + (k % 2) * 8; xx < w.x + w.w; xx += 16) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 6); ctx.stroke(); }
      for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(w.x + rnd() * w.w, w.y - D + rnd() * w.h, 4 + rnd() * 8, 2); }
    } else if (kind === 'metal') {                                    // plated container with rivets
      for (let xx = w.x + 14; xx < w.x + w.w; xx += 14) { ctx.beginPath(); ctx.moveTo(xx, fy); ctx.lineTo(xx, fy + fh); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.4)'; for (let xx = w.x + 5; xx < w.x + w.w; xx += 14) { ctx.fillRect(xx, fy + 3, 2, 2); ctx.fillRect(xx, fy + fh - 5, 2, 2); }
      ctx.fillStyle = env.edge; ctx.globalAlpha = 0.5; ctx.fillRect(w.x, w.y - D, w.w, 2); ctx.globalAlpha = 1;
    } else if (kind === 'ice') {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w.x + 6, w.y - D + w.h); ctx.lineTo(w.x + w.w * 0.5, w.y - D + 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.moveTo(w.x + w.w * 0.6, w.y - D + w.h); ctx.lineTo(w.x + w.w * 0.85, w.y - D + 6); ctx.stroke();
    } else {                                                          // wooden crates
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; for (let xx = w.x; xx < w.x + w.w; xx += 22) { ctx.strokeRect(xx + 1, fy + 1, Math.min(20, w.x + w.w - xx - 2), fh - 2); ctx.beginPath(); ctx.moveTo(xx + 1, fy + 1); ctx.lineTo(xx + 21, fy + fh - 1); ctx.stroke(); }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w.x, w.y - D + 0.5); ctx.lineTo(w.x + w.w, w.y - D + 0.5); ctx.stroke();   // rim light
    if (kind === 'ice') glowAt(w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h) * 1.6, '#8fe3ff', 0.18);
    ctx.restore();
  }

  function draw(now) {
    btns = [];
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    if (state === 'menu' || state === 'shop') {
      const g = ctx.createLinearGradient(0, 0, 0, AH); g.addColorStop(0, '#1d1235'); g.addColorStop(1, '#2d1b4e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, AW, AH);
      ctx.save(); ctx.translate(0, UIY); if (state === 'menu') drawMenu(now); else drawShop(now); ctx.restore(); return;
    }
    ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, AW, AH);

    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 24, rand(-1, 1) * shake * 24);
    drawFloor(run.room);
    drawAmbient(run.room, now);
    if (state === 'clear') drawDoorOpen(now);                                                  // the exit door lights up

    for (const p of pickups) {
      shadow(p.x + 2, p.y + 7, 6, 2.5); glowAt(p.x, p.y, 26, '#ffd34d', 0.35);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.6);
      const bg = ctx.createLinearGradient(0, -5, 0, 5); bg.addColorStop(0, '#fff3a8'); bg.addColorStop(0.5, '#ffd34d'); bg.addColorStop(1, '#b8860b');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, 8, 4.2, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#5a3d10'; ctx.fillRect(7, -1.2, 2.5, 2.4); ctx.restore();
    }
    if (state === 'play' || state === 'clear') glowAt(P.x, P.y, 300, envOf(run.room).edge, 0.16);
    const list = [];                                                  // things lower on screen draw on top
    for (const w of walls) list.push({ y: w.y + w.h, f: () => drawWall(w) });
    for (const e of enemies) list.push({ y: e.y + e.r * 0.9, f: () => drawOpp(e) });
    if (state === 'play' || state === 'clear') list.push({ y: P.y + P.r * 2.4, f: () => {
      const blink = P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0;
      ctx.globalAlpha = blink ? 0.35 : 1;
      drawApe(ctx, P.x, P.y, P.r, P.ch, P.aim, 0, P.walk || 0, P.mv || 0, (P.sl || 0) > 0 ? ((P.sl / 0.14) * 1.5 - 0.75) * -1 : 0);
      ctx.globalAlpha = 1;
    } });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.f();
    for (const f of fx) {
      const a = Math.max(0, f.life / (f.max || 1));
      if (f.k === 'p') { ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); glowAt(f.x, f.y, 14, f.col, a * 0.5); }
      else if (f.k === 'm') glowAt(f.x, f.y, 44, '#ffe9a0', a);
      else if (f.k === 'f') { glowAt(f.x, f.y, 16 + (1 - a) * 26, a > 0.5 ? '#ffc94d' : '#ff4a1f', a * 0.9); }
      else if (f.k === 'r') { glowAt(f.x, f.y, f.r * 2.6 * (1.1 - a * 0.4), '#ff9a3a', a); ctx.globalAlpha = a; ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - a * 0.6), 0, 6.28); ctx.stroke(); }
      else if (f.k === 'l') { glowAt((f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2, 60, f.col, a * 0.4); ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = f.w * a + 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, f.w * a * 0.4); ctx.stroke(); }
      else if (f.k === 's') { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); glowAt(f.r * 0.6, 0, f.r * 1.6, '#cfe6ff', a * 0.5); ctx.strokeStyle = `rgba(235,245,255,${a})`; ctx.lineWidth = 7 * a + 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, f.r * (0.72 + 0.28 * (1 - a)), -f.cone / 2, f.cone / 2); ctx.stroke(); ctx.restore(); }
      else if (f.k === 'z') { ctx.globalAlpha = a; ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); const n = 5; for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(f.x1 + (f.x2 - f.x1) * u + rand(-8, 8), f.y1 + (f.y2 - f.y1) * u + rand(-8, 8)); } ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
      else if (f.k === 'c') { ctx.globalAlpha = a; txt('CRIT', f.x, f.y - (1 - a) * 18, 12, '#ffd34d'); }
      ctx.globalAlpha = 1;
    }
    for (const b of pbul) {
      if (b.k === 'cd') {                                            // spinning disc with a rainbow sheen
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.spin); glowAt(0, 0, 34, '#9be7ff', 0.5);
        ctx.fillStyle = '#e9eef8'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.28); ctx.fill();
        ['#ff6ad5', '#ffd34d', '#5ef2ff', '#9b7bff'].forEach((c, i) => { ctx.fillStyle = c; ctx.globalAlpha = 0.65; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 7.5, i * 1.57, i * 1.57 + 0.9); ctx.closePath(); ctx.fill(); });
        ctx.globalAlpha = 1; ctx.fillStyle = '#1d1235'; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 6.28); ctx.fill(); ctx.restore();
      } else if (b.k === 'bow') {
        const a = Math.atan2(b.vy, b.vx); ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a); glowAt(0, 0, 26, '#ffeab0', 0.4);
        ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-12, -1.2, 18, 2.4); ctx.fillStyle = '#dfe3ec'; ctx.beginPath(); ctx.moveTo(6, -3.5); ctx.lineTo(13, 0); ctx.lineTo(6, 3.5); ctx.fill();
        ctx.fillStyle = '#d63b3b'; ctx.fillRect(-12, -3, 4, 1.6); ctx.fillRect(-12, 1.4, 4, 1.6); ctx.restore();
      } else if (b.k === 'nade') {
        const arc = b.dist ? Math.sin(Math.min(1, b.trav / b.dist) * Math.PI) * 14 : 0, blink = b.vx === 0 && b.vy === 0 && Math.floor(b.life * 14) % 2 === 0;
        shadow(b.x, b.y + 3, 7, 2.5); ctx.save(); ctx.translate(b.x, b.y - arc); ctx.rotate(b.vx || b.vy ? b.spin * 0.6 : 0.6);
        ctx.fillStyle = blink ? '#fff' : '#d63b3b'; rr(-7, -3, 14, 6, 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-7, 0, 14, 3);
        ctx.strokeStyle = '#f0e6c8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(7, 0); ctx.quadraticCurveTo(10, -4, 12, -2); ctx.stroke(); ctx.restore(); glowAt(b.x + 5, b.y - arc - 3, 16, '#ffb347', 0.8);
      } else { glowAt(b.x, b.y, b.r * 6, b.col, 0.9); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, 6.28); ctx.fill(); }
    }
    for (const b of ebul) { glowAt(b.x, b.y, b.r * 5, '#ff4d6d', 0.8); ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, 6.28); ctx.fill(); }
    ctx.restore();

    if (state === 'play' && run.room === 1 && bannerT > 0 && !joy.on) txt('Drag anywhere with your thumb to move', AW / 2, AH - BOT - 8, 15, 'rgba(255,255,255,.75)');

    { const vg = ctx.createRadialGradient(AW / 2, AH * 0.52, Math.min(AW, AH) * 0.32, AW / 2, AH * 0.52, Math.max(AW, AH) * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,2,12,.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, AW, AH); }
    if (flash > 0) { ctx.fillStyle = `rgba(255,70,110,${flash * 0.6})`; ctx.fillRect(0, 0, AW, AH); }
    drawHud();
    if (bannerT > 0 && state === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT);
      if (bossRoom(run.room)) { txt(['KINGPIN KONG', 'LORD LEO', 'BARON BULL'][(run.room / 15 - 1) % 3], AW / 2, AH * 0.45, Math.min(44, AW * 0.12), '#e84393'); txt('BOSS  -  ' + envOf(run.room).n.toUpperCase() + '  -  ROOM ' + run.room, AW / 2, AH * 0.45 + 40, 14, '#fff'); }
      else { txt('ROOM ' + run.room, AW / 2, AH * 0.45, 40, '#fff'); txt(envOf(run.room).n.toUpperCase(), AW / 2, AH * 0.45 + 38, 16, envOf(run.room).edge); }
      ctx.globalAlpha = 1;
    }
    if (msg) txt(msg.s, AW / 2, AH * 0.5, 34, '#ffd34d');
    if (state === 'clear') {
      if (bannerT > 0) { ctx.globalAlpha = Math.min(1, bannerT); txt(bossRoom(run.room) ? 'BOSS DOWN!' : 'ROOM CLEAR', AW / 2, AH * 0.45, 36, '#7bed9f'); txt('Go through the top door', AW / 2, AH * 0.45 + 34, 16, '#fff'); ctx.globalAlpha = 1; }
      else txt('EXIT', AW / 2, TOP + 26, 12, '#7bed9f');
    }
    ctx.save(); ctx.translate(0, UIY);
    if (state === 'upgrade') drawUpgrade();
    if (state === 'over') drawOver();
    if (state === 'pause') drawPause();
    ctx.restore();
  }

  function drawHud() {
    const y = hudY;
    ctx.fillStyle = 'rgba(0,0,0,.4)'; rr(16, y - 8, AW - 32, 16, 8); ctx.fill();
    const hg = ctx.createLinearGradient(0, y - 8, 0, y + 8); const low = P.hp / P.hpMax <= 0.35;
    hg.addColorStop(0, low ? '#ff9a9a' : '#a8f5c0'); hg.addColorStop(1, low ? '#d84a4a' : '#3fbf6f');
    ctx.fillStyle = hg; rr(16, y - 8, Math.max(0, (AW - 32) * P.hp / P.hpMax), 16, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)'; rr(18, y - 6, Math.max(0, (AW - 36) * P.hp / P.hpMax), 5, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,114,.7)'; ctx.lineWidth = 1.2; rr(16, y - 8, AW - 32, 16, 8); ctx.stroke();
    txt(Math.ceil(P.hp) + ' / ' + P.hpMax, AW / 2, y + 1, 11, '#10101a');
    txt('ROOM ' + run.room, 16, y + 26, 15, '#fff', 'left');
    for (let i = 0; i < 2; i++) { ctx.fillStyle = i < P.lives ? '#ff4d6d' : 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.arc(AW / 2 - 52 + i * 22, y + 27, 8, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(AW - 116, y + 27, 7, 4, -0.6, 0, 6.28); ctx.fill();
    txt(String(save.ban), AW - 60, y + 27, 15, '#ffd34d', 'right');
    if (state === 'play' || state === 'clear') {                                                  // pause button
      const bx = AW - 50, by = y + 10;
      btns.push({ x: bx - 6, y: by - 6, w: 46, h: 46, cb: pauseGame, label: 'pause' });
      ctx.fillStyle = 'rgba(255,255,255,.14)'; rr(bx, by, 34, 34, 9); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(bx + 10, by + 9, 5, 16); ctx.fillRect(bx + 19, by + 9, 5, 16);
    }
    const boss = enemies.find(e => e.boss);
    if (boss) {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(16, y + 46, AW - 32, 12, 6); ctx.fill();
      ctx.fillStyle = '#e84393'; rr(16, y + 46, Math.max(0, (AW - 32) * boss.hp / boss.max), 12, 6); ctx.fill();
      txt(boss.name, AW / 2, y + 52, 9, '#fff');
    }
  }

  let shopTab = 0, shopChar = 0, shopPage = 0;
  const SHOP_PAGE = 7;
  function drawMenu(now) {
    const ch = CHARS[sel], w = WEAP[ch.weapon], owned = save.owned[ch.id], tsz = Math.min(54, AW * 0.15);
    const sp = ctx.createRadialGradient(AW / 2, AH * 0.42, 10, AW / 2, AH * 0.42, AH * 0.55); sp.addColorStop(0, 'rgba(232,200,114,.16)'); sp.addColorStop(1, 'rgba(232,200,114,0)'); ctx.fillStyle = sp; ctx.fillRect(0, 0, AW, AH);
    { const rn = seeded(11), tt = now / 1000; for (let i = 0; i < 46; i++) { const x = rn() * AW, y = (rn() * AH - tt * (6 + rn() * 10) + AH * 4) % AH; ctx.fillStyle = `rgba(240,214,140,${0.12 + 0.3 * Math.abs(Math.sin(tt * (0.5 + rn()) + i))})`; ctx.fillRect(x, y, 1.6, 1.6); } }
    goldTxt('BANANA', AW / 2, 62, tsz, 3); goldTxt('BREACH', AW / 2, 62 + tsz * 0.95, tsz, 3); ornament(AW / 2, 62 + tsz * 1.52, Math.min(240, AW - 80));
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(AW - 86, 28, 7, 4, -0.6, 0, 6.28); ctx.fill(); txt(String(save.ban), AW - 16, 28, 16, '#ffd34d', 'right');
    txt('BEST ROOM ' + save.best, 16, 28, 12, '#c9b27a', 'left');
    const cy = Math.max(AH * 0.36, 250);
    { const px = AW / 2, py = cy + 66;                                                      // lit pedestal
      const cone = ctx.createLinearGradient(0, cy - 120, 0, py); cone.addColorStop(0, 'rgba(255,240,200,0)'); cone.addColorStop(1, 'rgba(255,240,200,.1)');
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(px - 30, cy - 120); ctx.lineTo(px + 30, cy - 120); ctx.lineTo(px + 88, py); ctx.lineTo(px - 88, py); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(px, py + 6, 92, 20, 0, 0, 6.28); ctx.fill();
      const rg = ctx.createLinearGradient(px - 90, 0, px + 90, 0); rg.addColorStop(0, '#7a5a1e'); rg.addColorStop(0.5, '#f3dc8e'); rg.addColorStop(1, '#7a5a1e'); ctx.strokeStyle = rg; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, py, 86, 17, 0, 0, 6.28); ctx.stroke();
      ctx.fillStyle = 'rgba(232,200,114,.1)'; ctx.beginPath(); ctx.ellipse(px, py, 84, 15, 0, 0, 6.28); ctx.fill(); }
    if (owned) drawApe(ctx, AW / 2, cy - 40, 52, ch, -0.5, Math.sin(now / 500) * 3, 0, 0);
    else {
      const off = document.createElement('canvas'); off.width = Math.round(AW * S * dpr); off.height = Math.round(AH * S * dpr);
      const main = ctx; ctx = off.getContext('2d'); ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
      try {
        drawApe(ctx, AW / 2, cy - 40, 52, ch, -0.5, Math.sin(now / 500) * 3, 0, 0);
        ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(12,8,28,.62)'; ctx.fillRect(0, 0, AW, AH);
      } finally { ctx = main; }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(off, 0, 0); ctx.restore();
      txt('LOCKED', AW / 2, cy + 112, 15, '#ff9f43');
    }
    txt(ch.name.toUpperCase(), AW / 2, cy + 138, 28, '#fff');
    txt(w.name.toUpperCase(), AW / 2, cy + 160, 13, '#ffd34d');
    wrap(w.desc, AW - 48, 11).slice(0, 2).forEach((ln, i) => txt(ln, AW / 2, cy + 177 + i * 14, 11, '#c9bdf0'));
    let pl = 0; for (const u of PERM) pl += permLevel(ch.id, u.id);
    txt('HP ' + ch.hp + '    SPEED ' + ch.spd + (pl ? '    UPGRADES ' + pl : ''), AW / 2, cy + 211, 13, '#9d8fd0');
    button(10, cy - 24, 56, 48, '<', () => { sel = (sel + CHARS.length - 1) % CHARS.length; }, { col: '#4a3a7a', size: 26, label: 'prev' });
    button(AW - 66, cy - 24, 56, 48, '>', () => { sel = (sel + 1) % CHARS.length; }, { col: '#4a3a7a', size: 26, label: 'next' });
    for (let i = 0; i < CHARS.length; i++) { ctx.fillStyle = i === sel ? '#ffd34d' : (save.owned[CHARS[i].id] ? '#7a6cb0' : '#3a3552'); ctx.beginPath(); ctx.arc(AW / 2 + (i - (CHARS.length - 1) / 2) * 17, cy + 232, 4.2, 0, 6.28); ctx.fill(); }
    const by = cy + 250;
    if (owned) button(40, by, AW - 80, 56, 'PLAY', () => { save.sel = sel; persist(); startRun(); }, { label: 'play' });
    else button(40, by, AW - 80, 56, 'LOCKED - OPEN SHOP', () => { shopTab = 0; shopChar = sel; shopPage = Math.floor(sel / SHOP_PAGE); state = 'shop'; }, { col: '#ff9f43', size: 17, label: 'locked' });
    const sn = save.snap && save.owned[save.snap.ch] ? save.snap : null;
    if (sn) {
      button(40, by + 66, (AW - 90) / 2, 46, 'SHOP', () => { shopTab = 0; shopChar = sel; state = 'shop'; }, { col: '#9b86d6', size: 18, label: 'shop' });
      button(50 + (AW - 90) / 2, by + 66, (AW - 90) / 2, 46, 'CONTINUE  ' + Math.floor(sn.room), () => continueRun(), { col: '#7bed9f', size: 14, label: 'continue' });
    } else button(40, by + 66, AW - 80, 46, 'SHOP', () => { shopTab = 0; shopChar = sel; state = 'shop'; }, { col: '#9b86d6', size: 18, label: 'shop' });
  }

  function drawShop(now) {
    goldTxt('THE SHOP', AW / 2, 50, 32, 3); ornament(AW / 2, 71, 150);
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(AW - 86, 28, 7, 4, -0.6, 0, 6.28); ctx.fill(); txt(String(save.ban), AW - 16, 28, 16, '#ffd34d', 'right');
    const tw = (AW - 34) / 2;
    button(12, 80, tw, 42, 'MONKEYS', () => { shopTab = 0; }, { col: shopTab === 0 ? '#ffd34d' : '#4a3a7a', size: 15, label: 'tab-monkeys' });
    button(22 + tw, 80, tw, 42, 'UPGRADES', () => { shopTab = 1; }, { col: shopTab === 1 ? '#ffd34d' : '#4a3a7a', size: 15, label: 'tab-upgrades' });
    const row = (y, h) => panel(12, y, AW - 24, h, 12);
    if (shopTab === 0) {
      CHARS.slice(shopPage * SHOP_PAGE, shopPage * SHOP_PAGE + SHOP_PAGE).forEach((c, i) => {
        const y = 132 + i * 54, own = save.owned[c.id], can = save.ban >= c.cost;
        row(y, 50);
        drawApe(ctx, 44, y + 14, 9, c, null, 0, 0, 0);
        txt(c.name, 76, y + 17, 16, '#fff', 'left'); txt(WEAP[c.weapon].name, 76, y + 36, 12, '#b9aee6', 'left');
        if (own) { ctx.fillStyle = '#7bed9f'; txt('OWNED', AW - 28, y + 25, 14, '#7bed9f', 'right'); }
        else button(AW - 122, y + 6, 98, 38, c.cost + ' BANANAS', () => { if (save.ban >= c.cost) { save.ban -= c.cost; save.owned[c.id] = 1; persist(); tone(600, 0.3, 'triangle', 0.08, 500); } }, { off: !can, col: '#7bed9f', size: 12, label: 'buy-' + c.id });
      });
    } else {
      const c = CHARS[shopChar], own = save.owned[c.id];
      button(12, 134, 48, 44, '<', () => { shopChar = (shopChar + CHARS.length - 1) % CHARS.length; }, { col: '#4a3a7a', size: 22, label: 'shop-prev' });
      button(AW - 60, 134, 48, 44, '>', () => { shopChar = (shopChar + 1) % CHARS.length; }, { col: '#4a3a7a', size: 22, label: 'shop-next' });
      txt(c.name.toUpperCase(), AW / 2, 152, 22, '#fff'); txt(own ? 'Permanent upgrades for ' + c.name : 'Buy this monkey first', AW / 2, 172, 11, own ? '#b9aee6' : '#ff9f43');
      PERM.forEach((u, i) => {
        const y = 190 + i * 58, l = permLevel(c.id, u.id), cost = permCost(u, l), max = l >= u.max;
        row(y, 52);
        txt(u.n, 24, y + 16, 15, '#fff', 'left'); txt(u.d, 24, y + 34, 11, '#b9aee6', 'left');
        for (let k = 0; k < u.max; k++) { ctx.fillStyle = k < l ? '#ffd34d' : 'rgba(255,255,255,.18)'; ctx.fillRect(24 + k * 9, y + 43, 7, 4); }
        if (max) txt('MAX', AW - 28, y + 26, 14, '#7bed9f', 'right');
        else button(AW - 106, y + 6, 88, 40, own ? String(cost) : '-', () => { if (own && save.ban >= cost) { save.ban -= cost; (save.perm[c.id] = save.perm[c.id] || {})[u.id] = l + 1; persist(); tone(600, 0.2, 'triangle', 0.07, 400); } }, { off: !own || save.ban < cost, col: '#ffd34d', size: 15, label: 'perm-' + u.id });
      });
    }
    const pages = Math.ceil(CHARS.length / SHOP_PAGE);
    if (shopTab === 0 && pages > 1) {
      button(12, AH - UIY - BOT - 52, 56, 48, '<', () => { shopPage = (shopPage + pages - 1) % pages; }, { col: '#4a3a7a', size: 22, label: 'page-prev' });
      button(AW - 68, AH - UIY - BOT - 52, 56, 48, '>', () => { shopPage = (shopPage + 1) % pages; }, { col: '#4a3a7a', size: 22, label: 'page-next' });
      txt('Page ' + (shopPage + 1) + ' of ' + pages, AW / 2, AH - UIY - BOT - 66, 11, '#9d8fd0');
    }
    button(80, AH - UIY - BOT - 52, AW - 160, 48, 'BACK', () => { state = 'menu'; sel = shopTab === 1 ? shopChar : sel; save.sel = sel; persist(); }, { col: '#9b86d6', size: 18, label: 'back' });
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(8,4,20,.86)'; ctx.fillRect(0, -UIY, AW, AH + UIY);
    goldTxt('PAUSED', AW / 2, AH * 0.26, 42, 4); ornament(AW / 2, AH * 0.26 + 30, 180);
    txt('Room ' + run.room + '   -   ' + save.ban + ' bananas in your wallet', AW / 2, AH * 0.26 + 40, 13, '#c9bdf0');
    const y0 = AH * 0.4;
    button(40, y0, AW - 80, 56, 'RESUME', () => { state = prevState; }, { label: 'resume' });
    button(40, y0 + 68, AW - 80, 56, 'SAVE & EXIT', () => saveAndExit(), { col: '#7bed9f', label: 'saveexit' });
    button(40, y0 + 136, AW - 80, 56, 'END RUN', () => die(), { col: '#ff8a8a', label: 'endrun' });
    txt('Save & exit keeps this run so you can shop, then continue.', AW / 2, y0 + 218, 12, '#9d8fd0');
  }

  function wrap(str, maxW, size) {
    ctx.font = FONT(size); const words = str.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  function drawUpgrade() {
    ctx.fillStyle = 'rgba(10,5,24,.88)'; ctx.fillRect(0, 0, AW, AH);
    txt('ROOM ' + run.room + ' CLEARED', AW / 2, 78, 14, '#c9b27a');
    goldTxt('CHOOSE AN UPGRADE', AW / 2, 108, 26, 1); ornament(AW / 2, 130, 200);
    const gap = 10, mx = 12, cw = (AW - mx * 2 - gap * 2) / 3, ch = Math.min(270, AH - 250), y = 150;
    offer.forEach((u, i) => {
      const x = mx + i * (cw + gap), wk = u.t !== ALL, acc = wk ? P.col : '#8f7fd0';
      btns.push({ x, y: y + UIY, w: cw, h: ch, cb: () => choose(u) });
      const g = ctx.createLinearGradient(0, y, 0, y + ch); g.addColorStop(0, wk ? '#3a2870' : '#2c2354'); g.addColorStop(1, '#150d2c');
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; rr(x, y, cw, ch, 14); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      const bg = ctx.createLinearGradient(x, y, x + cw, y + ch); bg.addColorStop(0, '#fff1b8'); bg.addColorStop(0.5, '#b8892f'); bg.addColorStop(1, '#f3dc8e');
      ctx.strokeStyle = bg; ctx.lineWidth = 2; rr(x + 1, y + 1, cw - 2, ch - 2, 13); ctx.stroke();
      ctx.strokeStyle = wk ? acc : 'rgba(232,200,114,.25)'; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; rr(x + 5, y + 5, cw - 10, ch - 10, 10); ctx.stroke(); ctx.globalAlpha = 1;
      glowAt(x + cw / 2, y + 62, 100, acc, 0.45);
      const mg = ctx.createLinearGradient(0, y + 34, 0, y + 90); mg.addColorStop(0, '#fff1b8'); mg.addColorStop(0.5, '#d4a73a'); mg.addColorStop(1, '#7a5a1e');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x + cw / 2, y + 62, 29, 0, 6.28); ctx.fill();                  // gold medallion
      ctx.fillStyle = shade(wk ? '#7a5cff' : '#3a2f6a', 0); ctx.beginPath(); ctx.arc(x + cw / 2, y + 62, 24, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(x + cw / 2 - 6, y + 54, 12, 0, 6.28); ctx.fill();
      txt(u.n[0], x + cw / 2, y + 63, 22, '#f6e3a1');
      txt(wk ? P.ch.weapon.toUpperCase() : 'GENERAL', x + cw / 2, y + 108, 10, acc);
      let ty = y + 136;
      for (const ln of wrap(u.n, cw - 14, 15)) { txt(ln, x + cw / 2, ty, 15, '#fff'); ty += 19; }
      ty += 6;
      for (const ln of wrap(u.d, cw - 16, 12)) { txt(ln, x + cw / 2, ty, 12, '#cfc4f2'); ty += 16; }
      const st = run.stacks[u.id] || 0; if (st) txt('owned x' + st, x + cw / 2, y + ch - 16, 11, '#9d8fd0');
    });
    txt('Tap a card to choose', AW / 2, y + ch + 34, 14, '#9d8fd0');
  }
  function drawOver() {
    ctx.fillStyle = 'rgba(15,8,35,.82)'; ctx.fillRect(0, -UIY, AW, AH + UIY);
    goldTxt('OUT OF LIVES', AW / 2, AH * 0.2, 36, 2);
    txt('Reached room ' + run.room, AW / 2, AH * 0.2 + 52, 24, '#fff');
    txt(run.kills + ' opps beaten', AW / 2, AH * 0.2 + 84, 15, '#c9bdf0');
    txt('+' + run.ban + ' bananas banked', AW / 2, AH * 0.2 + 108, 15, '#ffd34d');
    txt(run.room >= save.best ? 'NEW BEST ROOM' : 'Best room ' + save.best, AW / 2, AH * 0.2 + 134, 14, '#9d8fd0');
    if (t0 > 0.5) {
      const y0 = AH * 0.46;
      button(40, y0, AW - 80, 54, 'TRY AGAIN', () => startRun(), { label: 'retry' });
      button(40, y0 + 64, AW - 80, 54, 'SHOP', () => { shopTab = 1; shopChar = sel; state = 'shop'; }, { col: '#9b86d6', label: 'shop' });
      button(40, y0 + 128, AW - 80, 54, 'CHANGE MONKEY', () => { state = 'menu'; }, { col: '#7bed9f', label: 'menu' });
    }
  }

  // ---------- loop ----------
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { update(dt); draw(now); }
    catch (err) {                                   // never freeze on a bad frame: drop back to the menu and keep running
      console.error(err); state = 'menu'; joy.on = false; joy.dx = joy.dy = 0; btns = [];
    }
    requestAnimationFrame(loop);
  })(last);
})();
