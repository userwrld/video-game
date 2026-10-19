// Monkeys vs Opps: clear rooms of Opps, pick one of three upgrades, beat a boss every 10 rooms. Stand still to shoot, move to dodge.
// Drag anywhere with your thumb to move. Your monkey starts at the bottom, opps drop in from the top, and it auto-fires.
(() => {
  const VERSION = 'v36';
  const cv = document.getElementById('c'); let ctx = cv.getContext('2d'); const mainCtx = ctx;
  let W, H, S, AW, AH, dpr, hudY = 44, UIY = 0, UIB = 14;
  let RW = 0, RH = 0, camX = 0, camY = 0;                   // the room can be bigger than the screen; the camera follows you
  let TOP = 96, BOT = 16;                 // arena edges: top clears the HUD and notch, bottom clears the home bar
  const PAD = 16;
  let lastInsetKey = '';
  function readInsets() {                                                           // notch / Dynamic Island and home bar, in screen pixels
    const probe = document.getElementById('probe'), cs = probe ? getComputedStyle(probe) : null;
    let top = cs ? parseFloat(cs.paddingTop) || 0 : 0, bottom = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
    if (navigator.standalone && top === 0 && innerHeight >= 700) top = 54;           // home-screen apps on notched iPhones sometimes report 0 until later
    return [Math.round(top), Math.round(bottom)];
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const stage = cv.parentElement; stage.style.height = '';                         // the stage fills the viewport exactly; never taller than what is visible
    W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;
    S = Math.min(W / 360, H / 640);
    AW = W / S; AH = H / S;
    const ins = readInsets(); lastInsetKey = ins.join('|');
    const sat = ins[0] / S, sab = ins[1] / S;
    hudY = Math.max(30, sat + 26); TOP = hudY + 48; BOT = 6; UIB = Math.max(14, sab + 8); UIY = Math.max(0, sat - 2);
    cv.width = W * dpr; cv.height = H * dpr;
    if (!RW || RW < AW) RW = AW; if (!RH || RH < AH) RH = AH;
  }
  const onResize = () => {
    resize();
    if (typeof P !== 'undefined' && P && typeof enemies !== 'undefined') { P.x = clamp(P.x, PAD + P.r, RW - PAD - P.r); P.y = clamp(P.y, TOP + P.r, RH - BOT - P.r * 3.5); }
    if (typeof enemies !== 'undefined') for (const e of enemies) { e.x = clamp(e.x, PAD, RW - PAD); e.y = clamp(e.y, TOP, RH - BOT); }
    if (typeof floorCache !== 'undefined') floorCache.key = '';
  };
  addEventListener('resize', onResize); addEventListener('orientationchange', () => setTimeout(onResize, 250)); addEventListener('load', () => setTimeout(onResize, 50));
  setInterval(() => { if (readInsets().join('|') !== lastInsetKey) onResize(); }, 600);          // pick up the real insets as soon as the phone reports them
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  resize();

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const FONT = s => `800 ${s}px -apple-system, "Segoe UI", Roboto, system-ui, sans-serif`;

  // ---------- save data ----------
  let save = { ban: 0, owned: { blaze: 1, gunner: 1 }, best: 0, sel: 0, perm: {}, snap: null, stats: { kills: 0, rooms: 0, bosses: 0, coins: 0, runs: 0, evos: 0, flawless: 0, played: {} }, ach: {}, set: { sfx: 1, music: 1, shake: 1, vib: 1 } };
  const CHAR_IDS = ['blaze', 'gunner', 'volt', 'frost', 'toxic', 'thunder', 'tank', 'shadow', 'plasma', 'chaos', 'slash', 'don', 'disco', 'robin', 'dyna'], PERM_IDS = ['lvl', 'hp', 'dmg', 'rate', 'spd', 'ban', 'crit'];
  try {
    const raw = JSON.parse(localStorage.getItem('monkey-opps') || localStorage.getItem('banana-breach') || '{}');       // only accept values of the expected shape
    const num = (v, max) => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);
    save.ban = num(raw.ban, 1e9); save.best = num(raw.best, 1e6); save.sel = num(raw.sel, 14);
    if (raw.owned && typeof raw.owned === 'object') for (const id of CHAR_IDS) if (raw.owned[id] === 1) save.owned[id] = 1;
    if (raw.stats && typeof raw.stats === 'object') { for (const k of ['kills', 'rooms', 'bosses', 'coins', 'runs', 'evos', 'flawless']) save.stats[k] = num(raw.stats[k], 1e9); if (raw.stats.played && typeof raw.stats.played === 'object') for (const id of CHAR_IDS) if (raw.stats.played[id]) save.stats.played[id] = 1; }
    if (raw.ach && typeof raw.ach === 'object') for (const k of Object.keys(raw.ach).slice(0, 40)) if (raw.ach[k] === 1 && /^[a-z0-9_]{1,24}$/.test(k)) save.ach[k] = 1;
    if (raw.set && typeof raw.set === 'object') for (const k of ['sfx', 'music', 'shake', 'vib']) if (raw.set[k] === 0) save.set[k] = 0;
    if (raw.perm && typeof raw.perm === 'object') for (const id of CHAR_IDS) { const o = raw.perm[id]; if (o && typeof o === 'object') { save.perm[id] = {}; for (const k of PERM_IDS) save.perm[id][k] = num(o[k], 10); } }
    if (raw.snap && typeof raw.snap === 'object' && CHAR_IDS.includes(raw.snap.ch) && Number.isFinite(raw.snap.room)) save.snap = raw.snap;     // checked again before use
  } catch (e) {}
  const persist = () => { try { localStorage.setItem('monkey-opps', JSON.stringify(save)); } catch (e) {} };

  // ---------- audio ----------
  let ac = null;
  function tone(f, d, type = 'square', v = 0.04, slide = 0) {
    if (!ac || !save.set.sfx) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
  }


  // ---------- music: a looping score that gets faster and heavier in boss fights ----------
  const mus = { on: false, step: 0, next: 0, timer: null, bus: null };
  function mnote(f, d, type, v, t, slide = 0) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(mus.bus); o.start(t); o.stop(t + d + 0.02);
  }
  function musicMood() { if (state === 'play' || state === 'clear' || state === 'pause') return enemies.some(e => e.boss && !e.clone) ? 'boss' : 'play'; return state === 'upgrade' ? 'calm' : 'menu'; }
  function playStep(i, mood, t) {
    const sc = [0, 3, 5, 7, 10, 12, 10, 7], root = mood === 'boss' ? 49 : 55, n = k => root * Math.pow(2, k / 12), q = i % 16;
    if (mood === 'menu' || mood === 'calm') {
      if (q % 4 === 0) mnote(n(sc[(q / 4 + (i >> 4)) % 8] - 12), 0.9, 'triangle', 0.05, t);
      if (q % 2 === 0) mnote(n(sc[(q / 2 + (i >> 4) * 2) % 8] + 12), 0.35, 'sine', 0.022, t);
      return;
    }
    if (q % 4 === 0) mnote(130, 0.18, 'sine', 0.16, t, -95);                                  // kick
    if (q % 4 === 2) mnote(7000, 0.03, 'square', 0.012, t);                                    // hat
    if (mood === 'boss' && q % 8 === 4) mnote(200, 0.16, 'sawtooth', 0.05, t, -120);           // snare-ish
    const pat = mood === 'boss' ? [0, 0, 3, 0, 5, 0, 3, 0, 0, 0, 7, 0, 5, 3, 0, 10] : [0, -1, 0, -1, 3, -1, 0, -1, 5, -1, 3, -1, 7, -1, 5, -1];
    const k = pat[q]; if (k >= 0) mnote(n(k - 12), mood === 'boss' ? 0.12 : 0.16, 'sawtooth', mood === 'boss' ? 0.055 : 0.04, t);
    if (q % 8 === 0) { for (const iv of [0, 3, 7]) mnote(n(iv + (i >> 4) % 2 * 5), 0.5, 'triangle', 0.02, t); }
    if (mood === 'boss' && q % 2 === 1) mnote(n(sc[(q >> 1) % 8] + 12), 0.1, 'square', 0.018, t);
  }
  function musicTick() {
    if (!ac || !mus.on) return;
    const mood = musicMood(), bpm = mood === 'boss' ? 150 : mood === 'play' ? 122 : 88, dur = 60 / bpm / 2;
    if (mus.next < ac.currentTime - 0.5) mus.next = ac.currentTime + 0.05;
    while (mus.next < ac.currentTime + 0.3) { playStep(mus.step, mood, mus.next); mus.step++; mus.next += dur; }
  }
  function musicSync() {
    if (!ac) return;
    if (!mus.bus) { mus.bus = ac.createGain(); mus.bus.gain.value = 0.9; mus.bus.connect(ac.destination); }
    if (save.set.music && !document.hidden && !mus.on) { mus.on = true; mus.next = ac.currentTime + 0.1; mus.step = 0; mus.timer = setInterval(musicTick, 40); }
    else if ((!save.set.music || document.hidden) && mus.on) { mus.on = false; clearInterval(mus.timer); }
  }

  // ---------- weapons and characters ----------
  const WEAP = {
    gun:     { name: 'Blaster',      desc: 'Fast single shots. Great with multishot.', dmg: 10, rate: 3.2, count: 1, spread: 0.2, speed: 520, life: 0.9, pierce: 0, reach: 420, col: '#ffe066' },
    laser:   { name: 'Laser Eyes',   desc: 'Piercing beams that cut through lines of opps.', dmg: 15, rate: 1.5, count: 1, spread: 0.3, len: 320, width: 6, reach: 320, col: '#ff3df2' },
    flame:   { name: 'Flamethrower', desc: 'Short range cone that sets opps on fire.', dmg: 3.4, rate: 10, range: 105, cone: 0.8, burn: 4, reach: 105, col: '#ff8a2a' },
    shotgun: { name: 'Scattergun',   desc: 'Pellet spray. Brutal up close.', dmg: 6, rate: 1.1, count: 5, spread: 0.6, speed: 480, life: 0.38, pierce: 0, reach: 190, col: '#ffd0a0' },
    rocket:  { name: 'Rocket Pod',   desc: 'Slow rockets with splash damage.', dmg: 24, rate: 0.85, count: 1, spread: 0.12, speed: 300, life: 1.5, boom: 52, reach: 420, col: '#ff5a5a' },
    fire:    { name: 'Fireball',     desc: 'Burning fireballs that explode on impact.', dmg: 14, rate: 1.8, count: 1, spread: 0.2, speed: 380, life: 1, pierce: 0, boom: 26, burn: 6, reach: 400, col: '#ff8a2a', elem: 'fire' },
    ice:     { name: 'Frost Shards',  desc: 'Ice shards that chill, and can freeze opps solid.', dmg: 9, rate: 2.4, count: 1, spread: 0.2, speed: 470, life: 0.9, pierce: 1, reach: 420, col: '#8fe3ff', elem: 'ice' },
    poison:  { name: 'Toxic Shot',    desc: 'Corrosive rounds that poison opps over time.', dmg: 8, rate: 2.2, count: 1, spread: 0.2, speed: 420, life: 0.9, pierce: 0, reach: 410, col: '#8bff5a', elem: 'poison', pois: 5 },
    plasma:  { name: 'Plasma Burst',  desc: 'Three plasma orbs that detonate on contact.', dmg: 7, rate: 1.5, count: 3, spread: 0.5, speed: 440, life: 0.9, pierce: 0, boom: 24, reach: 400, col: '#ff6bf0', elem: 'plasma' },
    shadow:  { name: 'Shadow Daggers', desc: 'Fast daggers that pierce. Crits hit very hard.', dmg: 12, rate: 2.6, count: 1, spread: 0.15, speed: 640, life: 0.8, pierce: 2, reach: 430, col: '#9b7bff', elem: 'shadow' },
    cannon:  { name: 'Heavy Cannon',  desc: 'Slow, huge shells with massive splash damage.', dmg: 38, rate: 0.7, count: 1, spread: 0.1, speed: 300, life: 1.4, pierce: 0, boom: 58, reach: 420, col: '#ffb060', elem: 'none' },
    chaos:   { name: 'Chaos Orbs',    desc: 'Every shot is a different element. Anything can happen.', dmg: 10, rate: 2, count: 1, spread: 0.2, speed: 430, life: 1, pierce: 0, boom: 14, reach: 410, col: '#ffffff', elem: 'chaos' },
    cd:      { name: 'CD Slinger',   desc: 'Spinning CDs that bounce off walls and slice through opps.', dmg: 11, rate: 2.3, count: 1, spread: 0.22, speed: 400, life: 1.9, pierce: 3, rico: 2, reach: 400, col: '#cfe9ff' },
    bow:     { name: 'Hunter Bow',   desc: 'Fast arrows that punch through whole lines of opps.', dmg: 19, rate: 1.5, count: 1, spread: 0.2, speed: 700, life: 0.85, pierce: 2, reach: 450, col: '#e6d49a' },
    nade:    { name: 'Dynamite',     desc: 'Lobbed sticks that blow up after a short fuse.', dmg: 30, rate: 0.8, count: 1, spread: 0.16, speed: 270, life: 1, boom: 60, reach: 390, col: '#ff6b4a' },
    blade:   { name: 'Combat Knife', desc: 'Close-range slashes hit everything in front of you.', dmg: 16, rate: 3, range: 66, cone: 1.7, burn: 0, knives: 0, reach: 66, col: '#d7dbe6' },
    tommy:   { name: 'Tommy Gun',    desc: 'Rapid-fire spray. Messy but relentless.', dmg: 5.5, rate: 9, count: 1, spread: 0.14, speed: 560, life: 0.8, pierce: 0, reach: 380, col: '#ffd37a' },
    zap:     { name: 'Volt Staff',   desc: 'Lightning that jumps between opps.', dmg: 11, rate: 2, chain: 2, range: 190, chainRange: 110, reach: 190, col: '#7df9ff' },
  };
  const CHARS = [
    { ring: 1, tee: 'flame', mouth: 'flat', bg: '#f7b21a', cloth: '#1c1614', id: 'blaze',   name: 'Blaze Monkey',   short: 'Blaze',   role: 'Fire',          weapon: 'fire',   cost: 0,     fur: '#c4501c', skin: '#e8a574', acc: 'fireHair',   hp: 105, spd: 156, ability: 'nova',   passive: 'Burns hit 50% harder', weak: 'Low health', blurb: 'Bold and fearless. Sets the whole room on fire.' },
    { cigar: 1, tee: 'camo', mouth: 'flat', bg: '#f08a1a', cloth: '#4a5a32', id: 'gunner',  name: 'Gunner Monkey',  short: 'Gunner',  role: 'Guns',          weapon: 'gun',    cost: 0,     fur: '#6b4a30', skin: '#d9b48a', acc: 'beret',    hp: 115, spd: 154, ability: 'frenzy', passive: 'Bullets ricochet once', weak: 'No special element', blurb: 'Tactical and battle-ready. Reliable, balanced, deadly.' },
    { tee: 'cyber', mouth: 'flat', bg: '#e02a2e', cloth: '#15151c', id: 'volt',    name: 'Volt Monkey',    short: 'Volt',    role: 'Lasers',        weapon: 'laser',  cost: 1500,  fur: '#4a3626', skin: '#d9b48a', acc: 'cyberRed',  hp: 95,  spd: 158, ability: 'strike', passive: '+10% crit chance', weak: 'Short range', blurb: 'Cool and sharp. Precision beams cut through whole lines.' },
    { tee: 'furcoat', mouth: 'flat', bg: '#18c8ee', cloth: '#2a4a7a', id: 'frost',   name: 'Frost Monkey',   short: 'Frost',   role: 'Ice',           weapon: 'ice',    cost: 2500,  fur: '#e8f1f8', skin: '#dcc0a0', acc: 'iceHair', hp: 115, spd: 150, ability: 'freeze', passive: 'Doubled freeze chance', weak: 'Low raw damage', blurb: 'Calm and calculated. Slows and freezes anything that moves.' },
    { tee: 'toxic', mouth: 'flat', bg: '#58e01c', cloth: '#1a2218', id: 'toxic',   name: 'Toxic Monkey',   short: 'Toxic',   role: 'Poison',        weapon: 'poison', cost: 4000,  fur: '#26262c', skin: '#c9a27a', acc: 'toxicMask', hp: 105, spd: 152, ability: 'nova',  passive: 'Poison spreads when opps die', weak: 'Slow to kill', blurb: 'Unpredictable and experimental. Damage that keeps on giving.' },
    { tee: 'voltJ', mouth: 'flat', bg: '#1e5ff0', cloth: '#0f1626', id: 'thunder', name: 'Thunder Monkey', short: 'Thunder', role: 'Electricity',   weapon: 'zap',    cost: 6000,  fur: '#1e2a44', skin: '#c9a27a', acc: 'voltHead', hp: 100, spd: 160, ability: 'strike', passive: 'Lightning chains 1 extra', weak: 'Short reach', blurb: 'Energetic and flashy. Lightning jumps through the crowd.' },
    { tee: 'armor', mouth: 'flat', bg: '#d8a82a', cloth: '#4d6a2a', id: 'tank',    name: 'Tank Monkey',    short: 'Tank',    role: 'Heavy weapons', weapon: 'cannon', cost: 8500,  fur: '#7a5a3a', skin: '#d9b48a', acc: 'campHelmet', hp: 175, spd: 138, ability: 'shield', passive: '20% less damage taken', weak: 'Slow and slow-firing', blurb: 'Confident and unstoppable. Walks through fire, shells everything.' },
    { ring: 1, tee: 'ninja', mouth: 'flat', bg: '#7a2ad8', cloth: '#17162a', id: 'shadow',  name: 'Shadow Monkey',  short: 'Shadow',  role: 'Stealth',       weapon: 'shadow', cost: 12000, fur: '#2a2622', skin: '#c9a27a', acc: 'ninjaHood',   hp: 90,  spd: 178, ability: 'blink',  passive: '30% crit, crits hit 3x', weak: 'Fragile', blurb: 'Mysterious and slick. Fast, elusive, and absolutely lethal.' },
    { tee: 'neon', mouth: 'flat', bg: '#c02ef0', cloth: '#1a1530', id: 'plasma',  name: 'Plasma Monkey',  short: 'Plasma',  role: 'Plasma',        weapon: 'plasma', cost: 16000, fur: '#8a909c', skin: '#d9b48a', acc: 'cyberPurple',  hp: 105, spd: 152, ability: 'nova',   passive: 'Plasma blasts are 25% wider', weak: 'Tight spread up close', blurb: 'Futuristic and elite. Bursts of energy that control the floor.' },
    { ring: 1, tee: 'punk', mouth: 'grin', bg: '#ee1a66', cloth: '#1a1418', id: 'chaos',   name: 'Chaos Monkey',   short: 'Chaos',   role: 'Mixed elements', weapon: 'chaos', cost: 25000, fur: '#8a3a22', skin: '#d9a070', acc: 'punkHair', hp: 110, spd: 156, ability: 'chaos',  passive: 'Every shot rolls a new element', weak: 'Unpredictable', blurb: 'Flashy and legendary. Fire, ice, poison, lightning, plasma. All at once.' },
    { tee: 'skull', mouth: 'smirk', bg: '#7fe0c8', cloth: '#7a2a2a', id: 'slash',   name: 'Slash Monkey',   short: 'Slash',   role: 'Blades',        weapon: 'blade',  cost: 3500,  fur: '#5a4636', skin: '#c9a27a', acc: 'scar',   hp: 130, spd: 172, ability: 'blink',  passive: 'Fast and tough in close combat', weak: 'Has to get close', blurb: 'A scarred street fighter with a combat knife.' },
    { tee: 'collar', mouth: 'flat', ring: 1, bg: '#e8c99a', cloth: '#2a2a33', id: 'don',     name: 'Don Monkey',     short: 'Don',     role: 'Tommy gun',     weapon: 'tommy',  cost: 5000,  fur: '#7a5a3a', skin: '#d9b48a', acc: 'fedora', hp: 110, spd: 150, ability: 'frenzy', passive: 'Always has a cigar', weak: 'Messy aim', cigar: 1, blurb: 'Old-school boss. A cigar, a fedora and a Tommy gun.' },
    { tee: 'stripes', held: 'gum', mouth: 'grin', ring: 1, bg: '#f7a8e8', cloth: '#ff4fd8', id: 'disco',   name: 'Disco Monkey',   short: 'Disco',   role: 'CDs',           weapon: 'cd',     cost: 4500,  fur: '#9b5de5', skin: '#f0c8ff', acc: 'phones', hp: 105, spd: 158, ability: 'nova',   passive: 'Discs bounce twice', weak: 'Slow discs', blurb: 'Spins records. Throws CDs that slice through crowds.' },
    { tee: 'plain', held: 'pick', mouth: 'smirk', bg: '#9ed3a0', cloth: '#3d6a30', id: 'robin',   name: 'Robin Monkey',   short: 'Robin',   role: 'Archery',       weapon: 'bow',    cost: 5500,  fur: '#4f7a3a', skin: '#d9c9a0', acc: 'hood',   hp: 100, spd: 162, ability: 'strike', passive: 'Arrows pierce twice', weak: 'Slow fire rate', blurb: 'A hooded hunter. Fast arrows punch through whole lines.' },
    { tee: 'vest', mouth: 'grin', bg: '#f6c36a', cloth: '#e0a020', id: 'dyna',    name: 'Dyna Monkey',    short: 'Dyna',    role: 'Explosives',    weapon: 'nade',   cost: 7000,  fur: '#c4602d', skin: '#f0c8a0', acc: 'hardhat', hp: 115, spd: 148, ability: 'nova',  passive: 'Big blasts', weak: 'Fuse delay', blurb: 'Lobs lit dynamite. Everything nearby goes boom.' },
  ];

  // ---------- upgrades ----------
  const ALL = ['all'];
  const PROJ = ['gun', 'shotgun', 'rocket', 'tommy', 'cd', 'bow', 'nade', 'fire', 'ice', 'poison', 'plasma', 'shadow', 'cannon', 'chaos'];
  const BUL = ['gun', 'shotgun', 'tommy', 'cd', 'bow', 'fire', 'ice', 'poison', 'plasma', 'shadow', 'chaos'];
  const HEAVY = ['rocket', 'cannon', 'nade'];
  const FIRE = ['fire', 'chaos'], ICE = ['ice', 'chaos'], POIS = ['poison', 'chaos'], ELEC = ['zap', 'chaos'];
  const RARITY = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'], RCOL = ['#b9bdd0', '#5fd16a', '#4da3ff', '#b46bff', '#ffb02e'];
  const U = (id, n, d, t, max, r, f) => ({ id, n, d, t, max, r, f });
  const UPG = [
    // universal (shown less often so builds stay focused)
    U('hp', 'Thick Fur', '+25 max HP and heal 25', ALL, 8, 0, p => { p.hpMax += 25; p.hp = Math.min(p.hpMax, p.hp + 25); }),
    U('spd', 'Fast Feet', '+10% move speed', ALL, 5, 0, p => { p.speed *= 1.1; }),
    U('dmg', 'Power Rounds', '+15% damage', ALL, 12, 0, p => { p.dmg *= 1.15; }),
    U('rate', 'Quick Trigger', '+15% attack speed', ALL, 8, 0, p => { p.rate *= 1.15; }),
    U('crit', 'Critical Eye', '+10% crit chance', ALL, 6, 0, p => { p.crit += 0.1; }),
    U('critdmg', 'Critical Damage', 'Crits do +50% more', ALL, 4, 1, p => { p.critMul += 0.5; }),
    U('mag', 'Coin Magnet', 'Bigger pickup range, +15% Ape Coins', ALL, 4, 0, p => { p.magnet += 45; p.bmult *= 1.15; }),
    U('heal', 'Field Medkit', 'Heal 40% of your HP now', ALL, 99, 0, p => { p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.4); }),
    U('dr', 'Damage Resistance', 'Take 8% less damage', ALL, 5, 1, p => { p.dr += 0.08; }),
    U('vamp', 'Lifesteal', 'Heal 1 HP for every kill', ALL, 5, 1, p => { p.vamp += 1; }),
    U('tail', 'Quick Recovery', 'Stay safe longer after a hit', ALL, 3, 0, p => { p.invT += 0.2; }),
    U('shield', 'Energy Shield', 'Absorbs one hit each room', ALL, 3, 1, p => { p.shieldMax += 1; p.shieldHits += 1; }),
    U('dodge', 'Dodge Chance', '+8% chance to dodge a hit', ALL, 5, 1, p => { p.dodge += 0.08; }),
    U('cdr', 'Cooldown Reduction', 'Ability recharges 15% faster', ALL, 4, 1, p => { p.cdr *= 0.85; }),
    U('armor', 'Armor Breaker', '+25% damage to big and armored opps', ALL, 3, 1, p => { p.armor += 0.25; }),
    U('psize', 'Projectile Size Up', 'Shots are 25% bigger', PROJ, 3, 0, p => { p.psize *= 1.25; }),
    // projectile weapons
    U('multi', 'Multishot', '+1 projectile per attack', PROJ, 5, 1, p => { p.count += 1; p.spread += 0.12; }),
    U('side', 'Side Shot', '+2 projectiles fired sideways', BUL, 2, 1, p => { p.side += 1; }),
    U('rear', 'Rear Shot', '+1 projectile fired behind you', BUL, 2, 1, p => { p.rear += 1; }),
    U('pierce', 'Piercing Rounds', 'Shots pass through 1 more opp', BUL, 4, 1, p => { p.pierce += 1; }),
    U('rico', 'Ricochet', 'Shots bounce off walls once more', BUL, 3, 2, p => { p.rico += 1; p.life += 0.3; }),
    U('home', 'Homing Rounds', 'Shots curve toward opps', BUL, 3, 2, p => { p.homing += 1; }),
    U('expl', 'Explosive Rounds', 'Shots pop with a small blast', ['gun', 'shotgun', 'tommy', 'cd', 'bow', 'shadow'], 3, 2, p => { p.explo += 26; }),
    U('choke', 'Slug Choke', 'Tighter spread, +10% damage', ['shotgun'], 3, 0, p => { p.spread *= 0.8; p.dmg *= 1.1; }),
    U('drum', 'Drum Mag', '+20% attack speed, +10% damage', ['tommy'], 4, 1, p => { p.rate *= 1.2; p.dmg *= 1.1; }),
    U('boom', 'Bigger Boom', 'Blast radius +20', ['rocket', 'nade', 'cannon', 'fire', 'plasma', 'chaos'], 4, 1, p => { p.boom += 20; }),
    U('clust', 'Cluster Bombs', 'Explosions scatter mini blasts', HEAVY, 2, 2, p => { p.cluster += 1; }),
    U('fuse', 'Short Fuse', 'Dynamite blows up sooner, +15% damage', ['nade'], 3, 1, p => { p.dmg *= 1.15; p.fuseT = (p.fuseT || 0.5) - 0.08; }),
    U('heavy', 'Heavy Rounds', '+25% damage, slightly slower', ['cannon', 'rocket'], 3, 1, p => { p.dmg *= 1.25; p.rate *= 0.95; }),
    U('plating', 'Reactive Plating', '+30 max HP and 10% less damage taken', ['cannon'], 2, 1, p => { p.hpMax += 30; p.hp += 30; p.dr += 0.1; }),
    // lasers
    U('twin', 'Double Beam', '+1 beam per shot', ['laser'], 4, 1, p => { p.count += 1; p.spread += 0.12; }),
    U('wide', 'Wide Beam', 'Beams are thicker', ['laser'], 4, 0, p => { p.width += 4; }),
    U('long', 'Long Beam', 'Beams reach farther', ['laser'], 3, 0, p => { p.len += 80; p.reach += 80; }),
    U('sear', 'Searing Beam', 'Beams set opps on fire', ['laser'], 3, 1, p => { p.burn += 3; }),
    U('lover', 'Overcharged Beam', '+35% beam damage', ['laser'], 3, 2, p => { p.dmg *= 1.35; }),
    U('lboom', 'Laser Explosion', 'Beams detonate where they end', ['laser'], 2, 2, p => { p.lboom += 1; }),
    // blades
    U('lblade', 'Long Blade', 'Slashes reach 16 farther', ['blade'], 4, 0, p => { p.range += 16; p.reach += 16; }),
    U('wslash', 'Wide Slash', 'Slash arc is much wider', ['blade'], 3, 1, p => { p.cone += 0.55; }),
    U('serr', 'Serrated Edge', 'Cuts keep hurting for 4 a second', ['blade'], 5, 1, p => { p.burn += 4; }),
    U('knives', 'Throwing Knives', '+1 knife thrown with each slash', ['blade'], 5, 2, p => { p.knives += 1; }),
    U('nap', 'Napalm', 'Burning opps ignite their neighbors', ['laser', 'blade'], 1, 3, p => { p.spreadFire = 1; }),
    // fire
    U('burnup', 'Burn Damage Up', 'Burning does +4 per second', FIRE, 5, 0, p => { p.burn += 4; }),
    U('fspread', 'Fire Spread', 'Burning opps ignite their neighbors', FIRE, 1, 2, p => { p.spreadFire = 1; }),
    U('fboom', 'Explosive Fireball', 'Fireballs explode 18 wider', FIRE, 3, 1, p => { p.boom += 18; }),
    U('groundfire', 'Burning Ground', 'Impacts leave fire on the floor', FIRE, 1, 2, p => { p.groundFire = 1; }),
    U('trail', 'Flame Trail', 'You leave fire behind as you move', FIRE, 1, 3, p => { p.trail = 1; }),
    U('meteor', 'Meteor Strike', 'Meteors fall on opps every 4s', FIRE, 3, 3, p => { p.meteor += 1; }),
    U('inferno', 'Inferno Burst', 'Burning opps explode when they die', FIRE, 1, 3, p => { p.infernoBurst = 1; }),
    // ice
    U('freeze', 'Freeze Chance', '+12% chance to freeze solid', ICE, 5, 1, p => { p.freeze += 0.12; }),
    U('fdur', 'Freeze Duration Up', 'Chill and freeze last longer', ICE, 3, 0, p => { p.freezeDur += 0.6; }),
    U('frostboom', 'Frost Explosion', 'Shards burst on impact', ICE, 3, 2, p => { p.boom += 30; }),
    U('spikes', 'Ice Spike Burst', 'Shards splinter into 3 spikes', ICE, 1, 2, p => { p.spikes = 1; }),
    U('blizzard', 'Blizzard', 'A freezing storm surrounds you', ICE, 1, 3, p => { p.blizzard = 1; }),
    U('groundice', 'Frozen Ground', 'Impacts leave slowing ice', ICE, 1, 2, p => { p.groundIce = 1; }),
    U('shatter', 'Shatter Damage', '+35% damage to chilled opps', ICE, 3, 1, p => { p.shatter += 0.35; }),
    // electricity
    U('chain', 'Chain Link', 'Lightning jumps to 2 more opps', ['zap'], 5, 1, p => { p.chain += 2; }),
    U('over', 'Overload', '+25% lightning damage', ['zap'], 4, 1, p => { p.dmg *= 1.25; }),
    U('rod', 'Storm Rod', 'Lightning reaches 40 farther', ['zap'], 3, 0, p => { p.range += 40; p.reach += 40; p.chainRange += 20; }),
    U('static', 'Static Shock', 'Zapped opps are stunned briefly', ['zap'], 2, 1, p => { p.stun += 0.35; }),
    U('aura', 'Electric Aura', 'Shocks everything close to you', ELEC, 3, 2, p => { p.aura += 1; }),
    U('strike', 'Thunder Strike', 'Lightning falls on a random opp', ELEC, 3, 3, p => { p.strikeRate += 1; }),
    U('shockch', 'Shock Chance', 'Hits may arc to nearby opps', BUL, 3, 1, p => { p.shockChance += 0.15; }),
    U('storm', 'Storm Burst', 'Opps arc lightning when they die', ELEC, 1, 3, p => { p.stormBurst = 1; }),
    // poison
    U('cloud', 'Toxic Cloud', 'Impacts leave a poison cloud', POIS, 1, 2, p => { p.cloud = 1; }),
    U('corrosion', 'Corrosion Damage', 'Poison does +4 per second', POIS, 5, 0, p => { p.pois += 4; }),
    U('pspread', 'Poison Spread', 'Poison spreads when opps die', POIS, 1, 2, p => { p.pSpread = 1; }),
    U('venom', 'Venom Burst', 'Poisoned opps burst when they die', POIS, 1, 3, p => { p.venom = 1; }),
    U('lingering', 'Lingering Toxins', 'Poison lasts 2 seconds longer', POIS, 3, 0, p => { p.poisDur += 2; }),
    U('acid', 'Acid Pool', 'Dead opps leave pools of acid', POIS, 1, 2, p => { p.acidPool = 1; }),
    U('infect', 'Infectious Strike', 'Poison jumps to a nearby opp', POIS, 1, 2, p => { p.infect = 1; }),
    // plasma, shadow
    U('split', 'Plasma Split', 'Shots split into 2 on impact', ['plasma', 'chaos', 'ice', 'poison', 'fire'], 2, 2, p => { p.split += 1; }),
    U('core', 'Overcharged Core', '+20% damage and 10 wider blasts', ['plasma'], 3, 1, p => { p.dmg *= 1.2; p.boom += 10; }),
    U('shadowstep', 'Shadow Step', '+12% crit chance', ['shadow'], 4, 1, p => { p.crit += 0.12; }),
    U('exec', 'Executioner', 'Crits do +80% more', ['shadow'], 3, 3, p => { p.critMul += 0.8; }),
    U('phantom', 'Phantom Daggers', 'Daggers pass through 2 more opps', ['shadow'], 3, 2, p => { p.pierce += 2; }),
  ];
  // evolutions: collect the pieces and a legendary combination appears
  const EVO = [
    { id: 'e_bullet', n: 'Bullet Apocalypse', w: ['gun', 'tommy', 'cd', 'bow', 'shotgun', 'shadow'], need: ['multi', 'rico', 'expl'], d: '+3 projectiles, ricochets and blasts everywhere', f: p => { p.count += 3; p.spread += 0.35; p.explo += 20; p.rico += 2; p.dmg *= 1.25; p.rate *= 1.15; } },
    { id: 'e_ray', n: 'Death Ray', w: ['laser'], need: ['twin', 'wide', 'long'], d: '+2 huge beams that melt everything', f: p => { p.count += 2; p.spread += 0.2; p.width += 8; p.len += 160; p.reach += 160; p.dmg *= 1.5; } },
    { id: 'e_inferno', n: 'Inferno King', w: ['fire', 'chaos'], need: ['fspread', 'groundfire', 'fboom'], d: 'Massive fire blasts, burning ground and +2 fireballs', f: p => { p.burn += 10; p.boom += 25; p.count += 2; p.groundFire = 1; p.spreadFire = 1; } },
    { id: 'e_zero', n: 'Absolute Zero', w: ['ice', 'chaos'], need: ['freeze', 'shatter', 'blizzard'], d: 'Freezing storm, +25% freeze, shatter hits +60%', f: p => { p.freeze += 0.25; p.shatter += 0.6; p.blizzard = 1; p.count += 2; } },
    { id: 'e_thunder', n: 'Thunder God', w: ['zap', 'chaos'], need: ['chain', 'aura', 'strike'], d: 'Lightning everywhere, +4 chains and +40% damage', f: p => { p.chain += 4; p.aura += 2; p.strikeRate += 2; p.dmg *= 1.4; } },
    { id: 'e_plague', n: 'Plague Lord', w: ['poison', 'chaos'], need: ['cloud', 'corrosion', 'pspread'], d: 'Deadly poison that spreads and burns through crowds', f: p => { p.pois += 10; p.cloud = 1; p.pSpread = 1; p.poisDur += 3; p.count += 1; } },
    { id: 'e_plasma', n: 'Plasma Storm', w: ['plasma'], need: ['split', 'multi', 'boom'], d: '+2 orbs, bigger blasts and splitting shots', f: p => { p.count += 2; p.split += 1; p.boom += 25; p.dmg *= 1.2; } },
    { id: 'e_reaper', n: 'Shadow Reaper', w: ['shadow'], need: ['exec', 'phantom', 'shadowstep'], d: '+25% crit, crits do +100%, daggers pierce everything', f: p => { p.crit += 0.25; p.critMul += 1; p.pierce += 3; p.count += 1; } },
    { id: 'e_titan', n: 'Titan Barrage', w: ['cannon', 'rocket', 'nade'], need: ['boom', 'clust', 'multi'], d: 'Colossal blasts, cluster bombs and +1 shell', f: p => { p.boom += 35; p.cluster += 1; p.count += 1; p.dmg *= 1.3; } },
  ];

  const ELEMCOL = { fire: '#ff8a2a', ice: '#8fe3ff', poison: '#8bff5a', shock: '#7df9ff', plasma: '#ff6bf0', shadow: '#9b7bff' };
  const CHAOS_EL = ['fire', 'ice', 'poison', 'shock', 'plasma'];
  const PROJK = new Set(['gun', 'shotgun', 'rocket', 'tommy', 'cd', 'bow', 'nade', 'fire', 'ice', 'poison', 'plasma', 'shadow', 'cannon', 'chaos']);
  const BK = { gun: 'gun', tommy: 'gun', shotgun: 'shotgun', rocket: 'rocket', cannon: 'rocket', cd: 'cd', bow: 'bow', nade: 'nade', fire: 'orb', ice: 'orb', poison: 'orb', plasma: 'orb', shadow: 'orb', chaos: 'orb' };
  const MOVEATK = { blade: 0.7, tommy: 0.5, zap: 0.45, laser: 0.35 };          // how much of your fire rate survives while you are moving
  const ABIL = {
    nova:   { n: 'Nova',          d: 'Blast everything around you', cd: 14 },
    freeze: { n: 'Deep Freeze',   d: 'Freeze every opp for 2.5s',    cd: 18 },
    shield: { n: 'Bulwark',       d: 'Invulnerable for 3 seconds',   cd: 16 },
    frenzy: { n: 'Frenzy',        d: 'Double fire rate for 4s',      cd: 16 },
    blink:  { n: 'Phase Dash',    d: 'Dash away, brief invulnerability', cd: 7 },
    strike: { n: 'Thunderstorm',  d: 'Lightning hits every opp',     cd: 15 },
    chaos:  { n: 'Chaos Surge',   d: 'A random element erupts',      cd: 14 },
  };
  // ---------- permanent upgrades, bought in the shop for one monkey at a time ----------
  const PERM = [
    { id: 'lvl',  n: 'Level',        d: '+8% damage and +12 HP each level', max: 10, base: 400, f: (p, l) => { p.dmg *= 1 + 0.08 * l; p.hpMax += 12 * l; } },
    { id: 'hp',   n: 'Tough Hide',   d: '+10 max HP each level',        max: 10, base: 600, f: (p, l) => { p.hpMax += 10 * l; } },
    { id: 'dmg',  n: 'Sharp Claws',  d: '+6% damage each level',        max: 10, base: 800, f: (p, l) => { p.dmg *= 1 + 0.06 * l; } },
    { id: 'rate', n: 'Quick Hands',  d: '+4% fire rate each level',     max: 10, base: 800, f: (p, l) => { p.rate *= 1 + 0.04 * l; } },
    { id: 'spd',  n: 'Nimble Paws',  d: '+3% move speed each level',    max: 6,  base: 500, f: (p, l) => { p.speed *= 1 + 0.03 * l; } },
    { id: 'ban',  n: 'Coin Sense',   d: '+6% Ape Coins each level',       max: 10, base: 700, f: (p, l) => { p.bmult *= 1 + 0.06 * l; } },
    { id: 'crit', n: 'Lucky Streak', d: '+2% crit chance each level',   max: 8,  base: 900, f: (p, l) => { p.crit += 0.02 * l; } },
  ];
  const permLevel = (cid, k) => (save.perm[cid] && save.perm[cid][k]) || 0;
  const permCost = (u, l) => Math.round(u.base * (1 + l * 0.9 + l * l * 0.15));

  const BOSSES = [                                                       // ten bosses, each its own character; "ai" picks the attack pattern it fights with
    { id: 'bandit',  ai: 'enforcer', name: 'SKULL BANDIT',  sub: 'Skull-masked thug. Slams, charges and calls backup.',  look: 'b_bandit',  r: 50, hp: 1.1,  sp: 32, dmg: 1 },
    { id: 'ninja',   ai: 'shadow',   name: 'RED NINJA',     sub: 'Teleports, strikes fast, and leaves illusions.',       look: 'b_ninja',   r: 46, hp: 0.95, sp: 60, dmg: 1.1 },
    { id: 'ammo',    ai: 'war',      name: 'AMMO BRUTE',    sub: 'Missile barrages, laser sweeps and explosive traps.',  look: 'b_ammo',    r: 56, hp: 1.2,  sp: 26, dmg: 1.1 },
    { id: 'ghillie', ai: 'war',      name: 'GHILLIE SNIPER', sub: 'Hidden in the leaves. Lasers and traps everywhere.',  look: 'b_ghillie', r: 50, hp: 1.0,  sp: 30, dmg: 1.15 },
    { id: 'riot',    ai: 'enforcer', name: 'RIOT TANK',     sub: 'Shielded and heavy. Slams and charges.',               look: 'b_riot',    r: 58, hp: 1.4,  sp: 28, dmg: 1.1 },
    { id: 'blast',   ai: 'war',      name: 'BLAST ENGINEER', sub: 'Explosives, mines and missiles.',                     look: 'b_blast',   r: 52, hp: 1.2,  sp: 30, dmg: 1.2 },
    { id: 'toxic',   ai: 'shadow',   name: 'TOXIC STALKER', sub: 'Gas-masked and fast. Teleports and strikes.',          look: 'b_toxic',   r: 48, hp: 1.1,  sp: 58, dmg: 1.2 },
    { id: 'volt',    ai: 'overlord', name: 'VOLT CYBORG',   sub: 'Every weapon, every trick.',                           look: 'b_volt',    r: 56, hp: 1.35, sp: 36, dmg: 1.25 },
    { id: 'chain',   ai: 'titan',    name: 'CHAINBREAKER',  sub: 'Arena-wide shockwaves and a rage form.',               look: 'b_chain',   r: 72, hp: 1.5,  sp: 24, dmg: 1.3 },
    { id: 'king',    ai: 'overlord', name: 'THE KONG KING', sub: 'Every weapon, every trick. The final crown.',          look: 'b_king',    r: 62, hp: 1.6,  sp: 36, dmg: 1.3 },
  ];
  const bossCfg = room => BOSSES[((room / 10 - 1) % BOSSES.length + BOSSES.length) % BOSSES.length];
  // ---------- opps ----------
  const TYPES = {
    runt:    { r: 10, hp: 14,  sp: 82,  dmg: 6,  val: 1, col: '#ff6b6b' },
    brute:   { r: 17, hp: 48,  sp: 56,  dmg: 11, val: 3, col: '#ff9f43' },
    tank:    { r: 27, hp: 150, sp: 36,  dmg: 18, val: 8, col: '#a55eea' },
    shooter: { r: 12, hp: 22,  sp: 48,  dmg: 6,  val: 3, col: '#4bcffa' },
    dasher:  { r: 11, hp: 18,  sp: 60,  dmg: 9,  val: 2, col: '#7bed9f' },
    swarm:   { r: 8,  hp: 8,   sp: 112, dmg: 4,  val: 0.6, col: '#ff8a8a' },
    shield:  { r: 17, hp: 62,  sp: 50,  dmg: 10, val: 4, col: '#9aa7c0' },
    bomber:  { r: 12, hp: 22,  sp: 92,  dmg: 10, val: 3, col: '#ff5a3a' },
    sniper:  { r: 11, hp: 20,  sp: 40,  dmg: 10, val: 5, col: '#7a8cff' },
    giant:   { r: 40, hp: 430, sp: 30,  dmg: 22, val: 22, col: '#8a6a4a' },
    clone:   { r: 24, hp: 30,  sp: 125, dmg: 8,  val: 0,  col: '#6a4a9a' },
  };

  // ---------- state ----------
  let state = 'title', sel = Math.min(save.sel, CHARS.length - 1);
  let run, P, enemies = [], pbul = [], ebul = [], pickups = [], fx = [], queue, spawnT, clearT, bannerT, shake, flash, msg;
  let offer = [], t0 = 0, roomT = 0, clearBonus = 0;
  let btns = [];
  const joy = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };
  const pen = {};
  const keys = {};

  function buildPlayer() {
    const ch = CHARS[sel], w = WEAP[ch.weapon];
    P = Object.assign({}, w, {
      ch, x: RW / 2, y: RH - BOT - 180, r: 14, hp: ch.hp, hpMax: ch.hp, speed: ch.spd, inv: 1, cd: 0.4, aim: -Math.PI / 2, tick: 0,
      crit: 0.05, magnet: 60, bmult: 1, dr: 0, vamp: 0, invT: 0.7, rico: w.rico || 0, homing: 0, explo: 0, cluster: 0, burn: w.burn || 0,
      spreadFire: 0, stun: 0, boom: w.boom || 0, lives: 2,
      critMul: 2, freeze: 0.05, freezeDur: 0, pois: w.pois || 0, poisDur: 0, pSpread: 0, shatter: 0, psize: 1, side: 0, rear: 0, dodge: 0, shieldHits: 0, cdr: 1,
      abCd: 0, frenzyT: 0, shockChance: 0, groundFire: 0, groundIce: 0, cloud: 0, acidPool: 0, venom: 0, infernoBurst: 0, trail: 0, meteor: 0, blizzard: 0, aura: 0,
      fuseT: 0.5, strikeRate: 0, stormBurst: 0, split: 0, spikes: 0, lboom: 0, armor: 0, infect: 0, auraT: 0, strikeT: 2, meteorT: 3, trailT: 0, shieldMax: 0,
    });
    { const id = ch.id;                                                                  // each monkey's passive trait
      if (id === 'blaze') P.burn *= 1.5;
      else if (id === 'gunner') P.rico = 1;
      else if (id === 'volt') P.crit += 0.1;
      else if (id === 'frost') P.freeze = 0.2;
      else if (id === 'toxic') P.pSpread = 1;
      else if (id === 'thunder') P.chain += 1;
      else if (id === 'tank') P.dr += 0.2;
      else if (id === 'shadow') { P.crit = 0.3; P.critMul = 3; }
      else if (id === 'plasma') P.boom *= 1.25;
      else if (id === 'disco') P.rico = 2;
      else if (id === 'robin') P.pierce += 1;
      else if (id === 'dyna') P.boom *= 1.2; }
    for (const u of PERM) { const l = permLevel(ch.id, u.id); if (l) u.f(P, l); }       // shop upgrades for this monkey
    P.hp = P.hpMax;
  }
  function startRun() {
    buildPlayer(); save.stats.runs++; save.stats.played[P.ch.id] = 1;
    run = { room: 1, ban: 0, kills: 0, stacks: {} };
    for (const k in pen) delete pen[k];
    save.snap = null;
    startRoom();
    state = 'play';
  }
  const SNAPKEYS = ['critMul', 'freeze', 'freezeDur', 'pois', 'poisDur', 'pSpread', 'shatter', 'psize', 'side', 'rear', 'dodge', 'shieldHits', 'shieldMax', 'cdr', 'shockChance', 'groundFire', 'groundIce', 'cloud', 'acidPool', 'venom', 'infernoBurst', 'trail', 'meteor', 'blizzard', 'aura', 'strikeRate', 'stormBurst', 'split', 'spikes', 'lboom', 'armor', 'infect', 'fuseT', 'knives', 'hp', 'hpMax', 'speed', 'dmg', 'rate', 'count', 'spread', 'pierce', 'life', 'len', 'width', 'range', 'cone', 'burn', 'chain', 'chainRange', 'reach', 'boom', 'crit', 'magnet', 'bmult', 'dr', 'vamp', 'invT', 'rico', 'homing', 'explo', 'cluster', 'spreadFire', 'stun', 'lives'];
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
    for (const u of UPG.concat(EVO.map(e => ({ id: e.id, max: 1 })))) { const n = f(rs.stacks && rs.stacks[u.id]); if (n) stacks[u.id] = Math.min(u.max, Math.max(0, Math.floor(n))); }
    run = { room: clamp(Math.floor(sn.room), 1, 9999), ban: Math.max(0, f(rs.ban) || 0), kills: Math.max(0, f(rs.kills) || 0), stacks };
    for (const k in pen) delete pen[k];
    for (const u of UPG) { const n = sn.pen && f(sn.pen[u.id]); if (n) pen[u.id] = clamp(n, 0.01, 1); }
    startRoom(); state = 'play';
  }
  function bossRoom(n) { return n % 10 === 0; }
  // ---------- the room: bigger than the screen, so the camera follows you and you explore ----------
  const roomWide = () => RW > AW + 40 || RH > AH + 40;
  function worldInit(room) {
    if (bossRoom(room)) { RW = AW; RH = AH; }                                      // boss arenas fit on one screen
    else {
      const r = seeded(room * 37 + 11), f = Math.min(1, 0.55 + room * 0.045);
      RW = AW * (1 + (0.1 + r() * 0.3) * f); RH = AH * (1 + (0.4 + r() * 0.5) * f);
      const k = S * Math.min(dpr, 2); while (RW * RH * k * k > 8.5e6) { RW *= 0.94; RH *= 0.94; }
      RW = Math.max(AW, Math.round(RW)); RH = Math.max(AH, Math.round(RH));
    }
    floorCache.key = ''; decal.clear = true;
  }
  const camMaxX = () => Math.max(0, RW - AW), camMaxY = () => Math.max(0, RH - AH);
  function snapCamera() { camX = clamp(P.x - AW / 2, 0, camMaxX()); camY = clamp(P.y - AH * 0.62, 0, camMaxY()); }
  function updateCamera(dt) {
    const tx = clamp(P.x - AW / 2 + (P.vx || 0) * 0.28, 0, camMaxX()), ty = clamp(P.y - AH * 0.6 + (P.vy || 0) * 0.22, 0, camMaxY()), k = 1 - Math.exp(-dt * 7);
    camX += (tx - camX) * k; camY += (ty - camY) * k;
  }
  function placeQueue() {                                                              // enemies wait in packs across the room until you get close
    const items = queue.splice(0, queue.length);
    let i = 0;
    while (i < items.length) {
      const size = Math.min(items.length - i, 2 + Math.floor(Math.random() * 4));
      let cx = 0, cy = 0, ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) {
        cx = rand(PAD + 50, RW - PAD - 50); cy = rand(TOP + 70, RH - BOT - (tries < 30 ? 330 : 120));
        ok = !inWall(cx, cy, 44) && Math.hypot(cx - RW / 2, cy - (RH - BOT - 180)) > (tries < 30 ? 320 : 200) && !(Math.abs(cx - RW / 2) < 90 && cy < TOP + 130);
      }
      for (let k = 0; k < size; k++) {
        const kind = items[i + k];
        if (kind === 'swarm') { for (let q = 0; q < 3; q++) { spawn('swarm', cx + rand(-30, 30), cy + rand(-30, 30)); enemies[enemies.length - 1].spawn = 0; } }
        else { spawn(kind, cx + rand(-44, 44), cy + rand(-44, 44)); enemies[enemies.length - 1].spawn = 0; }
      }
      i += size;
    }
  }

  function startRoom() {
    enemies = []; pbul = []; ebul = []; pickups = []; fx = []; zones = []; mines = []; roomTotal = 0; decal.clear = true; clearT = 0; spawnT = 0.8; bannerT = 1.4; shake = 0; flash = 0;
    const room = run.room; worldInit(room);
    P.x = RW / 2; P.y = RH - BOT - 180; P.inv = Math.max(P.inv, 1); P.vx = P.vy = 0; snapCamera();
    P.hurtRoom = false; genWalls(room); genHazards(room); roomT = 0; P.shieldHits = P.shieldMax;
    takeSnap();
    queue = [];
    if (bossRoom(room)) queue.push('boss');
    else {
      const n = Math.min(6 + Math.floor(room * 1.4), 44);
      const pool = [['runt', Math.max(1.5, 5 - room * 0.12)]];
      if (room >= 2) pool.push(['brute', 3 + room * 0.1]);
      if (room >= 2) pool.push(['shooter', 2.6 + room * 0.15]);
      if (room >= 3) { pool.push(['swarm', 1.6 + room * 0.1]); }
      if (room >= 5) pool.push(['dasher', 2 + room * 0.1]);
      if (room >= 6) pool.push(['shield', 1.6 + room * 0.1]);
      if (room >= 7) pool.push(['bomber', 1.4 + room * 0.06]);
      if (room >= 8) { pool.push(['sniper', 1.2 + room * 0.05]); pool.push(['tank', 1 + room * 0.12]); }
      const tot = pool.reduce((a, b) => a + b[1], 0);
      for (let i = 0; i < n; i++) {
        let r = Math.random() * tot, k = pool[0][0];
        for (const [name, wt] of pool) { r -= wt; if (r <= 0) { k = name; break; } }
        queue.push(k);
      }
      if (room >= 10 && Math.random() < Math.min(0.75, 0.2 + (room - 10) * 0.05)) queue.splice(Math.floor(Math.random() * queue.length), 0, 'giant');
      placeQueue();
    }
  }
  function spawn(kind, x, y) {
    const room = run.room, hs = 1 + 0.17 * (room - 1), ds = 1 + 0.05 * (room - 1);
    let e;
    if (kind === 'boss') {
      const bn = room / 10;
      const hp = 900 * (1 + 0.8 * (bn - 1)) * (1 + 0.07 * (room - 1));                  // beatable with a decent build, but still a real fight
      e = { kind, boss: 1, bn, r: 52, hp, max: hp, sp: 30, dmg: 20 + bn * 6, bdmg: 9 + bn * 3.5, val: 40 * bn, col: '#e84393', pt: 2, sum: 6 };
    } else {
      const T = TYPES[kind];
      e = { kind, r: T.r, hp: T.hp * hs, max: T.hp * hs, sp: T.sp, dmg: T.dmg * ds, bdmg: 6 * ds, val: T.val, col: T.col, cd: rand(1, 2), st: 0, stt: 0 };
    }
    const LK = { runt: ['monkey', 'rat', 'bat'], brute: ['gorilla', 'boar'], tank: ['rhino', 'hippo'], shooter: ['parrot', 'mandrill'], dasher: ['jaguar', 'wolf'], swarm: ['rat', 'monkey', 'bat'], shield: ['gorilla', 'boar', 'rhino'], bomber: ['monkey', 'rat', 'mandrill'], sniper: ['parrot', 'mandrill', 'wolf'], giant: ['gorilla', 'rhino', 'hippo'], clone: ['kingShadow'] };
    if (kind !== 'boss') {
      let gun = null;
      if (kind === 'shooter') gun = room >= 8 && Math.random() < 0.4 ? 'smg' : (Math.random() < 0.5 ? 'rifle' : 'pistol');
      else if (kind === 'runt' && room >= 2 && Math.random() < Math.min(0.7, 0.35 + room * 0.02)) gun = 'pistol';
      else if (kind === 'brute' && room >= 3 && Math.random() < Math.min(0.85, 0.45 + room * 0.02)) gun = Math.random() < 0.5 ? 'smg' : 'shotgun';
      else if (kind === 'tank') gun = 'cannon';
      e.gun = gun; e.out = Math.floor(rand(0, 5)); e.burst = 0; e.bt = 0;
      if (kind === 'shield') { e.shield = true; e.gun = null; }
      if (kind === 'bomber') e.bomber = true;
      if (kind === 'sniper') { e.sn = 0; e.cd = rand(1.4, 2.4); e.snA = 0; e.stt = 0; e.gun = null; }
      if (kind === 'clone') { e.clone = true; e.gun = null; e.melee = null; }
      if (kind === 'giant') { e.giant = true; e.gun = null; e.mode = 'idle'; e.mt = rand(1.5, 2.5); e.hp = e.max = e.hp * (1 + 0.1 * (room - 10)); }
      if (room >= 11 && kind !== 'giant' && Math.random() < Math.min(0.4, (room - 9) * 0.04)) {     // elites, each with a special trick
        e.elite = 1; e.r *= 1.3; e.hp = e.max = e.hp * 2.4; e.dmg *= 1.3; e.bdmg *= 1.3; e.val *= 3;
        e.mod = ['regen', 'ring', 'swift'][Math.floor(Math.random() * 3)]; e.modT = rand(2, 4);
        if (e.mod === 'swift') e.sp *= 1.35;
      }
      e.melee = e.gun ? null : (kind === 'dasher' ? 'blades' : kind === 'brute' || kind === 'giant' ? 'bat' : kind === 'shield' ? 'club' : kind === 'runt' || kind === 'swarm' ? (Math.random() < 0.5 ? 'knife' : 'club') : null);
    }
    e.look = kind === 'boss' ? bossCfg(room).look : LK[kind][Math.floor(Math.random() * LK[kind].length)];
    { const pool = ['serum', 'eye3', 'skull', 'robot', 'spikes', 'tumor', 'skull', 'spikes', 'robot', 'tumor'], n = e.boss ? 1 : e.giant || e.elite ? 3 : Math.random() < 0.55 ? 2 : 1; e.mut = [];
      if (!e.clone) for (let i = 0; i < n; i++) { const m = e.boss ? 'serum' : pool[Math.floor(Math.random() * pool.length)]; if (!e.mut.includes(m)) e.mut.push(m); } }
    e.v = Math.floor(Math.random() * 3); e.ph = rand(0, 6.28); e.chillT = 0; e.pois = 0; e.poisT = 0; e.faceA = Math.PI / 2;
    if (e.boss) {                                                  // each boss has its own build
      const B = bossCfg(room);
      e.id = B.ai; e.name = B.name; e.sub = B.sub; e.r = B.r; e.hp = e.max = e.max * B.hp; e.sp = B.sp; e.dmg *= B.dmg; e.bdmg *= B.dmg;
      e.mode = 'idle'; e.mt = 1.2; e.pat = 0; e.dx = 0; e.dy = 1; e.sa = 0; e.et = 0; e.phase = 1; e.intro = 1.9; e.sched = [];
    }
    e.x = x; e.y = y; if (!e.boss && walls.length) pushOut(e, e.r + 4);
    e.spawn = 0.3; e.flash = 0; e.burn = 0; e.burnT = 0; e.stun = 0; e.vx = 0; e.vy = 0;
    enemies.push(e);
  }


  // ---------- walls: some rooms have cover that blocks movement and every shot ----------
  let walls = [], rayW = null;
  function genWalls(room) {
    walls = [];
    const rnd = seeded(room * 131 + 17), boss = bossRoom(room), gap = boss ? 80 : 48;
    if (room < 2 && !boss) return;
    if (!boss && rnd() < 0.3) return;                                  // some rooms stay wide open
    const n = boss ? 2 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * Math.min(5, 2 + room / 6));
    const xa = PAD + 34, xb = RW - PAD - 34, ya = TOP + 24, yb = RH - BOT - 24;
    const OBJ = envOf(room).objs;
    const SIZE = { barrel: [26, 26], crate: [36, 36], boulder: [48, 40], pillar: [30, 30], statue: [32, 32], tomb: [30, 36], coral: [42, 36], ice: [40, 40] };
    for (let tries = 0; walls.length < n && tries < 120; tries++) {
      if (rnd() < 0.5) {                                                // a single object instead of a slab
        const k = OBJ[Math.floor(rnd() * OBJ.length)], [ow, oh] = SIZE[k];
        const ox = xa + rnd() * Math.max(1, xb - xa - ow), oy = ya + rnd() * Math.max(1, yb - ya - oh);
        if (oy < TOP + 110 && ox < RW / 2 + 90 && ox + ow > RW / 2 - 90) continue;
        if (oy + oh > RH - BOT - 240 && ox < RW / 2 + 80 && ox + ow > RW / 2 - 80) continue;
        if (walls.some(o => ox < o.x + o.w + gap && ox + ow > o.x - gap && oy < o.y + o.h + gap && oy + oh > o.y - gap)) continue;
        walls.push({ x: ox, y: oy, w: ow, h: oh, i: walls.length, k, hp: k === 'barrel' ? 20 : k === 'crate' ? 36 : 0, max: k === 'barrel' ? 20 : k === 'crate' ? 36 : 0 });
        continue;
      }
      const kind = rnd(), w = kind < 0.45 ? 56 + rnd() * 70 : kind < 0.75 ? 22 + rnd() * 16 : 34 + rnd() * 12;
      const h = kind < 0.45 ? 20 + rnd() * 10 : kind < 0.75 ? 56 + rnd() * 60 : w;
      const x = xa + rnd() * Math.max(1, xb - xa - w), y = ya + rnd() * Math.max(1, yb - ya - h);
      if (y < TOP + 110 && x < RW / 2 + 90 && x + w > RW / 2 - 90) continue;                        // keep the exit door clear
      if (y + h > RH - BOT - 240 && x < RW / 2 + 80 && x + w > RW / 2 - 80) continue;               // and the spot you walk in on
      if (walls.some(o => x < o.x + o.w + gap && x + w > o.x - gap && y < o.y + o.h + gap && y + h > o.y - gap)) continue;
      walls.push({ x, y, w, h, i: walls.length });
    }
    buildNav();
    for (let g = 0; g < 14 && walls.length && !pathExists(); g++) { walls.pop(); buildNav(); }          // always leave a route from the start to the exit
    updateNav();
  }
  function pathExists() {
    const { cols, rows, blocked } = nav, seen = new Uint8Array(cols * rows);
    const cell = (x, y) => clamp(Math.floor(y / CELL), 0, rows - 1) * cols + clamp(Math.floor(x / CELL), 0, cols - 1);
    const start = cell(RW / 2, RH - BOT - 180), goal = cell(RW / 2, TOP + 26), q = [start]; seen[start] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h]; if (c === goal) return true;
      const ci = c % cols, cj = (c / cols) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue; const n = nj * cols + ni; if (seen[n] || blocked[n]) continue; seen[n] = 1; q.push(n); }
    }
    return false;
  }
  function pushOut(o, rad, tall) {
    for (const w of walls) {
      const up = tall ? (w.k && w.k !== 'crate' ? 30 : 14) : 0, wy = w.y - up, wh = w.h + up;    // the player also bumps the drawn top of an object, so you can't walk into it from behind
      const cx = clamp(o.x, w.x, w.x + w.w), cy = clamp(o.y, wy, wy + wh), dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
      if (d < rad) {
        if (d > 0.0001) { o.x = cx + dx / d * rad; o.y = cy + dy / d * rad; }
        else { const l = o.x - w.x, r = w.x + w.w - o.x, t = o.y - wy, b = wy + wh - o.y, m = Math.min(l, r, t, b); if (m === l) o.x = w.x - rad; else if (m === r) o.x = w.x + w.w + rad; else if (m === t) o.y = wy - rad; else o.y = wy + wh + rad; }
      }
    }
  }
  function moveBy(o, dx, dy, rad) { const t = o === P; o.x += dx; pushOut(o, rad, t); o.y += dy; pushOut(o, rad, t); }
  function inWall(x, y, pad = 0) { for (const w of walls) if (x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad) return w; return null; }
  function rayT(x1, y1, x2, y2) {                                    // 0..1 along the segment where it first meets a wall, or 1
    let best = 1; rayW = null; const dx = x2 - x1, dy = y2 - y1;
    for (const w of walls) {
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, q, lo, hi] of [[dx, x1, w.x, w.x + w.w], [dy, y1, w.y, w.y + w.h]]) {
        if (Math.abs(p) < 1e-9) { if (q < lo || q > hi) { ok = false; break; } }
        else { let a = (lo - q) / p, b = (hi - q) / p; if (a > b) { const tmp = a; a = b; b = tmp; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { ok = false; break; } }
      }
      if (ok && t0 < best) { best = t0; rayW = w; }
    }
    return best;
  }
  const clearShot = (x1, y1, x2, y2) => !walls.length || rayT(x1, y1, x2, y2) >= 1;

  // ---------- path finding: opps walk around cover to reach you ----------
  const CELL = 16;
  let nav = { cols: 0, rows: 0, blocked: null, dist: null }, navT = 0;
  function buildNav() {
    const cols = Math.ceil(RW / CELL), rows = Math.ceil(RH / CELL), blocked = new Uint8Array(cols * rows);
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


  // ---------- hazards: telegraphed traps that hurt you ----------
  let hazards = [];
  function genHazards(room) {
    hazards = [];
    const env = envOf(room), boss = bossRoom(room);
    if (room < 6 && !boss) return;
    const n = boss ? 2 : Math.min(1 + Math.floor((room - 5) / 4), 4), rnd = seeded(room * 53 + 9);
    const xa = PAD + 40, xb = RW - PAD - 40, ya = TOP + 60, yb = RH - BOT - 150;
    for (let tries = 0; hazards.length < n && tries < 100; tries++) {
      const k = env.hz[Math.floor(rnd() * env.hz.length)];
      const h = { k, t: rnd() * 3, x: xa + rnd() * (xb - xa), y: ya + rnd() * (yb - ya), r: k === 'toxic' ? 36 : 26, w: 46, h: 46, hit: false, st: 0 };
      if (k === 'laser') { h.x = PAD; h.w = RW - PAD * 2; if (Math.abs(h.y - (RH - BOT - 180)) < 120) continue; }
      if (Math.abs(h.x - RW / 2) < 80 && h.y < TOP + 140) continue;                              // keep the door lane clear
      if (walls.some(w => h.x > w.x - 34 && h.x < w.x + w.w + 34 && h.y > w.y - 34 && h.y < w.y + w.h + 34) && k !== 'laser') continue;
      if (hazards.some(o => o.k !== 'laser' && k !== 'laser' && Math.hypot(o.x - h.x, o.y - h.y) < 90) || hazards.some(o => o.k === 'laser' && k === 'laser' && Math.abs(o.y - h.y) < 90)) continue;
      hazards.push(h);
    }
  }
  function updateHazards(dt) {
    const dmg = 10 + run.room * 0.5;
    for (const h of hazards) {
      h.t += dt;
      if (h.k === 'vent') { const tt = h.t % 3.4; h.st = tt < 2.2 ? 0 : tt < 3.0 ? 1 : 2; if (h.st === 0) h.hit = false; if (h.st === 2 && !h.hit && Math.hypot(P.x - h.x, P.y + P.r - h.y) < h.r + P.r) { h.hit = true; hurtPlayer(dmg + 4); } }
      else if (h.k === 'spikes') { const tt = h.t % 3.0; h.st = tt < 1.5 ? 0 : tt < 2.1 ? 1 : tt < 2.6 ? 2 : 0; if (tt < 1.5) h.hit = false; if (h.st === 2 && !h.hit && Math.abs(P.x - h.x) < h.w / 2 + 6 && Math.abs(P.y + P.r - h.y) < h.h / 2 + 8) { h.hit = true; hurtPlayer(dmg + 2); } }
      else if (h.k === 'laser') { const tt = h.t % 4.6; h.st = tt < 2.4 ? 0 : tt < 3.2 ? 1 : 2; if (h.st === 2 && Math.abs(P.y + P.r * 1.2 - h.y) < 11) hurtPlayer(dmg + 4); }
      else if (h.k === 'toxic') { h.st = 0; if (Math.hypot(P.x - h.x, P.y + P.r * 1.4 - h.y) < h.r + 6) { P.slowT = 0.15; h.hurtT = (h.hurtT || 0) - dt; if (h.hurtT <= 0) { h.hurtT = 0.7; hurtPlayer(4 + run.room * 0.25); } } }
    }
    P.slowT = Math.max(0, (P.slowT || 0) - dt);
  }
  function drawHazard(h, now) {
    ctx.save();
    if (h.k === 'vent') {
      const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r); g.addColorStop(0, '#0b0808'); g.addColorStop(1, '#2a2222'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.6, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#4a4040'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(h.x - h.r * 0.8, h.y + i * 4); ctx.lineTo(h.x + h.r * 0.8, h.y + i * 4); ctx.stroke(); }
      if (h.st === 1) { const p = 0.5 + 0.5 * Math.sin(now / 60); rglow(h.x, h.y, h.r * 3, '#ff7a2a', 0.35 + 0.4 * p); ctx.strokeStyle = `rgba(255,120,40,${0.4 + 0.5 * p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * 1.05, h.r * 0.65, 0, 0, 6.28); ctx.stroke(); }
      if (h.st === 2) { rglow(h.x, h.y - 20, h.r * 5, '#ff7a2a', 0.8); const fg = ctx.createLinearGradient(0, h.y - 70, 0, h.y); fg.addColorStop(0, 'rgba(255,230,120,0)'); fg.addColorStop(0.5, 'rgba(255,150,40,.85)'); fg.addColorStop(1, 'rgba(255,90,20,.95)'); ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(h.x - h.r * 0.8, h.y); ctx.quadraticCurveTo(h.x - h.r * 0.4, h.y - 50, h.x, h.y - 78 - Math.sin(now / 40) * 6); ctx.quadraticCurveTo(h.x + h.r * 0.4, h.y - 50, h.x + h.r * 0.8, h.y); ctx.closePath(); ctx.fill(); }
    } else if (h.k === 'spikes') {
      ctx.fillStyle = '#2c2c34'; rr(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h, 4); ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const px = h.x - 14 + i * 14, py = h.y - 14 + j * 14, hh = h.st === 2 ? 15 : h.st === 1 ? 4 : 0;
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.28); ctx.fill();
        if (hh) { ctx.fillStyle = '#d7dbe6'; ctx.beginPath(); ctx.moveTo(px - 4, py + 2); ctx.lineTo(px, py + 2 - hh); ctx.lineTo(px + 4, py + 2); ctx.fill(); }
      }
      if (h.st === 1) { ctx.strokeStyle = `rgba(255,70,70,${0.4 + 0.5 * Math.sin(now / 50)})`; ctx.lineWidth = 2; rr(h.x - h.w / 2 - 2, h.y - h.h / 2 - 2, h.w + 4, h.h + 4, 5); ctx.stroke(); }
    } else if (h.k === 'laser') {
      for (const ex of [h.x - 4, h.x + h.w + 4 - 12]) { ctx.fillStyle = '#2a2a36'; rr(ex, h.y - 13, 16, 26, 4); ctx.fill(); ctx.strokeStyle = '#6a6a80'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = h.st === 2 ? '#ff4a5a' : h.st === 1 ? '#ffb02e' : '#444'; ctx.beginPath(); ctx.arc(ex + 8, h.y, 4, 0, 6.28); ctx.fill(); }
      if (h.st === 1) { ctx.strokeStyle = `rgba(255,80,90,${0.25 + 0.4 * Math.abs(Math.sin(now / 70))})`; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(h.x + 12, h.y); ctx.lineTo(h.x + h.w - 12, h.y); ctx.stroke(); ctx.setLineDash([]); }
      if (h.st === 2) { rglow(RW / 2, h.y, RW * 1.1, '#ff3a4a', 0.28); ctx.strokeStyle = 'rgba(255,60,80,.9)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(h.x + 12, h.y); ctx.lineTo(h.x + h.w - 12, h.y); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    } else if (h.k === 'toxic') {
      const g = ctx.createRadialGradient(h.x, h.y, 4, h.x, h.y, h.r); g.addColorStop(0, 'rgba(150,255,80,.85)'); g.addColorStop(0.8, 'rgba(70,170,40,.8)'); g.addColorStop(1, 'rgba(40,110,20,.5)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.62, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(30,70,10,.8)'; ctx.lineWidth = 2; ctx.stroke(); rglow(h.x, h.y, h.r * 2.6, '#8bff5a', 0.25);
      for (let i = 0; i < 5; i++) { const u = (now / 900 + i * 0.2) % 1; ctx.strokeStyle = `rgba(220,255,180,${0.7 * (1 - u)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(h.x + Math.sin(i * 2.1) * h.r * 0.5, h.y + Math.cos(i * 1.7) * h.r * 0.25 - u * 8, 2 + u * 3, 0, 6.28); ctx.stroke(); }
    }
    ctx.restore();
  }
  // barrels and crates can be shot apart; barrels explode
  function damageWall(w, d) {
    if (!w.max || w.dead) return;
    w.hp -= d; w.flash = 0.1;
    if (w.hp > 0) return;
    w.dead = true; walls = walls.filter(o => o !== w); buildNav(); updateNav();
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    burst(cx, cy, w.k === 'barrel' ? '#ffb347' : '#c9965a', 14, 180); tone(w.k === 'barrel' ? 90 : 200, 0.25, 'sawtooth', 0.07, -80);
    for (let i = 0; i < 3; i++) pickups.push({ x: cx + rand(-6, 6), y: cy + rand(-6, 6), v: Math.max(1, Math.round(5 * P.bmult)), vx: rand(-50, 50), vy: rand(-50, 50) });
    if (w.k === 'barrel') { blast(cx, cy, 68, 40 + run.room * 3, { nocrit: true }); if (Math.hypot(P.x - cx, P.y - cy) < 68 + P.r) hurtPlayer(12 + run.room * 0.4); shake = Math.max(shake, 0.25); }
  }

  // ---------- helpers ----------
  function burst(x, y, col, n = 10, sp = 140) {
    for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(sp * 0.3, sp); fx.push({ k: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), max: 0.6, col }); }
  }
  function hitEnemy(e, d, o = {}) {
    if (e.spawn > 0 || e.intro > 0 || e.hp <= 0 || e.dead) return;
    if (e.shield && o.dir !== undefined && !o.pierceShield) {                         // shield opps block shots from the front
      let da = o.dir - e.faceA; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 2.2) { fx.push({ k: 'c', x: e.x, y: e.y - e.r, life: 0.35, txt: 'BLOCKED' }); d *= 0.12; }
    }
    if (!o.nocrit && Math.random() < P.crit) { d *= P.critMul; fx.push({ k: 'c', x: e.x, y: e.y - e.r, life: 0.4 }); }
    if (P.shatter && (e.chillT > 0 || e.stun > 0)) d *= 1 + P.shatter;
    if (P.armor && (e.r >= 20 || e.elite || e.shield)) d *= 1 + P.armor;
    e.hp -= d; e.flash = 0.08;
    if (o.burn) { e.burn = Math.max(e.burn, o.burn); e.burnT = 2; }
    if (o.stun) e.stun = Math.max(e.stun, o.stun);
    if (o.chill) { e.chillT = Math.max(e.chillT || 0, 2 + P.freezeDur); if (!e.boss && !e.giant && Math.random() < P.freeze) e.stun = Math.max(e.stun, 1 + P.freezeDur * 0.5); }
    if (o.pois) { e.pois = Math.max(e.pois || 0, o.pois); e.poisT = 3 + P.poisDur; }
    e.woke = true;
    if (o.shock && !o.noshock) {                                                       // arc to a neighbour
      let nx = null, nd = 120; for (const n of enemies) { if (n === e || n.spawn > 0 || n.hp <= 0) continue; const dd = Math.hypot(n.x - e.x, n.y - e.y); if (dd < nd) { nd = dd; nx = n; } }
      if (nx) { fx.push({ k: 'z', x1: e.x, y1: e.y, x2: nx.x, y2: nx.y, life: 0.14, max: 0.14 }); hitEnemy(nx, d * 0.5, { noshock: true, nocrit: true }); }
    }
    if (o.infect && !o.noinfect) { let nx = null, nd = 90; for (const n of enemies) { if (n === e || n.hp <= 0) continue; const dd = Math.hypot(n.x - e.x, n.y - e.y); if (dd < nd) { nd = dd; nx = n; } } if (nx) { nx.pois = Math.max(nx.pois || 0, P.pois || 5); nx.poisT = 3; } }
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    if (e.dead) return; e.dead = true; e.hp = Math.min(e.hp, 0);
    burst(e.x, e.y, e.col, e.boss ? 40 : 10 + e.r / 3, e.boss ? 260 : 150);
    run.kills++;
    const n = e.boss ? 14 : e.giant ? 6 : 1, each = Math.max(1, Math.round(e.val * 10 * P.bmult / n));
    for (let i = 0; i < n; i++) pickups.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), v: each, vx: rand(-60, 60), vy: rand(-60, 60) });
    save.stats.kills++;
    if (P.vamp) P.hp = Math.min(P.hpMax, P.hp + P.vamp);
    tone(e.boss ? 90 : 240, e.boss ? 0.6 : 0.1, 'sawtooth', 0.05, -120);
    addDecal(e.x, e.y + e.r * 0.5, 'goo', e.boss ? e.r * 1.4 : e.r);
    if (e.boss) { shake = 0.6; ebul = []; mines = []; for (const o of enemies) if (o.clone) { o.hp = 0; o.dead = true; burst(o.x, o.y, '#9b7bff', 10, 160); } save.stats.bosses++; }
    if (e.bomber) { fx.push({ k: 'r', x: e.x, y: e.y, r: 70, life: 0.35, max: 0.35 }); burst(e.x, e.y, '#ff8a2a', 20, 220); if (Math.hypot(P.x - e.x, P.y - e.y) < 74) hurtPlayer(e.dmg * 1.6); for (const o of enemies) if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 70) hitEnemy(o, e.max * 0.6, { nocrit: true }); }
    if (e.poisT > 0) {
      if (P.pSpread) for (const o of enemies) if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < 85) { o.pois = Math.max(o.pois || 0, P.pois || 5); o.poisT = 3; }
      if (P.venom) blast(e.x, e.y, 50, P.dmg * 1.2, { pois: P.pois || 5 });
      if (P.acidPool) addZone(e.x, e.y, 40, 'poison', 4);
    }
    if (e.burnT > 0 && P.infernoBurst) blast(e.x, e.y, 56, P.dmg * 1.3, { burn: P.burn || 6 });
    if (P.stormBurst) { let c = 0; for (const o of enemies) if (c < 2 && o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < 120) { c++; fx.push({ k: 'z', x1: e.x, y1: e.y, x2: o.x, y2: o.y, life: 0.14, max: 0.14 }); hitEnemy(o, P.dmg * 1.2, { nocrit: true, noshock: true }); } }
  }
  function blast(x, y, r, d, o) {
    fx.push({ k: 'r', x, y, r, life: 0.3, max: 0.3 }); addDecal(x, y, 'scorch', r * 0.75);
    burst(x, y, o && o.pois ? '#8bff5a' : o && o.chill ? '#8fe3ff' : '#ffb347', 10, 150);
    for (const e of enemies) if (Math.hypot(e.x - x, e.y - y) < r + e.r) hitEnemy(e, d, o ? Object.assign({}, o) : {});
    for (const w of walls.slice()) if (w.max && !w.dead) { const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h); if (Math.hypot(cx - x, cy - y) < r) damageWall(w, d * 0.7); }
    shake = Math.max(shake, 0.1);
    tone(110, 0.2, 'sawtooth', 0.06, -60);
  }
  // lingering damage areas left by fire, poison and ice upgrades
  let zones = [];
  function addZone(x, y, r, kind, dur) { if (zones.length < 40) zones.push({ x, y, r, kind, t: dur, max: dur, tick: 0 }); }
  function updateZones(dt) {
    for (const z of zones) {
      z.t -= dt; z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.3;
        for (const e of enemies) if (e.spawn <= 0 && e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) < z.r + e.r * 0.5) {
          if (z.kind === 'fire') hitEnemy(e, Math.max(2, P.dmg * 0.35), { burn: P.burn || 6, nocrit: true });
          else if (z.kind === 'poison') hitEnemy(e, Math.max(1, P.dmg * 0.15), { pois: P.pois || 5, nocrit: true });
          else if (z.kind === 'ice') { e.chillT = Math.max(e.chillT || 0, 1.2); }
        }
      }
    }
    zones = zones.filter(z => z.t > 0);
  }
  function elemOpts(b) {
    const o = {}, el = b.elem;
    if (el === 'fire') o.burn = P.burn || 6; else if (el === 'ice') o.chill = 1; else if (el === 'poison') { o.pois = P.pois || 5; if (P.infect) o.infect = 1; }
    else if (el === 'shock') o.shock = 1;
    if (P.shockChance && Math.random() < P.shockChance) o.shock = 1;
    o.dir = Math.atan2(b.vy, b.vx); o.pierceShield = b.pierce > 0;
    return o;
  }
  function onImpact(b) {                                                              // what a projectile leaves behind
    const el = b.elem;
    if (el === 'fire' && P.groundFire) addZone(b.x, b.y, 36, 'fire', 3);
    if (el === 'poison' && P.cloud) addZone(b.x, b.y, 42, 'poison', 3.5);
    if (el === 'ice' && P.groundIce) addZone(b.x, b.y, 38, 'ice', 3.5);
    if (el === 'ice' && P.spikes && !b.child) for (let i = 0; i < 3; i++) { const an = i / 3 * 6.28 + rand(0, 1); pbul.push({ x: b.x, y: b.y, vx: Math.cos(an) * 440, vy: Math.sin(an) * 440, dmg: b.dmg * 0.5, life: 0.35, pierce: 0, rico: 0, hit: new Set(), r: 3, boom: 0, col: ELEMCOL.ice, k: 'orb', elem: 'ice', spin: 0, child: 1 }); }
    if (P.split && !b.child) for (const sgn of [-1, 1]) { const an = Math.atan2(b.vy, b.vx) + sgn * 0.6; pbul.push({ x: b.x, y: b.y, vx: Math.cos(an) * 400, vy: Math.sin(an) * 400, dmg: b.dmg * 0.5, life: 0.5, pierce: 0, rico: 0, hit: new Set(), r: 3.5, boom: 0, col: b.col, k: b.k === 'rocket' ? 'orb' : b.k, elem: b.elem, spin: 0, child: 1 }); }
  }
  function hurtPlayer(d) {
    if (P.inv > 0 || state !== 'play') return;
    if (P.dodge && Math.random() < P.dodge) { P.inv = 0.35; fx.push({ k: 'c', x: P.x, y: P.y - 24, life: 0.5, txt: 'DODGE' }); return; }
    if (P.shieldHits > 0) { P.shieldHits--; P.inv = 0.9; burst(P.x, P.y, '#7df9ff', 18, 200); tone(520, 0.2, 'triangle', 0.07, -200); fx.push({ k: 'c', x: P.x, y: P.y - 24, life: 0.5, txt: 'SHIELD' }); return; }
    P.hurtRoom = true; P.hp -= d * (1 - Math.min(0.7, P.dr)); P.inv = P.invT; shake = 0.25; flash = 0.25;
    tone(150, 0.25, 'sawtooth', 0.08, -80);
    if (navigator.vibrate && save.set.vib) navigator.vibrate(30);
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
    } else if (PROJK.has(k)) {
      let angs = aimAngles(a, P.count, P.spread, k === 'tommy' ? 0.12 : 0.04);
      const nMain = angs.length;
      if (P.side) angs = angs.concat([a + Math.PI / 2, a - Math.PI / 2]);
      if (P.rear) angs.push(a + Math.PI);
      const wk = WEAP[k];
      angs.forEach((an, ai) => {
        const extra = ai >= nMain, elem = wk.elem === 'chaos' ? CHAOS_EL[Math.floor(Math.random() * CHAOS_EL.length)] : wk.elem;
        const bk = BK[k], sp0 = wk.speed, base = bk === 'rocket' ? (k === 'cannon' ? 9 : 7) : bk === 'cd' ? 7 : k === 'tommy' ? 3 : bk === 'bow' ? 3.5 : bk === 'orb' ? 5 : 4;
        const b = { x: mx, y: my, vx: Math.cos(an) * sp0, vy: Math.sin(an) * sp0, dmg: P.dmg * (extra ? 0.6 : 1), life: P.life, pierce: P.pierce, rico: P.rico, hit: new Set(), r: base * P.psize, boom: P.boom || 0, col: ELEMCOL[elem] || wk.col, k: bk, elem, spin: rand(0, 6.28) };
        if (k === 'nade') { const dist = Math.hypot(tg.x - mx, tg.y - my); b.dist = dist; b.trav = 0; b.nohit = true; b.life = dist / sp0 + (P.fuseT || 0.5); b.ang = an; }
        pbul.push(b);
      });
      tone(k === 'rocket' || k === 'cannon' ? 150 : k === 'shotgun' ? 140 : k === 'tommy' ? 520 : k === 'cd' ? 800 : k === 'bow' ? 260 : k === 'nade' ? 200 : k === 'ice' ? 900 : k === 'fire' ? 180 : k === 'poison' ? 330 : k === 'plasma' ? 640 : k === 'shadow' ? 700 : k === 'chaos' ? 480 : 700, k === 'tommy' ? 0.04 : 0.06, k === 'bow' ? 'triangle' : 'square', k === 'tommy' ? 0.018 : 0.03);
    } else if (k === 'laser') {
      for (const an of aimAngles(a, P.count, P.spread)) {
        let x2 = P.x + Math.cos(an) * P.len, y2 = P.y + Math.sin(an) * P.len;
        const bt = rayT(P.x, P.y, x2, y2); if (bt < 1) { x2 = P.x + (x2 - P.x) * bt; y2 = P.y + (y2 - P.y) * bt; if (rayW && rayW.max) damageWall(rayW, P.dmg); }
        fx.push({ k: 'l', x1: P.x, y1: P.y, x2, y2, w: P.width, life: 0.12, max: 0.12, col: P.col });
        if (P.lboom) blast(x2, y2, 34, P.dmg * 0.8, { burn: P.burn || 0 });
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


  function drawEItem(b) {                                                  // thrown junk and laser bolts
    const g = ctx, k = b.it; g.save(); g.translate(b.x, b.y);
    if (k === 'laser') {
      g.rotate(Math.atan2(b.vy, b.vx)); glowAt(0, 0, 18, '#ff3d5a', 0.7);
      g.fillStyle = '#ff3d5a'; rr(-12, -2.6, 24, 5.2, 2.6); g.fill(); g.fillStyle = '#fff'; rr(-10, -1, 20, 2, 1); g.fill();
    } else {
      g.rotate(b.rot); g.lineWidth = 1.6; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round';
      if (k === 'chair') {
        g.fillStyle = '#b07a3c'; g.fillRect(-8, -2, 16, 6); g.strokeRect(-8, -2, 16, 6);
        g.fillRect(-8, -11, 4, 9); g.strokeRect(-8, -11, 4, 9); g.fillRect(-7, 4, 3, 8); g.fillRect(4, 4, 3, 8);
      } else if (k === 'barrel') {
        g.fillStyle = '#8a5a2b'; rr(-7, -9, 14, 18, 4); g.fill(); g.stroke(); g.strokeStyle = '#2a1a10'; g.beginPath(); g.moveTo(-7, -3); g.lineTo(7, -3); g.moveTo(-7, 3); g.lineTo(7, 3); g.stroke();
      } else if (k === 'crate') {
        g.fillStyle = '#c9965a'; g.fillRect(-8, -8, 16, 16); g.strokeRect(-8, -8, 16, 16); g.strokeStyle = '#8a5a2b'; g.beginPath(); g.moveTo(-8, -8); g.lineTo(8, 8); g.moveTo(8, -8); g.lineTo(-8, 8); g.stroke();
      } else if (k === 'tv') {
        g.fillStyle = '#3a3f4a'; rr(-9, -7, 18, 14, 2); g.fill(); g.stroke(); g.fillStyle = '#7fd6ff'; g.fillRect(-6, -4, 12, 8);
      } else {
        g.fillStyle = '#222'; g.beginPath(); g.arc(0, 0, 8, 0, 6.28); g.fill(); g.stroke(); g.fillStyle = '#6a6f7a'; g.beginPath(); g.arc(0, 0, 3.2, 0, 6.28); g.fill();
      }
    }
    g.restore();
  }
  const E_ITEMS = ['chair', 'barrel', 'crate', 'laser', 'tv', 'tire', 'laser', 'chair'];
  function enemyShot(e) {
    const a = Math.atan2(P.y - e.y, P.x - e.x), g = e.gun, dm = e.bdmg;
    let it = Math.random() < 0.65 ? E_ITEMS[Math.floor(Math.random() * E_ITEMS.length)] : null;       // opps hurl whatever's lying around: chairs, barrels, crates, laser bolts...
    if (g === 'shotgun') it = null;
    const b = (an, sp, d = dm, r = 5, life = 5) => ebul.push({ x: e.x + Math.cos(an) * e.r, y: e.y + Math.sin(an) * e.r, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, dmg: d, r: it && it !== 'laser' ? Math.max(r, 8) : r, life, it, rot: Math.random() * 6.28, ang: an });
    fx.push({ k: 'm', x: e.x + Math.cos(a) * e.r * 1.4, y: e.y + Math.sin(a) * e.r * 1.4, life: 0.07, max: 0.07 });
    if (g === 'pistol') { b(a, 190); e.cd = rand(2.4, 3.4); }
    else if (g === 'rifle') { b(a, 320, dm * 1.3, 4); e.cd = rand(1.8, 2.6); }
    else if (g === 'smg') { b(a + rand(-0.06, 0.06), 215, dm * 0.8, 4); }
    else if (g === 'shotgun') { for (let i = -2; i <= 2; i++) b(a + i * 0.12, 175, dm * 0.7, 4, 0.9); e.cd = rand(3, 3.8); }
    else if (g === 'cannon') { for (let i = -1; i <= 1; i++) b(a + i * 0.25, 135, dm * 1.6, 8); e.cd = rand(3, 4); }
    tone(g === 'cannon' ? 90 : 420, 0.08, 'square', 0.025);
  }
  // Each boss fights differently. Kong slams and throws, Leo spins bullet storms and pounces, Bull charges.
  let mines = [];
  function addMine(x, y, arm, r, dmg) { mines.push({ x: clamp(x, PAD + 20, RW - PAD - 20), y: clamp(y, TOP + 20, RH - BOT - 30), t: arm, arm, r, dmg }); }
  function updateMines(dt) {
    for (const m of mines) {
      m.t -= dt;
      if (m.t <= 0) { fx.push({ k: 'r', x: m.x, y: m.y, r: m.r * 1.3, life: 0.35, max: 0.35 }); burst(m.x, m.y, '#ff8a2a', 16, 220); shake = Math.max(shake, 0.18); tone(100, 0.25, 'sawtooth', 0.07, -60); if (Math.hypot(P.x - m.x, P.y + P.r - m.y) < m.r + P.r * 0.6) hurtPlayer(m.dmg); m.dead = true; }
    }
    mines = mines.filter(m => !m.dead);
  }
  // Each boss fights differently, in three phases that speed up as it is hurt.
  function bossAI(e, dt, ux, uy, d) {
    const bn = e.bn, tier = 1 + (bn - 1) * 0.18, hpf = e.hp / e.max, phase = hpf > 0.66 ? 1 : hpf > 0.33 ? 2 : 3, rage = phase >= 2, frenzy = phase === 3;
    if (phase !== e.phase) { e.phase = phase; msg = { t: 1.4, s: 'PHASE ' + phase }; shake = 0.5; fx.push({ k: 'r', x: e.x, y: e.y, r: 160, life: 0.5, max: 0.5 }); burst(e.x, e.y, '#ff3a5a', 30, 260); tone(80, 0.6, 'sawtooth', 0.09, -40); if (e.id === 'titan' && phase === 2) e.r *= 1.12; }
    const aim = Math.atan2(P.y - e.y, P.x - e.x);
    const bul = (a, sp, dm = e.bdmg, r = 6, extra) => ebul.push(Object.assign({ x: e.x, y: e.y, vx: Math.cos(a) * sp * tier, vy: Math.sin(a) * sp * tier, dmg: dm, r, life: 6 }, extra || {}));
    const ring = (n, sp, off = 0, dm) => { for (let i = 0; i < n; i++) bul(i / n * 6.28 + off, sp, dm); };
    const fan = (n, spread, sp, dm, r) => { for (let i = 0; i < n; i++) bul(aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), sp, dm, r); };
    let vx = 0, vy = 0;
    e.mt -= dt * (frenzy ? 1.6 : rage ? 1.25 : 1);
    for (const q of e.sched) q.t -= dt;                                     // delayed follow-up attacks
    for (const q of e.sched) if (q.t <= 0) { q.fn(); q.done = true; }
    e.sched = e.sched.filter(q => !q.done);
    const walk = k => { vx = ux * e.sp * k; vy = uy * e.sp * k * 0.7; };
    const startTele = (t, nextMode = 'dash') => { e.mode = 'tele'; e.mt = t; e.next = nextMode; };

    if (e.id === 'enforcer') {                                              // slam, barrel throw, charge, summon
      walk(rage ? 1.4 : 1);
      if (e.mode === 'tele') {
        vx = vy = 0; e.dx = ux; e.dy = uy;
        if (e.mt <= 0) {
          if (e.next === 'slam') { ring(20 + bn * 5 + (frenzy ? 8 : 0), 150); fx.push({ k: 'r', x: e.x, y: e.y, r: 130, life: 0.4, max: 0.4 }); shake = 0.5; tone(70, 0.4, 'sawtooth', 0.09); if (d < 125) hurtPlayer(e.bdmg * 1.6); e.mode = 'idle'; e.mt = rage ? 1.0 : 1.7; }
          else { e.mode = 'dash'; e.mt = 0.75; }
        }
      } else if (e.mode === 'dash') {
        vx = e.dx * 400 * tier; vy = e.dy * 400 * tier;
        if (e.mt <= 0) { e.mode = 'idle'; e.mt = rage ? 0.8 : 1.4; ring(10, 150); shake = 0.3; }
      } else if (e.mt <= 0) {
        e.pat++; const m = e.pat % 4;
        if (m === 0) { e.dx = ux; e.dy = uy; startTele(0.8, 'slam'); }
        else if (m === 1) { const n = rage ? 5 : 3; for (let i = 0; i < n; i++) bul(aim + (i - (n - 1) / 2) * 0.2, 225, e.bdmg * 1.4, 10); e.mt = 1.1; }
        else if (m === 2) { e.dx = ux; e.dy = uy; startTele(rage ? 0.55 : 0.75, 'dash'); }
        else { if (enemies.length < 7) for (let i = 0; i < (rage ? 3 : 2); i++) spawn(Math.random() < 0.5 ? 'runt' : 'shield', clamp(e.x + rand(-70, 70), PAD + 20, RW - PAD - 20), clamp(e.y + 70, TOP + 20, RH - 80)); e.mt = 1.2; }
      }
    } else if (e.id === 'war') {                                            // missiles, laser sweeps, mines
      walk(0.7);
      if (e.mode === 'sweep') {
        vx = vy = 0; const tt = 3.0 - e.mt;
        if (tt > 0.9) { e.sa += e.sdir * (frenzy ? 1.5 : rage ? 1.2 : 0.95) * dt; const ex = Math.cos(e.sa), ey = Math.sin(e.sa), px = P.x - e.x, py = P.y + P.r - e.y, along = px * ex + py * ey; if (along > 0 && Math.abs(px * ey - py * ex) < 14) hurtPlayer(e.bdmg * 1.5); }
        if (e.mt <= 0) { e.mode = 'idle'; e.mt = rage ? 0.9 : 1.5; }
      } else if (e.mt <= 0) {
        e.pat++; const m = e.pat % 4;
        if (m === 0) { const n = 3 + (rage ? 1 : 0) + (frenzy ? 2 : 0); for (let i = 0; i < n; i++) { const a2 = aim + (i - (n - 1) / 2) * 0.5; bul(a2, 150, e.bdmg, 7, { home: 1.4, life: 4.5 }); } tone(260, 0.3, 'sawtooth', 0.06, 200); e.mt = 1.6; }
        else if (m === 1) { e.mode = 'sweep'; e.mt = 3.0; e.sa = aim - 0.9 * (Math.random() < 0.5 ? 1 : -1); e.sdir = e.sa < aim ? 1 : -1; }
        else if (m === 2) { const n = 3 + bn + (rage ? 2 : 0); for (let i = 0; i < n; i++) addMine(P.x + rand(-130, 130), P.y + rand(-110, 110), 1.2 + i * 0.12, 54, e.bdmg * 1.6); e.mt = 1.5; }
        else { fan(rage ? 7 : 5, 0.9, 230, e.bdmg, 6); e.mt = 1.0; }
      }
    } else if (e.id === 'shadow') {                                         // teleports, fast strikes, illusions
      if (e.mode === 'blink') {
        vx = vy = 0; e.alpha = Math.max(0, e.mt / 0.55);
        if (e.mt <= 0) { e.x = clamp(e.tx, PAD + e.r, RW - PAD - e.r); e.y = clamp(e.ty, TOP + e.r, RH - BOT - e.r); e.alpha = 1; fx.push({ k: 'r', x: e.x, y: e.y, r: 70, life: 0.3, max: 0.3 }); burst(e.x, e.y, '#9b7bff', 18, 200); e.mode = 'tele'; e.mt = rage ? 0.4 : 0.55; e.next = 'dash'; }
      } else if (e.mode === 'tele') {
        vx = vy = 0; e.dx = ux; e.dy = uy;
        if (e.mt <= 0) { e.mode = 'dash'; e.mt = 0.35; }
      } else if (e.mode === 'dash') {
        vx = e.dx * 540 * tier; vy = e.dy * 540 * tier;
        if (e.mt <= 0) { fan(rage ? 7 : 5, 0.9, 240, e.bdmg, 6); e.mode = 'idle'; e.mt = rage ? 0.7 : 1.2; }
      } else {
        const ang = aim + Math.PI + Math.sin(performance.now() / 700) * 1.2; vx = Math.cos(ang) * e.sp * 0.5; vy = Math.sin(ang) * e.sp * 0.5;
        if (e.mt <= 0) {
          e.pat++; const m = e.pat % 3;
          if (m === 1) { for (let i = 0; i < (frenzy ? 3 : 2); i++) { if (enemies.length < 8) spawn('clone', clamp(P.x + rand(-170, 170), PAD + 20, RW - PAD - 20), clamp(P.y + rand(-200, -60), TOP + 20, RH - 120)); } burst(e.x, e.y, '#9b7bff', 20, 200); e.mt = 0.8; }
          else if (m === 2) { ring(14 + bn * 2, 140); e.sched.push({ t: 0.5, fn: () => ring(14 + bn * 2, 140, 0.22) }); e.mt = 1.3; }
          if (m !== 1) { const a2 = rand(0, 6.28), dd = rand(110, 190); e.tx = P.x + Math.cos(a2) * dd; e.ty = P.y + Math.sin(a2) * dd * 0.7; e.mode = 'blink'; e.mt = 0.55; }
        }
      }
    } else if (e.id === 'titan') {                                          // earth-shaking waves, then a rage form
      walk(rage ? 0.9 : 0.6);
      if (e.mode === 'tele') {
        vx = vy = 0;
        if (e.mt <= 0) {
          const n = 26 + (rage ? 6 : 0); ring(n, 125); e.sched.push({ t: 0.4, fn: () => ring(n, 125, 3.14 / n) }); if (rage) e.sched.push({ t: 0.8, fn: () => ring(n, 125, 0) });
          fx.push({ k: 'r', x: e.x, y: e.y, r: 170, life: 0.5, max: 0.5 }); shake = 0.6; tone(60, 0.6, 'sawtooth', 0.1); if (d < 150) hurtPlayer(e.bdmg * 1.8); e.mode = 'idle'; e.mt = frenzy ? 1.0 : 1.8;
        }
      } else if (e.mt <= 0) {
        e.pat++; const m = e.pat % 3;
        if (m === 0) startTele(1.0, 'smash');
        else if (m === 1) { const n = 4 + bn + (rage ? 3 : 0); for (let i = 0; i < n; i++) addMine(rand(PAD + 30, RW - PAD - 30), rand(TOP + 40, RH - BOT - 60), 0.9 + i * 0.1, 62, e.bdmg * 1.7); e.mt = 1.6; }
        else { fan(rage ? 9 : 7, 1.3, 210, e.bdmg, 8); e.mt = 1.2; }
      }
    } else {                                                                // Opp Overlord: a bit of everything
      walk(0.8);
      if (e.mode === 'sweep') {
        vx = vy = 0; const tt = 3.0 - e.mt;
        if (tt > 0.9) { e.sa += e.sdir * 1.1 * dt; const ex = Math.cos(e.sa), ey = Math.sin(e.sa), px = P.x - e.x, py = P.y + P.r - e.y, along = px * ex + py * ey; if (along > 0 && Math.abs(px * ey - py * ex) < 14) hurtPlayer(e.bdmg * 1.5); }
        if (e.mt <= 0) { e.mode = 'idle'; e.mt = 1.0; }
      } else {
        if (e.shield && e.shT > 0) { e.shT -= dt; if (e.shT <= 0) e.shield = false; }
        if (e.mt <= 0) {
          e.pat++; const m = e.pat % 6;
          if (m === 0) { for (let i = 0; i < 4 + (rage ? 2 : 0); i++) bul(aim + (i - 1.5) * 0.45, 150, e.bdmg, 7, { home: 1.3, life: 4.5 }); e.mt = 1.3; }
          else if (m === 1) { e.mode = 'sweep'; e.mt = 3.0; e.sa = aim - 0.9; e.sdir = 1; }
          else if (m === 2) { if (enemies.length < 7) { spawn('shield', clamp(e.x - 80, PAD + 20, RW - 40), clamp(e.y + 80, TOP + 20, RH - 90)); spawn('sniper', clamp(e.x + 80, PAD + 20, RW - 40), clamp(e.y + 60, TOP + 20, RH - 90)); } e.mt = 1.3; }
          else if (m === 3) { ring(20, 150); e.sched.push({ t: 0.45, fn: () => ring(20, 150, 0.15) }); e.mt = 1.3; }
          else if (m === 4) { e.shield = true; e.shT = 3.5; e.mt = 2.0; }
          else { const n = 4 + bn; for (let i = 0; i < n; i++) addMine(P.x + rand(-120, 120), P.y + rand(-100, 100), 1.1 + i * 0.1, 54, e.bdmg * 1.6); fan(5, 0.8, 230, e.bdmg, 6); e.mt = 1.4; }
        }
      }
    }
    return [vx, vy];
  }

  function tryDash(dx, dy) {                                             // quick burst with a moment of invulnerability
    if ((state !== 'play' && state !== 'clear') || (P.dashCd || 0) > 0 || (P.dashT || 0) > 0) return false;
    let l = Math.hypot(dx, dy);
    if (l < 0.2) { dx = P.vx || 0; dy = P.vy || 0; l = Math.hypot(dx, dy); }
    if (l < 0.05) { dx = -Math.cos(P.aim); dy = -Math.sin(P.aim); l = 1; }
    P.dashDir = [dx / l, dy / l]; P.dashT = 0.17; P.dashCd = 0; P.inv = Math.max(P.inv, 0.3);
    tone(420, 0.15, 'sawtooth', 0.05, 380); if (navigator.vibrate && save.set.vib) navigator.vibrate(12);
    return true;
  }
  function useAbility() {
    if (state !== 'play' || P.abCd > 0 || !enemies.length) return;
    let ab = P.ch.ability; const A = ABIL[ab];
    P.abCd = A.cd * P.cdr;
    let elem = WEAP[P.ch.weapon].elem;
    if (ab === 'chaos') { ab = ['nova', 'freeze', 'strike', 'frenzy'][Math.floor(Math.random() * 4)]; elem = CHAOS_EL[Math.floor(Math.random() * CHAOS_EL.length)]; }
    if (elem === 'chaos') elem = CHAOS_EL[Math.floor(Math.random() * CHAOS_EL.length)];
    const eo = { fire: { burn: P.burn || 6 }, ice: { chill: 1 }, poison: { pois: P.pois || 5 }, shock: { shock: 1 } }[elem] || {};
    tone(300, 0.4, 'sawtooth', 0.07, 400); shake = 0.3;
    if (ab === 'nova') { blast(P.x, P.y, 135, P.dmg * 3.2, eo); fx.push({ k: 'r', x: P.x, y: P.y, r: 170, life: 0.45, max: 0.45 }); burst(P.x, P.y, ELEMCOL[elem] || '#ffd34d', 36, 280); }
    else if (ab === 'freeze') { for (const e of enemies) { e.chillT = 3; if (!e.boss && !e.giant) e.stun = 2.5 + P.freezeDur; } fx.push({ k: 'r', x: P.x, y: P.y, r: 260, life: 0.5, max: 0.5 }); burst(P.x, P.y, '#8fe3ff', 40, 300); }
    else if (ab === 'shield') { P.inv = Math.max(P.inv, 3); P.bulwark = 3; burst(P.x, P.y, '#7df9ff', 24, 200); }
    else if (ab === 'frenzy') { P.frenzyT = 4; burst(P.x, P.y, '#ffd34d', 24, 200); }
    else if (ab === 'blink') {
      let dx = joy.dx, dy = joy.dy; if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(P.aim + Math.PI); dy = Math.sin(P.aim + Math.PI); }
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      for (let i = 0; i < 6; i++) { fx.push({ k: 'p', x: P.x, y: P.y, vx: 0, vy: 0, life: 0.35, max: 0.35, col: '#9b7bff' }); moveBy(P, dx * 22, dy * 22, P.r * 0.8); }
      P.x = clamp(P.x, PAD + P.r, RW - PAD - P.r); P.y = clamp(P.y, TOP + P.r, RH - BOT - P.r * 3.5); P.inv = Math.max(P.inv, 0.7);
    }
    else if (ab === 'strike') { for (const e of enemies) if (e.spawn <= 0) { fx.push({ k: 'z', x1: e.x + rand(-20, 20), y1: e.y - 160, x2: e.x, y2: e.y, life: 0.2, max: 0.2 }); hitEnemy(e, P.dmg * 3, { nocrit: true, noshock: true }); } flash = 0.15; }
  }
  function updatePower(dt) {
    if (P.bulwark > 0) P.bulwark -= dt;
    if (P.aura) { P.auraT -= dt; if (P.auraT <= 0) { P.auraT = 0.6; fx.push({ k: 'r', x: P.x, y: P.y, r: 72, life: 0.25, max: 0.25 }); for (const e of enemies) if (e.spawn <= 0 && Math.hypot(e.x - P.x, e.y - P.y) < 72 + e.r) hitEnemy(e, P.dmg * 0.7 * P.aura, { nocrit: true, noshock: true }); } }
    if (P.strikeRate) { P.strikeT -= dt; if (P.strikeT <= 0) { P.strikeT = 3.2 / P.strikeRate; const c = enemies.filter(e => e.spawn <= 0 && e.hp > 0); if (c.length) { const e = c[Math.floor(Math.random() * c.length)]; fx.push({ k: 'z', x1: e.x, y1: e.y - 170, x2: e.x, y2: e.y, life: 0.22, max: 0.22 }); hitEnemy(e, P.dmg * 2.6, { shock: 1, nocrit: true }); shake = Math.max(shake, 0.08); } } }
    if (P.meteor) { P.meteorT -= dt; if (P.meteorT <= 0) { P.meteorT = 4; const c = enemies.filter(e => e.spawn <= 0 && e.hp > 0); if (c.length) { const e = c[Math.floor(Math.random() * c.length)]; blast(e.x, e.y, 62, P.dmg * 3.2, { burn: P.burn || 6 }); glowAt(e.x, e.y, 150, '#ff7a2a', 0.8); } } }
    if (P.blizzard) { P.blizT = (P.blizT || 0) - dt; if (P.blizT <= 0) { P.blizT = 0.5; fx.push({ k: 'r', x: P.x, y: P.y, r: 115, life: 0.3, max: 0.3 }); for (const e of enemies) if (Math.hypot(e.x - P.x, e.y - P.y) < 115 + e.r) { e.chillT = Math.max(e.chillT || 0, 1.2); hitEnemy(e, P.dmg * 0.25, { nocrit: true, chill: 1 }); } } }
    if (P.trail && (P.mv || 0) > 0.3) { P.trailT -= dt; if (P.trailT <= 0) { P.trailT = 0.25; addZone(P.x, P.y + 10, 22, 'fire', 2.2); } }
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

    // move player: the thumb stick has a small dead zone and a gentle curve, and the monkey speeds up and slows down smoothly
    let ix = joy.dx, iy = joy.dy;
    const il0 = Math.hypot(ix, iy);
    if (il0 < 0.1) { ix = iy = 0; } else { const k = Math.pow(Math.min(1, (il0 - 0.1) / 0.9), 1.12) / il0; ix *= k; iy *= k; }
    if (keys.ArrowLeft || keys.a) ix -= 1; if (keys.ArrowRight || keys.d) ix += 1;
    if (keys.ArrowUp || keys.w) iy -= 1; if (keys.ArrowDown || keys.s) iy += 1;
    const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
    const slow = (P.slowT || 0) > 0 ? 0.62 : 1, moving = il > 0.02;
    P.vx = P.vx || 0; P.vy = P.vy || 0; P.dashCd = Math.max(0, (P.dashCd || 0) - dt);
    if ((P.dashT || 0) > 0) {                                                            // mid-dash: fixed fast velocity and a trail
      P.dashT -= dt; P.vx = P.dashDir[0] * 640; P.vy = P.dashDir[1] * 640;
      fx.push({ k: 'gh', x: P.x, y: P.y, life: 0.28, max: 0.28, col: P.ch.fur });
    }
    const ease = Math.min(1, dt * (moving ? 15 : 22));                                  // quick to start, quicker to stop
    if (!(P.dashT > 0)) { P.vx += (ix * P.speed * slow - P.vx) * ease; P.vy += (iy * P.speed * slow - P.vy) * ease; }
    if (!moving && Math.hypot(P.vx, P.vy) < 6) P.vx = P.vy = 0;
    { const ox = P.x, oy = P.y; moveBy(P, P.vx * dt, P.vy * dt, P.r * 0.8);
      if (Math.abs(P.x - ox) < Math.abs(P.vx * dt) * 0.5) P.vx *= 0.35;                  // sliding along cover instead of grinding into it
      if (Math.abs(P.y - oy) < Math.abs(P.vy * dt) * 0.5) P.vy *= 0.35; }
    P.face = il > 0.15 ? Math.atan2(iy, ix) : P.aim;                                    // the body turns the way the stick points; the arm still tracks the opps
    P.x = clamp(P.x, PAD + P.r, RW - PAD - P.r);
    P.y = clamp(P.y, TOP + P.r, RH - BOT - P.r * 3.5);
    P.inv = Math.max(0, P.inv - dt); P.sl = Math.max(0, (P.sl || 0) - dt);
    P.mv = Math.min(1, Math.hypot(P.vx, P.vy) / Math.max(1, P.speed)); P.walk = (P.walk || 0) + dt * (4 + 9 * P.mv) * (P.mv > 0.05 ? 1 : 0);
    if (P.mv > 0.5) { P.dustT = (P.dustT || 0) - dt; if (P.dustT <= 0) { P.dustT = 0.11; fx.push({ k: 'p', x: P.x + rand(-4, 4), y: P.y + P.r * 3.2, vx: -P.vx * 0.15, vy: rand(-8, 8), life: 0.35, max: 0.35, col: 'rgba(200,200,190,.8)' }); } }

    updateCamera(dt);
    navT -= dt; if (navT <= 0 && walls.length) { navT = 0.12; updateNav(); }
    if (state === 'play') { roomT += dt; if (roomT > 90 && !queue.length) for (const e of enemies) if (!e.boss && e.hp > 0) killEnemy(e); }

    // spawns: opps drop in from the top of the room
    if (state === 'play') {
      spawnT -= dt;
      const alive = enemies.length, cap = Math.min(6 + Math.floor(run.room / 2), 22);
      if (queue.length && spawnT <= 0 && alive < cap) {
        const kind = queue.shift();
        if (kind === 'swarm') { const sx = rand(PAD + 40, RW - PAD - 40), sy = rand(TOP + 24, TOP + 120); for (let q = 0; q < 3; q++) spawn('swarm', clamp(sx + rand(-26, 26), PAD + 12, RW - PAD - 12), sy + rand(-12, 12)); }
        else if (kind === 'boss') spawn(kind, RW / 2, TOP + 70);
        else {
          let x, y, tries = 0;
          do { x = rand(PAD + 24, RW - PAD - 24); y = rand(TOP + 24, TOP + Math.min(220, (RH - TOP) * 0.4)); tries++; } while ((Math.hypot(x - P.x, y - P.y) < 130 || inWall(x, y, 30)) && tries < 20);
          spawn(kind, x, y);
        }
        spawnT = Math.max(0.16, 0.4 - run.room * 0.01);
      }
    }

    // opps
    for (const e of enemies) {
      e.flash = Math.max(0, e.flash - dt);
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      if (e.intro > 0) { e.intro -= dt; e.ph += dt * 3; continue; }
      if (e.burnT > 0) {
        e.burnT -= dt; e.hp -= e.burn * dt;
        if (Math.random() < dt * 8) fx.push({ k: 'p', x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: 0, vy: -30, life: 0.3, max: 0.3, col: '#ff8a2a' });
        if (P.spreadFire) for (const o of enemies) if (o !== e && o.burnT <= 0 && Math.hypot(o.x - e.x, o.y - e.y) < e.r + o.r + 16) { o.burn = e.burn; o.burnT = 1.5; }
        if (e.hp <= 0) { killEnemy(e); continue; }
      }
      if (e.poisT > 0) {
        e.poisT -= dt; e.hp -= e.pois * dt;
        if (Math.random() < dt * 6) fx.push({ k: 'p', x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: 0, vy: -24, life: 0.4, max: 0.4, col: '#8bff5a' });
        if (e.hp <= 0) { killEnemy(e); continue; }
      }
      if (e.stun > 0 && !e.boss) { e.stun -= dt; continue; }
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      let sp = e.sp, vx = 0, vy = 0, mux = ux, muy = uy, around = false;
      if (!e.aggro && !e.boss && !e.clone && roomWide()) {                                  // idle until you come near, then the whole pack wakes up
        if (d < 300 || e.woke) { e.aggro = true; for (const o of enemies) if (!o.aggro && Math.hypot(o.x - e.x, o.y - e.y) < 150) o.aggro = true; }
      } else e.aggro = true;
      if (walls.length && d > 24 && !clearShot(e.x, e.y, P.x, P.y)) { const nd = navDir(e.x, e.y); if (nd) { mux = nd[0]; muy = nd[1]; around = true; } }   // no line to the player: follow the way around
      if (!e.aggro) {                                                                      // wander slowly while waiting
        e.wt = (e.wt || 0) - dt; if (e.wt <= 0) { e.wa = rand(0, 6.28); e.wt = rand(1, 2.6); e.wm = Math.random() < 0.55 ? 1 : 0; }
        vx = Math.cos(e.wa) * sp * 0.22 * e.wm; vy = Math.sin(e.wa) * sp * 0.22 * e.wm;
      } else if (e.boss) {
        [vx, vy] = bossAI(e, dt, mux, muy, d);
      } else if (e.kind === 'shooter') {
        if (d > 190 || around) { vx = mux * sp; vy = muy * sp; } else if (d < 140) { vx = -ux * sp; vy = -uy * sp; } else { vx = -uy * sp * 0.6; vy = ux * sp * 0.6; }
      } else if (e.kind === 'sniper') {                              // keeps its distance, shows a laser line, then fires a hard shot
        if (e.sn === 1) { e.stt -= dt; if (e.stt > 0.45) e.snA = Math.atan2(P.y - e.y, P.x - e.x);
          if (e.stt <= 0) { ebul.push({ x: e.x, y: e.y, vx: Math.cos(e.snA) * 560, vy: Math.sin(e.snA) * 560, dmg: e.bdmg * 1.9, r: 5, life: 3 }); fx.push({ k: 'm', x: e.x + Math.cos(e.snA) * e.r * 1.6, y: e.y + Math.sin(e.snA) * e.r * 1.6, life: 0.08, max: 0.08 }); tone(900, 0.12, 'sawtooth', 0.05, -500); e.sn = 0; e.cd = rand(2.6, 3.6); } }
        else { if (d > 340 || around) { vx = mux * sp; vy = muy * sp; } else if (d < 240) { vx = -ux * sp; vy = -uy * sp; } e.cd -= dt; if (e.cd <= 0 && d < 560 && clearShot(e.x, e.y, P.x, P.y)) { e.sn = 1; e.stt = 1.1; e.snA = Math.atan2(P.y - e.y, P.x - e.x); } }
      } else if (e.giant) {                                          // slow giant: slams the ground in a telegraphed ring
        vx = mux * sp; vy = muy * sp; e.mt -= dt;
        if (e.mode === 'tele') { vx = vy = 0; if (e.mt <= 0) { fx.push({ k: 'r', x: e.x, y: e.y, r: 110, life: 0.4, max: 0.4 }); shake = 0.4; tone(70, 0.4, 'sawtooth', 0.09); if (Math.hypot(P.x - e.x, P.y - e.y) < 110) hurtPlayer(e.dmg * 1.3); for (let i = 0; i < 12; i++) { const a2 = i / 12 * 6.28; ebul.push({ x: e.x, y: e.y, vx: Math.cos(a2) * 150, vy: Math.sin(a2) * 150, dmg: e.bdmg, r: 6, life: 4 }); } e.mode = 'idle'; e.mt = rand(2.4, 3.2); } }
        else if (e.mt <= 0) { e.mode = 'tele'; e.mt = 0.85; }
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
      if (e.chillT > 0) { e.chillT -= dt; vx *= 0.55; vy *= 0.55; }
      e.aimA = Math.atan2(dy, dx); e.faceA = e.aimA;
      if (e.elite) {                                                  // elite tricks
        e.modT -= dt;
        if (e.mod === 'regen') e.hp = Math.min(e.max, e.hp + e.max * 0.03 * dt);
        else if (e.mod === 'ring' && e.modT <= 0) { e.modT = 4.5; for (let i = 0; i < 8; i++) { const a2 = i / 8 * 6.28; ebul.push({ x: e.x, y: e.y, vx: Math.cos(a2) * 150, vy: Math.sin(a2) * 150, dmg: e.bdmg * 0.9, r: 5, life: 4 }); } }
      }
      if (e.gun && e.aggro) {                                                    // opps with guns
        if (e.burst > 0) { e.bt -= dt; if (e.bt <= 0) { enemyShot(e); e.burst--; e.bt = 0.11; if (!e.burst) e.cd = rand(2.6, 3.4); } }
        else { e.cd -= dt; if (e.cd <= 0 && e.y > TOP) { if (e.gun === 'smg') { e.burst = 3; e.bt = 0; } else enemyShot(e); } }
      }
      e.ph += dt * (6 + Math.hypot(vx, vy) / 30);
      if (!walls.length) { e.x += vx * dt; e.y += vy * dt; }
      else {
        const ox = e.x, oy = e.y, want = Math.hypot(vx, vy) * dt, rad = e.boss ? e.r * 0.42 : e.r * 0.8;
        moveBy(e, vx * dt, vy * dt, rad);
        const got = Math.hypot(e.x - ox, e.y - oy);
        if (e.boss && e.mode === 'dash' && want > 0.4 && got < want * 0.3) e.mt = 0;
        if (want > 0.4 && got < want * 0.45) { e.side = e.side || (Math.random() < 0.5 ? 1 : -1); moveBy(e, -muy * e.side * 70 * dt, mux * e.side * 70 * dt, rad); }   // slide around cover
        else if (got > want * 0.85) e.side = 0;
        pushOut(e, rad);
      }
      e.x = clamp(e.x, PAD + e.r * 0.5, RW - PAD - e.r * 0.5);
      e.y = clamp(e.y, TOP + e.r * 0.5, RH - BOT - e.r * 0.5);
      if (e.bomber && d < e.r + P.r + 16) { e.hp = 0; killEnemy(e); continue; }
      if (Math.hypot(P.x - e.x, P.y - e.y) < e.r + P.r - 3) {
        hurtPlayer(e.dmg);
        if (P.inv > 0) { const k = 40 * dt * 60; e.x -= ux * k * 0.2; e.y -= uy * k * 0.2; }
      }
    }
    enemies = enemies.filter(e => e.hp > 0);

    // auto-fire at the nearest opp: standing still shoots at full rate, moving slows it right down
    P.frenzyT = Math.max(0, P.frenzyT - dt); P.abCd = Math.max(0, P.abCd - dt);
    const rm = (P.frenzyT > 0 ? 2 : 1) * ((P.mv || 0) > 0.2 ? (MOVEATK[P.ch.weapon] || 0.3) : 1);
    P.cd -= dt * rm;
    updatePower(dt); updateZones(dt); updateMines(dt); if (state === 'play') updateHazards(dt);
    for (const w of walls) if (w.flash > 0) w.flash -= dt;
    const tg = nearest();
    if (!tg) { let nb = null, nd = 1e9; for (const e of enemies) { if (e.spawn > 0) continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < nd) { nd = d; nb = e; } } if (nb) P.aim = Math.atan2(nb.y - P.y, nb.x - P.x); }   // out of range or behind cover: still point at the closest opp
    if (tg) {
      P.aim = Math.atan2(tg.y - P.y, tg.x - P.x);
      if (P.ch.weapon === 'flame') {
        P.tick -= dt * rm;
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
        if (wl.max) damageWall(wl, b.dmg);
        if (b.rico > 0) { const px = b.x - b.vx * dt, py = b.y - b.vy * dt; if (px < wl.x - b.r || px > wl.x + wl.w + b.r) b.vx = -b.vx; else b.vy = -b.vy; b.x += b.vx * dt * 2; b.y += b.vy * dt * 2; b.rico--; b.hit.clear(); }
        else { b.dead = true; if (b.boom) boomAt(b); continue; }
      }
      if (b.x < PAD || b.x > RW - PAD) { if (b.rico > 0) { b.vx = -b.vx; b.x = clamp(b.x, PAD, RW - PAD); b.rico--; b.hit.clear(); } else wall = true; }
      if (b.y < TOP || b.y > RH - BOT) { if (b.rico > 0) { b.vy = -b.vy; b.y = clamp(b.y, TOP, RH - BOT); b.rico--; b.hit.clear(); } else wall = true; }
      if (wall) { b.dead = true; if (b.boom) boomAt(b); continue; }
      for (const e of enemies) {
        if (e.spawn > 0 || b.hit.has(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          b.hit.add(e);
          if (b.boom) { boomAt(b); b.dead = true; break; }
          hitEnemy(e, b.dmg, elemOpts(b)); onImpact(b);
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
      if (b.home) { const sp = Math.hypot(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx); let da = Math.atan2(P.y - b.y, P.x - b.x) - cur; da = Math.atan2(Math.sin(da), Math.cos(da)); const na = cur + clamp(da, -dt * b.home, dt * b.home); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; if (Math.random() < 0.5) fx.push({ k: 'p', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, col: '#ffb347' }); }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.it) b.rot += dt * 9;
      if (b.x < 0 || b.x > RW || b.y < 0 || b.y > RH) b.life = 0;
      else if (walls.length) { const wl = inWall(b.x, b.y, b.r); if (wl) { b.life = 0; if (wl.max) damageWall(wl, b.dmg * 0.6); } }
      if (Math.hypot(P.x - b.x, P.y - b.y) < P.r - 2 + b.r && P.inv <= 0) { b.life = 0; hurtPlayer(b.dmg); }
    }
    ebul = ebul.filter(b => b.life > 0);

    // bananas
    for (const p of pickups) {
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; p.vx *= 0.9; p.vy *= 0.9; if (walls.length) pushOut(p, 7);
      const d = Math.hypot(P.x - p.x, P.y - p.y);
      if (d < P.magnet || state === 'clear') { const s = 380 * dt; p.x += (P.x - p.x) / (d || 1) * s; p.y += (P.y - p.y) / (d || 1) * s; }
      if (d < P.r + 8) { p.got = 1; run.ban += p.v; save.ban += p.v; save.stats.coins += p.v; fx.push({ k: 'c', x: p.x, y: p.y - 12, life: 0.7, txt: '+' + p.v }); tone(900, 0.06, 'triangle', 0.04); }
    }
    pickups = pickups.filter(p => !p.got);

    // room cleared
    if (state === 'play' && !queue.length && !enemies.length) { state = 'clear'; clearT = 0; bannerT = 3; ebul = []; hazards = []; mines = []; P.hp = Math.min(P.hpMax, P.hp + P.hpMax * (bossRoom(run.room) ? 0.3 : 0.08));
      { const bonus = Math.round((20 + run.room * 4) * (bossRoom(run.room) ? 6 : 1) * P.bmult); run.ban += bonus; save.ban += bonus; save.stats.coins += bonus; save.stats.rooms++; if (!P.hurtRoom) save.stats.flawless++; clearBonus = bonus; }
      persist(); tone(660, 0.3, 'triangle', 0.07, 400); }
    if (state === 'clear' && P.y < TOP + P.r + 12 && Math.abs(P.x - RW / 2) < 36) { persist(); makeOffer(); state = 'upgrade'; joy.on = false; joy.dx = joy.dy = 0; tone(440, 0.25, 'triangle', 0.06, 300); }
  }
  function boomAt(b) {
    const o = elemOpts(b); delete o.dir;
    blast(b.x, b.y, P.boom, b.dmg, o); onImpact(b);
    for (let i = 0; i < P.cluster * 3; i++) { const a = i / (P.cluster * 3) * 6.28, d = P.boom * 0.9; setTimeout(() => state === 'play' && blast(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, P.boom * 0.5, b.dmg * 0.5, o), 120); }
  }

  // ---------- upgrade offers ----------
  const rarW = u => [50, 28, 14, 6, 2][u.r || 0] * (u.r >= 2 ? 1 + run.room / 18 : 1);
  function hintFor(u) {                                                    // does this piece belong to an evolution?
    if (u.evo) return null;
    for (const e of EVO) if (e.w.includes(P.ch.weapon) && e.need.includes(u.id) && !run.stacks[e.id]) {
      const have = e.need.filter(id => run.stacks[id] > 0 || id === u.id).length;
      return 'Evolves into ' + e.n + ' (' + have + '/' + e.need.length + ')';
    }
    return null;
  }
  function makeOffer() {
    const wk = P.ch.weapon;
    let pool = UPG.filter(u => (u.t === ALL || u.t.includes(wk)) && (run.stacks[u.id] || 0) < u.max);
    const w = u => (u.t === ALL ? 0.55 : 3) * (pen[u.id] || 1) * rarW(u);
    offer = [];
    const ready = EVO.filter(e => e.w.includes(wk) && !run.stacks[e.id] && e.need.every(id => run.stacks[id] > 0));
    if (ready.length) { const e = ready[Math.floor(Math.random() * ready.length)]; offer.push({ id: e.id, n: e.n, d: e.d, t: e.w, max: 1, r: 4, evo: true, f: e.f }); }
    while (offer.length < 3 && pool.length) {
      const tot = pool.reduce((a, u) => a + w(u), 0);
      let r = Math.random() * tot, pick = pool[0];
      for (const u of pool) { r -= w(u); if (r <= 0) { pick = u; break; } }
      offer.push(pick); pool = pool.filter(u => u !== pick);
    }
  }
  function choose(u) {
    for (const o of offer) if (o !== u && !o.evo) pen[o.id] = (pen[o.id] || 1) * (o.t === ALL ? 0.2 : 0.7);   // passed-over picks fade, weapon ones fade less
    run.stacks[u.id] = (run.stacks[u.id] || 0) + 1;
    u.f(P); tone(u.evo ? 330 : 520, u.evo ? 0.6 : 0.2, 'triangle', 0.07, 500);
    if (u.evo) { save.stats.evos++; flash = 0.4; msg = { t: 2, s: u.n.toUpperCase() + '!' }; }
    run.room++; startRoom(); state = 'play';
  }

  // ---------- input ----------
  const toLogical = e => ({ x: e.clientX / S, y: e.clientY / S });
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
    if (ac && ac.state === 'suspended') ac.resume();
    musicSync();
    const { x, y } = toLogical(e);
    for (let i = btns.length - 1; i >= 0; i--) { const b = btns[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.cb(); return; } }
    if ((state === 'play' || state === 'clear') && !joy.on) {
      const tn = performance.now(); joy.dbl = tn - (joy.lastT || 0) < 280 && Math.hypot(x - (joy.lastX || 0), y - (joy.lastY || 0)) < 70; joy.lastT = tn; joy.lastX = x; joy.lastY = y; joy.t0 = tn; joy.dashed = false;
      joy.on = true; joy.id = e.pointerId; joy.ox = joy.x = x; joy.oy = joy.y = y; joy.dx = joy.dy = 0;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!joy.on || e.pointerId !== joy.id) return;
    const { x, y } = toLogical(e);
    let dx = x - joy.ox, dy = y - joy.oy; const d = Math.hypot(dx, dy), R = 58;
    if (d > R) { joy.ox += dx / d * (d - R); joy.oy += dy / d * (d - R); dx = x - joy.ox; dy = y - joy.oy; }   // stick follows the thumb
    joy.x = x; joy.y = y; joy.dx = clamp(dx / R, -1, 1); joy.dy = clamp(dy / R, -1, 1);
    const tn = performance.now(); (joy.hist = joy.hist || []).push([x, y, tn]); while (joy.hist.length > 1 && tn - joy.hist[0][2] > 90) joy.hist.shift();
    if (state === 'play' || state === 'clear') {                                 // quick swipe of the stick in any direction dashes that way
      const h0 = joy.hist[0], mx = x - h0[0], my = y - h0[1], md = Math.hypot(mx, my);
      if (md > 28 && tn - h0[2] > 0 && md / (tn - h0[2]) > 0.8 && tn - (joy.lastDash || 0) > 200) {
        const sm = Math.hypot(joy.dx, joy.dy);                                    // only a swipe that pushes the stick the way it's already pointing counts, so easing back to centre never dashes backwards
        if (sm > 0.15 && (mx * joy.dx + my * joy.dy) / (md * sm) > 0.7) { joy.lastDash = tn; joy.hist.length = 0; tryDash(joy.dx, joy.dy); }
      }
    }
  });
  const up = e => { if (joy.on && e.pointerId === joy.id) { joy.on = false; joy.dx = joy.dy = 0; } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); musicSync(); });
  addEventListener('keydown', e => { if (e.key === ' ' && state === 'play') { tryDash((keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0)); e.preventDefault(); } if (e.key === 'p' || e.key === 'Escape') { if (state === 'pause') state = prevState; else pauseGame(); } keys[e.key] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); });
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
  const INK = '#1b1210';
  function ball(x, y, r, col, sx = 1, sy = 1, rim = -0.5) {          // flat vector shape: one fill, a soft shadow side, a thin outline
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
    ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-r * 0.06, -r * 0.08, r * 0.92, 0, 6.28); ctx.fill();
    if (r > 2.5) { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.05); ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.stroke(); }
    ctx.restore();
  }
  function shadow(x, y, rx, ry) { ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.28); ctx.fill(); }
  function coinArt(x, y, r) {                                         // Ape Coin
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#e8b93c'); g.addColorStop(1, '#8a5f12');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
    ctx.strokeStyle = 'rgba(90,55,5,.7)'; ctx.lineWidth = Math.max(1, r * 0.14); ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, 6.28); ctx.stroke();
    ctx.fillStyle = 'rgba(90,55,5,.75)'; ctx.beginPath(); ctx.arc(x, y + r * 0.08, r * 0.3, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.22, r * 0.14, 0, 6.28); ctx.arc(x + r * 0.3, y - r * 0.22, r * 0.14, 0, 6.28); ctx.fill();
  }
  const cglow = () => {};
  const rglow = () => {};                                              // rooms do not glow either                                              // characters and Opps do not glow
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

  function drawApe(g, x, y, r, ch, aim, bob = 0, walk = 0, mv = 0, swing = 0, bust = false, face = null) {
    const sv = ctx; sv.save(); sv.translate(x, y + bob + Math.abs(Math.sin(walk)) * r * 0.1 * mv);
    const fur = ch.fur, skin = ch.skin, dark = shade(fur, -0.25);
    const hasAim = aim != null, w = ch.weapon;
    const chestY = r * 1.15, two = w === 'shotgun' || w === 'rocket' || w === 'flame' || w === 'tommy' || w === 'cannon' || w === 'plasma';
    const cloth = ch.cloth || fur, pants = shade(cloth, -0.35);
    if (!bust) shadow(0, r * 2.7, r * 1.1, r * 0.32);
    // legs: swing while moving, planted when still
    if (!bust) for (const sx of [-1, 1]) {
      const sw = Math.sin(walk + (sx > 0 ? Math.PI : 0)) * mv, hipX = sx * r * 0.34, hipY = r * 1.75;
      const kx = hipX + sx * r * 0.08, ky = hipY + r * 0.45, fx = hipX + sw * r * 0.2, fy = r * 2.55 - Math.max(0, sw) * r * 0.2;
      sv.lineCap = 'round'; sv.strokeStyle = INK; sv.lineWidth = r * 0.62;
      sv.beginPath(); sv.moveTo(hipX, hipY); sv.lineTo(kx, ky); sv.lineTo(fx, fy); sv.stroke();
      sv.strokeStyle = pants; sv.lineWidth = r * 0.46; sv.beginPath(); sv.moveTo(hipX, hipY); sv.lineTo(kx, ky); sv.lineTo(fx, fy); sv.stroke();
      ball(fx + sx * r * 0.08, fy + r * 0.05, r * 0.34, skin, 1.2, 0.7);                // foot
    }
    if (!bust) ball(0, chestY + r * 0.35, r * 0.64, pants, 1, 0.9, -0.3);                                  // hips
    // back arm swings at the side when it isn't holding anything
    const arm = (sx, hx, hy) => {
      const shx = sx * r * 0.68, shy = chestY - r * 0.1;
      sv.lineCap = 'round'; sv.strokeStyle = INK; sv.lineWidth = r * 0.56; sv.beginPath(); sv.moveTo(shx, shy); sv.lineTo(hx, hy); sv.stroke();
      sv.strokeStyle = cloth; sv.lineWidth = r * 0.4; sv.beginPath(); sv.moveTo(shx, shy); sv.lineTo(hx, hy); sv.stroke();
      ball(hx, hy, r * 0.27, skin);
    };
    const ca = hasAim ? Math.cos(aim) : 0, sa = hasAim ? Math.sin(aim) : -1;
    const grip = d => [ca * d, chestY + sa * d];                                            // points along the aim line from the chest
    const gripL = grip(r * 0.7), gripR = grip(r * 1.3);
    if (!bust && !(hasAim && w !== 'laser')) arm(-1, -r * 0.85 + Math.sin(walk) * r * 0.3 * mv, chestY + r * 0.85);
    ball(0, chestY, r * 0.95, cloth, 0.84, 1.0, -0.28);                                // torso in the monkey's outfit
    sv.fillStyle = skin; sv.beginPath(); sv.moveTo(-r * 0.3, chestY - r * 0.82); sv.lineTo(r * 0.3, chestY - r * 0.82); sv.lineTo(0, chestY - r * 0.3); sv.closePath(); sv.fill(); sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.06); sv.stroke();
    { const tee = hasAim && (face != null ? Math.sin(face) : sa) < -0.3 && !bust ? 'plain' : (ch.tee || 'plain'), cy2 = chestY + r * 0.12;
      sv.save(); sv.beginPath(); sv.ellipse(0, chestY, r * 0.9, r * 0.92, 0, 0, 6.28); sv.clip();
      if (tee === 'stripes') { sv.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 4; i++) sv.fillRect(-r * 1.2, chestY - r * 0.1 + i * r * 0.26, r * 2.4, r * 0.12); }
      else if (tee === 'skull') { sv.fillStyle = '#f2efe6'; sv.beginPath(); sv.arc(0, cy2 + r * 0.05, r * 0.26, 0, 6.28); sv.fill(); sv.fillRect(-r * 0.14, cy2 + r * 0.2, r * 0.28, r * 0.16); sv.fillStyle = cloth; sv.beginPath(); sv.arc(-r * 0.1, cy2, r * 0.06, 0, 6.28); sv.arc(r * 0.1, cy2, r * 0.06, 0, 6.28); sv.fill(); }
      else if (tee === 'flag') { sv.fillStyle = '#e0e6f2'; sv.fillRect(-r * 0.5, cy2 - r * 0.2, r, r * 0.55); sv.fillStyle = '#c0392b'; for (let i = 0; i < 3; i++) sv.fillRect(-r * 0.5, cy2 - r * 0.2 + i * r * 0.22, r, r * 0.1); sv.fillStyle = '#2a3f8f'; sv.fillRect(-r * 0.5, cy2 - r * 0.2, r * 0.4, r * 0.3); }
      else if (tee === 'vest') { sv.strokeStyle = 'rgba(0,0,0,.45)'; sv.lineWidth = r * 0.12; sv.beginPath(); sv.moveTo(-r * 0.55, chestY - r * 0.8); sv.lineTo(-r * 0.3, chestY + r * 0.9); sv.moveTo(r * 0.55, chestY - r * 0.8); sv.lineTo(r * 0.3, chestY + r * 0.9); sv.stroke(); sv.fillStyle = 'rgba(0,0,0,.3)'; sv.fillRect(-r * 0.5, cy2 + r * 0.1, r * 0.3, r * 0.3); sv.fillRect(r * 0.2, cy2 + r * 0.1, r * 0.3, r * 0.3); }
      else if (tee === 'collar') { sv.fillStyle = '#f2efe6'; sv.beginPath(); sv.moveTo(-r * 0.4, chestY - r * 0.85); sv.lineTo(0, chestY - r * 0.25); sv.lineTo(-r * 0.05, chestY - r * 0.95); sv.fill(); sv.beginPath(); sv.moveTo(r * 0.4, chestY - r * 0.85); sv.lineTo(0, chestY - r * 0.25); sv.lineTo(r * 0.05, chestY - r * 0.95); sv.fill(); sv.fillStyle = '#c0392b'; sv.beginPath(); sv.moveTo(0, chestY - r * 0.3); sv.lineTo(-r * 0.1, chestY + r * 0.2); sv.lineTo(r * 0.1, chestY + r * 0.2); sv.fill(); }
      else if (tee === 'dots') { sv.fillStyle = 'rgba(255,255,255,.4)'; for (let i = -2; i <= 2; i++) for (let j = 0; j < 3; j++) { sv.beginPath(); sv.arc(i * r * 0.3 + (j % 2) * r * 0.15, chestY - r * 0.1 + j * r * 0.3, r * 0.06, 0, 6.28); sv.fill(); } }
      else if (tee === 'cyber') { sv.fillStyle = '#0c0c12'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); sv.strokeStyle = '#d93030'; sv.lineWidth = r * 0.09; sv.beginPath(); sv.moveTo(-r * 0.95, chestY - r * 0.4); sv.lineTo(-r * 0.4, chestY - r * 0.1); sv.lineTo(-r * 0.3, chestY + r * 0.7); sv.moveTo(r * 0.95, chestY - r * 0.4); sv.lineTo(r * 0.4, chestY - r * 0.1); sv.lineTo(r * 0.3, chestY + r * 0.7); sv.stroke(); sv.fillStyle = '#ff5a4a'; sv.fillRect(-r * 0.7, chestY + r * 0.25, r * 0.22, r * 0.08); sv.fillRect(r * 0.48, chestY + r * 0.25, r * 0.22, r * 0.08); sv.fillStyle = '#2a2a34'; sv.fillRect(-r * 0.25, chestY - r * 0.1, r * 0.5, r * 0.5); }
      else if (tee === 'camo') { sv.fillStyle = '#3c4a28'; for (let i = 0; i < 9; i++) { sv.beginPath(); sv.ellipse(((i * 37) % 21 - 10) * r * 0.1, chestY + ((i * 23) % 17 - 8) * r * 0.1, r * 0.3, r * 0.17, i, 0, 6.28); sv.fill(); } sv.fillStyle = '#6a7a3a'; for (let i = 0; i < 6; i++) { sv.beginPath(); sv.ellipse(((i * 29) % 19 - 9) * r * 0.11, chestY + ((i * 31) % 15 - 7) * r * 0.1, r * 0.2, r * 0.12, i * 2, 0, 6.28); sv.fill(); } sv.strokeStyle = '#17170f'; sv.lineWidth = r * 0.15; sv.beginPath(); sv.moveTo(-r * 0.6, chestY - r * 0.8); sv.lineTo(-r * 0.4, chestY + r * 0.9); sv.moveTo(r * 0.6, chestY - r * 0.8); sv.lineTo(r * 0.4, chestY + r * 0.9); sv.stroke(); sv.fillStyle = '#2a2a24'; sv.fillRect(-r * 0.7, chestY, r * 0.3, r * 0.22); sv.fillRect(r * 0.4, chestY, r * 0.3, r * 0.22); }
      else if (tee === 'flame') { sv.fillStyle = '#17110e'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); const ft = performance.now() / 160; for (let i = -4; i <= 4; i++) { const h = r * (0.35 + 0.2 * Math.sin(ft + i * 1.7)); sv.fillStyle = i % 2 ? '#ff8a1a' : '#ffd34d'; sv.beginPath(); sv.moveTo(i * r * 0.26 - r * 0.14, chestY + r * 0.95); sv.quadraticCurveTo(i * r * 0.26 - r * 0.05, chestY + r * 0.95 - h, i * r * 0.26, chestY + r * 0.95 - h * 1.5); sv.quadraticCurveTo(i * r * 0.26 + r * 0.08, chestY + r * 0.95 - h * 0.5, i * r * 0.26 + r * 0.14, chestY + r * 0.95); sv.fill(); } sv.fillStyle = '#ffb347'; sv.beginPath(); sv.moveTo(-r * 0.3, chestY - r * 0.6); sv.lineTo(0, chestY + r * 0.4); sv.lineTo(r * 0.3, chestY - r * 0.6); sv.fill(); }
      else if (tee === 'furcoat') { sv.fillStyle = '#2f5a92'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); sv.strokeStyle = '#1a2f50'; sv.lineWidth = r * 0.06; sv.beginPath(); sv.moveTo(0, chestY - r * 0.2); sv.lineTo(0, chestY + r * 0.9); sv.stroke(); sv.fillStyle = '#f4f8fc'; for (let i = -4; i <= 4; i++) { sv.beginPath(); sv.arc(i * r * 0.26, chestY - r * 0.55 + Math.abs(i) * r * 0.06, r * 0.2, 0, 6.28); sv.fill(); } for (let i = -3; i <= 3; i++) { sv.beginPath(); sv.arc(i * r * 0.3, chestY - r * 0.3 + Math.abs(i) * r * 0.1, r * 0.15, 0, 6.28); sv.fill(); } }
      else if (tee === 'toxic') { sv.fillStyle = '#10140e'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); for (const sg of [-1, 1]) { sv.fillStyle = '#7cdc2a'; rr(sg * r * 0.78 - r * 0.2, chestY - r * 0.55, r * 0.4, r * 0.85, r * 0.12); sv.fill(); sv.fillStyle = '#c8ff7a'; sv.fillRect(sg * r * 0.78 - r * 0.05, chestY - r * 0.4, r * 0.1, r * 0.5); } sv.strokeStyle = '#2a3a22'; sv.lineWidth = r * 0.14; sv.beginPath(); sv.moveTo(-r * 0.5, chestY - r * 0.7); sv.lineTo(r * 0.4, chestY + r * 0.9); sv.stroke(); }
      else if (tee === 'voltJ') { sv.fillStyle = '#0c1220'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); sv.strokeStyle = '#46c8ff'; sv.lineWidth = r * 0.09; sv.beginPath(); sv.moveTo(-r * 0.9, chestY - r * 0.5); sv.lineTo(-r * 0.3, chestY - r * 0.1); sv.lineTo(-r * 0.2, chestY + r * 0.9); sv.moveTo(r * 0.9, chestY - r * 0.5); sv.lineTo(r * 0.3, chestY - r * 0.1); sv.lineTo(r * 0.2, chestY + r * 0.9); sv.stroke(); sv.fillStyle = '#d9a74a'; sv.beginPath(); sv.moveTo(-r * 0.12, chestY + r * 0.2); sv.lineTo(0, chestY + r * 0.05); sv.lineTo(r * 0.12, chestY + r * 0.2); sv.lineTo(0, chestY + r * 0.35); sv.fill(); }
      else if (tee === 'ninja') { sv.fillStyle = '#14142a'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); sv.strokeStyle = '#0a0a16'; sv.lineWidth = r * 0.3; sv.beginPath(); sv.moveTo(-r * 0.9, chestY - r * 0.7); sv.lineTo(r * 0.7, chestY + r * 0.8); sv.moveTo(r * 0.9, chestY - r * 0.7); sv.lineTo(-r * 0.7, chestY + r * 0.8); sv.stroke(); sv.fillStyle = '#d9a74a'; sv.fillRect(-r * 0.12, chestY + r * 0.05, r * 0.24, r * 0.2); sv.fillRect(-r * 0.7, chestY + r * 0.55, r * 0.2, r * 0.14); }
      else if (tee === 'armor') { sv.fillStyle = '#566e30'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); sv.fillStyle = '#6a8238'; rr(-r * 0.6, chestY - r * 0.5, r * 1.2, r * 1.2, r * 0.1); sv.fill(); sv.strokeStyle = 'rgba(0,0,0,.4)'; sv.lineWidth = 1; sv.stroke(); sv.strokeStyle = '#1c1c14'; sv.lineWidth = r * 0.2; sv.beginPath(); sv.moveTo(-r * 0.9, chestY - r * 0.5); sv.lineTo(r * 0.8, chestY + r * 0.8); sv.stroke(); for (let i = 0; i < 6; i++) { const t = i / 5, x = -r * 0.9 + t * r * 1.7, y = chestY - r * 0.5 + t * r * 1.3; sv.fillStyle = '#d9a83a'; sv.fillRect(x - r * 0.06, y - r * 0.13, r * 0.12, r * 0.26); } }
      else if (tee === 'neon') { sv.fillStyle = '#120e24'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); sv.strokeStyle = '#d24aff'; sv.lineWidth = r * 0.08; sv.beginPath(); sv.moveTo(-r * 0.95, chestY - r * 0.3); sv.lineTo(-r * 0.35, chestY - r * 0.05); sv.lineTo(-r * 0.3, chestY + r * 0.8); sv.moveTo(r * 0.95, chestY - r * 0.3); sv.lineTo(r * 0.35, chestY - r * 0.05); sv.lineTo(r * 0.3, chestY + r * 0.8); sv.stroke(); sv.beginPath(); sv.arc(-r * 0.55, chestY + r * 0.45, r * 0.16, 0, 6.28); sv.stroke(); sv.fillStyle = '#b8e4ff'; sv.fillRect(-r * 0.2, chestY - r * 0.7, r * 0.4, r * 0.5); }
      else if (tee === 'punk') { sv.fillStyle = '#17121a'; sv.fillRect(-r * 1.2, chestY - r, r * 2.4, r * 2); sv.fillStyle = '#d9d2c4'; for (let i = -4; i <= 4; i++) { sv.beginPath(); sv.arc(i * r * 0.26, chestY - r * 0.55 + Math.abs(i) * r * 0.07, r * 0.19, 0, 6.28); sv.fill(); } sv.fillStyle = '#9aa0aa'; for (let i = -3; i <= 3; i++) { sv.beginPath(); sv.moveTo(i * r * 0.3 - r * 0.05, chestY - r * 0.3 + Math.abs(i) * r * 0.1); sv.lineTo(i * r * 0.3, chestY - r * 0.55 + Math.abs(i) * r * 0.1); sv.lineTo(i * r * 0.3 + r * 0.05, chestY - r * 0.3 + Math.abs(i) * r * 0.1); sv.fill(); } sv.strokeStyle = '#8a8f9a'; sv.lineWidth = r * 0.05; sv.beginPath(); sv.arc(0, chestY - r * 0.1, r * 0.4, 0.2, 2.9); sv.stroke(); }
      sv.restore();
      sv.strokeStyle = 'rgba(0,0,0,.28)'; sv.lineWidth = Math.max(1, r * 0.05); sv.beginPath(); sv.moveTo(0, chestY - r * 0.3); sv.lineTo(0, chestY + r * 0.75); sv.stroke(); }
    if (!bust && hasAim && w !== 'laser') {                                                         // weapon, then hands on it
      sv.save(); sv.translate(0, chestY); sv.rotate(aim + (w === 'blade' ? swing : 0));
      const bar = (x0, h, w0, c) => { const gr = sv.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, shade(c, 0.35)); gr.addColorStop(1, shade(c, -0.45)); sv.fillStyle = gr; sv.fillRect(x0, -h / 2, w0, h); };
      if (w === 'gun') { bar(r * 0.55, 6, r * 1.0, '#b9bdca'); bar(r * 0.5, 9, r * 0.4, '#3a3d4a'); }
      else if (w === 'shotgun') { bar(r * 0.3, 8, r * 1.5, '#8a8f9c'); bar(r * 0.3, 9, r * 0.5, '#7a4a22'); bar(r * 1.7, 5, r * 0.15, '#222'); }
      else if (w === 'flame') { bar(r * 0.4, 8, r * 1.2, '#9aa0aa'); bar(r * 0.6, 11, r * 0.4, '#c44'); bar(r * 1.6, 10, 5, '#ff8a2a'); }
      else if (w === 'rocket') { bar(r * 0.2, 13, r * 1.5, '#5d6470'); bar(r * 1.7, 13, 5, '#ff5a5a'); bar(r * 0.2, 15, r * 0.25, '#2d3340'); }
      else if (w === 'zap') { bar(r * 0.2, 4, r * 1.6, '#8a5a2b'); ball(r * 1.9, 0, 5, '#7df9ff'); }
      else if (w === 'tommy') { bar(r * 0.1, 8, r * 1.6, '#2c2f3a'); bar(-r * 0.3, 9, r * 0.45, '#7a4a22'); ball(r * 0.85, r * 0.36, r * 0.3, '#3a3d4a'); bar(r * 1.65, 5, r * 0.25, '#15171d'); }
      else if (w === 'fire') { bar(r * 0.3, 9, r * 0.9, '#6b3a1a'); bar(r * 1.1, 12, r * 0.25, '#2a1608'); glowAt(r * 1.5, 0, r * 1.3, '#ff8a2a', 0.8); sv.fillStyle = '#ffd34d'; sv.beginPath(); sv.arc(r * 1.45, 0, r * 0.2, 0, 6.28); sv.fill(); }
      else if (w === 'ice') { bar(r * 0.3, 7, r * 0.8, '#5a7a90'); sv.fillStyle = '#d9f4ff'; sv.beginPath(); sv.moveTo(r * 1.0, -r * 0.3); sv.lineTo(r * 1.8, 0); sv.lineTo(r * 1.0, r * 0.3); sv.closePath(); sv.fill(); glowAt(r * 1.4, 0, r * 1.2, '#8fe3ff', 0.7); }
      else if (w === 'poison') { bar(r * 0.3, 8, r * 1.0, '#3a4a2a'); ball(r * 0.95, r * 0.28, r * 0.3, '#8bff5a', 1, 1, -0.3); glowAt(r * 0.95, r * 0.28, r * 0.9, '#8bff5a', 0.6); bar(r * 1.3, 5, r * 0.4, '#222'); }
      else if (w === 'plasma') { bar(r * 0.2, 9, r * 1.5, '#4a3a7a'); sv.fillStyle = '#ff6bf0'; sv.fillRect(r * 0.5, -2, r * 0.9, 4); glowAt(r * 1.1, 0, r * 1.4, '#ff6bf0', 0.7); bar(r * 1.7, 7, r * 0.2, '#1b1130'); }
      else if (w === 'shadow') { sv.fillStyle = '#a58bff'; sv.beginPath(); sv.moveTo(r * 0.7, -r * 0.12); sv.lineTo(r * 1.8, 0); sv.lineTo(r * 0.7, r * 0.12); sv.closePath(); sv.fill(); sv.fillStyle = '#16101f'; sv.fillRect(r * 0.45, -r * 0.1, r * 0.3, r * 0.2); glowAt(r * 1.3, 0, r * 1.1, '#9b7bff', 0.6); }
      else if (w === 'cannon') { bar(r * 0.1, 16, r * 1.6, '#4e5440'); bar(r * 1.7, 20, r * 0.25, '#222'); bar(r * 0.1, 18, r * 0.35, '#2c3024'); }
      else if (w === 'chaos') { ball(r * 1.1, 0, r * 0.42, '#ffffff', 1, 1, -0.2); for (let i = 0; i < 5; i++) { const an = performance.now() / 300 + i * 1.256; glowAt(r * 1.1 + Math.cos(an) * r * 0.5, Math.sin(an) * r * 0.5, r * 0.8, ['#ff8a2a', '#8fe3ff', '#8bff5a', '#7df9ff', '#ff6bf0'][i], 0.8); } }
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
    } else if (!bust && hasAim && w === 'laser') arm(1, r * 0.85 - Math.sin(walk) * r * 0.3 * mv, chestY + r * 0.85);
    // head
    sv.save(); sv.translate(0, 0);
    // face: flat-coloured ape with a heavy brow, sleepy sunken eyes, a long muzzle and big lips
    const sk2 = shade(skin, 0.08), dk = shade(fur, -0.38), mouth = ch.mouth || 'flat';
    ball(-r * 1.0, r * 0.02, r * 0.3, fur); ball(r * 1.0, r * 0.02, r * 0.3, fur);
    ball(-r * 1.0, r * 0.02, r * 0.17, shade(skin, -0.15)); ball(r * 1.0, r * 0.02, r * 0.17, shade(skin, -0.15));
    if (ch.ring) { sv.strokeStyle = '#ffd34d'; sv.lineWidth = Math.max(1.4, r * 0.07); sv.beginPath(); sv.arc(-r * 1.2, r * 0.3, r * 0.12, 0, 6.28); sv.stroke(); }
    ball(0, -r * 0.02, r, fur, 1.04, 1.04);                                                // head
    sv.save(); sv.beginPath(); sv.arc(0, 0, r, 0, 6.28); sv.clip(); furTexture(r, fur, ch.name.length * 31);
    if (ch.spots) { sv.fillStyle = 'rgba(40,24,6,.55)'; const rs = seeded(ch.name.length * 13); for (let i = 0; i < 9; i++) { sv.beginPath(); sv.ellipse(Math.cos(rs() * 6.28) * r * 0.75, Math.sin(rs() * 6.28) * r * 0.75, r * 0.1, r * 0.07, rs() * 3, 0, 6.28); sv.fill(); } }
    sv.restore();
    sv.fillStyle = dk; for (let i = -2; i <= 2; i++) { sv.beginPath(); sv.moveTo(i * r * 0.2 - r * 0.1, -r * 0.88); sv.lineTo(i * r * 0.22, -r * (1.18 - Math.abs(i) * 0.07)); sv.lineTo(i * r * 0.2 + r * 0.1, -r * 0.88); sv.fill(); }   // forelock
    ball(0, r * 0.06, r * 0.74, skin, 1.02, 0.8);                                         // pale face mask around the eyes
    ball(0, r * 0.56, r * 0.58, sk2, 1, 0.82);                                            // big protruding muzzle
    sv.strokeStyle = dk; sv.lineWidth = r * 0.2; sv.lineCap = 'round'; sv.beginPath(); sv.moveTo(-r * 0.58, -r * 0.2); sv.quadraticCurveTo(0, -r * 0.4, r * 0.58, -r * 0.2); sv.stroke();   // heavy brow
    sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.05); sv.beginPath(); sv.moveTo(-r * 0.6, -r * 0.12); sv.quadraticCurveTo(0, -r * 0.3, r * 0.6, -r * 0.12); sv.stroke();
    const lx = hasAim ? Math.cos(aim) * r * 0.06 : 0, ly = hasAim ? Math.sin(aim) * r * 0.05 : 0;
    for (const sx of [-1, 1]) {                                                           // sleepy eyes
      const ex = sx * r * 0.28, ey = -r * 0.02;
      sv.fillStyle = '#f4efe0'; sv.beginPath(); sv.ellipse(ex, ey, r * 0.19, r * 0.15, 0, 0, 6.28); sv.fill(); sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.05); sv.stroke();
      sv.fillStyle = '#5a2c10'; sv.beginPath(); sv.arc(ex + lx, ey + r * 0.03 + ly, r * 0.1, 0, 6.28); sv.fill();
      sv.fillStyle = '#080402'; sv.beginPath(); sv.arc(ex + lx, ey + r * 0.03 + ly, r * 0.055, 0, 6.28); sv.fill();
      sv.fillStyle = '#fff'; sv.beginPath(); sv.arc(ex + lx - r * 0.03, ey + ly, r * 0.025, 0, 6.28); sv.fill();
      sv.fillStyle = shade(fur, -0.12); sv.beginPath(); sv.moveTo(ex - r * 0.21, ey + r * 0.02); sv.quadraticCurveTo(ex, ey - r * 0.3, ex + r * 0.21, ey + r * 0.02); sv.lineTo(ex + r * 0.21, ey - r * 0.04); sv.quadraticCurveTo(ex, ey - r * 0.2, ex - r * 0.21, ey - r * 0.04); sv.closePath(); sv.fill();       // droopy lid
      sv.fillStyle = shade(fur, -0.1); sv.beginPath(); sv.ellipse(ex, ey - r * 0.1, r * 0.2, r * 0.1, 0, Math.PI, 0); sv.fill(); sv.strokeStyle = INK; sv.beginPath(); sv.moveTo(ex - r * 0.2, ey - r * 0.01); sv.lineTo(ex + r * 0.2, ey - r * 0.01); sv.stroke();
      sv.strokeStyle = 'rgba(40,20,10,.55)'; sv.lineWidth = Math.max(1, r * 0.04); sv.beginPath(); sv.arc(ex, ey + r * 0.08, r * 0.2, 0.25, 2.9); sv.stroke();        // eye bag
    }
    sv.fillStyle = 'rgba(30,15,8,.85)'; sv.beginPath(); sv.ellipse(-r * 0.1, r * 0.4, r * 0.045, r * 0.06, 0, 0, 6.28); sv.ellipse(r * 0.1, r * 0.4, r * 0.045, r * 0.06, 0, 0, 6.28); sv.fill();   // nostrils
    sv.lineCap = 'round'; sv.strokeStyle = INK; sv.lineWidth = Math.max(1.2, r * 0.06);
    if (mouth === 'grin' || mouth === 'open') {                                           // teeth showing
      sv.fillStyle = mouth === 'open' ? '#3a1210' : '#f7f2e4'; sv.beginPath(); sv.ellipse(0, r * 0.68, r * 0.34, mouth === 'open' ? r * 0.15 : r * 0.1, 0, 0, 6.28); sv.fill(); sv.stroke();
      if (mouth === 'grin') { sv.strokeStyle = 'rgba(0,0,0,.5)'; sv.lineWidth = 1; sv.beginPath(); for (let i = -2; i <= 2; i++) { sv.moveTo(i * r * 0.12, r * 0.6); sv.lineTo(i * r * 0.12, r * 0.76); } sv.stroke(); }
      else { sv.fillStyle = '#e8737a'; sv.beginPath(); sv.ellipse(0, r * 0.73, r * 0.14, r * 0.06, 0, 0, 6.28); sv.fill(); }
    } else {
      sv.fillStyle = '#d98a86'; sv.beginPath(); sv.ellipse(0, r * 0.74, r * 0.3, r * 0.09, 0, 0, 6.28); sv.fill(); sv.stroke();                      // lower lip
      sv.beginPath(); sv.moveTo(-r * 0.36, r * 0.64); sv.quadraticCurveTo(0, r * (mouth === 'smirk' ? 0.6 : 0.68), r * 0.36, r * (mouth === 'smirk' ? 0.56 : 0.64)); sv.stroke();   // upper lip line
    }
    if (ch.held && ch.held !== 'cigar') {
      sv.save(); sv.translate(r * 0.22, r * 0.66); sv.lineCap = 'round';
      if (ch.held === 'pipe') { sv.strokeStyle = INK; sv.lineWidth = r * 0.14; sv.beginPath(); sv.moveTo(0, 0); sv.lineTo(r * 0.5, r * 0.1); sv.stroke(); sv.strokeStyle = '#8a5a2b'; sv.lineWidth = r * 0.08; sv.stroke(); ball(r * 0.6, -r * 0.05, r * 0.2, '#6b4220', 1, 1.1); glowAt(r * 0.6, -r * 0.2, r * 0.5, '#ff9a3a', 0.5); }
      else if (ch.held === 'cig') { sv.rotate(-0.15); sv.fillStyle = '#f2efe6'; sv.fillRect(0, -r * 0.04, r * 0.62, r * 0.08); sv.strokeStyle = INK; sv.lineWidth = 1; sv.strokeRect(0, -r * 0.04, r * 0.62, r * 0.08); sv.fillStyle = '#e8873a'; sv.fillRect(r * 0.62, -r * 0.04, r * 0.06, r * 0.08); glowAt(r * 0.68, 0, r * 0.4, '#ff7a2a', 0.8); const tn2 = performance.now() / 1000; for (let i = 0; i < 3; i++) { const u = (tn2 * 0.6 + i * 0.33) % 1; sv.fillStyle = `rgba(220,220,230,${0.35 * (1 - u)})`; sv.beginPath(); sv.arc(r * 0.7 + Math.sin(u * 5 + i) * r * 0.12, -u * r * 0.9, r * (0.05 + u * 0.12), 0, 6.28); sv.fill(); } }
      else if (ch.held === 'gum') { sv.translate(-r * 0.22, -r * 0.02); sv.fillStyle = '#ff8fcf'; sv.beginPath(); sv.arc(0, r * 0.1, r * (0.2 + 0.05 * Math.sin(performance.now() / 300)), 0, 6.28); sv.fill(); sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.04); sv.stroke(); sv.fillStyle = 'rgba(255,255,255,.5)'; sv.beginPath(); sv.arc(-r * 0.06, r * 0.04, r * 0.06, 0, 6.28); sv.fill(); }
      else if (ch.held === 'pick') { sv.strokeStyle = '#d9b46a'; sv.lineWidth = r * 0.05; sv.beginPath(); sv.moveTo(0, 0); sv.lineTo(r * 0.5, -r * 0.14); sv.stroke(); }
      sv.restore();
    }
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
    const fsa = face != null ? Math.sin(face) : sa, back = !bust && hasAim && fsa < -0.3;                                              // aiming up the screen: the monkey turns its back to us and faces the opps
    if (back) {
      ball(0, -r * 0.02, r * 1.0, fur, 1.04, 1.04);
      sv.save(); sv.beginPath(); sv.arc(0, 0, r * 0.98, 0, 6.28); sv.clip(); furTexture(r, fur, ch.name.length * 31); sv.restore();
      sv.fillStyle = dk; sv.beginPath(); sv.ellipse(0, r * 0.52, r * 0.62, r * 0.26, 0, 0, Math.PI); sv.fill();                // nape
      sv.strokeStyle = 'rgba(0,0,0,.25)'; sv.lineWidth = Math.max(1, r * 0.05); sv.beginPath(); sv.moveTo(0, -r * 0.85); sv.lineTo(0, r * 0.4); sv.stroke();
    }
    const acc = back && ['gasmask', 'visor', 'cyber', 'scar', 'phones', 'cyberRed', 'cyberPurple', 'toxicMask', 'beret', 'iceHair'].includes(ch.acc) ? null : ch.acc;
    if (acc === 'phones') { sv.strokeStyle = '#1b1b24'; sv.lineWidth = r * 0.2; sv.lineCap = 'round'; sv.beginPath(); sv.arc(0, -r * 0.05, r * 1.04, Math.PI * 1.05, Math.PI * 1.95); sv.stroke(); ball(-r * 1.02, -r * 0.02, r * 0.32, '#ff4fd8'); ball(r * 1.02, -r * 0.02, r * 0.32, '#ff4fd8'); sv.fillStyle = '#5ef2ff'; sv.fillRect(-r * 0.62, -r * 0.3, r * 1.24, r * 0.2); sv.fillStyle = 'rgba(255,255,255,.5)'; sv.fillRect(-r * 0.55, -r * 0.27, r * 0.4, r * 0.04); }
    else if (acc === 'beanie') { ball(0, -r * 0.58, r * 0.98, '#7fc8e8', 1, 0.72, -0.4); sv.fillStyle = '#eaf9ff'; sv.fillRect(-r * 1.0, -r * 0.62, r * 2, r * 0.2); ball(0, -r * 1.2, r * 0.22, '#ffffff'); }
    else if (acc === 'gasmask') { ball(0, r * 0.42, r * 0.62, '#4a5160', 1, 0.78, -0.4); ball(-r * 0.52, r * 0.5, r * 0.2, '#2c303a'); ball(r * 0.52, r * 0.5, r * 0.2, '#2c303a'); sv.strokeStyle = '#8bff5a'; sv.lineWidth = Math.max(1.5, r * 0.07); for (const sx of [-1, 1]) { sv.beginPath(); sv.arc(sx * r * 0.3, -r * 0.1, r * 0.24, 0, 6.28); sv.stroke(); sv.fillStyle = 'rgba(139,255,90,.25)'; sv.fill(); } sv.fillStyle = '#2c303a'; sv.fillRect(-r * 0.98, -r * 0.5, r * 1.96, r * 0.12); }
    else if (acc === 'spikes') { sv.fillStyle = '#fff27a'; for (let i = -2; i <= 2; i++) { sv.beginPath(); sv.moveTo(i * r * 0.36 - r * 0.2, -r * 0.62); sv.lineTo(i * r * 0.42, -r * (1.45 - Math.abs(i) * 0.14)); sv.lineTo(i * r * 0.36 + r * 0.2, -r * 0.62); sv.fill(); } sv.fillStyle = '#1b1b24'; sv.fillRect(-r * 0.98, -r * 0.62, r * 1.96, r * 0.14);  }
    else if (acc === 'cyber') { sv.fillStyle = 'rgba(20,10,40,.9)'; rr(-r * 0.7, -r * 0.28, r * 1.4, r * 0.3, r * 0.1); sv.fill(); sv.fillStyle = '#5ef2ff'; sv.fillRect(-r * 0.58, -r * 0.2, r * 0.45, r * 0.14); sv.fillStyle = '#ff6bf0'; sv.fillRect(r * 0.12, -r * 0.2, r * 0.45, r * 0.14); glowAt(-r * 0.35, -r * 0.13, r * 1.2, '#5ef2ff', 0.6); sv.strokeStyle = '#8a5de0'; sv.lineWidth = 2; sv.beginPath(); sv.moveTo(r * 0.7, -r * 0.7); sv.lineTo(r * 1.0, -r * 1.4); sv.stroke(); glowAt(r * 1.0, -r * 1.4, r * 0.9, '#ff6bf0', 0.9); }
    else if (acc === 'jester') { const cs = ['#e83a5a', '#ffd34d', '#5ef2ff']; for (let i = -1; i <= 1; i++) { sv.fillStyle = cs[i + 1]; sv.beginPath(); sv.moveTo(i * r * 0.45 - r * 0.3, -r * 0.6); sv.quadraticCurveTo(i * r * 0.9, -r * 1.2, i * r * 1.0, -r * 1.55); sv.quadraticCurveTo(i * r * 0.5, -r * 1.0, i * r * 0.45 + r * 0.3, -r * 0.6); sv.fill(); ball(i * r * 1.0, -r * 1.55, r * 0.14, '#fff6c0'); } sv.fillStyle = '#6c3fc9'; sv.fillRect(-r * 0.95, -r * 0.66, r * 1.9, r * 0.15); }
    else if (acc === 'hood') { const hc = ch.id === 'shadow' ? ['#17171f', '#262633'] : ['#2f5a26', '#3d7032']; sv.fillStyle = hc[0]; sv.beginPath(); sv.arc(0, -r * 0.1, r * 1.12, Math.PI * 1.02, Math.PI * 1.98); sv.lineTo(r * 0.7, -r * 0.5); sv.lineTo(-r * 0.7, -r * 0.5); sv.closePath(); sv.fill(); ball(0, -r * 0.55, r * 0.85, hc[1], 1, 0.7); if (ch.id !== 'shadow') { sv.fillStyle = '#d63b3b'; sv.beginPath(); sv.moveTo(r * 0.3, -r * 1.0); sv.lineTo(r * 1.1, -r * 1.5); sv.lineTo(r * 0.65, -r * 0.8); sv.fill(); } else { sv.fillStyle = '#7b5cff'; sv.fillRect(-r * 0.5, -r * 0.12, r * 0.3, r * 0.05); sv.fillRect(r * 0.2, -r * 0.12, r * 0.3, r * 0.05); glowAt(-r * 0.35, -r * 0.1, r * 0.6, '#9b7bff', 0.7); glowAt(r * 0.35, -r * 0.1, r * 0.6, '#9b7bff', 0.7); } }
    else if (acc === 'hardhat') { ball(0, -r * 0.5, r * 0.95, '#ffcf2e', 1, 0.72, -0.4); sv.fillStyle = '#d9a900'; sv.fillRect(-r * 1.1, -r * 0.55, r * 2.2, r * 0.16); sv.fillStyle = '#fff'; sv.beginPath(); sv.arc(0, -r * 0.85, r * 0.2, 0, 6.28); sv.fill(); glowAt(0, -r * 0.85, r * 1.2, '#fff6b0', 0.6); sv.fillStyle = 'rgba(40,40,48,.9)'; sv.fillRect(-r * 0.55, -r * 0.28, r * 1.1, r * 0.17); }
    else if (acc === 'scar') { sv.strokeStyle = '#8f3030'; sv.lineWidth = Math.max(1.3, r * 0.07); sv.lineCap = 'round'; sv.beginPath(); sv.moveTo(-r * 0.5, -r * 0.4); sv.lineTo(-r * 0.12, r * 0.08); sv.stroke(); sv.strokeStyle = 'rgba(255,220,220,.6)'; sv.lineWidth = 1; for (const t of [0.25, 0.5, 0.75]) { const px = -r * 0.5 + r * 0.38 * t, py = -r * 0.4 + r * 0.48 * t; sv.beginPath(); sv.moveTo(px - 2, py + 2); sv.lineTo(px + 2, py - 2); sv.stroke(); } sv.fillStyle = '#16161c'; sv.fillRect(-r * 0.98, -r * 0.64, r * 1.96, r * 0.2); sv.fillStyle = '#c0392b'; sv.fillRect(r * 0.9, -r * 0.64, r * 0.35, r * 0.1); sv.fillRect(r * 0.9, -r * 0.5, r * 0.28, r * 0.1); }
    else if (acc === 'fedora') { sv.fillStyle = 'rgba(0,0,0,.35)'; sv.beginPath(); sv.ellipse(0, -r * 0.5, r * 1.35, r * 0.34, 0, 0, 6.28); sv.fill(); ball(0, -r * 0.5, r * 1.25, '#2b2b33', 1, 0.28, -0.4); ball(0, -r * 0.92, r * 0.68, '#34343e', 1, 0.8, -0.4); sv.fillStyle = '#9a1f2a'; sv.fillRect(-r * 0.68, -r * 0.7, r * 1.36, r * 0.16); }
    else if (acc === 'bucket') { ball(0, -r * 0.82, r * 0.62, '#4c8dff', 1, 0.75); sv.fillStyle = shade('#4c8dff', -0.3); sv.fillRect(-r * 1.02, -r * 0.62, r * 2.04, r * 0.15); }
    else if (acc === 'visor') { sv.fillStyle = '#ff3df2'; rr(-r * 0.7, -r * 0.32, r * 1.4, r * 0.32, r * 0.1); sv.fill(); sv.fillStyle = 'rgba(255,255,255,.55)'; sv.fillRect(-r * 0.62, -r * 0.28, r * 1.24, r * 0.06); sv.fillStyle = '#fff'; sv.fillRect(-r * 0.3, -r * 0.18, r * 0.14, r * 0.08); sv.fillRect(r * 0.16, -r * 0.18, r * 0.14, r * 0.08); }
    else if (acc === 'band') { sv.fillStyle = '#ffeb3b'; sv.fillRect(-r * 0.98, -r * 0.62, r * 1.96, r * 0.2); sv.fillStyle = 'rgba(0,0,0,.2)'; sv.fillRect(-r * 0.98, -r * 0.46, r * 1.96, r * 0.04); sv.fillStyle = '#ffeb3b'; sv.fillRect(r * 0.9, -r * 0.62, r * 0.4, r * 0.1); }
    else if (acc === 'cap') { ball(0, -r * 0.5, r * 0.82, '#2d7d46', 1, 0.75); sv.fillStyle = shade('#2d7d46', -0.3); sv.fillRect(-r * 0.2, -r * 0.62, r * 1.3, r * 0.14); }
    else if (acc === 'helmet') { ball(0, -r * 0.35, r * 1.05, '#5b6b7a', 1, 0.8); sv.fillStyle = '#ffcf6e'; sv.fillRect(-r * 0.1, -r * 1.15, r * 0.2, r * 0.3); }
    else if (acc === 'wizard') { sv.fillStyle = '#6c3fc9'; sv.beginPath(); sv.moveTo(-r * 0.85, -r * 0.55); sv.lineTo(0, -r * 1.9); sv.lineTo(r * 0.85, -r * 0.55); sv.closePath(); sv.fill(); sv.fillStyle = 'rgba(255,255,255,.2)'; sv.beginPath(); sv.moveTo(-r * 0.3, -r * 0.7); sv.lineTo(0, -r * 1.85); sv.lineTo(-r * 0.1, -r * 0.7); sv.fill(); sv.fillStyle = '#ffd34d'; sv.fillRect(-r * 0.9, -r * 0.62, r * 1.8, r * 0.14); }
    else if (acc === 'cyberRed' || acc === 'cyberPurple') {                                  // headset, spiky hair and a glowing visor
      const pc = acc === 'cyberRed' ? '#ff3a3a' : '#c84bff', hair = acc === 'cyberRed' ? shade(fur, -0.35) : '#aeb4c2';
      sv.fillStyle = hair; for (let i = -3; i <= 3; i++) { sv.beginPath(); sv.moveTo(i * r * 0.26 - r * 0.15, -r * 0.7); sv.lineTo(i * r * 0.3 + (i < 0 ? -r * 0.1 : r * 0.1), -r * (1.28 - Math.abs(i) * 0.1)); sv.lineTo(i * r * 0.26 + r * 0.15, -r * 0.72); sv.fill(); }
      sv.strokeStyle = '#1a1a22'; sv.lineWidth = r * 0.13; sv.beginPath(); sv.arc(0, -r * 0.05, r * 1.0, Math.PI * 1.08, Math.PI * 1.92); sv.stroke();
      for (const sg of [-1, 1]) { ball(sg * r * 1.0, r * 0.05, r * 0.34, '#1a1a22'); sv.strokeStyle = pc; sv.lineWidth = r * 0.07; sv.beginPath(); sv.arc(sg * r * 1.0, r * 0.05, r * 0.22, 0, 6.28); sv.stroke(); }
      sv.fillStyle = '#0e0e14'; rr(-r * 0.8, -r * 0.3, r * 1.6, r * 0.34, r * 0.14); sv.fill(); sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.05); sv.stroke();
      glowAt(0, -r * 0.13, r * 0.9, pc, 0.7); sv.fillStyle = pc; rr(-r * 0.68, -r * 0.24, r * 1.36, r * 0.16, r * 0.08); sv.fill(); sv.fillStyle = 'rgba(255,255,255,.7)'; sv.fillRect(-r * 0.5, -r * 0.2, r * 0.5, r * 0.04);
      if (acc === 'cyberRed') { sv.strokeStyle = pc; sv.lineWidth = Math.max(1.4, r * 0.07); sv.beginPath(); sv.moveTo(r * 0.5, -r * 0.16); sv.lineTo(r * 3.0, -r * 0.5); sv.stroke(); sv.strokeStyle = '#fff'; sv.lineWidth = Math.max(0.8, r * 0.025); sv.stroke(); }
    }
    else if (acc === 'beret') {                                                              // green beret and aviator shades
      sv.fillStyle = '#2f5d34'; sv.beginPath(); sv.ellipse(-r * 0.08, -r * 0.62, r * 1.05, r * 0.44, -0.12, 0, 6.28); sv.fill(); sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.05); sv.stroke();
      sv.fillStyle = '#1f4524'; sv.fillRect(-r * 1.0, -r * 0.46, r * 2, r * 0.1); sv.fillStyle = '#d9b44a'; sv.beginPath(); sv.arc(r * 0.45, -r * 0.62, r * 0.13, 0, 6.28); sv.fill(); sv.stroke();
      for (const sg of [-1, 1]) { sv.fillStyle = 'rgba(14,14,18,.95)'; sv.beginPath(); sv.ellipse(sg * r * 0.3, -r * 0.01, r * 0.26, r * 0.2, 0, 0, 6.28); sv.fill(); sv.strokeStyle = '#d9b44a'; sv.lineWidth = r * 0.05; sv.stroke(); sv.fillStyle = 'rgba(255,255,255,.35)'; sv.beginPath(); sv.ellipse(sg * r * 0.38, -r * 0.07, r * 0.07, r * 0.05, 0, 0, 6.28); sv.fill(); }
      sv.strokeStyle = '#d9b44a'; sv.lineWidth = r * 0.05; sv.beginPath(); sv.moveTo(-r * 0.05, -r * 0.05); sv.lineTo(r * 0.05, -r * 0.05); sv.stroke();
    }
    else if (acc === 'fireHair') {                                                           // burning hair and glowing eyes
      const ft = performance.now() / 150;
      for (let i = -3; i <= 3; i++) { const h = r * (0.5 + 0.18 * Math.sin(ft + i * 1.9)), x = i * r * 0.26; sv.fillStyle = '#e8501a'; sv.beginPath(); sv.moveTo(x - r * 0.18, -r * 0.7); sv.quadraticCurveTo(x - r * 0.1, -r * 0.7 - h * 0.7, x, -r * 0.72 - h * 1.3); sv.quadraticCurveTo(x + r * 0.12, -r * 0.7 - h * 0.5, x + r * 0.18, -r * 0.7); sv.fill(); sv.fillStyle = '#ffd34d'; sv.beginPath(); sv.moveTo(x - r * 0.08, -r * 0.7); sv.quadraticCurveTo(x - r * 0.03, -r * 0.7 - h * 0.4, x, -r * 0.72 - h * 0.8); sv.quadraticCurveTo(x + r * 0.06, -r * 0.7 - h * 0.3, x + r * 0.08, -r * 0.7); sv.fill(); }
      for (const sg of [-1, 1]) { glowAt(sg * r * 0.28, -r * 0.02, r * 0.35, '#ffd34d', 0.8); sv.fillStyle = '#ffd34d'; sv.beginPath(); sv.ellipse(sg * r * 0.28, -r * 0.02, r * 0.17, r * 0.12, 0, 0, 6.28); sv.fill(); sv.fillStyle = '#ff7a1a'; sv.beginPath(); sv.arc(sg * r * 0.28, -r * 0.02, r * 0.06, 0, 6.28); sv.fill(); }
    }
    else if (acc === 'iceHair') {                                                            // frosty white spikes, blue goggles, ice crystals
      sv.fillStyle = '#f2f8ff'; sv.strokeStyle = '#9ac4e8'; sv.lineWidth = Math.max(1, r * 0.04); for (let i = -3; i <= 3; i++) { sv.beginPath(); sv.moveTo(i * r * 0.27 - r * 0.17, -r * 0.66); sv.lineTo(i * r * 0.3 + (i < 0 ? -r * 0.12 : r * 0.12), -r * (1.3 - Math.abs(i) * 0.1)); sv.lineTo(i * r * 0.27 + r * 0.17, -r * 0.68); sv.closePath(); sv.fill(); sv.stroke(); }
      sv.fillStyle = '#9fe0ff'; for (const [cx2, cy2, h] of [[r * 1.15, -r * 0.1, 0.55], [r * 1.0, r * 0.2, 0.4]]) { sv.beginPath(); sv.moveTo(cx2 - r * 0.1, cy2 + r * 0.1); sv.lineTo(cx2 + r * 0.05, cy2 - r * h); sv.lineTo(cx2 + r * 0.15, cy2 + r * 0.1); sv.fill(); sv.stroke(); }
      sv.fillStyle = '#1c3a66'; rr(-r * 0.78, -r * 0.3, r * 1.56, r * 0.1, r * 0.04); sv.fill();
      for (const sg of [-1, 1]) { sv.fillStyle = '#2a8fe0'; rr(sg * r * 0.3 - r * 0.28, -r * 0.27, r * 0.56, r * 0.4, r * 0.15); sv.fill(); sv.strokeStyle = '#173a66'; sv.lineWidth = r * 0.07; sv.stroke(); sv.fillStyle = 'rgba(255,255,255,.5)'; sv.fillRect(sg * r * 0.3 - r * 0.15, -r * 0.2, r * 0.18, r * 0.06); }
    }
    else if (acc === 'toxicMask') {                                                          // black mohawk with a green streak, gas mask
      for (let i = -3; i <= 3; i++) { sv.fillStyle = i === 0 ? '#58e01c' : '#15151a'; sv.beginPath(); sv.moveTo(i * r * 0.14 - r * 0.1, -r * 0.8); sv.lineTo(i * r * 0.16 - r * 0.02, -r * (1.35 - Math.abs(i) * 0.1)); sv.lineTo(i * r * 0.14 + r * 0.1, -r * 0.8); sv.fill(); }
      sv.fillStyle = '#17181c'; sv.beginPath(); sv.moveTo(-r * 0.72, r * 0.1); sv.quadraticCurveTo(0, r * 0.0, r * 0.72, r * 0.1); sv.lineTo(r * 0.55, r * 0.92); sv.quadraticCurveTo(0, r * 1.05, -r * 0.55, r * 0.92); sv.closePath(); sv.fill(); sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.05); sv.stroke();
      for (const sg of [-1, 1]) { ball(sg * r * 0.5, r * 0.62, r * 0.28, '#2a2c32'); glowAt(sg * r * 0.5, r * 0.62, r * 0.4, '#58e01c', 0.7); ball(sg * r * 0.5, r * 0.62, r * 0.16, '#58e01c'); }
      sv.fillStyle = '#3a3c44'; sv.fillRect(-r * 0.12, r * 0.45, r * 0.24, r * 0.3);
      for (const sg of [-1, 1]) { sv.fillStyle = '#7cdc2a'; sv.beginPath(); sv.ellipse(sg * r * 0.28, -r * 0.02, r * 0.07, r * 0.05, 0, 0, 6.28); sv.fill(); }
    }
    else if (acc === 'voltHead') {                                                           // spiky hair, headphones with a bolt, lightning arcs
      sv.fillStyle = '#18233c'; for (let i = -3; i <= 3; i++) { sv.beginPath(); sv.moveTo(i * r * 0.26 - r * 0.15, -r * 0.7); sv.lineTo(i * r * 0.3 + (i < 0 ? -r * 0.1 : r * 0.1), -r * (1.28 - Math.abs(i) * 0.1)); sv.lineTo(i * r * 0.26 + r * 0.15, -r * 0.72); sv.fill(); sv.fillStyle = '#46c8ff'; sv.beginPath(); sv.moveTo(i * r * 0.3 - r * 0.04, -r * (1.1 - Math.abs(i) * 0.1)); sv.lineTo(i * r * 0.3 + (i < 0 ? -r * 0.1 : r * 0.1), -r * (1.28 - Math.abs(i) * 0.1)); sv.lineTo(i * r * 0.3 + r * 0.04, -r * (1.1 - Math.abs(i) * 0.1)); sv.fill(); sv.fillStyle = '#18233c'; }
      sv.strokeStyle = '#10141f'; sv.lineWidth = r * 0.13; sv.beginPath(); sv.arc(0, -r * 0.05, r * 1.0, Math.PI * 1.08, Math.PI * 1.92); sv.stroke();
      for (const sg of [-1, 1]) { ball(sg * r * 1.0, r * 0.05, r * 0.36, '#10141f'); sv.strokeStyle = '#46c8ff'; sv.lineWidth = r * 0.07; sv.beginPath(); sv.arc(sg * r * 1.0, r * 0.05, r * 0.24, 0, 6.28); sv.stroke(); sv.fillStyle = '#7fe0ff'; sv.beginPath(); sv.moveTo(sg * r * 1.0 + r * 0.04, -r * 0.1); sv.lineTo(sg * r * 1.0 - r * 0.08, r * 0.08); sv.lineTo(sg * r * 1.0, r * 0.06); sv.lineTo(sg * r * 1.0 - r * 0.04, r * 0.2); sv.lineTo(sg * r * 1.0 + r * 0.08, r * 0.02); sv.lineTo(sg * r * 1.0, r * 0.04); sv.closePath(); sv.fill(); }
      const tt = performance.now() / 80; sv.strokeStyle = '#9fe6ff'; sv.lineWidth = Math.max(1.2, r * 0.05); for (const sg of [-1, 1]) { sv.beginPath(); for (let i = 0; i < 5; i++) sv.lineTo(sg * (r * 1.15 + i * r * 0.17), -r * 0.7 + Math.sin(tt + i * 2.3 + sg) * r * 0.22 + i * r * 0.2); sv.stroke(); }
      for (const sg of [-1, 1]) { sv.fillStyle = '#5ec8ff'; sv.beginPath(); sv.ellipse(sg * r * 0.28, -r * 0.02, r * 0.07, r * 0.05, 0, 0, 6.28); sv.fill(); }
    }
    else if (acc === 'ninjaHood') {                                                          // dark hood, black face wrap, katana on the back
      sv.strokeStyle = '#2a2a3a'; sv.lineWidth = r * 0.12; sv.beginPath(); sv.moveTo(r * 0.8, -r * 0.1); sv.lineTo(r * 1.55, -r * 1.25); sv.stroke(); sv.fillStyle = '#d9a74a'; sv.fillRect(r * 0.95 - r * 0.02, -r * 0.35, r * 0.3, r * 0.08);
      sv.fillStyle = '#1c1c34'; sv.beginPath(); sv.arc(0, -r * 0.05, r * 1.18, 0, 6.28); sv.closePath(); sv.moveTo(r * 0.74, r * 0.1); sv.ellipse(0, r * 0.1, r * 0.74, r * 0.6, 0, 0, 6.28); sv.closePath(); sv.fill('evenodd'); sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.05); sv.beginPath(); sv.arc(0, -r * 0.05, r * 1.18, 0, 6.28); sv.stroke();
      sv.fillStyle = '#0e0e16'; sv.beginPath(); sv.moveTo(-r * 0.74, r * 0.12); sv.lineTo(r * 0.74, r * 0.12); sv.lineTo(r * 0.6, r * 0.95); sv.quadraticCurveTo(0, r * 1.1, -r * 0.6, r * 0.95); sv.closePath(); sv.fill(); sv.stroke();
      sv.strokeStyle = '#1c1c34'; sv.lineWidth = r * 0.12; sv.beginPath(); sv.moveTo(-r * 0.62, -r * 0.3); sv.lineTo(-r * 0.12, -r * 0.18); sv.moveTo(r * 0.62, -r * 0.3); sv.lineTo(r * 0.12, -r * 0.18); sv.stroke();
    }
    else if (acc === 'campHelmet') {                                                         // camo helmet with goggles, grey goatee
      ball(0, -r * 0.45, r * 1.1, '#4e6a2a', 1.05, 0.82); sv.save(); sv.beginPath(); sv.ellipse(0, -r * 0.45, r * 1.15, r * 0.9, 0, Math.PI, 0); sv.clip(); sv.fillStyle = '#34481c'; for (let i = 0; i < 7; i++) { sv.beginPath(); sv.ellipse((i * 31 % 19 - 9) * r * 0.1, -r * (0.45 + (i * 17 % 9) * 0.07), r * 0.2, r * 0.1, i, 0, 6.28); sv.fill(); } sv.fillStyle = '#7a9a3a'; for (let i = 0; i < 4; i++) { sv.beginPath(); sv.ellipse((i * 23 % 17 - 8) * r * 0.1, -r * (0.55 + (i * 13 % 7) * 0.06), r * 0.15, r * 0.08, i * 2, 0, 6.28); sv.fill(); } sv.restore();
      sv.fillStyle = '#3a3e34'; sv.fillRect(-r * 1.0, -r * 0.5, r * 2, r * 0.1);
      for (const sg of [-1, 1]) { sv.fillStyle = '#2a2e26'; sv.beginPath(); sv.arc(sg * r * 0.38, -r * 0.8, r * 0.27, 0, 6.28); sv.fill(); sv.strokeStyle = INK; sv.lineWidth = Math.max(1, r * 0.05); sv.stroke(); sv.fillStyle = '#4a5a52'; sv.beginPath(); sv.arc(sg * r * 0.38, -r * 0.8, r * 0.17, 0, 6.28); sv.fill(); sv.fillStyle = 'rgba(255,255,255,.35)'; sv.fillRect(sg * r * 0.3, -r * 0.88, r * 0.1, r * 0.04); }
      sv.fillStyle = '#b8b8bc'; sv.beginPath(); sv.moveTo(-r * 0.3, r * 0.82); sv.lineTo(r * 0.3, r * 0.82); sv.lineTo(0, r * 1.1); sv.fill();
    }
    else if (acc === 'punkHair') {                                                           // crimson mohawk, war paint, double earrings
      for (let i = -3; i <= 3; i++) { sv.fillStyle = i % 2 ? '#c4163e' : '#8a1030'; sv.beginPath(); sv.moveTo(i * r * 0.15 - r * 0.12, -r * 0.8); sv.lineTo(i * r * 0.17 + i * r * 0.04, -r * (1.45 - Math.abs(i) * 0.12)); sv.lineTo(i * r * 0.15 + r * 0.12, -r * 0.8); sv.fill(); }
      sv.strokeStyle = '#3fd85a'; sv.lineWidth = Math.max(1.4, r * 0.06); sv.lineCap = 'round'; for (const sg of [-1, 1]) { sv.beginPath(); sv.moveTo(sg * r * 0.5, r * 0.02); sv.lineTo(sg * r * 0.72, r * 0.2); sv.moveTo(sg * r * 0.45, r * 0.08); sv.lineTo(sg * r * 0.64, r * 0.3); sv.stroke(); }
      sv.strokeStyle = '#d9b44a'; sv.lineWidth = Math.max(1.2, r * 0.06); for (const sg of [-1, 1]) for (const dy of [0.3, 0.5]) { sv.beginPath(); sv.arc(sg * r * 1.2, r * dy, r * 0.1, 0, 6.28); sv.stroke(); }
    }
    sv.restore();
    sv.restore();
  }

  // collectible portrait: head and shoulders on a coloured card
  function drawPortrait(ch, x, y, w, now = 0, locked = false) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = w * 0.08; ctx.shadowOffsetY = w * 0.03; rr(x, y, w, w, w * 0.07); ctx.fillStyle = ch.bg; ctx.fill(); ctx.shadowColor = 'transparent';
    rr(x, y, w, w, w * 0.07); ctx.clip();
    drawApe(ctx, x + w / 2, y + w * 0.49 + Math.sin(now / 700) * w * 0.004, w * 0.25, ch, null, 0, 0, 0, 0, true);
    if (locked) {
      ctx.fillStyle = 'rgba(12,8,28,.68)'; ctx.fillRect(x, y, w, w);
      const cx = x + w / 2, cy = y + w / 2, k = w * 0.1;
      ctx.strokeStyle = '#e8c872'; ctx.lineWidth = k * 0.5; ctx.beginPath(); ctx.arc(cx, cy - k * 0.6, k * 0.9, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#e8c872'; rr(cx - k * 1.3, cy - k * 0.5, k * 2.6, k * 2.1, k * 0.3); ctx.fill();
      ctx.fillStyle = '#2a1a05'; ctx.beginPath(); ctx.arc(cx, cy + k * 0.4, k * 0.3, 0, 6.28); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#0d0a10'; ctx.lineWidth = Math.max(2, w * 0.022); rr(x, y, w, w, w * 0.07); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,200,114,.55)'; ctx.lineWidth = 1; rr(x - 2.5, y - 2.5, w + 5, w + 5, w * 0.07 + 2); ctx.stroke();
  }

  // ---------- opps: monkeys and animals, each lit like a small 3D model ----------
  const BASE = { monkey: ['#8a5a2b', '#6b6b78', '#c9a36a'], rat: ['#8d8d99', '#6f6a63', '#b7aa98'], bat: ['#5a3d8a', '#3d3d55', '#7a4a6a'], gorilla: ['#34353f', '#4a4b55', '#2c2c33'], boar: ['#8a4b3a', '#5d4a3e', '#a0643f'], rhino: ['#8b93a0', '#7a7f8c', '#9a8f84'], hippo: ['#7e6f9c', '#8a7aa3', '#6f7fa8'], parrot: ['#d63b3b', '#2fb36a', '#3b82d6'], mandrill: ['#6a4a2f', '#5c4a3a', '#7a5a3a'], jaguar: ['#e0902f', '#d4a24a', '#c97a2a'], wolf: ['#8f98a6', '#6d7482', '#a6a39a'] };
  BASE.monkey = ['#4f9a42', '#3b8f7c', '#8a5fb8']; BASE.gorilla = ['#2f6a3a', '#3a4f6a', '#4a2f6a']; BASE.mandrill = ['#4a8a3a', '#7a3a8a', '#3a6a7a'];
  BASE.kingMech = ['#7a8294']; BASE.kingShadow = ['#241d33'];
  BASE.kingGorilla = ['#3a3a46', '#4a4252', '#2c3a3a']; BASE.kingLion = ['#e0a040']; BASE.kingBull = ['#7a3b2a'];
  for (const k of ['b_bandit', 'b_ninja', 'b_ammo', 'b_ghillie', 'b_riot', 'b_blast', 'b_toxic', 'b_volt', 'b_chain', 'b_king']) BASE[k] = ['#2b2a31'];
  function drawOpp(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.spawn > 0) { ctx.restore(); return; }                      // nothing is drawn before an opp arrives
    const r = e.r, bob = Math.sin(e.ph) * r * 0.06, wob = Math.cos(e.ph * 0.5) * 0.05;
    if (e.boss && e.mode === 'sweep') {                                  // rotating laser: warning, then beam
      const tt = 3 - e.mt, on = tt > 0.9; ctx.save(); ctx.strokeStyle = on ? 'rgba(255,60,80,.95)' : `rgba(255,120,120,${0.3 + 0.4 * Math.abs(Math.sin(tt * 18))})`; ctx.lineWidth = on ? 10 : 2; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(e.sa) * 760, Math.sin(e.sa) * 760); ctx.stroke(); if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); cglow(Math.cos(e.sa) * 120, Math.sin(e.sa) * 120, 260, '#ff3a4a', 0.5); } ctx.restore();
    }
    if (e.boss && e.mode === 'blink') { ctx.strokeStyle = 'rgba(160,120,255,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.tx - e.x, e.ty - e.y, 46 * clamp(1 - e.mt / 0.55, 0, 1) + 12, 0, 6.28); ctx.stroke(); cglow(e.tx - e.x, e.ty - e.y, 120, '#9b7bff', 0.5); }
    if (e.boss && e.mode === 'tele') {                                // warning before a boss move
      const pul = 0.4 + 0.4 * Math.sin(e.mt * 40);
      if ((e.id === 'enforcer' && e.next === 'slam') || (e.id === 'titan' && e.next === 'smash')) { ctx.strokeStyle = `rgba(255,80,80,${pul + 0.2})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 130 * clamp(1 - Math.max(0, e.mt) / (e.look === 'kingBull' ? 1 : 0.8), 0, 1) + 20, 0, 6.28); ctx.stroke(); }
      else { ctx.strokeStyle = `rgba(255,80,80,${pul + 0.2})`; ctx.lineWidth = r * 0.6; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(e.dx * r, e.dy * r); ctx.lineTo(e.dx * 420, e.dy * 420); ctx.stroke(); }
    }
    if (e.sn === 1) {                                                   // sniper laser line: dodge before it fires
      const k = 1 - Math.max(0, e.stt) / 1.1; ctx.strokeStyle = `rgba(255,70,90,${0.25 + 0.6 * k})`; ctx.lineWidth = 1 + 3 * k; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(Math.cos(e.snA) * r, Math.sin(e.snA) * r); ctx.lineTo(Math.cos(e.snA) * 640, Math.sin(e.snA) * 640); ctx.stroke(); cglow(0, 0, r * 3, '#ff4a5a', 0.4 * k);
    }
    if (e.giant && e.mode === 'tele') { const pul = 0.4 + 0.4 * Math.sin(e.mt * 40); ctx.strokeStyle = `rgba(255,80,80,${pul + 0.2})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 110 * clamp(1 - Math.max(0, e.mt) / 0.85, 0, 1) + 14, 0, 6.28); ctx.stroke(); }
    const flying = e.look === 'bat' || e.look === 'parrot';
    shadow(0, r * (flying ? 0.95 : 1.4), r * 0.95, r * 0.3);
    ctx.rotate(wob); ctx.translate(0, bob);
    if (e.alpha !== undefined && e.alpha < 1) ctx.globalAlpha = Math.max(0.05, e.alpha);
    if (e.clone) ctx.globalAlpha = 0.6;
    if (!flying) ctx.translate(0, -r * 0.4);                           // head sits above a full body
    const col = (BASE[e.look] || ['#e84393'])[e.v % (BASE[e.look] ? BASE[e.look].length : 1)];
    if (!flying) oppBody(e, r, col);
    beast(e, r, col);
    oppOutfit(e, r); oppMutation(e, r); oppWeapon(e, r);
    if (e.shield) {                                                    // riot shield on the side facing you
      ctx.save(); ctx.translate(0, r * 0.4); ctx.rotate(e.faceA);
      const sg = ctx.createLinearGradient(r, 0, r * 1.5, 0); sg.addColorStop(0, '#dfe5f2'); sg.addColorStop(1, '#6a7490');
      ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, -0.95, 0.95); ctx.stroke();
      ctx.strokeStyle = sg; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, -0.95, 0.95); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 1.3, -0.7, 0.2); ctx.stroke(); ctx.restore();
    }
    if (e.bomber) { const near = Math.hypot(P.x - e.x, P.y - e.y) < 170, pl = 0.5 + 0.5 * Math.sin(performance.now() / (near ? 70 : 220)); cglow(0, r * 0.9, r * 3.2, '#ff4a2a', 0.25 + 0.5 * pl); ctx.fillStyle = '#d63b3b'; for (let i = -1; i <= 1; i++) { rr(i * r * 0.28 - r * 0.1, r * 0.55, r * 0.2, r * 0.7, 2); ctx.fill(); } ctx.strokeStyle = '#f0e6c8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, r * 0.55); ctx.quadraticCurveTo(r * 0.2, r * 0.2, r * 0.45, r * 0.3); ctx.stroke(); cglow(r * 0.45, r * 0.3, r * 0.8, '#ffb347', 0.5 + 0.5 * pl); }
    if (e.flash > 0 || e.st === 1) { ctx.fillStyle = e.flash > 0 ? 'rgba(255,255,255,.55)' : `rgba(255,255,255,${0.35 + 0.35 * Math.sin(e.stt * 40)})`; ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, 6.28); ctx.fill(); }
    if (e.burnT > 0) cglow(0, 0, r * 3.2, '#ff8a2a', 0.7);
    if (e.poisT > 0) cglow(0, 0, r * 2.8, '#8bff5a', 0.45);
    if (e.chillT > 0) { ctx.fillStyle = 'rgba(143,227,255,.3)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.04, 0, 6.28); ctx.fill(); }
    if (e.stun > 0 && e.chillT > 0) { ctx.fillStyle = 'rgba(210,244,255,.55)'; rr(-r * 1.1, -r * 1.1, r * 2.2, r * 2.2, 6); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; rr(-r * 1.1, -r * 1.1, r * 2.2, r * 2.2, 6); ctx.stroke(); }
    if (e.elite) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, r * 0.4, r * 1.5, 0, 6.28); ctx.stroke(); cglow(0, r * 0.4, r * 4, e.mod === 'regen' ? '#8bff5a' : e.mod === 'ring' ? '#ff6b6b' : '#ffd34d', 0.25); }
    ctx.restore();
    if (!e.boss) { const bw = Math.max(16, e.r * 2), by = e.y - e.r * 1.75 - 8; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 5); ctx.fillStyle = e.elite ? '#ffd34d' : '#7bed9f'; ctx.fillRect(e.x - bw / 2, by, bw * Math.max(0, e.hp / e.max), 3); }
  }

  const BOSSDRESS = { b_bandit: { cloth: '#1f1f26', acc: '#d93a3a' }, b_ninja: { cloth: '#1a1418', acc: '#d93a3a' }, b_ammo: { cloth: '#26262c', acc: '#d9a83a' }, b_ghillie: { cloth: '#3b4a24', acc: '#6a7a38' }, b_riot: { cloth: '#2c2f36', acc: '#8a909c' }, b_blast: { cloth: '#2a2420', acc: '#ff8a2a' }, b_toxic: { cloth: '#2e3a22', acc: '#9dff5a' }, b_volt: { cloth: '#1c2233', acc: '#5ec8ff' }, b_chain: { cloth: '#2a2a2e', acc: '#9aa0aa' }, b_king: { cloth: '#3a1a22', acc: '#ffd34d' } };
  const CLOTH = ['#6b4a3a', '#3a4a6b', '#5a3a6b', '#3f5f3f', '#7a3a3a', '#4a4a52'];
  function oppBody(e, r, col) {                                       // torso, arms and legs behind the head
    const BL = e.boss ? BOSSDRESS[e.look] : null, cloth = e.boss ? (BL ? BL.cloth : '#3a2a44') : CLOTH[(e.v + (e.out || 0)) % CLOTH.length], pants = shade(cloth, -0.3), fur = col;
    const big = e.kind === 'tank' || e.giant || e.boss ? 1.2 : 1;
    for (const sx of [-1, 1]) {                                        // legs swing as it walks
      const st = Math.sin(e.ph + (sx > 0 ? Math.PI : 0)), hx = sx * r * 0.34 * big, hy = r * 1.2, fx = hx + st * r * 0.22, fy = r * 2.0 - Math.max(0, st) * r * 0.16;
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.58; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = pants; ctx.lineWidth = r * 0.42; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
      ball(fx + sx * r * 0.05, fy + r * 0.03, r * 0.27, '#2a2230', 1.25, 0.7);
    }
    for (const sx of [-1, 1]) {                                        // arms hang and swing
      const sw = Math.sin(e.ph + (sx > 0 ? 0 : Math.PI)) * r * 0.25, shx = sx * r * 0.7 * big, shy = r * 0.85, hx = sx * r * 1.0 * big, hy = r * 1.55 + sw;
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.5; ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = cloth; ctx.lineWidth = r * 0.36; ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(hx, hy); ctx.stroke();
      ball(hx, hy + r * 0.05, r * 0.22, fur);
    }
    ball(0, r * 1.0, r * 0.78 * big, cloth, 1.08, 0.95);
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.beginPath(); ctx.moveTo(0, r * 0.45); ctx.lineTo(0, r * 1.6); ctx.stroke();
    ctx.fillStyle = shade(cloth, 0.3); ctx.beginPath(); ctx.arc(r * 0.3, r * 1.0, r * 0.08, 0, 6.28); ctx.fill();
    if (BL) {                                                          // each boss has its own outfit
      const a = BL.acc, L = e.look, glo = (x, y, rr2, c) => glowAt(x, y, rr2, c, 0.7);
      ctx.lineWidth = Math.max(1.2, r * 0.05); ctx.strokeStyle = INK;
      const strap = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = r * w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      if (L === 'b_bandit') {                                           // harness, pouches and a red scarf
        strap(-r * 0.6, r * 0.5, r * 0.5, r * 1.4, '#3a3a44', 0.14); strap(r * 0.6, r * 0.5, -r * 0.5, r * 1.4, '#3a3a44', 0.14);
        ctx.fillStyle = '#5a5a66'; rr(-r * 0.1, r * 0.95, r * 0.2, r * 0.2, 2); ctx.fill();
        ctx.fillStyle = a; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.45); ctx.lineTo(r * 0.5, r * 0.45); ctx.lineTo(0, r * 1.05); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (L === 'b_ninja') {                                      // hooded sash and belt
        ctx.fillStyle = a; ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.45); ctx.lineTo(r * 0.7, r * 0.45); ctx.lineTo(r * 0.45, r * 0.8); ctx.lineTo(-r * 0.45, r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
        strap(-r * 0.7, r * 1.3, r * 0.7, r * 1.3, a, 0.2); strap(0, r * 0.8, r * 0.1, r * 1.9, a, 0.14);
      } else if (L === 'b_ammo') {                                       // crossed bandoliers of gold shells
        for (const sg of [-1, 1]) { strap(sg * r * 0.7, r * 0.5, -sg * r * 0.7, r * 1.45, '#1a1a1e', 0.22); for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5, x = sg * r * 0.7 - sg * t * r * 1.4, y = r * 0.5 + t * r * 0.95; ctx.fillStyle = a; rr(x - r * 0.07, y - r * 0.14, r * 0.14, r * 0.28, r * 0.05); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(); } }
        ctx.fillStyle = '#4a4a54'; rr(-r * 0.3, r * 0.75, r * 0.6, r * 0.45, r * 0.08); ctx.fill();
      } else if (L === 'b_ghillie') {                                    // shaggy leaf cloak
        ctx.fillStyle = '#4a5a2a'; for (let i = 0; i < 26; i++) { const an = i * 2.4, rx = Math.cos(an) * r * 0.75 * ((i % 5) / 5 + 0.4), ry = r * 1.05 + Math.sin(an) * r * 0.75 * ((i % 4) / 4 + 0.3); ctx.beginPath(); ctx.moveTo(rx - r * 0.12, ry); ctx.lineTo(rx + (i % 2 ? 1 : -1) * r * 0.06, ry + r * 0.4); ctx.lineTo(rx + r * 0.12, ry); ctx.fillStyle = i % 3 ? '#4a5a2a' : '#6a7a38'; ctx.fill(); }
        strap(r * 0.6, r * 0.2, r * 0.2, r * 1.0, '#222', 0.12);
      } else if (L === 'b_riot') {                                       // plates and a big riot shield
        for (const sg of [-1, 1]) { ball(sg * r * 0.85, r * 0.7, r * 0.36, '#3a3e48', 1.1, 0.85); }
        ctx.fillStyle = '#4a4e5a'; rr(-r * 0.45, r * 0.5, r * 0.9, r * 0.8, r * 0.1); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(-r * 0.95, r * 1.0); ctx.fillStyle = '#7a808c'; rr(-r * 0.45, -r * 0.75, r * 0.9, r * 1.5, r * 0.12); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3a1418'; rr(-r * 0.3, -r * 0.5, r * 0.6, r * 0.35, r * 0.05); ctx.fill(); ctx.fillStyle = 'rgba(255,90,90,.5)'; ctx.fillRect(-r * 0.25, -r * 0.45, r * 0.5, r * 0.08); ctx.restore();
      } else if (L === 'b_blast') {                                      // glowing grenades and a charge pack
        ctx.fillStyle = '#3a3a44'; rr(-r * 0.4, r * 0.65, r * 0.8, r * 0.55, r * 0.08); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 3; i++) { const x = (i - 1) * r * 0.24; ctx.fillStyle = a; rr(x - r * 0.07, r * 0.72, r * 0.14, r * 0.4, 3); ctx.fill(); glo(x, r * 0.92, r * 0.3, a); }
        for (const sg of [-1, 1]) { ball(sg * r * 0.8, r * 0.75, r * 0.3, '#2a2a30'); glo(sg * r * 0.8, r * 0.75, r * 0.4, a); ball(sg * r * 0.8, r * 0.75, r * 0.14, a); }
      } else if (L === 'b_toxic') {                                      // toxin tanks and hose
        for (const sg of [-1, 1]) { ctx.fillStyle = '#3a4a28'; rr(sg * r * 0.72 - r * 0.15, r * 0.35, r * 0.3, r * 0.9, r * 0.12); ctx.fill(); ctx.stroke(); ctx.fillStyle = a; ctx.fillRect(sg * r * 0.72 - r * 0.1, r * 0.7, r * 0.2, r * 0.35); glo(sg * r * 0.72, r * 0.88, r * 0.4, a); }
        strap(-r * 0.5, r * 0.5, r * 0.5, r * 1.35, '#d9c43a', 0.14); strap(r * 0.5, r * 0.5, -r * 0.5, r * 1.35, '#d9c43a', 0.14);
      } else if (L === 'b_volt') {                                       // armoured chest, arc reactor, shoulder orbs
        ctx.fillStyle = '#7a8296'; rr(-r * 0.5, r * 0.5, r * 1.0, r * 0.85, r * 0.12); ctx.fill(); ctx.stroke();
        glo(0, r * 0.9, r * 0.8, a); ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.arc(0, r * 0.9, r * 0.18, 0, 6.28); ctx.fill(); ctx.strokeStyle = a; ctx.lineWidth = r * 0.07; ctx.stroke();
        for (const sg of [-1, 1]) { ball(sg * r * 0.85, r * 0.7, r * 0.3, '#6a7286'); glo(sg * r * 0.85, r * 0.7, r * 0.45, a); ball(sg * r * 0.85, r * 0.7, r * 0.15, a); }
        const tt = performance.now() / 90; ctx.strokeStyle = a; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = 0; i < 6; i++) { const x = Math.sin(tt + i * 1.7) * r * 1.2, y = r * (0.4 + i * 0.28); ctx.lineTo(x, y); } ctx.stroke();
      } else if (L === 'b_chain') {                                      // heavy chains across a bare chest
        for (const sg of [-1, 1]) { for (let i = 0; i < 7; i++) { const t = i / 6, x = sg * r * 0.7 - sg * t * r * 1.4, y = r * 0.45 + t * r * 0.95; ctx.fillStyle = a; ctx.beginPath(); ctx.ellipse(x, y, r * 0.11, r * 0.07, sg * 0.8 + (i % 2) * 1.2, 0, 6.28); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(); } }
        for (const sg of [-1, 1]) { ball(sg * r * 1.2, r * 1.5, r * 0.3, '#4a4a52', 1.1, 0.9); ctx.fillStyle = a; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sg * r * 1.2 + i * r * 0.14 - r * 0.05, r * 1.32); ctx.lineTo(sg * r * 1.2 + i * r * 0.14, r * 1.1); ctx.lineTo(sg * r * 1.2 + i * r * 0.14 + r * 0.05, r * 1.32); ctx.fill(); } }
      } else if (L === 'b_king') {                                       // red cape collar, gold armour
        ctx.fillStyle = '#9a1c30'; ctx.beginPath(); ctx.moveTo(-r * 1.0, r * 0.5); ctx.lineTo(r * 1.0, r * 0.5); ctx.lineTo(r * 1.2, r * 1.8); ctx.lineTo(-r * 1.2, r * 1.8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2a1018'; rr(-r * 0.5, r * 0.6, r * 1.0, r * 1.0, r * 0.1); ctx.fill();
        ctx.fillStyle = a; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.6); ctx.lineTo(0, r * 1.5); ctx.lineTo(r * 0.5, r * 0.6); ctx.lineTo(r * 0.3, r * 0.6); ctx.lineTo(0, r * 1.15); ctx.lineTo(-r * 0.3, r * 0.6); ctx.closePath(); ctx.fill();
        for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sg * r * 0.7, r * 0.65); ctx.lineTo(sg * r * 1.0, r * 0.15); ctx.lineTo(sg * r * 1.0, r * 0.7); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(); }
      }
    }
  }

  function oppMutation(e, r) {                                          // serum mutations: glowing green skin, extra eyes, bone, metal, spikes, growths
    if (!e.mut || !e.mut.length || e.clone || (e.boss && e.look.startsWith('b_'))) return;
    const ey = (EYEY[e.look] === undefined ? -0.2 : EYEY[e.look]) * r, t = performance.now() / 1000, big = e.boss ? 0.5 : 1;
    for (const m of e.mut) {
      if (m === 'serum') {
        ctx.fillStyle = 'rgba(110,255,80,.2)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, 6.28); ctx.fill();
        if (!e.boss) { for (const sx of [-1, 1]) { glowAt(sx * r * 0.3, ey, r * 0.9, '#9dff5a', 0.8); ctx.fillStyle = '#e6ffa8'; ctx.beginPath(); ctx.arc(sx * r * 0.3, ey, r * 0.09, 0, 6.28); ctx.fill(); }
          ctx.fillStyle = '#8bff5a'; for (const dx of [-0.18, 0.12]) { const l = r * (0.18 + 0.12 * Math.sin(t * 3 + dx * 20)); ctx.fillRect(dx * r, r * 0.52, r * 0.07, l); ctx.beginPath(); ctx.arc(dx * r + r * 0.035, r * 0.52 + l, r * 0.05, 0, 6.28); ctx.fill(); } }
      } else if (m === 'eye3') {
        ctx.fillStyle = '#f4f0d8'; ctx.beginPath(); ctx.arc(0, ey - r * 0.5, r * 0.15, 0, 6.28); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
        ctx.fillStyle = '#7dff3a'; ctx.beginPath(); ctx.arc(Math.sin(t * 2) * r * 0.04, ey - r * 0.5, r * 0.07, 0, 6.28); ctx.fill();
      } else if (m === 'skull') {
        ctx.fillStyle = '#efe9d6'; ctx.beginPath(); ctx.ellipse(r * 0.5, ey + r * 0.3, r * 0.3, r * 0.4, 0.3, 0, 6.28); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
        ctx.strokeStyle = 'rgba(40,30,20,.6)'; ctx.beginPath(); ctx.moveTo(r * 0.4, ey + r * 0.1); ctx.lineTo(r * 0.55, ey + r * 0.35); ctx.lineTo(r * 0.45, ey + r * 0.55); ctx.stroke();
        ctx.fillStyle = '#efe9d6'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.14 - r * 0.05, r * 0.4, r * 0.1, r * 0.16);
      } else if (m === 'robot') {
        ctx.fillStyle = 'rgba(122,130,148,.92)'; ctx.beginPath(); ctx.moveTo(r * 0.05, -r * 0.8); ctx.arc(0, 0, r * 0.92, -1.2, 1.1); ctx.lineTo(r * 0.05, r * 0.5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
        glowAt(r * 0.32, ey, r * 0.9, '#ff3a4a', 0.9); ctx.fillStyle = '#ff6a7a'; ctx.beginPath(); ctx.arc(r * 0.32, ey, r * 0.1, 0, 6.28); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.5); ctx.lineTo(r * 0.7, -r * 0.2); ctx.stroke();
      } else if (m === 'spikes') {
        ctx.fillStyle = '#efe9d6'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.05);
        for (let i = 0; i < 5; i++) { const a = -2.6 + i * 0.5, bx = Math.cos(a) * r * 0.92, by = Math.sin(a) * r * 0.92; ctx.beginPath(); ctx.moveTo(bx - Math.sin(a) * r * 0.14, by + Math.cos(a) * r * 0.14); ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); ctx.lineTo(bx + Math.sin(a) * r * 0.14, by - Math.cos(a) * r * 0.14); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      } else if (m === 'tumor') {
        const rn = seeded(e.v * 7 + 3); for (let i = 0; i < 3; i++) { const a = rn() * 6.28, dd = r * (0.5 + rn() * 0.3), rad = r * (0.12 + rn() * 0.1); ctx.fillStyle = '#9ddc6a'; ctx.beginPath(); ctx.arc(Math.cos(a) * dd, Math.sin(a) * dd - r * 0.1, rad, 0, 6.28); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.04); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(Math.cos(a) * dd - rad * 0.3, Math.sin(a) * dd - r * 0.1 - rad * 0.3, rad * 0.28, 0, 6.28); ctx.fill(); }
      }
    }
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

  function bossHead(e, r) {                                              // gritty black gorilla heads, each with its own gear
    const L = e.look, fur = '#2b2a31', skin = '#8a7458', t = performance.now() / 1000, ln = Math.max(1.4, r * 0.06);
    const ac = BOSSDRESS[L].acc;
    for (const sg of [-1, 1]) { ball(sg * r * 0.98, r * 0.02, r * 0.3, fur); ball(sg * r * 0.98, r * 0.02, r * 0.17, '#c99888'); }
    if (L === 'b_ghillie') {                                                // shaggy hood sits behind the face
      for (let i = 0; i < 22; i++) { const an = Math.PI + i * 0.3 - 0.4, rx = Math.cos(an) * r * 1.05, ry = Math.sin(an) * r * 1.05; ctx.fillStyle = i % 3 ? '#4a5a2a' : '#6a7a38'; ctx.beginPath(); ctx.moveTo(rx - r * 0.15, ry); ctx.lineTo(rx + Math.cos(an) * r * 0.3, ry + Math.sin(an) * r * 0.3 - r * 0.05); ctx.lineTo(rx + r * 0.15, ry + r * 0.1); ctx.fill(); }
      ball(0, r * 0.05, r * 1.05, '#4a5a2a', 1.05, 1);
    }
    ball(0, 0, r * 0.92, fur, 1.0, 1.02);
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 6.28); ctx.clip(); furTexture(r * 0.9, fur, 40 + e.v); ctx.restore();
    ball(0, r * 0.28, r * 0.58, skin, 1.05, 0.82);                          // tan muzzle
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.ellipse(-r * 0.1, r * 0.22, r * 0.05, r * 0.07, 0, 0, 6.28); ctx.ellipse(r * 0.1, r * 0.22, r * 0.05, r * 0.07, 0, 0, 6.28); ctx.fill();
    let eye = '#ff4a3a';
    if (L === 'b_ammo') eye = '#ffd24a'; else if (L === 'b_ghillie') eye = '#9dff5a'; else if (L === 'b_toxic') eye = '#9dff5a'; else if (L === 'b_volt') eye = '#5ec8ff'; else if (L === 'b_blast') eye = '#ff9a3a';
    const eyes = (c, sz) => { for (const sg of [-1, 1]) { glowAt(sg * r * 0.33, -r * 0.1, r * 0.4, c, 0.75); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(sg * r * 0.33, -r * 0.1, sz, sz * 0.7, 0, 0, 6.28); ctx.fill(); ctx.fillStyle = '#100808'; ctx.beginPath(); ctx.arc(sg * r * 0.33, -r * 0.1, sz * 0.4, 0, 6.28); ctx.fill(); } };
    const brow = (c) => { ctx.strokeStyle = c || '#14120f'; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 0.62, -r * 0.34); ctx.lineTo(-r * 0.12, -r * 0.18); ctx.moveTo(r * 0.62, -r * 0.34); ctx.lineTo(r * 0.12, -r * 0.18); ctx.stroke(); };
    const teeth = () => { ctx.fillStyle = '#f2efe6'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.14 - r * 0.06, r * 0.62); ctx.lineTo(i * r * 0.14, r * 0.8); ctx.lineTo(i * r * 0.14 + r * 0.06, r * 0.62); ctx.fill(); } };
    if (L === 'b_bandit') {
      eyes(eye, r * 0.13); brow();
      ctx.fillStyle = '#1a1a1f'; ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.12); ctx.lineTo(r * 0.7, r * 0.12); ctx.lineTo(r * 0.5, r * 0.85); ctx.lineTo(-r * 0.5, r * 0.85); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke();   // skull bandana
      ctx.fillStyle = '#f2efe6'; for (let i = -2; i <= 2; i++) { ctx.fillRect(i * r * 0.14 - r * 0.05, r * 0.5, r * 0.1, r * 0.28); } ctx.fillRect(-r * 0.3, r * 0.4, r * 0.6, r * 0.1);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, r * 0.3, r * 0.14, 0, 6.28); ctx.fill();
      ball(0, -r * 0.62, r * 0.95, '#141418', 1.02, 0.55);                // cap
      ctx.fillStyle = '#141418'; ctx.beginPath(); ctx.ellipse(0, -r * 0.4, r * 1.0, r * 0.2, 0, 0, 6.28); ctx.fill(); ctx.fillStyle = '#c93030'; ctx.fillRect(-r * 0.85, -r * 0.62, r * 1.7, r * 0.1);
    } else if (L === 'b_ninja') {
      ctx.fillStyle = '#17131a'; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.22 - r * 0.12, -r * 0.7); ctx.lineTo(i * r * 0.26 - r * 0.2, -r * (1.2 - Math.abs(i) * 0.1)); ctx.lineTo(i * r * 0.22 + r * 0.12, -r * 0.75); ctx.fill(); }
      brow();
      ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.moveTo(-r * 0.78, -r * 0.3); ctx.lineTo(r * 0.78, -r * 0.3); ctx.lineTo(r * 0.7, r * 0.08); ctx.lineTo(0, r * 0.18); ctx.lineTo(-r * 0.7, r * 0.08); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke();   // visor
      for (const sg of [-1, 1]) { glowAt(sg * r * 0.33, -r * 0.1, r * 0.45, '#ff3a3a', 0.9); ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.moveTo(sg * r * 0.14, -r * 0.18); ctx.lineTo(sg * r * 0.6, -r * 0.2); ctx.lineTo(sg * r * 0.5, -r * 0.04); ctx.lineTo(sg * r * 0.16, -r * 0.08); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#c93030'; ctx.fillRect(-r * 0.78, r * 0.18, r * 1.56, r * 0.12);
      ctx.strokeStyle = '#14100f'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.5); ctx.lineTo(r * 0.5, r * 0.5); ctx.stroke();
    } else if (L === 'b_ammo') {
      eyes(eye, r * 0.13); brow();
      ctx.fillStyle = '#4a4a54'; ctx.fillRect(-r * 0.5, r * 0.65, r, r * 0.2); ctx.fillStyle = ac; for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.2 - r * 0.04, r * 0.68, r * 0.08, r * 0.14);   // studded collar
      ctx.fillStyle = '#d9d2b0'; ctx.beginPath(); ctx.moveTo(-r * 0.25, r * 0.5); ctx.lineTo(r * 0.25, r * 0.5); ctx.lineTo(0, r * 0.6); ctx.fill();
    } else if (L === 'b_ghillie') {
      brow('#2a3014'); eyes('#e8f0c8', r * 0.1);
      glowAt(r * 0.33, -r * 0.1, r * 0.6, '#9dff5a', 0.9); ctx.fillStyle = '#3a4a2a'; ctx.beginPath(); ctx.arc(r * 0.33, -r * 0.1, r * 0.26, 0, 6.28); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke();
      ctx.fillStyle = '#9dff5a'; ctx.beginPath(); ctx.arc(r * 0.33, -r * 0.1, r * 0.16, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.15, r * 0.04, 0, 6.28); ctx.fill();   // night-vision lens
      ctx.fillStyle = '#16180f'; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.4); ctx.lineTo(r * 0.5, r * 0.4); ctx.lineTo(r * 0.4, r * 0.85); ctx.lineTo(-r * 0.4, r * 0.85); ctx.closePath(); ctx.fill();
    } else if (L === 'b_riot') {
      eyes(eye, r * 0.11);
      ball(0, -r * 0.25, r * 0.98, '#1c1d22', 1.04, 0.95, -0.3);          // helmet
      ctx.fillStyle = '#0c0c10'; rr(-r * 0.78, -r * 0.4, r * 1.56, r * 0.38, r * 0.1); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke();
      for (const sg of [-1, 1]) { glowAt(sg * r * 0.33, -r * 0.22, r * 0.4, '#ff3a3a', 0.8); ctx.fillStyle = '#ff4a4a'; ctx.fillRect(sg * r * 0.33 - r * 0.2, -r * 0.27, r * 0.4, r * 0.1); }
      for (const sg of [-1, 1]) { ball(sg * r * 0.98, r * 0.05, r * 0.26, '#2c2f36'); ball(sg * r * 0.98, r * 0.05, r * 0.14, '#ff4a4a'); }
      ctx.fillStyle = '#d9d2b0'; ctx.fillRect(-r * 0.4, r * 0.62, r * 0.8, r * 0.05); teeth();
    } else if (L === 'b_blast') {
      eyes(eye, r * 0.1);
      for (const sg of [-1, 1]) { const gx = sg * r * 0.38, gy = -r * 0.36; ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(gx, gy, r * 0.3, 0, 6.28); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke(); glowAt(gx, gy, r * 0.6, '#ff8a2a', 0.9); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(gx, gy, r * 0.21, 0, 6.28); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(gx - r * 0.07, gy - r * 0.07, r * 0.06, 0, 6.28); ctx.fill(); }
      ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(-r * 0.92, -r * 0.4); ctx.lineTo(r * 0.92, -r * 0.4); ctx.stroke();
      ctx.fillStyle = '#17141a'; ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.2); ctx.lineTo(r * 0.6, r * 0.2); ctx.lineTo(r * 0.45, r * 0.85); ctx.lineTo(-r * 0.45, r * 0.85); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke();
      ctx.fillStyle = '#f2efe6'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.14 - r * 0.05, r * 0.5, r * 0.1, r * 0.26);
    } else if (L === 'b_toxic') {
      brow();
      ctx.fillStyle = '#16171a'; ctx.beginPath(); ctx.ellipse(0, r * 0.02, r * 0.78, r * 0.62, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke();    // gas mask
      for (const sg of [-1, 1]) { glowAt(sg * r * 0.33, -r * 0.1, r * 0.55, '#9dff5a', 0.95); ctx.fillStyle = '#9dff5a'; ctx.beginPath(); ctx.arc(sg * r * 0.33, -r * 0.1, r * 0.22, 0, 6.28); ctx.fill(); ctx.strokeStyle = '#0c0c0f'; ctx.lineWidth = r * 0.07; ctx.stroke(); ctx.fillStyle = '#e6ffa8'; ctx.beginPath(); ctx.arc(sg * r * 0.28, -r * 0.16, r * 0.06, 0, 6.28); ctx.fill(); }
      ctx.fillStyle = '#2a2c30'; ctx.beginPath(); ctx.ellipse(0, r * 0.52, r * 0.42, r * 0.34, 0, 0, 6.28); ctx.fill(); ctx.stroke();
      for (const sg of [-1, 1]) { ctx.fillStyle = '#3a3c42'; ctx.beginPath(); ctx.arc(sg * r * 0.5, r * 0.58, r * 0.2, 0, 6.28); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#6a6e76'; for (let i = -1; i <= 1; i++) ctx.fillRect(i * r * 0.1 - r * 0.02, r * 0.4, r * 0.04, r * 0.26);
      const u = (t * 0.6) % 1; ctx.fillStyle = `rgba(157,255,90,${0.35 * (1 - u)})`; ctx.beginPath(); ctx.arc(r * 0.6, r * 0.7 - u * r * 0.9, r * (0.1 + u * 0.2), 0, 6.28); ctx.fill();
    } else if (L === 'b_volt') {
      ctx.fillStyle = '#14141c'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.18 - r * 0.1, -r * 0.8); ctx.lineTo(i * r * 0.18, -r * (1.25 - Math.abs(i) * 0.12)); ctx.lineTo(i * r * 0.18 + r * 0.1, -r * 0.8); ctx.fill(); }
      brow();
      ctx.fillStyle = '#10141f'; rr(-r * 0.78, -r * 0.3, r * 1.56, r * 0.3, r * 0.12); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke();
      glowAt(0, -r * 0.15, r * 1.0, '#5ec8ff', 0.9); ctx.fillStyle = '#9fe6ff'; rr(-r * 0.7, -r * 0.24, r * 1.4, r * 0.14, r * 0.07); ctx.fill();
      ctx.fillStyle = '#7a8296'; ctx.fillRect(-r * 0.5, r * 0.65, r, r * 0.2); ctx.fillStyle = '#5ec8ff'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.18 - r * 0.04, r * 0.7, r * 0.08, r * 0.08);
      const tt = t * 11; ctx.strokeStyle = '#9fe6ff'; ctx.lineWidth = 1.6; for (const sg of [-1, 1]) { ctx.beginPath(); for (let i = 0; i < 5; i++) ctx.lineTo(sg * (r * 0.9 + i * r * 0.14), -r * 0.5 + Math.sin(tt + i * 2 + sg) * r * 0.25 + i * r * 0.18); ctx.stroke(); }
    } else if (L === 'b_chain') {
      brow(); eyes(eye, r * 0.13);
      ctx.fillStyle = '#2a0c0c'; ctx.beginPath(); ctx.ellipse(0, r * 0.62, r * 0.46, r * 0.3, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.stroke();   // roaring maw
      ctx.fillStyle = '#f2efe6'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.17 - r * 0.07, r * 0.4); ctx.lineTo(i * r * 0.17, r * (i === -2 || i === 2 ? 0.78 : 0.62)); ctx.lineTo(i * r * 0.17 + r * 0.07, r * 0.4); ctx.fill(); ctx.beginPath(); ctx.moveTo(i * r * 0.17 - r * 0.06, r * 0.86); ctx.lineTo(i * r * 0.17, r * 0.68); ctx.lineTo(i * r * 0.17 + r * 0.06, r * 0.86); ctx.fill(); }
      ctx.fillStyle = '#c93a4a'; ctx.beginPath(); ctx.ellipse(0, r * 0.72, r * 0.16, r * 0.08, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = ac; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.22 - r * 0.07, r * 0.88); ctx.lineTo(i * r * 0.22, r * 1.08); ctx.lineTo(i * r * 0.22 + r * 0.07, r * 0.88); ctx.fill(); }
    } else if (L === 'b_king') {
      eyes(eye, r * 0.13); brow();
      ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.moveTo(-r * 0.15, r * 0.52); ctx.lineTo(0, r * 0.7); ctx.lineTo(r * 0.15, r * 0.52); ctx.fill();
      ctx.fillStyle = ac; ctx.strokeStyle = INK; ctx.lineWidth = ln; ctx.beginPath(); const y0 = -r * 0.62;
      ctx.moveTo(-r * 0.72, y0 + r * 0.14); ctx.lineTo(-r * 0.8, y0 - r * 0.6); ctx.lineTo(-r * 0.4, y0 - r * 0.2); ctx.lineTo(-r * 0.2, y0 - r * 0.75); ctx.lineTo(0, y0 - r * 0.25); ctx.lineTo(r * 0.2, y0 - r * 0.75); ctx.lineTo(r * 0.4, y0 - r * 0.2); ctx.lineTo(r * 0.8, y0 - r * 0.6); ctx.lineTo(r * 0.72, y0 + r * 0.14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c92a4a'; ctx.beginPath(); ctx.arc(0, y0 - r * 0.02, r * 0.08, 0, 6.28); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-r * 0.6, y0 + r * 0.03, r * 1.2, r * 0.05);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, 6.28); ctx.stroke();
  }

  function beast(e, r, col) {
    const L = e.look, flap = Math.sin(e.ph * 1.6);
    if (L.startsWith('b_')) { bossHead(e, r); return; }
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
    } else if (L === 'kingMech') {
      for (const sx of [-1, 1]) { ctx.fillStyle = '#3a4050'; ctx.fillRect(sx * r * 0.9 - r * 0.12, -r * 0.4, r * 0.24, r * 0.9); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(sx * r * 0.9 - r * 0.12, -r * 0.4, r * 0.24, r * 0.9); ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(sx * r * 0.9, -r * 0.4, r * 0.1, 0, 6.28); ctx.fill(); }
      ball(0, 0, r * 0.85, '#7a8294'); ctx.fillStyle = '#2c3140'; rr(-r * 0.62, -r * 0.4, r * 1.24, r * 0.34, r * 0.08); ctx.fill();
      glowAt(0, -r * 0.23, r * 1.1, '#ff3a4a', 0.6 + 0.2 * Math.sin(performance.now() / 160)); ctx.fillStyle = '#ff5a6a'; ctx.fillRect(-r * 0.5, -r * 0.28, r * 1.0, r * 0.12);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; for (const dy of [0.15, 0.35, 0.55]) { ctx.beginPath(); ctx.moveTo(-r * 0.6, r * dy); ctx.lineTo(r * 0.6, r * dy); ctx.stroke(); }
      ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.8); ctx.lineTo(r * 0.7, -r * 1.3); ctx.stroke(); glowAt(r * 0.7, -r * 1.3, r * 0.7, '#ff3a4a', 0.9);
    } else if (L === 'kingShadow') {
      cglow(0, 0, r * 4, '#7b4cff', 0.35); ball(0, 0, r * 0.82, '#241d33');
      ctx.fillStyle = '#15101f'; ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.98, Math.PI * 1.04, Math.PI * 1.96); ctx.lineTo(r * 0.7, -r * 0.2); ctx.lineTo(-r * 0.7, -r * 0.2); ctx.closePath(); ctx.fill();
      for (const sx of [-1, 1]) { glowAt(sx * r * 0.28, -r * 0.08, r * 0.9, '#b48bff', 1); ctx.fillStyle = '#e8d8ff'; ctx.beginPath(); ctx.ellipse(sx * r * 0.28, -r * 0.08, r * 0.14, r * 0.06, sx * 0.3, 0, 6.28); ctx.fill(); }
      ctx.fillStyle = '#d7c9ff'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.13 - r * 0.04, r * 0.3, r * 0.08, r * 0.14);
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
    if (e.boss && e.look === 'kingLion') {                                                // only the Overlord wears the crown
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); const y0 = -r * 1.0;
      ctx.moveTo(-r * 0.55, y0); ctx.lineTo(-r * 0.62, y0 - r * 0.45); ctx.lineTo(-r * 0.3, y0 - r * 0.2); ctx.lineTo(0, y0 - r * 0.55); ctx.lineTo(r * 0.3, y0 - r * 0.2); ctx.lineTo(r * 0.62, y0 - r * 0.45); ctx.lineTo(r * 0.55, y0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-r * 0.5, y0 - r * 0.08, r * 1.0, r * 0.06);
      ctx.fillStyle = '#e84393'; ctx.beginPath(); ctx.arc(0, y0 - r * 0.12, r * 0.07, 0, 6.28); ctx.fill();
    }
    if (e.kind === 'tank' || e.boss) { /* heavy opps get a faint dark outline for weight */ ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, 6.28); ctx.stroke(); }
  }

  // ---------- environments: every room gets its own look ----------
  const ENVS = [
    { n: 'Opp Sewer', bg: ['#0b1208', '#17220d'], floor: '#232326', grid: 'rgba(0,0,0,0)', edge: '#9dff3a', amb: 'spores', prop: 'vent', light: '#9dff3a', wall: ['#6a6a60', '#34342f', 'stone'], objs: ['barrel', 'crate', 'boulder'], hz: ['toxic', 'vent'], cobble: true, moat: true },
    { n: 'Futuristic Laboratory',  bg: ['#0a1424', '#16304a'], floor: '#1c2c40', grid: 'rgba(120,200,255,.14)', edge: '#6ad0ff', amb: 'stars',   prop: 'panel',   light: '#6ad0ff', wall: ['#9fb6d6', '#4a5f80', 'metal'], objs: ['crate', 'barrel', 'pillar'], hz: ['laser', 'spikes'] },
    { n: 'Military Research Base', bg: ['#1d2316', '#38422a'], floor: '#3a4230', grid: 'rgba(220,240,160,.1)',  edge: '#b9c77a', amb: 'dust',    prop: 'panel',   light: '#ffe9a0', wall: ['#8a9468', '#4a5236', 'crate'], objs: ['crate', 'barrel', 'boulder'], hz: ['spikes', 'vent'] },
    { n: 'Underground Bunker',     bg: ['#14141a', '#26262e'], floor: '#34343c', grid: 'rgba(200,200,220,.1)',  edge: '#8a8aa0', amb: 'dust',    prop: 'vent',    light: '#ffcf7a', wall: ['#8a8a96', '#4a4a56', 'stone'], objs: ['crate', 'pillar', 'barrel'], hz: ['spikes', 'toxic'] },
    { n: 'Neon Warehouse',         bg: ['#12062a', '#2a0a4a'], floor: '#170b32', grid: 'rgba(255,61,242,.16)',  edge: '#ff3df2', amb: 'rain',    prop: 'sign',    light: '#ff3df2', wall: ['#4a3a72', '#241640', 'metal'], objs: ['barrel', 'crate'], hz: ['laser', 'vent'] },
    { n: 'Desert Compound',        bg: ['#4a2f12', '#a8742f'], floor: '#8a5f2a', grid: 'rgba(60,30,0,.16)',     edge: '#e6b35a', amb: 'dust',    prop: 'pillar',  light: '#ffd9a0', wall: ['#e0bd82', '#a67c45', 'stone'], objs: ['pillar', 'boulder', 'crate'], hz: ['spikes', 'vent'] },
    { n: 'Frozen Facility',        bg: ['#0b2236', '#1b4a6b'], floor: '#17405c', grid: 'rgba(200,240,255,.12)', edge: '#8fe3ff', amb: 'snow',    prop: 'crystal', light: '#8fe3ff', wall: ['#cdeeff', '#7fc3e8', 'ice'], objs: ['ice', 'boulder', 'crate'], hz: ['vent', 'laser'] },
    { n: 'Toxic Industrial Plant', bg: ['#0f1f0a', '#243d16'], floor: '#26361c', grid: 'rgba(160,255,120,.1)',  edge: '#8bff5a', amb: 'spores',  prop: 'vent',    light: '#8bff5a', wall: ['#7a8a5a', '#3d4a2a', 'metal'], objs: ['barrel', 'crate', 'pillar'], hz: ['toxic', 'vent'] },
    { n: 'Lava-Powered Chamber',   bg: ['#2a0c06', '#5a1a0a'], floor: '#3a1a12', grid: 'rgba(255,140,60,.12)',  edge: '#ff6a2a', amb: 'embers',  prop: 'vent',    light: '#ff6a2a', wall: ['#5a4644', '#2a1f1d', 'stone'], objs: ['boulder', 'barrel', 'pillar'], hz: ['vent', 'toxic'] },
    { n: 'High-Security Vault',    bg: ['#16131c', '#2a2433'], floor: '#2e2a38', grid: 'rgba(232,200,114,.14)', edge: '#e8c872', amb: 'sparkle', prop: 'pillar',  light: '#ffe9a0', wall: ['#cfd3dd', '#6a6f80', 'metal'], objs: ['pillar', 'crate', 'statue'], hz: ['laser', 'spikes'] },
  ];
  const BOSS_ENV = { n: 'Final Boss Arena', bg: ['#1a0510', '#3a0a1a'], floor: '#2a1018', grid: 'rgba(255,60,90,.14)', edge: '#e84393', amb: 'embers', prop: 'vent', light: '#ff3a5a', wall: ['#5a3a44', '#2a1a20', 'stone'], objs: ['pillar', 'boulder'], hz: ['vent'] };
  const envOf = room => (bossRoom(room) ? BOSS_ENV : ENVS[(room - 1) % ENVS.length]);
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
    const g = ctx.createLinearGradient(0, 0, 0, RH); g.addColorStop(0, env.bg[0]); g.addColorStop(1, env.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, RW, RH);
    if (boss) { const v = ctx.createRadialGradient(RW / 2, RH / 2, RH * 0.2, RW / 2, RH / 2, RH * 0.8); v.addColorStop(0, 'rgba(232,67,147,0)'); v.addColorStop(1, 'rgba(232,67,147,.28)'); ctx.fillStyle = v; ctx.fillRect(0, 0, RW, RH); }
  }
  let floorCache = { key: '', cv: null };
  function drawFloor(room) {
    const k = S * Math.min(dpr, 2), key = room + '|' + RW + 'x' + RH + '|' + k + '|' + TOP + '|' + BOT;
    if (floorCache.key !== key) {
      const off = document.createElement('canvas'); off.width = Math.round(RW * k); off.height = Math.round(RH * k);
      ctx = off.getContext('2d'); ctx.setTransform(k, 0, 0, k, 0, 0);
      try { paintRoom(room); } finally { ctx = mainCtx; }
      floorCache = { key, cv: off, k };
    }
    const c = floorCache; ctx.drawImage(c.cv, camX * c.k, camY * c.k, AW * c.k, AH * c.k, camX, camY, AW, AH);             // only the part you can see
  }

  // each room type gets its own ground: moss and roots, wet asphalt, frost, lava cracks, deck plating, sand, boards, sea floor
  function floorDetail(env, room) {
    const r = seeded(room * 5 + 3), X = () => PAD + r() * (RW - PAD * 2), Y = () => TOP + r() * (RH - TOP - BOT);
    const patch = (x, y, rad, rgb, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
    ctx.lineCap = 'round';
    switch (env.amb) {
      case 'fireflies':
        for (let i = 0; i < 12; i++) patch(X(), Y(), 28 + r() * 40, '58,130,58', 0.3);
        for (let i = 0; i < 90; i++) { const x = X(), y = Y(); ctx.strokeStyle = `rgba(${70 + r() * 40},${150 + r() * 60},70,.55)`; ctx.lineWidth = 1.2; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 2, y); ctx.lineTo(x + k * 3.5, y - 5 - r() * 4); ctx.stroke(); } }
        ctx.strokeStyle = 'rgba(40,24,12,.6)'; ctx.lineWidth = 4; for (let i = 0; i < 3; i++) { let x = r() < 0.5 ? PAD : RW - PAD, y = Y(); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (x < RW / 2 ? 1 : -1) * (12 + r() * 14); y += (r() - 0.5) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
        break;
      case 'rain':
        for (let i = 0; i < 7; i++) { const x = X(), y = Y(), rw = 22 + r() * 28; const g = ctx.createRadialGradient(x, y, 2, x, y, rw); const c = i % 2 ? '255,61,242' : '60,230,255'; g.addColorStop(0, `rgba(${c},.45)`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rw, rw * 0.5, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, rw * 0.7, rw * 0.32, 0, 0, 6.28); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,214,90,.28)'; ctx.lineWidth = 3; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.moveTo(RW / 2, TOP); ctx.lineTo(RW / 2, RH - BOT); ctx.stroke(); ctx.setLineDash([]);
        break;
      case 'snow':
        for (let i = 0; i < 9; i++) patch(X(), Y(), 30 + r() * 40, '235,248,255', 0.28);
        for (let i = 0; i < 9; i++) { let x = X(), y = Y(); ctx.strokeStyle = 'rgba(190,235,255,.5)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 24; y += 8 + r() * 14; ctx.lineTo(x, y); } ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 12; for (let i = 0; i < 4; i++) { const x = X(); ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x - 90, RH - BOT); ctx.stroke(); }
        break;
      case 'embers':
        for (let i = 0; i < 8; i++) { let x = X(), y = Y(); const pts = [[x, y]]; for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 44; y += (r() - 0.35) * 40; pts.push([x, y]); }
          for (const [lw, col] of [[7, 'rgba(255,90,20,.18)'], [3.5, 'rgba(255,140,40,.6)'], [1.4, 'rgba(255,230,160,.95)']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
          rglow(pts[2][0], pts[2][1], 70, '#ff6a2a', 0.35); }
        break;
      case 'stars':
        ctx.fillStyle = 'rgba(255,200,40,.55)'; for (const yy of [TOP + 2, RH - BOT - 14]) { ctx.save(); ctx.beginPath(); ctx.rect(PAD, yy, RW - PAD * 2, 12); ctx.clip(); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(PAD, yy, RW - PAD * 2, 12); ctx.fillStyle = '#e8b923'; for (let x = PAD - 12; x < RW - PAD; x += 22) { ctx.beginPath(); ctx.moveTo(x, yy + 12); ctx.lineTo(x + 11, yy + 12); ctx.lineTo(x + 23, yy); ctx.lineTo(x + 12, yy); ctx.fill(); } ctx.restore(); }
        for (let i = 0; i < 3; i++) { const x = X(), y = Y(); ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(x - 16, y - 12, 32, 24, 3); ctx.fill(); ctx.strokeStyle = 'rgba(160,190,255,.45)'; ctx.lineWidth = 1; for (let k = -8; k <= 8; k += 5) { ctx.beginPath(); ctx.moveTo(x - 13, y + k * 0.8); ctx.lineTo(x + 13, y + k * 0.8); ctx.stroke(); } }
        break;
      case 'dust':
        ctx.strokeStyle = 'rgba(70,40,10,.18)'; ctx.lineWidth = 1.2; for (let i = 0; i < 40; i++) { const x = X(), y = Y(); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 18, y - 4, x + 36, y); ctx.stroke(); }
        for (let i = 0; i < 6; i++) patch(X(), Y(), 40 + r() * 40, '255,232,180', 0.25);
        for (let i = 0; i < 28; i++) { const x = X(), y = Y(); ctx.fillStyle = `rgba(${90 + r() * 40},${60 + r() * 30},30,.55)`; ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 3, 1.5 + r() * 2, 0, 0, 6.28); ctx.fill(); }
        break;
      case 'spores':
        for (let i = 0; i < 9; i++) { const x = X(), y = Y(), rw = 20 + r() * 26; const g = ctx.createRadialGradient(x, y, 2, x, y, rw); g.addColorStop(0, 'rgba(140,255,80,.4)'); g.addColorStop(1, 'rgba(140,255,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rw, rw * 0.6, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(180,255,120,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, rw * 0.7, rw * 0.4, 0, 0, 6.28); ctx.stroke(); }
        ctx.fillStyle = '#c9a21c'; for (const yy of [TOP + 2, RH - 22]) { ctx.save(); ctx.beginPath(); ctx.rect(PAD, yy, RW - PAD * 2, 10); ctx.clip(); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(PAD, yy, RW - PAD * 2, 10); ctx.fillStyle = '#c9a21c'; for (let x = PAD - 10; x < RW - PAD; x += 20) { ctx.beginPath(); ctx.moveTo(x, yy + 10); ctx.lineTo(x + 10, yy + 10); ctx.lineTo(x + 20, yy); ctx.lineTo(x + 10, yy); ctx.fill(); } ctx.restore(); }
        break;
      case 'sparkle':
        ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.2; for (let i = 0; i < 18; i++) { let x = X(), y = Y(); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.3) * 40; y += (r() - 0.3) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
        ctx.strokeStyle = 'rgba(232,200,114,.55)'; ctx.lineWidth = 2; rr(PAD + 14, TOP + 14, RW - PAD * 2 - 28, RH - TOP - 40, 10); ctx.stroke(); ctx.strokeStyle = 'rgba(232,200,114,.25)'; ctx.lineWidth = 1; rr(PAD + 20, TOP + 20, RW - PAD * 2 - 40, RH - TOP - 52, 8); ctx.stroke();
        ctx.strokeStyle = 'rgba(232,200,114,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(RW / 2, (TOP + RH) / 2, 54, 0, 6.28); ctx.stroke(); ctx.beginPath(); ctx.arc(RW / 2, (TOP + RH) / 2, 40, 0, 6.28); ctx.stroke();
        break;
      case 'ghosts':
        for (let x = PAD; x < RW - PAD; x += 22) { ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.07})`; ctx.fillRect(x, TOP, 22, RH - TOP - BOT); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, TOP, 1, RH - TOP - BOT); }
        { const cx = RW / 2 - 46; ctx.fillStyle = 'rgba(110,20,40,.55)'; ctx.fillRect(cx, TOP, 92, RH - TOP - BOT); ctx.strokeStyle = 'rgba(214,170,70,.7)'; ctx.lineWidth = 2.5; ctx.strokeRect(cx + 5, TOP, 82, RH - TOP - BOT); ctx.strokeStyle = 'rgba(214,170,70,.35)'; ctx.lineWidth = 1; ctx.strokeRect(cx + 11, TOP, 70, RH - TOP - BOT); }
        break;
      case 'bubbles':
        ctx.strokeStyle = 'rgba(255,240,200,.14)'; ctx.lineWidth = 1.2; for (let i = 0; i < 36; i++) { const x = X(), y = Y(); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 14, y - 4, x + 28, y); ctx.stroke(); }
        for (let i = 0; i < 12; i++) { const x = X(), y = Y(); ctx.fillStyle = ['rgba(255,170,200,.7)', 'rgba(255,240,210,.7)', 'rgba(150,210,255,.6)'][i % 3]; ctx.beginPath(); ctx.arc(x, y, 3 + r() * 3, 0, 6.28); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 1, y + 1, 3, 1); }
        break;
    }
    // light fixtures along the walls spill coloured light onto the floor
    for (let i = 0; i < 5; i++) { const left = i % 2 === 0, y = TOP + 40 + (i + r() * 0.6) * (RH - TOP - BOT - 80) / 5; rglow(left ? PAD : RW - PAD, y, 190, env.light, 0.36); ctx.fillStyle = env.light; ctx.beginPath(); ctx.arc(left ? PAD - 3 : RW - PAD + 3, y, 3, 0, 6.28); ctx.fill(); }
  }

  function paintRoom(room) {
    const env = envOf(room), boss = bossRoom(room);
    drawBackdrop(room, 0);
    const x0 = PAD - 6, y0 = TOP - 6, w = RW - PAD * 2 + 12, h = RH - TOP + 30;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24; ctx.fillStyle = env.floor; rr(x0, y0, w, h, 16); ctx.fill(); ctx.restore();
    ctx.save(); rr(x0, y0, w, h, 16); ctx.clip();
    const rnd = seeded(room * 3 + 1), area = (RW * RH) / (AW * AH);
    const X = () => PAD + rnd() * (RW - PAD * 2), Y = () => TOP + rnd() * (RH - TOP - BOT);                 // flat ground: no tiles, just worn, stained, unique surfaces
    for (let i = 0; i < 26 * area; i++) { const x = X(), y = Y(), rr2 = 40 + rnd() * 90, dark = rnd() < 0.55; const g = ctx.createRadialGradient(x, y, 0, x, y, rr2); g.addColorStop(0, dark ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - rr2, y - rr2, rr2 * 2, rr2 * 2); }
    switch (env.n) {
      case 'Futuristic Laboratory':                                                                      // brushed steel with a few welded rivets
        ctx.strokeStyle = 'rgba(190,225,255,.07)'; ctx.lineWidth = 1; for (let i = 0; i < 90 * area; i++) { const y = Y(), x = X(); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + rnd() * 160, y + (rnd() - 0.5) * 2); ctx.stroke(); }
        ctx.fillStyle = 'rgba(210,230,255,.35)'; for (let i = 0; i < 40 * area; i++) { const x = X(), y = Y(); ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.28); ctx.fill(); }
        break;
      case 'Military Research Base':                                                                      // packed earth and gravel with tyre tracks
        ctx.fillStyle = 'rgba(20,16,8,.3)'; for (let i = 0; i < 260 * area; i++) { const x = X(), y = Y(); ctx.fillRect(x, y, 1 + rnd() * 2.5, 1 + rnd() * 2); }
        ctx.strokeStyle = 'rgba(15,12,6,.25)'; ctx.lineWidth = 5; for (let i = 0; i < 2; i++) { const x0 = PAD + 60 + rnd() * (RW - PAD * 2 - 120); for (const off of [-10, 10]) { ctx.beginPath(); ctx.moveTo(x0 + off, TOP); for (let y = TOP; y < RH; y += 60) ctx.lineTo(x0 + off + Math.sin(y / 120 + i) * 30, y); ctx.stroke(); } }
        break;
      case 'Underground Bunker':                                                                          // poured concrete: stains, hairline cracks, oil
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; for (let i = 0; i < 12 * area; i++) { let x = X(), y = Y(); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.2) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
        for (let i = 0; i < 6 * area; i++) { const x = X(), y = Y(); ctx.fillStyle = 'rgba(10,10,6,.35)'; ctx.beginPath(); ctx.ellipse(x, y, 14 + rnd() * 22, 8 + rnd() * 12, rnd() * 3, 0, 6.28); ctx.fill(); }
        break;
      case 'Toxic Industrial Plant':                                                                      // stained slab with round drains
        for (let i = 0; i < 5 * area; i++) { const x = X(), y = Y(); ctx.fillStyle = '#101510'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(120,150,110,.5)'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x - 9, y + k * 4); ctx.lineTo(x + 9, y + k * 4); ctx.stroke(); } }
        break;
      case 'Lava-Powered Chamber':                                                                        // cracked basalt
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.6; for (let i = 0; i < 30 * area; i++) { let x = X(), y = Y(); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; ctx.lineTo(x, y); } ctx.stroke(); }
        break;
      case 'Frozen Facility':                                                                             // sheets of ice with long cracks
        ctx.strokeStyle = 'rgba(220,245,255,.45)'; ctx.lineWidth = 1.2; for (let i = 0; i < 16 * area; i++) { let x = X(), y = Y(); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 50; y += 10 + rnd() * 30; ctx.lineTo(x, y); } ctx.stroke(); }
        break;
      case 'Neon Warehouse':                                                                              // wet asphalt grain
        ctx.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 300 * area; i++) { const x = X(), y = Y(); ctx.fillRect(x, y, 1.5, 1.5); }
        break;
      case 'Desert Compound':                                                                             // compacted sand with scattered stones
        for (let i = 0; i < 40 * area; i++) { const x = X(), y = Y(); ctx.fillStyle = 'rgba(60,40,20,.4)'; ctx.beginPath(); ctx.ellipse(x, y, 2 + rnd() * 4, 1.5 + rnd() * 2.5, 0, 0, 6.28); ctx.fill(); }
        break;
      case 'High-Security Vault':                                                                         // polished stone with a soft sheen
        ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 8; for (let i = 0; i < 6 * area; i++) { const x = X(); ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x - 140, RH); ctx.stroke(); }
        break;
    }
    if (env.cobble) {                                                                          // dark cobblestones
      const rc = seeded(room * 11 + 2); ctx.fillStyle = '#121214'; ctx.fillRect(x0, y0, w, h);
      for (let gy = TOP - 4, row = 0; gy < RH + 24; gy += 21, row++) for (let gx = PAD - 10 + (row % 2) * 13; gx < RW - PAD + 10; gx += 26) {
        const cx = gx + (rc() - 0.5) * 4, cy = gy + (rc() - 0.5) * 4, rx = 11 + rc() * 3, ry = 8.5 + rc() * 2.5, v = 40 + rc() * 24;
        const cg = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, rx); cg.addColorStop(0, `rgb(${v + 22},${v + 22},${v + 26})`); cg.addColorStop(1, `rgb(${v - 8},${v - 8},${v - 4})`);
        ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.4; ctx.stroke();
      }
    }
    const n = seeded(room * 7 + 5);                                                            // grit and cracks
    for (let i = 0; i < 380; i++) { ctx.fillStyle = n() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)'; ctx.fillRect(PAD + n() * (RW - PAD * 2), TOP + n() * (RH - TOP - BOT), 1 + n() * 2, 1 + n() * 2); }
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { let cx = PAD + n() * (RW - PAD * 2), cy = TOP + n() * (RH - TOP - BOT); ctx.beginPath(); ctx.moveTo(cx, cy); for (let k = 0; k < 5; k++) { cx += (n() - 0.5) * 26; cy += (n() - 0.2) * 22; ctx.lineTo(cx, cy); } ctx.stroke(); }
    floorDetail(env, room); paintDressing(env, room);
    const lp = ctx.createRadialGradient(RW / 2, RH * 0.5, 20, RW / 2, RH * 0.5, RH * 0.62);       // light pool in the middle, dark corners
    lp.addColorStop(0, 'rgba(255,255,255,.1)'); lp.addColorStop(0.6, 'rgba(0,0,0,0)'); lp.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = lp; ctx.fillRect(x0, y0, w, h);
    const rn = seeded(room);                                                                   // props along the walls
    for (let i = 0; i < 10; i++) {
      const left = i % 2 === 0, py = TOP + 30 + rn() * (RH - TOP - BOT - 60), sz = 18 + rn() * 14, px = left ? PAD + 12 + rn() * 6 : RW - PAD - 12 - rn() * 6;
      shadow(px + 4, py + sz * 0.45, sz * 0.5, sz * 0.18); drawProp(env.prop, px, py, sz, env);
    }
    for (let i = 0; i < 9; i++) { ctx.strokeStyle = `rgba(0,0,0,${0.07 * (9 - i)})`; ctx.lineWidth = 2; rr(x0 + 1 + i * 2, y0 + 1 + i * 2, w - 2 - i * 4, h - 2 - i * 4, 14); ctx.stroke(); }   // inner shadow under the wall
    ctx.restore();
    if (env.moat) {                                                                            // toxic slime channel around the room
      ctx.save(); rr(x0 - 4, y0 - 4, w + 8, h + 8, 16); ctx.clip();
      const sm = ctx.createLinearGradient(0, 0, RW, 0); sm.addColorStop(0, '#8be82a'); sm.addColorStop(0.5, '#b8ff4a'); sm.addColorStop(1, '#6bc21f');
      ctx.lineWidth = 22; ctx.strokeStyle = sm; rr(x0 - 2, y0 - 2, w + 4, h + 4, 16); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(230,255,160,.7)';
      const rm = seeded(room + 5); for (let i = 0; i < 40; i++) { const side = rm() < 0.5, yy = TOP + rm() * (RH - TOP), xx = side ? x0 + 2 + rm() * 14 : x0 + w - 16 + rm() * 14; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 4, yy + 6, xx, yy + 12); ctx.stroke(); }
      ctx.restore();
    }
    ctx.strokeStyle = '#0b0714'; ctx.lineWidth = 9; rr(x0, y0, w, h, 16); ctx.stroke();           // wall frame
    ctx.strokeStyle = boss ? '#e84393' : env.edge; ctx.lineWidth = 3; rr(x0, y0, w, h, 16); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; rr(x0 + 2, y0 + 2, w - 4, h - 4, 14); ctx.stroke();
    ctx.fillStyle = '#3a3a36'; rr(RW / 2 - 46, y0 - 15, 92, 26, 8); ctx.fill(); ctx.strokeStyle = '#161614'; ctx.lineWidth = 2; ctx.stroke();      // stone arch
    for (const sx of [-1, 1]) { ctx.fillStyle = '#5a3a1c'; ctx.fillRect(RW / 2 + sx * 62 - 3, y0 - 4, 6, 16); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(RW / 2 + sx * 62 - 6, y0 - 7, 12, 5); }   // torch brackets
    ctx.fillStyle = '#0b0714'; rr(RW / 2 - 39, y0 - 12, 78, 20, 6); ctx.fill();                  // exit door, locked until the room is clear
    ctx.fillStyle = boss ? '#5a1a3a' : '#2a2246'; rr(RW / 2 - 34, y0 - 9, 68, 15, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(RW / 2 - 1, y0 - 9, 2, 15);
    ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(RW / 2, y0 + 12, 2.5, 0, 6.28); ctx.fill();
  }
  function drawDoorOpen(now) {
    const cx = RW / 2, y0 = TOP - 6, pulse = 0.6 + 0.4 * Math.sin(now / 250);
    const bm = ctx.createLinearGradient(0, y0, 0, y0 + 150); bm.addColorStop(0, 'rgba(123,237,159,.32)'); bm.addColorStop(1, 'rgba(123,237,159,0)');
    ctx.fillStyle = bm; ctx.beginPath(); ctx.moveTo(cx - 30, y0 + 6); ctx.lineTo(cx + 30, y0 + 6); ctx.lineTo(cx + 80, y0 + 150); ctx.lineTo(cx - 80, y0 + 150); ctx.fill();
    rglow(cx, y0, 170, '#7bed9f', 0.55 * pulse);
    ctx.fillStyle = '#0b0714'; rr(cx - 39, y0 - 12, 78, 20, 4); ctx.fill();
    ctx.fillStyle = `rgba(150,255,185,${0.55 + 0.4 * pulse})`; rr(cx - 30, y0 - 8, 60, 14, 3); ctx.fill();
    ctx.strokeStyle = '#7bed9f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const o = (now / 7 + i * 26) % 78, yy = y0 + 112 - o; ctx.globalAlpha = Math.max(0, 1 - o / 78); ctx.beginPath(); ctx.moveTo(cx - 12, yy + 7); ctx.lineTo(cx, yy - 3); ctx.lineTo(cx + 12, yy + 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function drawAmbient(room, now) {
    const env = envOf(room), t = now / 1000, rnd = seeded(room + 99);
    ctx.save();
    if (env.amb === 'spores') { ctx.fillStyle = 'rgba(160,255,110,.55)'; for (let i = 0; i < 26; i++) { const sx = rnd(), sy = rnd(); ctx.fillRect(sx * AW + Math.sin(t + i) * 10, AH - (sy * AH + t * 26 * (0.5 + rnd())) % AH, 2.4, 2.4); } }
    else if (env.amb === 'sparkle') { for (let i = 0; i < 24; i++) { const sx = rnd() * AW, sy = rnd() * AH, a = Math.max(0, Math.sin(t * 1.4 + i * 1.7)); if (a > 0.5) { rglow(sx, sy, 16 * a, '#ffe9a0', a * 0.8); } } }
    if (env.amb === 'bubbles') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(120,255,235,.07)'; ctx.lineWidth = 3; for (let i = 0; i < 9; i++) { const y = TOP + 30 + i * 70 + Math.sin(t * 0.9 + i) * 14; ctx.beginPath(); for (let x = PAD; x <= AW - PAD; x += 14) { const yy = y + Math.sin(x * 0.05 + t * 1.3 + i) * 9; x === PAD ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); } ctx.globalCompositeOperation = 'source-over'; }
    else if (env.amb === 'embers') { rglow(AW / 2, AH * 0.55, AW * 1.2, '#ff5a1f', 0.07 + 0.05 * Math.sin(t * 2.2)); }
    else if (env.amb === 'rain') { rglow(AW * 0.25 + Math.sin(t) * 20, AH * 0.4, 260, '#ff3df2', 0.07); rglow(AW * 0.75 - Math.sin(t) * 20, AH * 0.65, 260, '#3ce6ff', 0.07); }
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
      const c = { 'Neon Warehouse': '#6a2fa0', 'Lava-Powered Chamber': '#8a3a22', 'Futuristic Laboratory': '#4a5a8a', 'Toxic Industrial Plant': '#5a8a2a' }[env.n] || '#8a5a2b', top = by - 34;
      const g = ctx.createLinearGradient(w.x, 0, w.x + W, 0); g.addColorStop(0, shade(c, -0.35)); g.addColorStop(0.35, shade(c, 0.25)); g.addColorStop(1, shade(c, -0.5));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w.x + 2, top + 6); ctx.quadraticCurveTo(w.x - 3, (top + by) / 2, w.x + 2, by - 5); ctx.lineTo(w.x + W - 2, by - 5); ctx.quadraticCurveTo(w.x + W + 3, (top + by) / 2, w.x + W - 2, top + 6); ctx.fill();
      ctx.fillStyle = shade(c, 0.35); ctx.beginPath(); ctx.ellipse(cx, top + 6, W / 2 - 1, 6, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#1c1c24'; ctx.lineWidth = 2.5; for (const yy of [top + 14, by - 12]) { ctx.beginPath(); ctx.ellipse(cx, yy, W / 2, 4, 0, 0.05, 3.09); ctx.stroke(); }
      if (env.n === 'Lava-Powered Chamber' || env.n === 'Futuristic Laboratory' || env.n === 'Toxic Industrial Plant') { ctx.fillStyle = '#ffd34d'; ctx.fillRect(cx - 6, top + 20, 12, 6); }
    } else if (k === 'boulder') {
      const c = shade(env.wall[0], -0.1), top = by - Hh * 1.05;
      const g = ctx.createRadialGradient(cx - W * 0.2, top + Hh * 0.3, 4, cx, by - Hh * 0.4, W * 0.7); g.addColorStop(0, shade(c, 0.35)); g.addColorStop(0.6, c); g.addColorStop(1, shade(c, -0.55));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w.x, by - 4); ctx.lineTo(w.x + 3, by - Hh * 0.6); ctx.lineTo(w.x + W * 0.25, top + 4); ctx.lineTo(w.x + W * 0.6, top); ctx.lineTo(w.x + W - 2, by - Hh * 0.55); ctx.lineTo(w.x + W, by - 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(w.x + W * 0.3, top + 6); ctx.lineTo(w.x + W * 0.45, by - Hh * 0.5); ctx.lineTo(w.x + W * 0.4, by - 6); ctx.stroke();
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

  function drawWall(w) { drawWall0(w); if (w.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, w.flash * 6)})`; rr(w.x - 2, w.y - 14, w.w + 4, w.h + 14, 4); ctx.fill(); } }
  function drawWall0(w) { if (w.k === 'crate') drawSlab(w, ['#c9965a', '#8a5a2b', 'crate']); else if (w.k) drawObj(w); else drawSlab(w, envOf(run.room).wall); }
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


  // ---------- room atmosphere: lasting marks, wall dressing, drifting fog, and real darkness with light pools ----------
  let decal = { cv: null, c: null, key: '', clear: true, k: 1 };
  function ensureDecal() {
    const k = S * Math.min(dpr, 2), key = RW + 'x' + RH + '|' + k;
    if (!decal.cv || decal.key !== key) { decal.cv = document.createElement('canvas'); decal.cv.width = Math.round(RW * k); decal.cv.height = Math.round(RH * k); decal.c = decal.cv.getContext('2d'); decal.key = key; decal.k = k; decal.clear = true; }
    if (decal.clear) { decal.c.setTransform(1, 0, 0, 1, 0, 0); decal.c.clearRect(0, 0, decal.cv.width, decal.cv.height); decal.clear = false; }
  }
  function addDecal(x, y, kind, sz) {                                   // kills leave goo, blasts leave scorch marks
    ensureDecal(); const c = decal.c; c.save(); c.setTransform(decal.k, 0, 0, decal.k, 0, 0);
    if (kind === 'goo') {
      const rn = seeded(Math.floor(x * 7 + y * 13)), n = 4 + Math.floor(sz / 6);
      for (let i = 0; i < n; i++) { const a = rn() * 6.28, d = rn() * sz * 1.1, rx = sz * (0.25 + rn() * 0.45), ry = rx * 0.6; c.fillStyle = 'rgba(40,110,20,.55)'; c.beginPath(); c.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, rx, ry, rn(), 0, 6.28); c.fill(); c.fillStyle = 'rgba(140,255,70,.35)'; c.beginPath(); c.ellipse(x + Math.cos(a) * d - 1, y + Math.sin(a) * d * 0.6 - 1, rx * 0.7, ry * 0.7, rn(), 0, 6.28); c.fill(); }
    } else {
      const g = c.createRadialGradient(x, y, 1, x, y, sz); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(0.6, 'rgba(10,6,4,.35)'); g.addColorStop(1, 'rgba(10,6,4,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, sz, 0, 6.28); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; const rn = seeded(Math.floor(x * 3 + y * 5)); for (let i = 0; i < 6; i++) { const a = rn() * 6.28; c.beginPath(); c.moveTo(x + Math.cos(a) * sz * 0.3, y + Math.sin(a) * sz * 0.3); c.lineTo(x + Math.cos(a + 0.2) * sz * 0.95, y + Math.sin(a + 0.2) * sz * 0.95); c.stroke(); }
    }
    c.restore();
  }
  function drawDecals() { if (!decal.cv) return; ensureDecal(); ctx.drawImage(decal.cv, camX * decal.k, camY * decal.k, AW * decal.k, AH * decal.k, camX, camY, AW, AH); }

  const DARK = { 'Underground Bunker': 0.62, 'Opp Sewer': 0.5, 'Toxic Industrial Plant': 0.42, 'Neon Warehouse': 0.38, 'High-Security Vault': 0.4, 'Final Boss Arena': 0.5, 'Frozen Facility': 0.22 };
  let lightCv = null;
  function drawLighting(now) {
    const env = envOf(run.room), dk = DARK[env.n]; if (!dk) return;
    if (!lightCv || lightCv.width !== Math.round(W * dpr) || lightCv.height !== Math.round(H * dpr)) { lightCv = document.createElement('canvas'); lightCv.width = Math.round(W * dpr); lightCv.height = Math.round(H * dpr); }
    const lc = lightCv.getContext('2d'); lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, lightCv.width, lightCv.height);
    lc.setTransform(dpr * S, 0, 0, dpr * S, -camX * dpr * S, -camY * dpr * S);
    lc.fillStyle = `rgba(3,5,8,${dk})`; lc.fillRect(camX - 2, camY - 2, AW + 4, AH + 4); lc.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a) => { const g = lc.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = g; lc.fillRect(x - r, y - r, r * 2, r * 2); };
    const fl = 0.9 + 0.1 * Math.sin(now / 110) * Math.sin(now / 370);
    if (state === 'play' || state === 'clear') light(P.x, P.y, 230 * fl, 1);
    for (const sx of [-1, 1]) light(RW / 2 + sx * 62, TOP - 6, 130 * fl, 0.9);
    for (const b of pbul) light(b.x, b.y, 80, 0.85);
    for (const f of fx) { if (f.k === 'm') light(f.x, f.y, 90, 0.9); else if (f.k === 'r') light(f.x, f.y, f.r * 1.8, Math.min(1, f.life / f.max + 0.2)); else if (f.k === 'l' || f.k === 'z') light((f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2, 100, 0.8); }
    for (const e of enemies) { if (e.burnT > 0) light(e.x, e.y, 90, 0.7); if (e.boss) light(e.x, e.y, 150, 0.7); }
    for (const z of zones) light(z.x, z.y, z.r * 2.4, 0.7);
    for (const h of hazards) if (h.k === 'vent' && h.st > 0 || h.k === 'laser' && h.st === 2 || h.k === 'toxic') light(h.k === 'laser' ? P.x : h.x, h.y, h.k === 'laser' ? 240 : 110, 0.8);
    for (const m of mines) light(m.x, m.y, 90, 0.7);
    for (const p of pickups) light(p.x, p.y, 36, 0.6);
    if (state === 'clear') light(RW / 2, TOP, 220, 1);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lightCv, 0, 0); ctx.restore();
  }
  function paintDressing(env, room) {                                    // static wall dressing, baked into the room
    const xa = PAD + 4, xb = RW - PAD - 4, yt = TOP - 2, rn = seeded(room * 19 + 4), cx = RW / 2;
    const notDoor = x => Math.abs(x - cx) > 64;
    switch (env.n) {
      case 'Frozen Facility':
        for (let x = xa; x < xb; x += 9 + rn() * 12) { if (!notDoor(x)) continue; const h = 10 + rn() * 26, w = 4 + rn() * 4; const g = ctx.createLinearGradient(0, yt, 0, yt + h); g.addColorStop(0, '#eaf9ff'); g.addColorStop(1, '#7fc3e8'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w, yt); ctx.lineTo(x, yt + h); ctx.lineTo(x + w, yt); ctx.fill(); ctx.strokeStyle = 'rgba(20,60,90,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
        break;
      case 'Opp Sewer': case 'Toxic Industrial Plant': case 'Underground Bunker':
        for (const yy of [yt + 4]) { const pg = ctx.createLinearGradient(0, yy, 0, yy + 14); pg.addColorStop(0, '#8a979e'); pg.addColorStop(0.5, '#4a565c'); pg.addColorStop(1, '#1a2024'); ctx.fillStyle = pg; ctx.fillRect(xa, yy, cx - 62 - xa, 14); ctx.fillRect(cx + 62, yy, xb - cx - 62, 14); ctx.fillStyle = '#2a3236'; for (let x = xa + 30; x < xb; x += 70) if (notDoor(x)) { ctx.fillRect(x, yy - 2, 8, 18); } }
        break;
      case 'Futuristic Laboratory':
        for (let i = 0; i < 6; i++) { const x = xa + 20 + i * ((xb - xa - 40) / 5); if (!notDoor(x)) continue; ctx.fillStyle = '#1a2230'; rr(x - 11, yt + 2, 22, 40, 6); ctx.fill(); const lg = ctx.createLinearGradient(0, yt, 0, yt + 40); const col = i % 2 ? '120,255,200' : '120,200,255'; lg.addColorStop(0, `rgba(${col},.9)`); lg.addColorStop(1, `rgba(${col},.3)`); ctx.fillStyle = lg; rr(x - 8, yt + 6, 16, 32, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; rr(x - 8, yt + 6, 16, 32, 4); ctx.stroke(); }
        break;
      case 'Military Research Base':
        for (let x = xa; x < xb; x += 34) { if (!notDoor(x)) continue; ctx.fillStyle = '#9a8a5a'; rr(x, yt + 4, 30, 14, 7); ctx.fill(); ctx.strokeStyle = '#4a3a1a'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(x + 6, yt + 6); ctx.lineTo(x + 6, yt + 16); ctx.moveTo(x + 15, yt + 5); ctx.lineTo(x + 15, yt + 17); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(210,210,200,.55)'; ctx.lineWidth = 1.2; for (const sx of [xa + 2, xb - 2]) { ctx.beginPath(); for (let y = TOP + 40; y < RH; y += 14) { ctx.lineTo(sx + ((y / 14) % 2 ? 6 : -6), y); } ctx.stroke(); }
        break;
      case 'Desert Compound':
        ctx.fillStyle = 'rgba(230,190,120,.5)'; for (const sx of [xa, xb]) for (let y = TOP + 20; y < RH; y += 90) { ctx.beginPath(); ctx.ellipse(sx, y + rn() * 30, 18 + rn() * 12, 40 + rn() * 20, 0, 0, 6.28); ctx.fill(); }
        break;
      case 'Lava-Powered Chamber':
        for (const sx of [PAD - 6, RW - PAD - 6]) { const lg = ctx.createLinearGradient(sx, 0, sx + 12, 0); lg.addColorStop(0, 'rgba(255,90,20,.9)'); lg.addColorStop(1, 'rgba(255,200,80,.2)'); ctx.fillStyle = lg; ctx.fillRect(sx, TOP, 12, RH - TOP); }
        break;
      case 'High-Security Vault':
        for (const sx of [xa + 6, xb - 40]) for (let r2 = 0; r2 < 3; r2++) for (let c2 = 0; c2 < 3 - r2; c2++) { const gx = sx + c2 * 13 + r2 * 6, gy = yt + 8 + (2 - r2) * 8; const gg = ctx.createLinearGradient(gx, gy, gx, gy + 8); gg.addColorStop(0, '#fff1b8'); gg.addColorStop(1, '#b8892f'); ctx.fillStyle = gg; ctx.fillRect(gx, gy, 12, 7); ctx.strokeStyle = '#5a3d0a'; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, 12, 7); }
        break;
      case 'Neon Warehouse':
        for (const [x, w, c] of [[xa + 30, 60, '#ff3df2'], [xb - 90, 60, '#3de8ff']]) { ctx.fillStyle = '#12081e'; rr(x, yt + 4, w, 20, 4); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2; rr(x + 2, yt + 6, w - 4, 16, 3); ctx.stroke(); }
        break;
    }
  }
  function drawDressing(env, now) {                                      // animated bits: drips, bubbles, neon flicker, searchlight, sand gusts
    const t = now / 1000, cx = RW / 2;
    if (env.n === 'Opp Sewer' || env.n === 'Toxic Industrial Plant') {
      for (let i = 0; i < 5; i++) { const x = PAD + 40 + i * ((RW - PAD * 2 - 80) / 4); if (Math.abs(x - cx) < 66) continue; const u = (t * 0.7 + i * 0.37) % 1, y = TOP + 16 + u * 70; ctx.fillStyle = 'rgba(150,255,80,.9)'; ctx.beginPath(); ctx.ellipse(x, y, 2, 3.4, 0, 0, 6.28); ctx.fill(); if (u > 0.93) { ctx.strokeStyle = 'rgba(190,255,120,.7)'; ctx.beginPath(); ctx.ellipse(x, TOP + 86, (u - 0.93) * 120, (u - 0.93) * 40, 0, 0, 6.28); ctx.stroke(); } }
    } else if (env.n === 'Futuristic Laboratory') {
      for (let i = 0; i < 6; i++) { const x = PAD + 24 + i * ((RW - PAD * 2 - 48) / 5); if (Math.abs(x - cx) < 64) continue; const u = (t * 0.5 + i * 0.2) % 1; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + i) * 3, TOP + 36 - u * 28, 1.6 + (i % 2), 0, 6.28); ctx.fill(); }
      rglow(cx, TOP + 20, RW * 1.1, '#6ad0ff', 0.08 + 0.03 * Math.sin(t * 3));
    } else if (env.n === 'Neon Warehouse') {
      for (const [x, w, c, txtS] of [[PAD + 34, 60, '#ff3df2', 'OPPS'], [RW - PAD - 94, 60, '#3de8ff', 'EXIT']]) {
        const fl = Math.sin(t * 9 + x) > 0.93 ? 0.3 : 1; rglow(x + w / 2, TOP + 16, 120, c, 0.5 * fl);
        ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 10 * fl; ctx.font = '800 12px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c; ctx.globalAlpha = fl; ctx.fillText(txtS, x + w / 2, TOP + 16); ctx.restore();
      }
    } else if (env.n === 'Military Research Base') {
      const a = Math.sin(t * 0.6) * 0.5; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const sg = ctx.createLinearGradient(RW * 0.15, TOP, RW * 0.15 + Math.sin(a) * RW, RH); sg.addColorStop(0, 'rgba(255,255,220,.22)'); sg.addColorStop(1, 'rgba(255,255,220,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(RW * 0.15 - 6, TOP); ctx.lineTo(RW * 0.15 + 6, TOP); ctx.lineTo(RW * 0.15 + Math.sin(a) * RW + 90, RH); ctx.lineTo(RW * 0.15 + Math.sin(a) * RW - 90, RH); ctx.fill(); ctx.restore();
    } else if (env.n === 'Desert Compound') {
      ctx.strokeStyle = 'rgba(255,230,170,.18)'; ctx.lineWidth = 2; for (let i = 0; i < 9; i++) { const u = (t * 0.25 + i * 0.11) % 1, y = TOP + i * ((RH - TOP) / 9), x = -60 + u * (RW + 120); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 70, y + 6); ctx.stroke(); }
    } else if (env.n === 'Lava-Powered Chamber') {
      for (const sx of [PAD, RW - PAD]) rglow(sx, (TOP + RH) / 2, RH * 0.8, '#ff6a2a', 0.1 + 0.05 * Math.sin(t * 2 + sx));
      for (let i = 0; i < 6; i++) { const sx = i % 2 ? RW - PAD : PAD, u = (t * 0.3 + i * 0.17) % 1; ctx.fillStyle = 'rgba(255,190,80,.9)'; ctx.beginPath(); ctx.arc(sx + (i % 2 ? -4 : 4) + Math.sin(t * 3 + i) * 3, RH - u * (RH - TOP), 2, 0, 6.28); ctx.fill(); }
    } else if (env.n === 'High-Security Vault') {
      for (let i = 0; i < 12; i++) { const a = Math.max(0, Math.sin(t * 1.6 + i * 2.1)); if (a > 0.6) rglow(PAD + 30 + ((i * 53) % (RW - PAD * 2 - 60)), TOP + 10 + ((i * 37) % 60), 18 * a, '#ffe9a0', a); }
    }
  }

  function draw(now) {
    btns = [];
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    const SCREENS = { title: drawTitle, menu: drawMenu, apes: drawApes, shop: drawShop, codex: drawCodex, achv: drawAchv, settings: drawSettings };
    if (SCREENS[state]) {
      if (state === 'shop') drawLabBg(now, 0.75);
      ctx.save(); ctx.translate(0, UIY); SCREENS[state](now); ctx.restore(); return;
    }
    ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, AW, AH);

    ctx.save();
    if (shake > 0 && save.set.shake) ctx.translate(rand(-1, 1) * shake * 24, rand(-1, 1) * shake * 24);
    ctx.translate(-camX, -camY);                                                                  // everything below is in room coordinates
    drawFloor(run.room);
    ctx.save(); ctx.translate(camX, camY); drawAmbient(run.room, now); ctx.restore();             // weather stays on the screen
    drawDecals(); drawDressing(envOf(run.room), now);
    if (state === 'clear') drawDoorOpen(now);                                                  // the exit door lights up

    for (const p of pickups) { shadow(p.x + 2, p.y + 7, 6, 2.5); const sq = Math.abs(Math.cos((p.x + p.y) * 0.05 + performance.now() / 300)); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(0.35 + 0.65 * sq, 1); coinArt(0, 0, 7); ctx.restore(); }
    for (const sx of [-1, 1]) {                                       // flickering torches either side of the exit
      const tx = RW / 2 + sx * 62, ty = TOP - 12, t2 = performance.now() / 90 + sx * 3, fl = 0.8 + 0.2 * Math.sin(t2) + 0.1 * Math.sin(t2 * 2.3);
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(tx - 4, ty + 6); ctx.quadraticCurveTo(tx - 6, ty - 2, tx, ty - 11 * fl); ctx.quadraticCurveTo(tx + 6, ty - 2, tx + 4, ty + 6); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.moveTo(tx - 2, ty + 6); ctx.quadraticCurveTo(tx - 3, ty, tx, ty - 6 * fl); ctx.quadraticCurveTo(tx + 3, ty, tx + 2, ty + 6); ctx.fill();
    }
    for (const h of hazards) drawHazard(h, performance.now());
    for (const m of mines) { const k = 1 - m.t / m.arm, pl = 0.5 + 0.5 * Math.sin(performance.now() / (120 - 80 * k)); ctx.fillStyle = `rgba(255,70,50,${0.12 + 0.25 * k})`; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.28); ctx.fill(); ctx.strokeStyle = `rgba(255,110,70,${0.5 + 0.5 * pl})`; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(m.x, m.y, 7, 0, 6.28); ctx.fill(); ctx.fillStyle = `rgba(255,74,42,${0.5 + 0.5 * pl})`; ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, 6.28); ctx.fill(); }
    for (const z of zones) {                                          // lingering fire, poison and ice
      const a = Math.min(1, z.t / 0.6) * 0.35, col = z.kind === 'fire' ? '255,122,42' : z.kind === 'poison' ? '139,255,90' : '143,227,255';
      ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.7, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = `rgba(${col},${a + 0.2})`; ctx.lineWidth = 1.5; ctx.stroke();
    }
    const list = [];                                                  // things lower on screen draw on top
    for (const w of walls) list.push({ y: w.y + w.h, f: () => drawWall(w) });
    for (const e of enemies) list.push({ y: e.y + e.r * 0.9, f: () => drawOpp(e) });
    if (state === 'play' || state === 'clear') list.push({ y: P.y + P.r * 3.0, f: () => {
      const blink = P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0;
      ctx.globalAlpha = blink ? 0.35 : 1;
      { const bw = 40, bx = P.x - bw / 2, by = P.y - P.r * 2.2, hp = clamp(P.hp / P.hpMax, 0, 1); ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 7); ctx.fillStyle = hp > 0.35 ? '#5fe070' : '#ff6a5a'; ctx.fillRect(bx, by, bw * hp, 5); }
      ctx.save(); ctx.translate(P.x, P.y + P.r * 2.6); ctx.rotate(clamp((P.vx || 0) / Math.max(1, P.speed), -1, 1) * 0.1); ctx.translate(0, -P.r * 2.6); ctx.scale(1.3, 1.3);
      drawApe(ctx, 0, 0, P.r, P.ch, P.aim, 0, P.walk || 0, P.mv || 0, (P.sl || 0) > 0 ? ((P.sl / 0.14) * 1.5 - 0.75) * -1 : 0, false, P.face);
      ctx.restore();
      ctx.globalAlpha = 1;
    } });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) { ctx.save(); try { it.f(); } catch (err) { console.error(err); } finally { ctx.restore(); } }
    for (const f of fx) {
      const a = Math.max(0, f.life / (f.max || 1));
      if (f.k === 'p') { ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); glowAt(f.x, f.y, 14, f.col, a * 0.5); }
      else if (f.k === 'm') glowAt(f.x, f.y, 44, '#ffe9a0', a);
      else if (f.k === 'f') { glowAt(f.x, f.y, 16 + (1 - a) * 26, a > 0.5 ? '#ffc94d' : '#ff4a1f', a * 0.9); }
      else if (f.k === 'r') { glowAt(f.x, f.y, f.r * 2.6 * (1.1 - a * 0.4), '#ff9a3a', a); ctx.globalAlpha = a; ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - a * 0.6), 0, 6.28); ctx.stroke(); }
      else if (f.k === 'l') { glowAt((f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2, 60, f.col, a * 0.4); ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = f.w * a + 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, f.w * a * 0.4); ctx.stroke(); }
      else if (f.k === 'gh') { ctx.globalAlpha = a * 0.4; ctx.fillStyle = f.col; ctx.beginPath(); ctx.ellipse(f.x, f.y + P.r * 1.4, 12, 22, 0, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(f.x, f.y, 11, 0, 6.28); ctx.fill(); }
      else if (f.k === 's') { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); glowAt(f.r * 0.6, 0, f.r * 1.6, '#cfe6ff', a * 0.5); ctx.strokeStyle = `rgba(235,245,255,${a})`; ctx.lineWidth = 7 * a + 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, f.r * (0.72 + 0.28 * (1 - a)), -f.cone / 2, f.cone / 2); ctx.stroke(); ctx.restore(); }
      else if (f.k === 'z') { ctx.globalAlpha = a; ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); const n = 5; for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(f.x1 + (f.x2 - f.x1) * u + rand(-8, 8), f.y1 + (f.y2 - f.y1) * u + rand(-8, 8)); } ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
      else if (f.k === 'c') { ctx.globalAlpha = a; txt(f.txt || 'CRIT', f.x, f.y - (1 - a) * 18, 12, f.txt === 'BLOCKED' ? '#aab' : (f.txt && f.txt[0] === '+') ? '#ffe27a' : f.txt === 'DODGE' || f.txt === 'SHIELD' ? '#7df9ff' : '#ffd34d'); }
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
      } else if (b.k === 'orb') {
        const pul = 1 + 0.15 * Math.sin(b.spin);
        glowAt(b.x, b.y, b.r * 7 * pul, b.col, 0.95);
        ctx.fillStyle = b.elem === 'shadow' ? '#1a0f33' : '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.75, 0, 6.28); ctx.fill();
        if (b.elem === 'ice') { ctx.fillStyle = '#eaf9ff'; ctx.beginPath(); ctx.moveTo(b.x + Math.cos(Math.atan2(b.vy, b.vx)) * b.r * 1.8, b.y + Math.sin(Math.atan2(b.vy, b.vx)) * b.r * 1.8); ctx.lineTo(b.x - b.vy / 200 * b.r, b.y + b.vx / 200 * b.r); ctx.lineTo(b.x + b.vy / 200 * b.r, b.y - b.vx / 200 * b.r); ctx.fill(); }
      } else { glowAt(b.x, b.y, b.r * 6, b.col, 0.9); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, 6.28); ctx.fill(); }
    }
    for (const b of ebul) { if (b.it) { drawEItem(b); continue; } glowAt(b.x, b.y, b.r * 5, '#ff4d6d', 0.8); ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, 6.28); ctx.fill(); }
    ctx.restore();

    if (state === 'play' && run.room === 1 && bannerT > 0 && !joy.on) { txt('Drag to move. Stop to shoot.', AW / 2, AH - BOT - 34, 14, 'rgba(255,255,255,.85)'); txt('Explore: Opps wake up when you get close.', AW / 2, AH - BOT - 14, 12, 'rgba(255,255,255,.75)'); }

    drawLighting(now);
    { const vg = ctx.createRadialGradient(AW / 2, AH * 0.52, Math.min(AW, AH) * 0.32, AW / 2, AH * 0.52, Math.max(AW, AH) * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,2,12,.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, AW, AH); }
    if ((state === 'play' || state === 'clear') && joy.on) {                  // thumb stick, only while touching
      const sx = joy.on ? joy.ox : AW / 2, sy = joy.on ? joy.oy : AH * 0.66, kx = sx + (joy.on ? joy.dx * 58 : 0), ky = sy + (joy.on ? joy.dy * 58 : 0), al = joy.on ? 1 : 0.35;
      ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.arc(sx, sy, 66, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(190,205,215,.75)'; ctx.beginPath(); ctx.arc(kx, ky, 27, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(30,40,50,.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(30,40,50,.75)'; ctx.beginPath(); ctx.arc(kx, ky + 1, 10, 0, 6.28); ctx.arc(kx - 11, ky - 5, 5, 0, 6.28); ctx.arc(kx + 11, ky - 5, 5, 0, 6.28); ctx.fill();      // monkey emblem
      ctx.restore();
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,70,110,${flash * 0.6})`; ctx.fillRect(0, 0, AW, AH); }
    if (state === 'play' || state === 'clear') drawIndicators(now);
    drawHud();
    { const ib = enemies.find(e => e.boss && e.intro > 0);              // cinematic boss introduction
      if (ib) {
        const k = Math.min(1, ib.intro / 0.3, (1.9 - ib.intro) / 0.3), bh = (AH * 0.16) * Math.max(0, k);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, AW, bh + hudY * 0.4); ctx.fillRect(0, AH - bh, AW, bh);
        const vg2 = ctx.createRadialGradient(AW / 2, AH * 0.4, 20, AW / 2, AH * 0.4, AH * 0.7); vg2.addColorStop(0, 'rgba(232,67,147,0)'); vg2.addColorStop(1, `rgba(232,67,147,${0.25 * k})`); ctx.fillStyle = vg2; ctx.fillRect(0, 0, AW, AH);
        ctx.globalAlpha = Math.min(1, k * 1.2); goldTxt(ib.name, AW / 2, AH - bh * 0.62, Math.min(34, AW * 0.09), 3); txt(ib.sub, AW / 2, AH - bh * 0.25, 11, '#e8d9b0'); ctx.globalAlpha = 1;
      }
    }
    if (bannerT > 0 && state === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT);
      if (bossRoom(run.room)) { txt('BOSS ROOM ' + run.room, AW / 2, AH * 0.45, Math.min(40, AW * 0.11), '#e84393'); txt('Something big is waiting...', AW / 2, AH * 0.45 + 36, 14, '#fff'); }
      else { txt('ROOM ' + run.room, AW / 2, AH * 0.45, 40, '#fff'); txt(envOf(run.room).n.toUpperCase(), AW / 2, AH * 0.45 + 38, 16, envOf(run.room).edge); }
      ctx.globalAlpha = 1;
    }
    if (msg) txt(msg.s, AW / 2, AH * 0.5, 34, '#ffd34d');
    if (state === 'clear') {
      if (bannerT > 0) { ctx.globalAlpha = Math.min(1, bannerT); txt(bossRoom(run.room) ? 'BOSS DOWN!' : 'ROOM CLEAR', AW / 2, AH * 0.45, 36, '#7bed9f'); txt('+' + clearBonus + ' Ape Coins', AW / 2, AH * 0.45 + 32, 15, '#ffd34d'); txt('Go through the top door', AW / 2, AH * 0.45 + 54, 14, '#fff'); ctx.globalAlpha = 1; }
      else txt('EXIT', AW / 2, TOP + 26, 12, '#7bed9f');
    }
    ctx.save(); ctx.translate(0, UIY);
    if (state === 'upgrade') drawUpgrade();
    if (state === 'over') drawOver();
    if (state === 'pause') drawPause();
    ctx.restore();
  }

  let roomTotal = 0;
  function drawIndicators(now) {
    const onScreen = (x, y, m = 20) => x > camX + m && x < camX + AW - m && y > camY + hudY + 44 && y < camY + AH - m;
    const arrowTo = (wx, wy, col, label) => {
      const cx = AW / 2, cy = AH / 2, dx = wx - camX - cx, dy = wy - camY - cy, l = Math.hypot(dx, dy) || 1;
      const mx = AW / 2 - 34, my = AH / 2 - 120, k = Math.min(mx / Math.abs(dx || 1e-6), my / Math.abs(dy || 1e-6));
      const x = cx + dx * Math.min(1, k) , y = cy + dy * Math.min(1, k) + 20, a = Math.atan2(dy, dx), bob = Math.sin(now / 200) * 3;
      ctx.save(); ctx.translate(x + Math.cos(a) * bob, y + Math.sin(a) * bob); ctx.rotate(a);
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      if (label) txt(label, x, y + (dy < 0 ? 26 : -26), 10, '#fff');
    };
    if (state === 'clear' && !onScreen(RW / 2, TOP, 0)) arrowTo(RW / 2, TOP, '#7bed9f', 'EXIT');
    else if (state === 'play' && enemies.length && !enemies.some(e => onScreen(e.x, e.y, 0))) {
      let best = null, bd = 1e9; for (const e of enemies) { const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < bd) { bd = d; best = e; } }
      if (best) arrowTo(best.x, best.y, '#ff6a5a', 'OPPS');
    }
  }
  function drawHud() {
    const y = hudY, now = performance.now(), boss = enemies.find(e => e.boss && !e.clone);
    const stage = Math.floor((run.room - 1) / 10) + 1, rin = ((run.room - 1) % 10) + 1;
    ctx.font = '800 15px "Courier New", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText('Stage ' + stage + ' - ' + rin + '/10', 17, y + 1.5); ctx.fillStyle = '#eef5f0'; ctx.fillText('Stage ' + stage + ' - ' + rin + '/10', 16, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    slate(AW - 168, y - 11, 104, 22, 6); coinArt(AW - 154, y, 8); txt(save.ban.toLocaleString(), AW - 72, y + 1, 12, '#ffe27a', 'right');
    if (state === 'play' || state === 'clear') {                                                  // pause button
      const bx = AW - 54, by = y - 15;
      btns.push({ x: bx - 4, y: by - 6, w: 46, h: 46, cb: pauseGame, label: 'pause' });
      slate(bx + 4, by + 4, 30, 22, 6); ctx.fillStyle = '#e8f2ee'; ctx.fillRect(bx + 14, by + 9, 4, 12); ctx.fillRect(bx + 21, by + 9, 4, 12);
    }
    // red progress bar: how much of the room is left (or the boss's health)
    const remaining = queue.length + enemies.filter(e => !e.clone).length; roomTotal = Math.max(roomTotal, remaining);
    const frac = boss ? boss.hp / boss.max : roomTotal ? remaining / roomTotal : 0, by2 = y + 14;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(16, by2, AW - 32, 12, 6); ctx.fill();
    const bg = ctx.createLinearGradient(0, by2, 0, by2 + 12); bg.addColorStop(0, boss ? '#ff7ac8' : '#ff8a7a'); bg.addColorStop(1, boss ? '#b8286a' : '#c43a2a'); ctx.fillStyle = bg; rr(16, by2, Math.max(6, (AW - 32) * frac), 12, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(18, by2 + 1.5, Math.max(4, (AW - 36) * frac), 3.5, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.5; rr(16, by2, AW - 32, 12, 6); ctx.stroke();
    txt(boss ? boss.name : remaining + ' LEFT', AW / 2, by2 + 6.5, 9, '#fff');
    if (state === 'play' || state === 'clear') {
      const px = 8, py = AH - Math.max(BOT, UIB - 8) - 78, ps = 58, A = ABIL[P.ch.ability], ready = P.abCd <= 0, cx = px + ps / 2, cy = py - 36;
      drawPortrait(P.ch, px, py, ps, now, false);                                                  // portrait and health, bottom left
      const hp = clamp(P.hp / P.hpMax, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.65)'; rr(px, py + ps + 3, ps, 9, 4); ctx.fill();
      const hg = ctx.createLinearGradient(0, py + ps + 3, 0, py + ps + 12); hg.addColorStop(0, hp > 0.35 ? '#8bf08b' : '#ff9a8a'); hg.addColorStop(1, hp > 0.35 ? '#2f9a3a' : '#c0382a'); ctx.fillStyle = hg; rr(px, py + ps + 3, Math.max(4, ps * hp), 9, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 1.2; rr(px, py + ps + 3, ps, 9, 4); ctx.stroke(); txt(Math.ceil(P.hp) + '/' + P.hpMax, px + ps / 2, py + ps + 8, 7, '#fff');
      for (let i = 0; i < 2; i++) { ctx.fillStyle = i < P.lives ? '#ff4d6d' : 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(px + ps + 10 + i * 15, py + 10, 6, 0, 6.28); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke(); }
      if (P.shieldMax) for (let i = 0; i < P.shieldMax; i++) { ctx.fillStyle = i < P.shieldHits ? '#7df9ff' : 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(px + ps + 10 + i * 15, py + 28, 5, 0, 6.28); ctx.fill(); }
      btns.push({ x: cx - 34, y: cy - 34, w: 68, h: 68, cb: useAbility, label: 'ability' });                // ability, like the potion button
      glowAt(cx, cy, 90, ready ? '#ffd34d' : '#6a5a9a', ready ? 0.4 + 0.2 * Math.sin(now / 200) : 0.12);
      const rg = ctx.createLinearGradient(cx - 26, cy - 26, cx + 26, cy + 26); rg.addColorStop(0, ready ? '#c9d6d2' : '#6d6a85'); rg.addColorStop(1, ready ? '#5a6a66' : '#3a3852');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 6.28); ctx.fill(); ctx.fillStyle = '#16211f'; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 6.28); ctx.fill();
      if (!ready) { ctx.fillStyle = 'rgba(120,150,170,.55)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + 6.28 * (1 - P.abCd / (A.cd * P.cdr))); ctx.closePath(); ctx.fill(); }
      txt(ready ? A.n.toUpperCase() : Math.ceil(P.abCd) + 's', cx, cy + 1, ready ? 7 : 15, ready ? '#f6e3a1' : '#cfe0dc');
    }
  }

  let shopTab = 0, shopChar = 0, shopPage = 0;
  const SHOP_PAGE = 7;
  // ---------- sewer-lab theme for the menus ----------
  let labCache = { key: '', cv: null };
  function paintLab() {
    const g = ctx;
    const bg = g.createLinearGradient(0, 0, 0, AH); bg.addColorStop(0, '#1b2620'); bg.addColorStop(1, '#0b100e'); g.fillStyle = bg; g.fillRect(0, 0, AW, AH);
    const rn = seeded(77);                                                                    // brick wall
    for (let y = 0, row = 0; y < AH; y += 20, row++) for (let x = -(row % 2) * 24; x < AW; x += 48) {
      const v = rn(); g.fillStyle = `rgb(${34 + v * 26},${40 + v * 24},${30 + v * 16})`; g.fillRect(x + 1, y + 1, 46, 18);
      g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(x + 1, y + 1, 46, 2); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 1, y + 17, 46, 2);
    }
    const pipe = (x, y, w, h, vert) => {                                                       // steel pipes with flanges
      const pg = vert ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
      pg.addColorStop(0, '#2a3338'); pg.addColorStop(0.3, '#8a979e'); pg.addColorStop(0.55, '#5a666c'); pg.addColorStop(1, '#222a2e');
      g.fillStyle = pg; g.fillRect(x, y, w, h); g.strokeStyle = '#101417'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
      g.fillStyle = '#3a454a'; if (vert) for (let yy = y + 30; yy < y + h; yy += 90) { g.fillRect(x - 4, yy, w + 8, 10); g.strokeRect(x - 4, yy, w + 8, 10); } else for (let xx = x + 40; xx < x + w; xx += 110) { g.fillRect(xx, y - 4, 10, h + 8); g.strokeRect(xx, y - 4, 10, h + 8); }
    };
    pipe(0, AH * 0.06, AW, 22, false); pipe(0, AH * 0.12, AW, 14, false); pipe(AW * 0.12, 0, 20, AH * 0.5, true); pipe(AW * 0.84, 0, 24, AH * 0.42, true); pipe(0, AH * 0.3, AW * 0.5, 16, false);
    const vx = AW / 2, vy = AH * 0.5, vr = Math.min(AW * 0.24, 92);                           // the serum vat
    g.fillStyle = '#2a1e16'; g.beginPath(); g.arc(vx, vy, vr + 16, 0, 6.28); g.fill(); g.strokeStyle = '#120c08'; g.lineWidth = 4; g.stroke();
    for (let i = 0; i < 28; i++) { const a = i / 28 * 6.28; g.fillStyle = i % 2 ? '#4a3a2c' : '#5a4a3a'; g.beginPath(); g.arc(vx + Math.cos(a) * (vr + 8), vy + Math.sin(a) * (vr + 8), 8, 0, 6.28); g.fill(); }
    const sg = g.createRadialGradient(vx, vy, 4, vx, vy, vr); sg.addColorStop(0, '#d8ff6a'); sg.addColorStop(0.5, '#6bd12a'); sg.addColorStop(1, '#1f5a14'); g.fillStyle = sg; g.beginPath(); g.arc(vx, vy, vr, 0, 6.28); g.fill();
    g.strokeStyle = 'rgba(30,20,10,.7)'; g.lineWidth = 2; for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(vx + i * vr / 4, vy - vr); g.lineTo(vx + i * vr / 4 - vr * 0.1, vy + vr); g.stroke(); }   // netting
    const stream = g.createLinearGradient(0, vy + vr, 0, AH * 0.8); stream.addColorStop(0, '#9dff3a'); stream.addColorStop(1, '#4fb81a'); g.fillStyle = stream; g.fillRect(vx - 22, vy + vr - 6, 44, AH * 0.8 - vy - vr + 6);
    g.fillStyle = '#5a3d22'; for (let i = 0; i < 7; i++) { g.fillRect(vx - 110 + i * 6, AH * 0.8 + i * 14, 220 - i * 12, 12); g.strokeStyle = '#2a1a0c'; g.lineWidth = 1.5; g.strokeRect(vx - 110 + i * 6, AH * 0.8 + i * 14, 220 - i * 12, 12); }   // wooden walkway
    const bar = (x, y) => { const bgr = g.createLinearGradient(x, 0, x + 54, 0); bgr.addColorStop(0, '#3a4a3a'); bgr.addColorStop(0.4, '#7a8a6a'); bgr.addColorStop(1, '#2a352a'); g.fillStyle = bgr; rr(x, y, 54, 64, 10); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#222'; g.fillRect(x, y + 10, 54, 4); g.fillRect(x, y + 50, 54, 4);
      g.fillStyle = '#ffd02a'; g.beginPath(); g.arc(x + 27, y + 32, 13, 0, 6.28); g.fill(); g.fillStyle = '#111'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + 27, y + 32); g.arc(x + 27, y + 32, 11, k * 2.09 + 0.3, k * 2.09 + 1.2); g.closePath(); g.fill(); } };
    bar(AW * 0.04, AH * 0.62); bar(AW * 0.04 + 30, AH * 0.68); bar(AW * 0.82, AH * 0.66);
    const vg = g.createRadialGradient(AW / 2, AH * 0.45, AH * 0.2, AW / 2, AH * 0.45, AH * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)'); g.fillStyle = vg; g.fillRect(0, 0, AW, AH);
  }
  function drawLabBg(now, dim) {
    const key = W + 'x' + H + '|' + dpr;
    if (labCache.key !== key) {
      const off = document.createElement('canvas'); off.width = Math.round(W * dpr); off.height = Math.round(H * dpr);
      const main = ctx; ctx = off.getContext('2d'); ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
      try { paintLab(); } finally { ctx = main; }
      labCache = { key, cv: off };
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(labCache.cv, 0, 0); ctx.restore();
    const vx = AW / 2, vy = AH * 0.5, t = now / 1000;
    glowAt(vx, vy, 360, '#8bff3a', 0.35 + 0.1 * Math.sin(t * 2)); glowAt(vx, AH * 0.8, 300, '#8bff3a', 0.3);
    ctx.fillStyle = 'rgba(190,255,120,.8)'; for (let i = 0; i < 9; i++) { const u = (t * 0.35 + i * 0.13) % 1, bx = vx + Math.sin(i * 5.1 + t) * 50, by = vy + 40 - u * 140; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 3), 0, 6.28); ctx.fill(); } ctx.globalAlpha = 1;
    if (dim) { ctx.fillStyle = `rgba(6,10,8,${dim})`; ctx.fillRect(0, 0, AW, AH); }
  }
  function neonTxt(str, x, y, size, col, fl = 1) {
    ctx.save(); ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.shadowColor = col; ctx.shadowBlur = 24 * fl; ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.fillText(str, x, y); ctx.shadowBlur = 8 * fl; ctx.fillText(str, x, y); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(str, x, y); ctx.restore();
  }
  const LABG = '#4f9a4f';
  function slate(x, y, w, h, r = 10) {                                                          // riveted slate panel
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a6563'); g.addColorStop(1, '#2d4140');
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; rr(x, y, w, h, r); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#86a7a0'; ctx.lineWidth = 2; rr(x + 1, y + 1, w - 2, h - 2, r - 1); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; rr(x + 4, y + 4, w - 8, h - 8, r - 3); ctx.stroke();
  }
  function topBar(now) {                                                                          // profile, Ape Coins, settings
    const y = 12, ch = CHARS[sel];
    slate(12, y, 150, 40, 8); drawPortrait(ch, 17, y + 5, 30, now, false);
    txt('MONKEYS VS OPPS', 54, y + 14, 10, '#cfe8e2', 'left'); txt('BEST ROOM ' + save.best, 54, y + 28, 10, '#9fc4bc', 'left');
    slate(170, y, AW - 170 - 58, 40, 8); coinArt(190, y + 20, 10); txt(save.ban.toLocaleString(), AW - 70, y + 21, 15, '#ffe27a', 'right');
    btns.push({ x: AW - 52, y: y + UIY, w: 40, h: 40, cb: () => { state = 'settings'; }, label: 'gear' });
    slate(AW - 52, y, 40, 40, 8); ctx.strokeStyle = '#cfe8e2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(AW - 32, y + 20, 8, 0, 6.28); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; ctx.beginPath(); ctx.moveTo(AW - 32 + Math.cos(a) * 8, y + 20 + Math.sin(a) * 8); ctx.lineTo(AW - 32 + Math.cos(a) * 12, y + 20 + Math.sin(a) * 12); ctx.stroke(); }
  }
  function tabBar(active) {
    const bot = AH - UIY - (UIB - 14), h = 58, y = bot - h;                          // tabs sit above the home bar; the bar colour runs to the screen edge
    const g = ctx.createLinearGradient(0, y, 0, y + h + 80); g.addColorStop(0, '#3c5857'); g.addColorStop(1, '#1f302f'); ctx.fillStyle = g; ctx.fillRect(0, y, AW, h + 120);
    ctx.fillStyle = '#86a7a0'; ctx.fillRect(0, y, AW, 2);
    [['apes', 'APES'], ['menu', 'BATTLE']].forEach(([st, label], i) => {
      const x = i * (AW / 2), on = active === st;
      btns.push({ x, y: y + UIY, w: AW / 2, h, cb: () => { state = st; }, label: 'tab-' + st });
      if (on) { ctx.fillStyle = 'rgba(120,200,160,.18)'; ctx.fillRect(x, y + 2, AW / 2, h - 2); }
      ctx.save(); ctx.translate(x + AW / 4 - 46, y + h / 2); if (st === 'apes') { ball(0, 0, 11, '#c4602d'); ball(-11, -2, 5, '#c4602d'); ball(11, -2, 5, '#c4602d'); } else { ctx.strokeStyle = '#e8f2ee'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-11, 11); ctx.lineTo(11, -11); ctx.moveTo(11, 11); ctx.lineTo(-11, -11); ctx.stroke(); } ctx.restore();
      ctx.font = `800 17px "Courier New", monospace`; ctx.fillStyle = on ? '#fff' : '#a9c7c0'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; if ('letterSpacing' in ctx) ctx.letterSpacing = '2px'; ctx.fillText(label, x + AW / 4 - 24, y + h / 2); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    });
  }
  function levelOf(ch) { return permLevel(ch.id, 'lvl'); }
  function statsOf(ch) {
    const lv = levelOf(ch), dmgMul = 1 + 0.06 * permLevel(ch.id, 'dmg'), base = WEAP[ch.weapon].dmg;
    const dmg = base * (1 + 0.08 * lv) * dmgMul, hp = ch.hp + 10 * permLevel(ch.id, 'hp') + 12 * lv;
    return { lv, dmg, hp, dDmg: base * 0.08 * dmgMul, dHp: 12 };
  }

  // ---------- title ----------
  function drawTitle(now) {
    drawLabBg(now, 0);
    const fl = 1 - (Math.sin(now / 77) > 0.985 ? 0.55 : 0), cx = AW / 2, ty = AH * 0.2;
    ctx.save(); ctx.strokeStyle = '#3de8ff'; ctx.lineWidth = 3; ctx.shadowColor = '#3de8ff'; ctx.shadowBlur = 16 * fl; ctx.beginPath(); ctx.moveTo(cx - 132, ty + 90); ctx.lineTo(cx - 152, ty - 50); ctx.lineTo(cx + 152, ty - 50); ctx.lineTo(cx + 132, ty + 90); ctx.closePath(); ctx.stroke(); ctx.restore();
    neonTxt('MONKEYS', cx - 30, ty - 20, Math.min(40, AW * 0.108), '#3dff7a', fl);
    ctx.save(); ctx.translate(cx + 112, ty - 20); ctx.strokeStyle = '#ff3df2'; ctx.fillStyle = 'rgba(255,61,242,.25)'; ctx.lineWidth = 3; ctx.shadowColor = '#ff3df2'; ctx.shadowBlur = 14 * fl; ctx.beginPath(); ctx.arc(0, 0, 21, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(-22, -4, 7, 0, 6.28); ctx.arc(22, -4, 7, 0, 6.28); ctx.stroke();
    ctx.lineWidth = 2.5; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 11 - 4, -9); ctx.lineTo(sx * 11 + 4, -1); ctx.moveTo(sx * 11 + 4, -9); ctx.lineTo(sx * 11 - 4, -1); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(8, 10); ctx.stroke(); ctx.restore();
    neonTxt('VS', cx, ty + 20, 30, '#ffffff', fl * 0.8);
    neonTxt('OPPS', cx, ty + 64, Math.min(70, AW * 0.19), '#ff3df2', fl);
    ctx.save(); ctx.translate(cx - 150, ty + 70); ctx.rotate(-0.5); ctx.fillStyle = '#ffe14a'; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.ellipse(0, 0, 18, 7, 0, 0.2, 3); ctx.fill(); ctx.restore();
    const by = AH - UIY - 170;
    button(60, by, AW - 120, 50, 'PLAY', () => { state = 'menu'; }, { col: LABG, size: 20, label: 'title-play' });
    button(60, by + 60, AW - 120, 44, 'SETTINGS', () => { state = 'settings'; }, { col: '#5a7a6a', size: 15, label: 'title-settings' });
    txt('Tap PLAY to enter the lab', AW / 2, by + 124, 11, 'rgba(220,255,230,.6)'); txt(VERSION, AW - 14, AH - UIY - 10, 10, 'rgba(220,255,230,.4)', 'right');
  }

  // ---------- battle tab ----------
  function drawMenu(now) {
    drawLabBg(now, 0.62);
    topBar(now);
    const ch = CHARS[sel], owned = save.owned[ch.id], bot = AH - UIY, cx = AW / 2, cy = Math.max(190, AH * 0.28);
    slate(24, cy - 80, AW - 48, 210, 14);
    { const rg = ctx.createLinearGradient(cx - 90, 0, cx + 90, 0); rg.addColorStop(0, '#2a5a2a'); rg.addColorStop(0.5, '#9dff6a'); rg.addColorStop(1, '#2a5a2a'); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(cx, cy + 74, 84, 14, 0, 0, 6.28); ctx.fill(); ctx.strokeStyle = rg; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy + 72, 80, 12, 0, 0, 6.28); ctx.stroke(); }
    if (owned) { ctx.save(); ctx.translate(cx, cy - 22); ctx.scale(1.15, 1.15); drawApe(ctx, 0, 0, 36, ch, -0.5, Math.sin(now / 500) * 3, 0, 0); ctx.restore(); }
    else drawPortrait(ch, cx - 60, cy - 70, 120, now, true);
    goldTxt(ch.short.toUpperCase(), cx, cy + 112, 26, 2); txt(ch.role.toUpperCase() + '  -  ' + WEAP[ch.weapon].name, cx, cy + 136, 11, '#bfe3d8');
    const y1 = cy + 160, sn = save.snap && save.owned[save.snap.ch] ? save.snap : null;
    if (owned) button(36, y1, AW - 72, 52, 'PLAY', () => { save.sel = sel; persist(); startRun(); }, { col: LABG, size: 22, label: 'play' });
    else button(36, y1, AW - 72, 52, 'LOCKED - OPEN APES', () => { state = 'apes'; }, { col: '#c9822a', size: 16, label: 'locked' });
    let y2 = y1 + 62;
    if (sn) { button(36, y2, AW - 72, 42, 'CONTINUE RUN  -  ROOM ' + Math.floor(sn.room), () => continueRun(), { col: '#3f8fa8', size: 14, label: 'continue' }); y2 += 50; }
    const bw = (AW - 72 - 16) / 3;
    [['SHOP', () => { shopTab = 0; shopChar = sel; shopPage = 0; state = 'shop'; }, 'shop'], ['UPGRADES', () => { codexPage = 0; state = 'codex'; }, 'codex'], ['TROPHIES', () => { state = 'achv'; }, 'trophies']].forEach(([lab, cb, id], i) => button(36 + i * (bw + 8), y2, bw, 40, lab, cb, { col: '#5a7a6a', size: 12, label: id }));
    tabBar('menu');
  }

  // ---------- apes tab: pick, upgrade and unlock monkeys ----------
  let hubPage = 0, codexPage = 0, codexMine = 0;
  const HUB_PAGE = 9;
  function drawApes(now) {
    drawLabBg(now, 0.7);
    topBar(now);
    const ch = CHARS[sel], own = save.owned[ch.id], st = statsOf(ch), lv = st.lv, can = save.ban;
    slate(12, 62, AW - 24, 150, 10);
    drawPortrait(ch, 24, 74, 92, now, !own);
    slate(126, 74, AW - 150, 74, 8);
    txt(ch.short.toUpperCase() + '  -  ' + ch.role, 136, 86, 10, '#cfe8e2', 'left');
    const row = (yy, icon, label) => { icon(); txt(label, 158, yy, 12, '#eaf6f2', 'left'); };
    row(104, () => { ctx.fillStyle = '#7fd0ff'; ctx.beginPath(); ctx.arc(144, 104, 6, 0, 6.28); ctx.fill(); }, 'Lv. ' + (1 + lv) + '/11');
    row(120, () => { ctx.save(); ctx.translate(144, 120); ctx.rotate(0.6); ctx.fillStyle = '#dfe8ee'; ctx.fillRect(-1.5, -7, 3, 12); ctx.fillStyle = '#9a6a3a'; ctx.fillRect(-4, 4, 8, 2); ctx.restore(); }, Math.round(st.dmg * 10) / 10 + (lv < 10 && own ? '  (+' + Math.round(st.dDmg * 10) / 10 + ')' : ''));
    row(136, () => { ctx.fillStyle = '#e84a5a'; ctx.beginPath(); ctx.arc(141.5, 134, 3.5, 0, 6.28); ctx.arc(146.5, 134, 3.5, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.moveTo(138, 135); ctx.lineTo(144, 142); ctx.lineTo(150, 135); ctx.fill(); }, st.hp + (lv < 10 && own ? '  (+' + st.dHp + ')' : ''));
    txt(own ? (sel === save.sel ? 'Selected' : 'Owned') : 'Locked', 128, 174, 13, own ? '#cfe8e2' : '#ffb04a', 'left');
    txt(ch.passive, 24, 196, 9, '#bfe3d8', 'left');
    if (!own) button(AW - 158, 156, 140, 42, 'UNLOCK  ' + ch.cost.toLocaleString(), () => { if (save.ban >= ch.cost) { save.ban -= ch.cost; save.owned[ch.id] = 1; persist(); tone(600, 0.3, 'triangle', 0.08, 500); } }, { off: save.ban < ch.cost, col: '#c9822a', size: 13, label: 'unlock' });
    else if (lv >= 10) txt('MAX LEVEL', AW - 88, 177, 14, '#9dff6a');
    else { const cost = permCost(PERM[0], lv); button(AW - 158, 156, 140, 42, 'UPGRADE  ' + cost.toLocaleString(), () => { if (save.ban >= cost) { save.ban -= cost; (save.perm[ch.id] = save.perm[ch.id] || {}).lvl = lv + 1; persist(); tone(600, 0.2, 'triangle', 0.07, 400); } }, { off: save.ban < cost, col: '#b8403a', size: 13, label: 'upgrade' }); }
    const gy = 222, gap = 8, cw = (AW - 24 - gap * 2) / 3, pages = Math.ceil(CHARS.length / HUB_PAGE);
    CHARS.slice(hubPage * HUB_PAGE, hubPage * HUB_PAGE + HUB_PAGE).forEach((c, i) => {
      const gi = hubPage * HUB_PAGE + i, x = 12 + (i % 3) * (cw + gap), y = gy + Math.floor(i / 3) * (cw + 6), o = save.owned[c.id], on = gi === sel;
      btns.push({ x, y: y + UIY, w: cw, h: cw, cb: () => { sel = gi; if (o) { save.sel = gi; persist(); } tone(500, 0.06, 'triangle', 0.04); }, label: 'ape-' + c.id });
      if (on) glowAt(x + cw / 2, y + cw / 2, cw * 1.8, '#7dffb0', 0.45);
      drawPortrait(c, x + 3, y + 3, cw - 6, now, !o);
      ctx.fillStyle = 'rgba(8,16,14,.82)'; ctx.fillRect(x + 3, y + cw - 24, cw - 6, 21);
      txt(o ? (permLevel(c.id, 'lvl') ? 'Lv.' + (1 + permLevel(c.id, 'lvl')) : c.short) : 'Locked', x + cw / 2, y + cw - 13, 12, o ? '#eaf6f2' : '#c9d6d2');
      if (on) { ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 3; rr(x, y, cw, cw, 8); ctx.stroke(); }
    });
    const dotY = gy + 3 * (cw + 6) + 8;
    if (pages > 1) {
      for (let p = 0; p < pages; p++) { ctx.fillStyle = p === hubPage ? '#7dffb0' : 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(AW / 2 + (p - (pages - 1) / 2) * 16, dotY, 4, 0, 6.28); ctx.fill(); }
      button(12, dotY - 14, 44, 28, '<', () => { hubPage = (hubPage + pages - 1) % pages; }, { col: '#5a7a6a', size: 16, label: 'hub-prev' });
      button(AW - 56, dotY - 14, 44, 28, '>', () => { hubPage = (hubPage + 1) % pages; }, { col: '#5a7a6a', size: 16, label: 'hub-next' });
    }
    tabBar('apes');
  }

  // ---------- upgrade encyclopedia ----------
  function drawCodex(now) {
    drawLabBg(now, 0.75);
    goldTxt('UPGRADES', AW / 2, 36, 26, 2); ornament(AW / 2, 58, 180);
    const wk = CHARS[sel].weapon, all = UPG.map(u => u).concat(EVO.map(e => ({ id: e.id, n: e.n, d: e.d, t: e.w, r: 4, evo: true })));
    const list = codexMine ? all.filter(u => u.t === ALL || u.t.includes(wk)) : all, per = 6, pages = Math.max(1, Math.ceil(list.length / per));
    codexPage = clamp(codexPage, 0, pages - 1);
    const tw = (AW - 34) / 2;
    button(12, 70, tw, 34, 'ALL UPGRADES', () => { codexMine = 0; codexPage = 0; }, { col: codexMine ? '#4a5a5a' : LABG, size: 12, label: 'cx-all' });
    button(22 + tw, 70, tw, 34, 'MY WEAPON', () => { codexMine = 1; codexPage = 0; }, { col: codexMine ? LABG : '#4a5a5a', size: 12, label: 'cx-mine' });
    list.slice(codexPage * per, codexPage * per + per).forEach((u, i) => {
      const y = 114 + i * 64, rc = RCOL[u.r || 0], ic = upIcon(u);
      slate(12, y, AW - 24, 58, 8);
      ctx.fillStyle = shade(ic.bg, -0.2); rr(20, y + 7, 44, 44, 6); ctx.fill(); ctx.strokeStyle = rc; ctx.lineWidth = 2; rr(20, y + 7, 44, 44, 6); ctx.stroke(); drawGlyph(ic.glyph, 42, y + 29, 28, '#e9fff8');
      txt(u.n, 74, y + 17, 13, '#fff', 'left'); txt(RARITY[u.r || 0], AW - 22, y + 17, 8, rc, 'right');
      wrap(u.d, AW - 110, 10).slice(0, 2).forEach((ln, k) => txt(ln, 74, y + 33 + k * 12, 10, '#cfe0dc', 'left'));
    });
    const by = AH - UIY - UIB - 50;
    button(12, by, 56, 46, '<', () => { codexPage = (codexPage + pages - 1) % pages; }, { col: '#5a7a6a', size: 20, label: 'cx-prev' });
    button(AW - 68, by, 56, 46, '>', () => { codexPage = (codexPage + 1) % pages; }, { col: '#5a7a6a', size: 20, label: 'cx-next' });
    button(80, by, AW - 160, 46, 'BACK  (' + (codexPage + 1) + '/' + pages + ')', () => { state = 'menu'; }, { col: LABG, size: 14, label: 'back' });
  }

  // ---------- achievements ----------
  const ACH = [
    { id: 'first', n: 'First Blood', d: 'Defeat 1 Opp', goal: 1, k: 'kills', coins: 50 },
    { id: 'runs', n: 'Dedicated', d: 'Start 20 runs', goal: 20, k: 'runs', coins: 500 },
    { id: 'r5', n: 'Room Crawler', d: 'Reach room 5', goal: 5, k: 'best', coins: 200 },
    { id: 'r10', n: 'Deep Dive', d: 'Reach room 10', goal: 10, k: 'best', coins: 400 },
    { id: 'boss1', n: 'Boss Slayer', d: 'Defeat a boss', goal: 1, k: 'bosses', coins: 1000 },
    { id: 'flaw', n: 'Untouchable', d: 'Clear 10 rooms without a hit', goal: 10, k: 'flawless', coins: 600 },
    { id: 'collect', n: 'Collector', d: 'Own 5 monkeys', goal: 5, k: 'owned', coins: 800 },
    { id: 'ele', n: 'Elementalist', d: 'Play 5 different monkeys', goal: 5, k: 'played', coins: 700 },
    { id: 'evo', n: 'Evolved', d: 'Get an evolution upgrade', goal: 1, k: 'evos', coins: 1500 },
    { id: 'slayer', n: 'Opp Slayer', d: 'Defeat 500 Opps', goal: 500, k: 'kills', coins: 1000 },
    { id: 'rich', n: 'Coin Hoarder', d: 'Earn 10,000 Ape Coins', goal: 10000, k: 'coins', coins: 1500 },
    { id: 'r30', n: 'War Veteran', d: 'Reach room 30', goal: 30, k: 'best', coins: 2500 },
    { id: 'r45', n: 'Legend', d: 'Reach room 45', goal: 45, k: 'best', coins: 5000 },
  ];
  const achVal = a => (a.k === 'best' ? save.best : a.k === 'owned' ? Object.keys(save.owned).length : a.k === 'played' ? Object.keys(save.stats.played).length : save.stats[a.k]);
  let achPage = 0;
  function drawAchv(now) {
    drawLabBg(now, 0.75);
    goldTxt('TROPHIES', AW / 2, 36, 28, 3); ornament(AW / 2, 58, 160);
    const per = 6, pages = Math.ceil(ACH.length / per);
    ACH.slice(achPage * per, achPage * per + per).forEach((a, i) => {
      const y = 74 + i * 72, v = Math.min(a.goal, achVal(a)), done = v >= a.goal, got = save.ach[a.id];
      slate(12, y, AW - 24, 64, 8);
      txt(a.n, 24, y + 15, 14, got ? '#9dff6a' : '#fff', 'left'); txt(a.d, 24, y + 32, 10, '#cfe0dc', 'left');
      ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(24, y + 44, AW - 150, 10, 5); ctx.fill(); ctx.fillStyle = done ? '#9dff6a' : '#4fa8d8'; rr(24, y + 44, Math.max(6, (AW - 150) * v / a.goal), 10, 5); ctx.fill();
      txt(v.toLocaleString() + '/' + a.goal.toLocaleString(), 24 + (AW - 150) / 2, y + 49, 8, '#fff');
      if (got) txt('CLAIMED', AW - 70, y + 32, 11, '#9dff6a'); else button(AW - 122, y + 14, 98, 36, done ? 'CLAIM ' + a.coins : String(a.coins), () => { if (done) { save.ban += a.coins; save.ach[a.id] = 1; persist(); tone(700, 0.3, 'triangle', 0.08, 500); } }, { off: !done, col: '#c9822a', size: 11, label: 'claim-' + a.id });
    });
    const by = AH - UIY - UIB - 50;
    button(12, by, 56, 46, '<', () => { achPage = (achPage + pages - 1) % pages; }, { col: '#5a7a6a', size: 20, label: 'ach-prev' });
    button(AW - 68, by, 56, 46, '>', () => { achPage = (achPage + 1) % pages; }, { col: '#5a7a6a', size: 20, label: 'ach-next' });
    button(80, by, AW - 160, 46, 'BACK', () => { state = 'menu'; }, { col: LABG, size: 16, label: 'back' });
  }

  // ---------- settings ----------
  let resetArm = 0;
  function drawSettings(now) {
    drawLabBg(now, 0.75);
    goldTxt('SETTINGS', AW / 2, 36, 28, 3); ornament(AW / 2, 58, 160);
    [['sfx', 'Sound Effects'], ['music', 'Music'], ['shake', 'Screen Shake'], ['vib', 'Vibration']].forEach(([k, lab], i) => {
      const y = 78 + i * 64; slate(12, y, AW - 24, 54, 8); txt(lab, 26, y + 27, 15, '#fff', 'left');
      button(AW - 120, y + 8, 98, 38, save.set[k] ? 'ON' : 'OFF', () => { save.set[k] = save.set[k] ? 0 : 1; persist(); if (k === 'music') musicSync(); }, { col: save.set[k] ? LABG : '#6a4a4a', size: 15, label: 'set-' + k });
    });
    const y = 78 + 4 * 64; slate(12, y, AW - 24, 54, 8); txt('Reset all progress', 26, y + 27, 14, '#ffb0a0', 'left');
    button(AW - 150, y + 8, 128, 38, resetArm > now ? 'TAP TO CONFIRM' : 'RESET', () => { if (resetArm > performance.now()) { try { localStorage.removeItem('monkey-opps'); localStorage.removeItem('banana-breach'); } catch (e) {} location.reload(); } else resetArm = performance.now() + 3000; }, { col: '#b8403a', size: 11, label: 'set-reset' });
    txt('MONKEYS VS OPPS  ' + VERSION, AW / 2, y + 90, 13, '#9fc4bc'); txt('Stop moving to shoot. Dodge. Pick upgrades. Beat the bosses.', AW / 2, y + 110, 10, '#7fa49c');
    button(60, AH - UIY - UIB - 50, AW - 120, 46, 'BACK', () => { state = 'menu'; }, { col: LABG, size: 16, label: 'back' });
  }

  function drawShop(now) {
    goldTxt('THE SHOP', AW / 2, 50, 32, 3); ornament(AW / 2, 71, 150);
    coinArt(AW - 90, 28, 8); txt(String(save.ban), AW - 16, 28, 16, '#ffd34d', 'right');
    const tw = (AW - 34) / 2;
    button(12, 80, tw, 42, 'MONKEYS', () => { shopTab = 0; }, { col: shopTab === 0 ? '#ffd34d' : '#4a3a7a', size: 15, label: 'tab-monkeys' });
    button(22 + tw, 80, tw, 42, 'UPGRADES', () => { shopTab = 1; }, { col: shopTab === 1 ? '#ffd34d' : '#4a3a7a', size: 15, label: 'tab-upgrades' });
    const row = (y, h) => panel(12, y, AW - 24, h, 12);
    if (shopTab === 0) {
      CHARS.slice(shopPage * SHOP_PAGE, shopPage * SHOP_PAGE + SHOP_PAGE).forEach((c, i) => {
        const y = 132 + i * 54, own = save.owned[c.id], can = save.ban >= c.cost;
        row(y, 50);
        drawPortrait(c, 18, y + 4, 42, now, !own);
        txt(c.name, 76, y + 17, 16, '#fff', 'left'); txt(WEAP[c.weapon].name, 76, y + 36, 12, '#b9aee6', 'left');
        if (own) { ctx.fillStyle = '#7bed9f'; txt('OWNED', AW - 28, y + 25, 14, '#7bed9f', 'right'); }
        else button(AW - 122, y + 6, 98, 38, c.cost.toLocaleString() + ' COINS', () => { if (save.ban >= c.cost) { save.ban -= c.cost; save.owned[c.id] = 1; persist(); tone(600, 0.3, 'triangle', 0.08, 500); } }, { off: !can, col: '#7bed9f', size: 12, label: 'buy-' + c.id });
      });
    } else {
      const c = CHARS[shopChar], own = save.owned[c.id];
      button(12, 134, 48, 44, '<', () => { shopChar = (shopChar + CHARS.length - 1) % CHARS.length; }, { col: '#4a3a7a', size: 22, label: 'shop-prev' });
      button(AW - 60, 134, 48, 44, '>', () => { shopChar = (shopChar + 1) % CHARS.length; }, { col: '#4a3a7a', size: 22, label: 'shop-next' });
      txt(c.name.toUpperCase(), AW / 2, 152, 22, '#fff'); txt(own ? 'Permanent upgrades for ' + c.name : 'Buy this monkey first', AW / 2, 172, 11, own ? '#b9aee6' : '#ff9f43');
      PERM.filter(u => u.id !== 'lvl').forEach((u, i) => {
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
      button(12, AH - UIY - UIB - 52, 56, 48, '<', () => { shopPage = (shopPage + pages - 1) % pages; }, { col: '#4a3a7a', size: 22, label: 'page-prev' });
      button(AW - 68, AH - UIY - UIB - 52, 56, 48, '>', () => { shopPage = (shopPage + 1) % pages; }, { col: '#4a3a7a', size: 22, label: 'page-next' });
      txt('Page ' + (shopPage + 1) + ' of ' + pages, AW / 2, AH - UIY - UIB - 66, 11, '#9d8fd0');
    }
    button(80, AH - UIY - UIB - 52, AW - 160, 48, 'BACK', () => { state = 'menu'; sel = shopTab === 1 ? shopChar : sel; save.sel = sel; persist(); }, { col: '#9b86d6', size: 18, label: 'back' });
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(8,4,20,.86)'; ctx.fillRect(0, -UIY, AW, AH + UIY);
    goldTxt('PAUSED', AW / 2, AH * 0.26, 42, 4); ornament(AW / 2, AH * 0.26 + 30, 180);
    txt('Room ' + run.room + '   -   ' + save.ban + ' Ape Coins in your wallet', AW / 2, AH * 0.26 + 40, 13, '#c9bdf0');
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
  // icon for every upgrade: a coloured tile with a simple glyph
  function upIcon(u) {
    const id = u.id, t = u.t;
    let glyph = 'circle', bg = '#2f8f86';
    const G = { multi: 'arrows', side: 'arrows', rear: 'arrowsdown', pierce: 'pierce', phantom: 'pierce', twin: 'beam', wide: 'beam', long: 'beam', sear: 'flame', lover: 'beam', lboom: 'burst',
      rico: 'bounce', home: 'target', expl: 'burst', boom: 'burst', clust: 'burst', fboom: 'burst', frostboom: 'burst', inferno: 'burst', core: 'burst',
      rate: 'chevrons', drum: 'chevrons', dmg: 'sword', over: 'bolt', heavy: 'sword', choke: 'arrows', fuse: 'burst',
      crit: 'target', critdmg: 'star', shadowstep: 'target', exec: 'star', hp: 'heart', heal: 'heart', vamp: 'drop', shield: 'shield', dr: 'shield', plating: 'shield', dodge: 'boot', tail: 'boot', spd: 'boot',
      mag: 'coin', cdr: 'clock', armor: 'shield', psize: 'circle', burnup: 'flame', fspread: 'flame', groundfire: 'flame', trail: 'flame', meteor: 'burst',
      freeze: 'snow', fdur: 'snow', spikes: 'snow', blizzard: 'snow', groundice: 'snow', shatter: 'snow', chain: 'bolt', rod: 'bolt', static: 'bolt', aura: 'bolt', strike: 'bolt', shockch: 'bolt', storm: 'bolt',
      cloud: 'drop', corrosion: 'drop', pspread: 'drop', venom: 'drop', lingering: 'drop', acid: 'drop', infect: 'drop', split: 'orb', lblade: 'knife', wslash: 'knife', serr: 'knife', knives: 'knife', nap: 'flame' };
    glyph = u.evo ? 'star' : (G[id] || 'circle');
    if (u.evo) bg = '#c98a14';
    else if (t === ALL) bg = ['hp', 'heal', 'vamp', 'shield', 'dr', 'dodge', 'tail', 'armor'].includes(id) ? '#8f3a3a' : '#3a6a8f';
    else if (t.includes('fire') && !t.includes('gun')) bg = '#b8541f';
    else if (t.includes('ice') && t.length === 2) bg = '#3a7fa8';
    else if (t.includes('poison') && t.length === 2) bg = '#4a8a2a';
    else if (t.includes('zap')) bg = '#a8892a';
    else if (t.includes('plasma') && t.length < 4) bg = '#7a3fb8';
    else if (t.includes('shadow') && t.length < 3) bg = '#5a3f8f';
    else if (t.includes('laser')) bg = '#a83a8a';
    else if (t.includes('blade')) bg = '#6a6f80';
    return { glyph, bg };
  }
  function drawGlyph(g, cx, cy, k, col) {
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = k * 0.1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const arrow = (x, y, a, len) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-k * 0.18, -len + k * 0.22); ctx.lineTo(0, -len - k * 0.1); ctx.lineTo(k * 0.18, -len + k * 0.22); ctx.closePath(); ctx.fill(); ctx.restore(); };
    switch (g) {
      case 'arrows': arrow(0, k * 0.4, 0, k * 0.8); arrow(-k * 0.08, k * 0.4, -0.55, k * 0.7); arrow(k * 0.08, k * 0.4, 0.55, k * 0.7); break;
      case 'arrowsdown': arrow(0, -k * 0.4, Math.PI, k * 0.8); arrow(-k * 0.08, -k * 0.4, Math.PI - 0.55, k * 0.7); arrow(k * 0.08, -k * 0.4, Math.PI + 0.55, k * 0.7); break;
      case 'pierce': arrow(0, k * 0.5, 0, k); ctx.beginPath(); ctx.moveTo(-k * 0.4, -k * 0.05); ctx.lineTo(k * 0.4, -k * 0.05); ctx.moveTo(-k * 0.4, k * 0.2); ctx.lineTo(k * 0.4, k * 0.2); ctx.stroke(); break;
      case 'bounce': ctx.beginPath(); ctx.moveTo(-k * 0.45, k * 0.4); ctx.lineTo(0, -k * 0.2); ctx.lineTo(k * 0.15, k * 0.3); ctx.stroke(); arrow(k * 0.15, k * 0.3, 0.5, k * 0.55); break;
      case 'target': ctx.beginPath(); ctx.arc(0, 0, k * 0.42, 0, 6.28); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, k * 0.16, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, -k * 0.55); ctx.lineTo(0, -k * 0.25); ctx.moveTo(0, k * 0.55); ctx.lineTo(0, k * 0.25); ctx.moveTo(-k * 0.55, 0); ctx.lineTo(-k * 0.25, 0); ctx.moveTo(k * 0.55, 0); ctx.lineTo(k * 0.25, 0); ctx.stroke(); break;
      case 'burst': ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28, r2 = i % 2 ? k * 0.22 : k * 0.55; ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); } ctx.closePath(); ctx.fill(); break;
      case 'chevrons': for (const dy of [-0.3, 0.1]) { ctx.beginPath(); ctx.moveTo(-k * 0.4, k * (dy + 0.3)); ctx.lineTo(0, k * dy); ctx.lineTo(k * 0.4, k * (dy + 0.3)); ctx.stroke(); } break;
      case 'sword': ctx.rotate(0.6); ctx.fillRect(-k * 0.06, -k * 0.55, k * 0.12, k * 0.8); ctx.beginPath(); ctx.moveTo(-k * 0.06, -k * 0.55); ctx.lineTo(0, -k * 0.7); ctx.lineTo(k * 0.06, -k * 0.55); ctx.fill(); ctx.fillRect(-k * 0.22, k * 0.22, k * 0.44, k * 0.08); ctx.fillRect(-k * 0.05, k * 0.3, k * 0.1, k * 0.2); break;
      case 'star': ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * 6.28, r2 = i % 2 ? k * 0.22 : k * 0.55; ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); } ctx.closePath(); ctx.fill(); break;
      case 'heart': ctx.beginPath(); ctx.moveTo(0, k * 0.45); ctx.bezierCurveTo(-k * 0.7, -k * 0.05, -k * 0.4, -k * 0.6, 0, -k * 0.2); ctx.bezierCurveTo(k * 0.4, -k * 0.6, k * 0.7, -k * 0.05, 0, k * 0.45); ctx.fill(); break;
      case 'shield': ctx.beginPath(); ctx.moveTo(-k * 0.42, -k * 0.4); ctx.lineTo(k * 0.42, -k * 0.4); ctx.lineTo(k * 0.38, k * 0.1); ctx.quadraticCurveTo(0, k * 0.6, -k * 0.38, k * 0.1); ctx.closePath(); ctx.fill(); break;
      case 'boot': ctx.beginPath(); ctx.moveTo(-k * 0.25, -k * 0.45); ctx.lineTo(k * 0.15, -k * 0.45); ctx.lineTo(k * 0.15, k * 0.1); ctx.lineTo(k * 0.5, k * 0.25); ctx.lineTo(k * 0.5, k * 0.45); ctx.lineTo(-k * 0.25, k * 0.45); ctx.closePath(); ctx.fill(); break;
      case 'coin': ctx.beginPath(); ctx.arc(0, 0, k * 0.46, 0, 6.28); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(0, 0, k * 0.3, 0, 6.28); ctx.fill(); break;
      case 'clock': ctx.beginPath(); ctx.arc(0, 0, k * 0.46, 0, 6.28); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -k * 0.3); ctx.moveTo(0, 0); ctx.lineTo(k * 0.22, k * 0.1); ctx.stroke(); break;
      case 'flame': ctx.beginPath(); ctx.moveTo(0, -k * 0.6); ctx.bezierCurveTo(k * 0.5, -k * 0.1, k * 0.5, k * 0.5, 0, k * 0.5); ctx.bezierCurveTo(-k * 0.5, k * 0.5, -k * 0.5, -k * 0.05, -k * 0.1, -k * 0.25); ctx.bezierCurveTo(-k * 0.05, -k * 0.4, k * 0.02, -k * 0.45, 0, -k * 0.6); ctx.fill(); break;
      case 'snow': for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -k * 0.55); ctx.lineTo(0, k * 0.55); ctx.stroke(); ctx.restore(); } break;
      case 'bolt': ctx.beginPath(); ctx.moveTo(k * 0.12, -k * 0.6); ctx.lineTo(-k * 0.3, k * 0.08); ctx.lineTo(0, k * 0.08); ctx.lineTo(-k * 0.12, k * 0.6); ctx.lineTo(k * 0.32, -k * 0.1); ctx.lineTo(0, -k * 0.1); ctx.closePath(); ctx.fill(); break;
      case 'drop': ctx.beginPath(); ctx.moveTo(0, -k * 0.6); ctx.bezierCurveTo(k * 0.55, k * 0.05, k * 0.4, k * 0.5, 0, k * 0.5); ctx.bezierCurveTo(-k * 0.4, k * 0.5, -k * 0.55, k * 0.05, 0, -k * 0.6); ctx.fill(); break;
      case 'orb': ctx.beginPath(); ctx.arc(0, 0, k * 0.3, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, k * 0.5, 0, 6.28); ctx.stroke(); break;
      case 'beam': ctx.fillRect(-k * 0.5, -k * 0.08, k, k * 0.16); ctx.fillRect(-k * 0.5, -k * 0.34, k * 0.8, k * 0.1); ctx.fillRect(-k * 0.5, k * 0.24, k * 0.8, k * 0.1); break;
      case 'knife': ctx.rotate(0.7); ctx.beginPath(); ctx.moveTo(-k * 0.08, k * 0.2); ctx.lineTo(0, -k * 0.65); ctx.lineTo(k * 0.12, k * 0.2); ctx.closePath(); ctx.fill(); ctx.fillRect(-k * 0.06, k * 0.2, k * 0.14, k * 0.3); break;
      default: ctx.beginPath(); ctx.arc(0, 0, k * 0.4, 0, 6.28); ctx.fill();
    }
    ctx.restore();
  }
  function drawUpgrade() {
    const now = performance.now();
    ctx.fillStyle = 'rgba(6,4,14,.92)'; ctx.fillRect(0, -UIY, AW, AH + UIY);
    const px = 10, py = 88, pw = AW - 20, ph = Math.min(AH - py - 20, 3 * 128 + 110);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;                       // olive panel in a riveted pipe frame
    const pg = ctx.createLinearGradient(0, py, 0, py + ph); pg.addColorStop(0, '#46513a'); pg.addColorStop(1, '#2b3324'); rr(px, py, pw, ph, 14); ctx.fillStyle = pg; ctx.fill(); ctx.restore();
    ctx.strokeStyle = '#7d8a6a'; ctx.lineWidth = 6; rr(px, py, pw, ph, 14); ctx.stroke(); ctx.strokeStyle = '#2a3022'; ctx.lineWidth = 2; rr(px + 3, py + 3, pw - 6, ph - 6, 11); ctx.stroke();
    ctx.fillStyle = '#a9b596'; for (const [rx, ry] of [[px + 12, py + 12], [px + pw - 12, py + 12], [px + 12, py + ph - 12], [px + pw - 12, py + ph - 12]]) { ctx.beginPath(); ctx.arc(rx, ry, 3, 0, 6.28); ctx.fill(); }
    const anyNew = offer.some(u => !(run.stacks[u.id] > 0)), title = anyNew ? 'SELECT NEW ABILITY' : 'UPGRADE AN ABILITY';
    const tg = ctx.createLinearGradient(0, py - 18, 0, py + 20); tg.addColorStop(0, '#9a6a3a'); tg.addColorStop(1, '#5a3a1c');                      // title plaque
    ctx.fillStyle = tg; rr(AW / 2 - 118, py - 16, 236, 36, 7); ctx.fill(); ctx.strokeStyle = '#2a190a'; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = 'rgba(255,225,170,.4)'; ctx.lineWidth = 1; rr(AW / 2 - 116, py - 14, 232, 32, 6); ctx.stroke();
    ctx.font = '700 17px Georgia, serif'; if ('letterSpacing' in ctx) ctx.letterSpacing = '2px'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, AW / 2, py + 3); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    txt('ROOM ' + run.room + ' CLEARED', AW / 2, py - 36, 12, '#c9b27a');
    const rh = Math.min(128, (ph - 66) / 3), x0 = px + 14, w0 = pw - 28;
    offer.forEach((u, i) => {
      const y = py + 38 + i * (rh + 8), rc = RCOL[u.r || 0], evo = !!u.evo, st = run.stacks[u.id] || 0, ic = upIcon(u);
      btns.push({ x: x0, y: y + UIY, w: w0, h: rh, cb: () => choose(u), label: 'card' + i });
      const g = ctx.createLinearGradient(0, y, 0, y + rh); g.addColorStop(0, evo ? '#5a4318' : '#4a4f94'); g.addColorStop(1, evo ? '#33250c' : '#2c2f64');
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; rr(x0, y, w0, rh, 9); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      if (evo) { const sh = ctx.createLinearGradient(x0, y, x0 + w0, y + rh); sh.addColorStop(0, '#fff1b8'); sh.addColorStop(((now / 800) % 2) / 2, '#ff9a2e'); sh.addColorStop(1, '#fff1b8'); ctx.strokeStyle = sh; ctx.lineWidth = 3; } else { ctx.strokeStyle = rc; ctx.lineWidth = 2; }
      rr(x0, y, w0, rh, 9); ctx.stroke();
      const ts = rh - 18, tx = x0 + 9, ty = y + 9;                                                                // icon tile
      ctx.fillStyle = shade(ic.bg, -0.35); rr(tx - 1, ty - 1, ts + 2, ts + 2, 7); ctx.fill();
      const tg2 = ctx.createLinearGradient(0, ty, 0, ty + ts); tg2.addColorStop(0, shade(ic.bg, 0.15)); tg2.addColorStop(1, shade(ic.bg, -0.2)); ctx.fillStyle = tg2; rr(tx, ty, ts, ts, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; rr(tx + 1.5, ty + 1.5, ts - 3, ts - 3, 5); ctx.stroke();
      glowAt(tx + ts / 2, ty + ts / 2, ts * 1.2, '#ffffff', 0.12);
      drawGlyph(ic.glyph, tx + ts / 2, ty + ts / 2, ts * 0.62, evo ? '#fff3c4' : '#d9fff6');
      const lx = tx + ts + 12, lw = w0 - ts - 40;
      txt(evo ? 'EVOLUTION' : st ? 'UPGRADE  Lv ' + st + ' > ' + (st + 1) : 'NEW ABILITY', lx, y + 16, 9, evo ? '#ffb02e' : st ? '#8fe38f' : rc, 'left');
      txt(RARITY[u.r || 0], x0 + w0 - 10, y + 16, 8, rc, 'right');
      txt(u.n, lx, y + 33, 15, '#fff', 'left');
      let ty2 = y + 50; for (const ln of wrap(u.d, lw, 12).slice(0, 2)) { txt(ln, lx, ty2, 12, '#d6dcff', 'left'); ty2 += 15; }
      const hint = hintFor(u); if (hint && ty2 < y + rh - 6) txt(hint, lx, Math.min(y + rh - 10, ty2 + 2), 9, '#e8c872', 'left');
    });
    txt('Tap an ability to choose it', AW / 2, py + ph + 18, 12, '#9d8fd0');
  }
  function drawOver() {
    ctx.fillStyle = 'rgba(15,8,35,.82)'; ctx.fillRect(0, -UIY, AW, AH + UIY);
    goldTxt('OUT OF LIVES', AW / 2, AH * 0.2, 36, 2);
    txt('Reached room ' + run.room, AW / 2, AH * 0.2 + 52, 24, '#fff');
    txt(run.kills + ' opps beaten', AW / 2, AH * 0.2 + 84, 15, '#c9bdf0');
    txt('+' + run.ban + ' Ape Coins banked', AW / 2, AH * 0.2 + 108, 15, '#ffd34d');
    txt(run.room >= save.best ? 'NEW BEST ROOM' : 'Best room ' + save.best, AW / 2, AH * 0.2 + 134, 14, '#9d8fd0');
    if (t0 > 0.5) {
      const y0 = AH * 0.46;
      button(40, y0, AW - 80, 54, 'TRY AGAIN', () => startRun(), { label: 'retry' });
      button(40, y0 + 64, AW - 80, 54, 'SHOP', () => { shopTab = 1; shopChar = sel; state = 'shop'; }, { col: '#9b86d6', label: 'shop' });
      button(40, y0 + 128, AW - 80, 54, 'MONKEYS', () => { state = 'apes'; }, { col: '#7bed9f', label: 'menu' });
    }
  }

  // ---------- loop ----------
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { if (dt > 0.026) { update(dt / 2); update(dt / 2); } else update(dt); draw(now); }
    catch (err) {                                   // never freeze on a bad frame: drop back to the menu and keep running
      console.error(err); state = 'menu'; joy.on = false; joy.dx = joy.dy = 0; btns = [];
    }
    requestAnimationFrame(loop);
  })(last);
})();
