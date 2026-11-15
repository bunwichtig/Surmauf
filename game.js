'use strict';
// Lichtung (Iteration 2, Strategie) – gemeinsam ein Dorf aufbauen, nur mit Baumenü. Mehrspieler-Technik wie in BombRe (siehe docs/online-multiplayer.md dort).

const VERSION = '__VERSION__';
const $ = (id) => document.getElementById(id);
const LOCAL = new URLSearchParams(location.search).has('local');
const PEER_PREFIX = 'lichtung-v2-';
const SAVE_PREFIX = 'lichtung2-save-';
const W = 64, H = 48, T = 32;          // Karte in Feldern, Feldgröße in Pixeln
const DAY_LEN = 120;                   // Sekunden pro Tag
const NIGHT_FROM = 0.72;               // ab diesem Anteil des Tages ist Nacht
const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
const DAYS_PER_SEASON = 3;
const TICK = 1 / 60, SEND_EVERY = 3;
const MAX_PLAYERS = 8;
const COLORS = ['#e4572e', '#3b8ea5', '#f2c14e', '#b48ee0', '#5fad56', '#ef8bb4', '#f5f5f5', '#f78154'];
const NAMES = ['Alma', 'Bruno', 'Clara', 'Dario', 'Elsa', 'Fiete', 'Greta', 'Hanno', 'Ida', 'Jori', 'Kaja', 'Lenz', 'Mira', 'Nils',
  'Oda', 'Pit', 'Rike', 'Sven', 'Tilda', 'Ulf', 'Vera', 'Wim', 'Yara', 'Zeno', 'Anouk', 'Bela', 'Carlo', 'Dina', 'Emil', 'Frida'];

// Gebäude: Buchstabe auf der Karte → Eigenschaften
const BUILD = {
  F: { name: 'Feuerstelle', icon: '🔥', cost: { wood: 5 }, level: 0, desc: 'Wärmt und spendet Licht. Ohne Feuer kommen keine Siedler.' },
  H: { name: 'Hütte', icon: '🛖', cost: { wood: 10 }, level: 0, beds: 2, desc: 'Betten für 2 Siedler.' },
  S: { name: 'Sammlerhütte', icon: '🧺', cost: { wood: 8 }, level: 0, job: 'food', rate: 3, near: 'Bb', desc: '1 Siedler sammelt Beeren in der Nähe, bis +3 Nahrung am Tag.' },
  L: { name: 'Holzfäller', icon: '🪓', cost: { wood: 8 }, level: 0, job: 'wood', rate: 4, near: 'T', desc: '1 Siedler fällt Bäume in der Nähe, bis +4 Holz am Tag.' },
  A: { name: 'Acker', icon: '🌾', cost: { wood: 6 }, level: 0, job: 'food', rate: 5, noWinter: true, walk: true, desc: '1 Siedler bestellt das Feld, +5 Nahrung am Tag. Nicht im Winter.' },
  Q: { name: 'Steinbruch', icon: '⛏️', cost: { wood: 12 }, level: 1, job: 'stone', rate: 3, near: 'R', desc: '1 Siedler bricht Steine in der Nähe, bis +3 Stein am Tag.' },
  M: { name: 'Steinhaus', icon: '🏠', cost: { wood: 10, stone: 12 }, level: 2, beds: 4, desc: 'Betten für 4 Siedler.' },
  P: { name: 'Dorfbrunnen', icon: '⛲', cost: { wood: 20, stone: 25 }, level: 2, desc: 'Das Herz des Dorfes.' },
};
const BUILD_KEYS = 'FHSLAQMP';
const TOOLS = BUILD_KEYS + 'X';      // X = Abreißen
const DEMOLISH = { name: 'Abreißen', icon: '🧹', desc: 'Gebäude entfernen. Die Hälfte der Baukosten kommt zurück.' };
const START_FOUNDERS = 3;
const RES_ICON = { wood: '🪵', stone: '🪨', food: '🍓' };

const LEVELS = [
  { name: 'Lagerplatz', goal: 'Feuerstelle, Hütten und Arbeit für 5 Siedler schaffen', check: (g) => g.villagers.length >= 5 },
  { name: 'Siedlung', goal: 'Auf 8 Bewohner wachsen', check: (g) => g.villagers.length >= 8 },
  { name: 'Weiler', goal: 'Den Dorfbrunnen bauen und 14 Bewohner haben', check: (g) => g.villagers.length >= 14 && g.count('P') > 0 },
  { name: 'Dorf', goal: 'Euer Dorf steht. Lasst es weiter wachsen!' },
];

// ---------------------------------------------------------------- Hilfen
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function slug(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
async function hashPw(room, pw) {
  const text = 'lichtung2|' + room + '|' + pw;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return 'f' + (h >>> 0).toString(16);
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function noise(seed, scale) {
  const r = rng(seed), gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2;
  const g = Array.from({ length: gw * gh }, r);
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), u = s(fx - ix), v = s(fy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------------------------------------------------------------- Karte
const TILE_OK = '.TtRBb~' + BUILD_KEYS;
const HP = { T: 3, R: 5, B: 3 };
const YIELD = { T: 'wood', R: 'stone', B: 'food' };

function genMap(seed) {
  const n1 = noise(seed + 1, 7), n2 = noise(seed + 2, 5), n3 = noise(seed + 3, 10), r = rng(seed + 4);
  const cx = W / 2, cy = H / 2, grid = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    let c = '.';
    if (n3(x, y) < 0.24 && d > 8) c = '~';
    else if (n1(x, y) > 0.57 && d > 5) c = 'T';
    else if (n2(x, y) > 0.72 && d > 6) c = 'R';
    else if (d > 3.5 && r() < 0.03) c = 'B';
    else if (d > 4 && r() < 0.03) c = 'T';
    grid.push(c);
  }
  // Ein paar Bäume, Steine und Beeren sicher in Laufweite
  const sprinkle = (c, n, dmin, dmax) => {
    for (let k = 0, tries = 0; k < n && tries < 500; tries++) {
      const a = r() * Math.PI * 2, d = dmin + r() * (dmax - dmin);
      const x = Math.floor(cx + Math.cos(a) * d), y = Math.floor(cy + Math.sin(a) * d);
      if (grid[y * W + x] === '.') { grid[y * W + x] = c; k++; }
    }
  };
  sprinkle('T', 8, 5, 9); sprinkle('B', 5, 4, 8); sprinkle('R', 3, 6, 10);
  return grid;
}

// ---------------------------------------------------------------- Spiellogik (weiß nichts vom Netzwerk)
class Game {
  constructor(save) {
    this.players = [];
    this.changes = [];
    this.events = [];
    this.evId = 0;
    this.nearT = 0;
    if (save) this.load(save);
    else this.fresh();
  }

  fresh() {
    this.vid = uid();
    this.seed = (Math.random() * 1e9) | 0;
    this.grid = genMap(this.seed);
    this.hp = new Map(); this.regrow = new Map();
    this.buildings = []; this.villagers = [];
    this.res = { wood: 40, stone: 0, food: 20 };
    this.day = 1; this.time = 0.05; this.prog = 0; this.level = 0; this.nextId = 1;
    this.stats = {};
    for (let k = 0; k < START_FOUNDERS; k++) this.newVillager(W / 2 + Math.cos(k * 2.1) * 1.5, H / 2 + Math.sin(k * 2.1) * 1.5);
  }

  load(s) {
    this.vid = s.vid; this.seed = s.seed; this.grid = s.grid.split('');
    this.hp = new Map(s.hp); this.regrow = new Map(s.regrow);
    this.buildings = s.buildings.map((b) => ({ ...b, worker: null, eff: 0 }));
    this.villagers = s.villagers.map((v) => ({ ...v, home: null, job: null }));
    this.res = { ...s.res }; this.day = s.day; this.time = s.time; this.prog = s.prog;
    this.level = s.level; this.nextId = s.nextId; this.stats = s.stats;
    this.assign();
    this.nearT = 0;
  }

  toSave() {
    return {
      v: 1, vid: this.vid, seed: this.seed, prog: Math.floor(this.prog), day: this.day, time: +this.time.toFixed(4),
      grid: this.grid.join(''), hp: [...this.hp], regrow: [...this.regrow].map(([i, t]) => [i, Math.round(t)]),
      buildings: this.buildings.map((b) => ({ id: b.id, k: b.k, x: b.x, y: b.y })),
      villagers: this.villagers.map((v) => ({ id: v.id, name: v.name, x: +v.x.toFixed(1), y: +v.y.toFixed(1), hungry: v.hungry, cold: v.cold })),
      res: { wood: +this.res.wood.toFixed(2), stone: +this.res.stone.toFixed(2), food: +this.res.food.toFixed(2) },
      level: this.level, nextId: this.nextId, stats: this.stats, savedAt: Date.now(),
    };
  }

  get season() { return Math.floor((this.day - 1) / DAYS_PER_SEASON) % 4; }
  get winter() { return this.season === 3; }
  get night() { return this.time >= NIGHT_FROM; }
  beds() { return this.buildings.reduce((n, b) => n + (BUILD[b.k].beds || 0), 0); }
  count(k) { return this.buildings.filter((b) => b.k === k).length; }
  tile(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? '#' : this.grid[y * W + x]; }
  setTile(i, c) { if (this.grid[i] !== c) { this.grid[i] = c; this.changes.push([i, c]); } }
  event(text) { this.events.push([++this.evId, text]); if (this.events.length > 8) this.events.shift(); }
  stat(name) { return this.stats[name] || (this.stats[name] = { g: 0, b: 0 }); }

  addPlayer(id, name) {
    const used = new Set(this.players.map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
    const p = { id, name, color, hx: -1, hy: -1 };
    this.players.push(p);
    this.stat(name);
    this.event(name + ' ist auf der Lichtung angekommen.');
    return p;
  }
  removePlayer(id) {
    const p = this.players.find((q) => q.id === id);
    this.players = this.players.filter((q) => q.id !== id);
    if (p) this.event(p.name + ' ist gegangen.');
  }

  canAfford(k) { const c = BUILD[k].cost; return Object.keys(c).every((r) => Math.floor(this.res[r]) >= c[r]); }

  // Bauen: liefert einen Fehlertext oder null
  build(pid, k, x, y) {
    const def = BUILD[k], p = this.players.find((q) => q.id === pid);
    if (!def || !p) return 'Unbekannt.';
    x |= 0; y |= 0;
    if (def.level > this.level) return def.name + ' gibt es erst ab Stufe „' + LEVELS[def.level].name + '“.';
    if (this.tile(x, y) !== '.') return 'Dort ist kein Platz. Nur auf freier Wiese bauen.';
    if (!this.canAfford(k)) return 'Nicht genug Vorrat: ' + costText(def.cost) + '.';
    for (const r in def.cost) this.res[r] -= def.cost[r];
    const i = y * W + x;
    this.setTile(i, k);
    this.buildings.push({ id: this.nextId++, k, x, y, worker: null, eff: 0 });
    this.stat(p.name).b++;
    this.event(def.icon + ' ' + p.name + ' hat gebaut: ' + def.name + '.');
    this.nearT = 0;
    this.assign();
    return null;
  }

  demolish(pid, x, y) {
    const p = this.players.find((q) => q.id === pid);
    const b = this.buildings.find((q) => q.x === (x | 0) && q.y === (y | 0));
    if (!p || !b) return 'Dort steht kein Gebäude.';
    const def = BUILD[b.k];
    for (const r in def.cost) this.res[r] += Math.floor(def.cost[r] / 2);
    this.buildings = this.buildings.filter((q) => q !== b);
    this.setTile(b.y * W + b.x, '.');
    this.event('🧹 ' + p.name + ' hat abgerissen: ' + def.name + '.');
    this.nearT = 0;
    this.assign();
    return null;
  }

  newVillager(x, y) {
    const used = new Set(this.villagers.map((v) => v.name));
    const free = NAMES.filter((n) => !used.has(n));
    const name = free.length ? free[(Math.random() * free.length) | 0] : 'Siedler ' + this.nextId;
    const v = { id: this.nextId++, name, x: clamp(x, 1, W - 1), y: clamp(y, 1, H - 1), hungry: 0, cold: 0, home: null, job: null };
    this.villagers.push(v);
    return v;
  }

  // Siedlern Betten und Arbeit zuteilen
  assign() {
    const byId = new Map(this.buildings.map((b) => [b.id, b]));
    const occ = new Map();
    for (const v of this.villagers) {
      if (v.home && !byId.has(v.home)) v.home = null;
      if (v.job && !byId.has(v.job)) v.job = null;
      if (v.home) occ.set(v.home, (occ.get(v.home) || 0) + 1);
    }
    for (const b of this.buildings) b.worker = null;
    for (const v of this.villagers) if (v.job) byId.get(v.job).worker = v.id;
    for (const v of this.villagers) {
      if (!v.home) {
        const h = this.buildings.find((b) => BUILD[b.k].beds && (occ.get(b.id) || 0) < BUILD[b.k].beds);
        if (h) { v.home = h.id; occ.set(h.id, (occ.get(h.id) || 0) + 1); }
      }
    }
    for (const b of this.buildings) {
      if (!BUILD[b.k].job || b.worker) continue;
      const v = this.villagers.find((q) => !q.job);
      if (v) { v.job = b.id; b.worker = v.id; }
    }
  }

  updateNear() {
    for (const b of this.buildings) {
      const def = BUILD[b.k];
      if (!def.near) { b.eff = 1; continue; }
      let n = 0;
      for (let y = b.y - 4; y <= b.y + 4; y++) for (let x = b.x - 4; x <= b.x + 4; x++) if (def.near.includes(this.tile(x, y))) n++;
      b.eff = Math.min(1, n / 4);
    }
  }

  step(dt) {
    this.prog += dt;
    const before = this.time;
    this.time += dt / DAY_LEN;
    if (this.time >= 1) { this.time -= 1; this.day++; this.dawn(); }
    for (const q of [0.2, 0.45, 0.65]) if (before < q && this.time >= q) this.immigrate();

    // Nachwachsen (nicht im Winter)
    if (!this.winter) {
      for (const [i, t] of this.regrow) {
        const nt = t - dt;
        if (nt > 0) { this.regrow.set(i, nt); continue; }
        const c = this.grid[i];
        this.regrow.delete(i);
        if (c === 't') this.setTile(i, 'T');
        else if (c === 'b') this.setTile(i, 'B');
      }
    }

    if ((this.nearT -= dt) <= 0) { this.nearT = 2; this.updateNear(); this.checkLevel(); }

    // Siedler laufen und arbeiten
    const byId = new Map(this.buildings.map((b) => [b.id, b]));
    const fire = this.buildings.find((b) => b.k === 'F');
    for (const v of this.villagers) {
      let tx, ty;
      const job = v.job && byId.get(v.job), home = v.home && byId.get(v.home);
      if (this.night) { const h = home || fire; if (h) { tx = h.x + 0.5; ty = h.y + 1.1; } }
      else if (job) { tx = job.x + 0.5 + Math.sin(this.prog * 0.7 + v.id) * 0.6; ty = job.y + 1.0 + Math.cos(this.prog * 0.5 + v.id) * 0.3; }
      else if (fire) { tx = fire.x + 0.5 + Math.cos(v.id * 1.7 + this.prog * 0.1) * 2; ty = fire.y + 0.5 + Math.sin(v.id * 1.7 + this.prog * 0.1) * 2; }
      if (tx === undefined) { tx = W / 2; ty = H / 2; }
      const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
      v.walk = d > 0.15;
      if (v.walk) { const s = Math.min(d, 2.2 * dt); v.x += (dx / d) * s; v.y += (dy / d) * s; }
      if (job && !this.night && d < 1.5) {
        const def = BUILD[job.k];
        if (!(def.noWinter && this.winter)) this.res[def.job] += def.rate * job.eff * dt / (DAY_LEN * NIGHT_FROM);
        v.working = 1;
      } else v.working = 0;
    }
  }

  // Morgens: essen, heizen, wer zu lange hungert oder friert, zieht weg
  dawn() {
    if ((this.day - 1) % DAYS_PER_SEASON === 0) {
      this.event(['🌱', '☀️', '🍂', '❄️'][this.season] + ' Es wird ' + SEASONS[this.season] + '.' + (this.winter ? ' Jetzt wächst nichts, und die Häuser brauchen Holz zum Heizen.' : ''));
    }
    const n = this.villagers.length;
    if (!n) { this.immigrate(); return; }
    if (this.res.food >= n) { this.res.food -= n; for (const v of this.villagers) v.hungry = 0; }
    else {
      let left = Math.floor(this.res.food); this.res.food -= left;
      for (const v of this.villagers) { if (left > 0) { left--; v.hungry = 0; } else v.hungry++; }
      this.event('🍽️ Nicht genug Nahrung! Einige Siedler hungern.');
    }
    if (this.winter) {
      const need = Math.ceil(n / 2);
      if (this.res.wood >= need) { this.res.wood -= need; for (const v of this.villagers) v.cold = 0; this.event('🪵 Die Häuser wurden mit ' + need + ' Holz geheizt.'); }
      else { this.res.wood = 0; for (const v of this.villagers) v.cold++; this.event('🥶 Zu wenig Holz zum Heizen! Die Siedler frieren.'); }
    } else for (const v of this.villagers) v.cold = 0;
    const noFire = !this.count('F');
    const leaving = this.villagers.filter((v) => v.hungry >= 2 || v.cold >= 2 || (!v.home && noFire));
    for (const v of leaving) this.event(v.name + ' hat das Dorf verlassen' + (v.hungry >= 2 ? ' (Hunger).' : v.cold >= 2 ? ' (Kälte).' : ' (kein Bett, kein Feuer).'));
    if (leaving.length) { this.villagers = this.villagers.filter((v) => !leaving.includes(v)); this.assign(); }
    this.immigrate();
  }

  immigrate() {
    const n = this.villagers.length;
    if (!this.count('F')) return;
    if (this.beds() <= n) return;
    if (this.res.food < n + 3) return;
    if (this.winter && this.res.wood < Math.ceil((n + 1) / 2)) return;
    const a = Math.random() * Math.PI * 2;
    const v = this.newVillager(W / 2 + Math.cos(a) * 18, H / 2 + Math.sin(a) * 18);
    this.assign();
    this.event('🏡 ' + v.name + ' ist ins Dorf gezogen.');
  }

  checkLevel() {
    while (this.level < LEVELS.length - 1 && LEVELS[this.level].check(this)) {
      this.level++;
      const unlocked = BUILD_KEYS.split('').filter((k) => BUILD[k].level === this.level).map((k) => BUILD[k].name);
      this.event('⭐ Neue Stufe: ' + LEVELS[this.level].name + '!' + (unlocked.length ? ' Neu: ' + unlocked.join(', ') + '.' : ''));
    }
  }

  snapshot(withChanges) {
    const s = {
      t: 'state', day: this.day, time: +this.time.toFixed(4), level: this.level,
      res: [Math.floor(this.res.wood), Math.floor(this.res.stone), Math.floor(this.res.food)],
      pop: this.villagers.length, beds: this.beds(), idle: this.villagers.filter((v) => !v.job).length, speed: this.speed || 1,
      players: this.players.map((p) => [p.id, p.name, p.color, p.hx, p.hy]),
      bl: this.buildings.map((b) => [b.x, b.y, b.worker ? 1 : 0, Math.round(b.eff * 100)]),
      vill: this.villagers.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), v.working ? 1 : 0, v.hungry || v.cold ? 1 : 0]),
      ev: this.events,
      stats: Object.entries(this.stats).sort((a, b) => b[1].b - a[1].b).slice(0, 12),
    };
    if (withChanges) { s.chg = this.changes; this.changes = []; }
    return s;
  }
}

function costText(c) { return Object.keys(c).map((r) => c[r] + ' ' + RES_ICON[r]).join(' '); }

// Spielstand prüfen (kommt auch von Mitspielern, also nichts ungeprüft übernehmen)
function cleanSave(s) {
  try {
    if (!s || s.v !== 1 || typeof s.grid !== 'string' || s.grid.length !== W * H) return null;
    for (const c of s.grid) if (!TILE_OK.includes(c)) return null;
    const num = (v, a, b) => (typeof v === 'number' && isFinite(v) ? clamp(v, a, b) : a);
    const idx = (i) => Number.isInteger(i) && i >= 0 && i < W * H;
    const buildings = (Array.isArray(s.buildings) ? s.buildings : []).slice(0, 2000)
      .filter((b) => b && BUILD[b.k] && Number.isInteger(b.x) && Number.isInteger(b.y) && s.grid[b.y * W + b.x] === b.k)
      .map((b) => ({ id: num(b.id, 1, 1e9) | 0, k: b.k, x: b.x, y: b.y }));
    const villagers = (Array.isArray(s.villagers) ? s.villagers : []).slice(0, 300).filter((v) => v && typeof v.name === 'string')
      .map((v) => ({ id: num(v.id, 1, 1e9) | 0, name: v.name.slice(0, 16), x: num(v.x, 0, W), y: num(v.y, 0, H), hungry: num(v.hungry, 0, 9) | 0, cold: num(v.cold, 0, 9) | 0 }));
    const stats = {};
    if (s.stats && typeof s.stats === 'object') for (const [k, v] of Object.entries(s.stats).slice(0, 60)) {
      if (v && typeof v === 'object') stats[String(k).slice(0, 12)] = { g: num(v.g, 0, 1e7) | 0, b: num(v.b, 0, 1e6) | 0 };
    }
    const pairs = (a, max) => (Array.isArray(a) ? a : []).filter((e) => Array.isArray(e) && idx(e[0])).map((e) => [e[0], num(e[1], 0, max)]);
    const res = s.res || {};
    const ids = [...buildings.map((b) => b.id), ...villagers.map((v) => v.id)];
    return {
      v: 1, vid: String(s.vid || uid()).slice(0, 24), seed: num(s.seed, 0, 1e9) | 0, prog: num(s.prog, 0, 1e9), day: num(s.day, 1, 1e6) | 0,
      time: num(s.time, 0, 0.999), grid: s.grid, hp: pairs(s.hp, 9), regrow: pairs(s.regrow, 1000), buildings, villagers,
      res: { wood: num(res.wood, 0, 1e7), stone: num(res.stone, 0, 1e7), food: num(res.food, 0, 1e7) },
      level: num(s.level, 0, LEVELS.length - 1) | 0, nextId: Math.max(num(s.nextId, 1, 1e9) | 0, ...ids.map((i) => i + 1), 1), stats,
      savedAt: num(s.savedAt, 0, 1e15),
    };
  } catch (e) { return null; }
}

// ---------------------------------------------------------------- Speichern im Browser
function loadSave(room) {
  try { return cleanSave(JSON.parse(localStorage.getItem(SAVE_PREFIX + room))); } catch (e) { return null; }
}
function storeSave(room, data) {
  try { localStorage.setItem(SAVE_PREFIX + room, JSON.stringify(data)); } catch (e) {}
}
function listSaves() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(SAVE_PREFIX)) continue;
      try { const s = JSON.parse(localStorage.getItem(k)); out.push({ room: k.slice(SAVE_PREFIX.length), day: s.day | 0, pop: (s.villagers || []).length, level: s.level | 0, at: s.savedAt || 0 }); } catch (e) {}
    }
  } catch (e) {}
  return out.sort((a, b) => b.at - a.at);
}

// ---------------------------------------------------------------- Transport (wie BombRe)
function wrapPeerConn(c) {
  const conn = { send: (o) => { if (c.open) c.send(o); }, close: () => c.close(), onData: null, onClose: null };
  c.on('data', (d) => conn.onData && conn.onData(d));
  c.on('close', () => conn.onClose && conn.onClose());
  c.on('error', () => conn.onClose && conn.onClose());
  return conn;
}
const Net = {
  host(room, onConn) {
    return new Promise((resolve, reject) => {
      if (LOCAL) return resolve(localHost(room, onConn));
      if (!window.Peer) return reject(new Error('Netzwerk-Bibliothek konnte nicht geladen werden.'));
      const peer = new Peer(PEER_PREFIX + room);
      peer.on('open', () => resolve({ close: () => peer.destroy() }));
      peer.on('connection', (c) => c.on('open', () => onConn(wrapPeerConn(c))));
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id') reject(new Error('Dieses Dorf ist schon geöffnet. Tritt bei oder wähle einen anderen Namen.'));
        else reject(new Error('Verbindungsfehler: ' + e.type));
      });
    });
  },
  join(room) {
    return new Promise((resolve, reject) => {
      if (LOCAL) return resolve(localJoin(room));
      if (!window.Peer) return reject(new Error('Netzwerk-Bibliothek konnte nicht geladen werden.'));
      const peer = new Peer();
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; peer.destroy(); reject(new Error('Keine Antwort vom Gastgeber.')); } }, 15000);
      peer.on('open', () => {
        const c = peer.connect(PEER_PREFIX + room, { reliable: true });
        c.on('open', () => {
          if (done) return; done = true; clearTimeout(timer);
          const conn = wrapPeerConn(c);
          const close = conn.close; conn.close = () => { close(); peer.destroy(); };
          resolve(conn);
        });
      });
      peer.on('error', (e) => {
        if (done) return; done = true; clearTimeout(timer); peer.destroy();
        reject(new Error(e.type === 'peer-unavailable' ? 'Dieses Dorf ist gerade nicht geöffnet. Prüfe den Namen oder öffne es selbst.' : 'Verbindungsfehler: ' + e.type));
      });
    });
  },
};
function localHost(room, onConn) {
  const bc = new BroadcastChannel('li2-' + room);
  const conns = new Map();
  bc.onmessage = ({ data: m }) => {
    if (m.to !== 'host') return;
    if (m.hello) {
      const conn = { send: (o) => bc.postMessage({ to: m.from, d: o }), close: () => { bc.postMessage({ to: m.from, bye: 1 }); conns.delete(m.from); }, onData: null, onClose: null };
      conns.set(m.from, conn); onConn(conn);
      bc.postMessage({ to: m.from, ok: 1 });
    } else if (m.bye) { const c = conns.get(m.from); conns.delete(m.from); c && c.onClose && c.onClose(); }
    else { const c = conns.get(m.from); c && c.onData && c.onData(m.d); }
  };
  return { close: () => { for (const [id] of conns) bc.postMessage({ to: id, bye: 1 }); bc.close(); } };
}
function localJoin(room) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel('li2-' + room);
    const me = Math.random().toString(36).slice(2);
    const conn = { send: (o) => bc.postMessage({ to: 'host', from: me, d: o }), close: () => { bc.postMessage({ to: 'host', from: me, bye: 1 }); bc.close(); }, onData: null, onClose: null };
    const timer = setTimeout(() => { bc.close(); reject(new Error('Dieses Dorf ist gerade nicht geöffnet.')); }, 1500);
    bc.onmessage = ({ data: m }) => {
      if (m.to !== me) return;
      if (m.ok) { clearTimeout(timer); resolve(conn); }
      else if (m.bye) { conn.onClose && conn.onClose(); }
      else conn.onData && conn.onData(m.d);
    };
    bc.postMessage({ to: 'host', from: me, hello: 1 });
  });
}

// ---------------------------------------------------------------- Zustand
const S = {
  role: null, solo: false, room: '', pw: '', pwHash: '', myId: null, game: null, hostNet: null, conns: new Map(), conn: null,
  view: null, grid: null, input: { hx: -1, hy: -1 }, lastSent: '', sel: null, hover: null, seenEv: 0,
};
let loopId = 0;
const broadcast = (msg) => { for (const c of S.conns.values()) c.send(msg); };

function readForm(needPw) {
  const name = ($('in-name').value.trim() || 'Gast').slice(0, 12);
  const room = slug($('in-room').value), pw = $('in-pass').value;
  if (needPw && (!room || !pw)) { startMsg('Bitte Dorfname und Passwort eingeben.', true); return null; }
  try { localStorage.setItem('lichtung-name', name); } catch (e) {}
  return { name, room, pw };
}
function startMsg(t, err) { $('start-msg').textContent = t || ''; $('start-msg').classList.toggle('err', !!err); }

// ---------------------------------------------------------------- Gastgeber
async function hostRoom(solo) {
  const f = solo ? { ...readForm(false), room: 'allein', pw: '' } : readForm(true);
  if (!f) return;
  startMsg(solo ? '' : 'Öffne das Dorf …');
  try {
    Object.assign(S, { role: 'host', solo, room: f.room, pw: f.pw, myId: 'host', conns: new Map() });
    S.pwHash = solo ? '' : await hashPw(f.room, f.pw);
    S.game = new Game(loadSave(f.room));
    S.game.addPlayer('host', f.name);
    S.grid = S.game.grid;
    if (!solo) S.hostNet = await Net.host(f.room, onClientConnect);
    enterGame();
    runHostLoop();
  } catch (e) { S.role = null; S.game = null; startMsg(e.message, true); }
}

function sendMap(conn) { conn.send({ t: 'map', grid: S.game.grid.join('') }); }
function saveNow() {
  if (S.role !== 'host' || !S.game) return;
  const data = S.game.toSave();
  storeSave(S.room, data);
  broadcast({ t: 'save', data });
}

function onClientConnect(conn) {
  let pid = null, name = '', askedSave = false;
  const timeout = setTimeout(() => { if (!pid) conn.close(); }, 10000);
  conn.onData = (m) => {
    if (!m || typeof m !== 'object' || S.role !== 'host') return;
    const g = S.game;
    if (!pid) {
      if (m.t !== 'join') return;
      clearTimeout(timeout);
      let reason = null;
      if (m.pw !== S.pwHash) reason = 'Falsches Passwort.';
      else if (g.players.length >= MAX_PLAYERS) reason = 'Das Dorf ist voll (maximal ' + MAX_PLAYERS + ' Spieler).';
      if (reason) { conn.send({ t: 'reject', reason }); setTimeout(() => conn.close(), 300); return; }
      pid = 'p' + Math.random().toString(36).slice(2, 8);
      name = String(m.name || 'Gast').slice(0, 12);
      if (g.players.some((p) => p.name === name)) name = (name.slice(0, 10) + ' ' + (g.players.length + 1));
      g.addPlayer(pid, name);
      S.conns.set(pid, conn);
      conn.send({ t: 'welcome', id: pid });
      sendMap(conn);
      conn.send({ t: 'save', data: g.toSave() });
      // Hat der Mitspieler einen neueren Stand dieses Dorfes? Dann übernehmen.
      const meta = m.save;
      if (meta && typeof meta.prog === 'number' && meta.prog > g.prog + 10 && (meta.vid === g.vid || g.buildings.length === 0)) {
        askedSave = true; conn.send({ t: 'needsave' });
      }
      return;
    }
    if (m.t === 'input') {
      const p = g.players.find((q) => q.id === pid);
      if (p) { p.hx = clamp(m.hx | 0, -1, W - 1); p.hy = clamp(m.hy | 0, -1, H - 1); }
    } else if (m.t === 'build') {
      const k = String(m.k);
      const err = k === 'X' ? g.demolish(pid, m.x | 0, m.y | 0) : g.build(pid, k, m.x | 0, m.y | 0);
      if (err) conn.send({ t: 'info', text: err });
    } else if (m.t === 'savedata' && askedSave) {
      askedSave = false;
      const s = cleanSave(m.data);
      if (s && s.prog > g.prog + 10 && (s.vid === g.vid || g.buildings.length === 0)) {
        g.load(s);
        S.grid = g.grid; g.changes = [];
        g.event('📜 ' + name + ' hat den neueren Spielstand mitgebracht (Tag ' + s.day + ').');
        for (const c of S.conns.values()) sendMap(c);
        saveNow();
      }
    }
  };
  conn.onClose = () => {
    if (!pid) return;
    S.conns.delete(pid);
    if (S.game) S.game.removePlayer(pid);
    pid = null;
  };
}

function runHostLoop() {
  const id = ++loopId;
  let last = performance.now(), acc = 0, n = 0, saveT = 0;
  const tick = (now) => {
    const dt = Math.min(0.25, (now - last) / 1000); last = now; acc += dt;
    const g = S.game;
    const me = g.players.find((p) => p.id === 'host'); if (me) { me.hx = S.input.hx; me.hy = S.input.hy; }
    while (acc >= TICK) {
      for (let k = 0; k < (g.speed || 1); k++) g.step(TICK);
      acc -= TICK;
      if (++n % SEND_EVERY === 0 && S.conns.size) broadcast(g.snapshot(true));
      else if (!S.conns.size) g.changes = [];
    }
    if ((saveT += dt) > 15) { saveT = 0; saveNow(); }
  };
  const frame = (now) => {
    if (id !== loopId || S.role !== 'host') return;
    tick(now);
    S.view = S.game.snapshot(false);
    draw(S.view, true);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const bg = setInterval(() => {
    if (id !== loopId || S.role !== 'host') return clearInterval(bg);
    if (document.hidden) tick(performance.now());
  }, 50);
}

// ---------------------------------------------------------------- Mitspieler
async function joinRoom() {
  const f = readForm(true); if (!f) return;
  startMsg('Verbinde …');
  try {
    const conn = await Net.join(f.room);
    Object.assign(S, { role: 'client', solo: false, room: f.room, pw: f.pw, conn });
    const pw = await hashPw(f.room, f.pw);
    const pending = [];
    const mine = loadSave(f.room);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Keine Antwort vom Gastgeber.')), 10000);
      conn.onData = (m) => {
        if (m.t === 'welcome') { clearTimeout(timer); S.myId = m.id; resolve(); }
        else if (m.t === 'reject') { clearTimeout(timer); reject(new Error(m.reason)); }
        else pending.push(m);
      };
      conn.onClose = () => { clearTimeout(timer); reject(new Error('Verbindung getrennt.')); };
      conn.send({ t: 'join', name: f.name, pw, save: mine ? { vid: mine.vid, prog: mine.prog } : null });
    });
    conn.onData = onHostMessage;
    conn.onClose = () => { if (S.role === 'client') leave('Der Gastgeber hat das Dorf geschlossen. Euer Stand ist auch in deinem Browser gespeichert.'); };
    for (const m of pending) onHostMessage(m);
    enterGame();
    runClientLoop();
  } catch (e) {
    if (S.conn) S.conn.close();
    S.role = null; S.conn = null;
    startMsg(e.message, true);
  }
}

function onHostMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'map' && typeof m.grid === 'string' && m.grid.length === W * H) S.grid = m.grid.split('');
  else if (m.t === 'state') {
    if (S.grid && Array.isArray(m.chg)) for (const [i, c] of m.chg) if (i >= 0 && i < W * H && TILE_OK.includes(c)) S.grid[i] = c;
    S.view = m;
  } else if (m.t === 'save') { const s = cleanSave(m.data); if (s) storeSave(S.room, s); }
  else if (m.t === 'needsave') { const s = loadSave(S.room); if (s) S.conn.send({ t: 'savedata', data: s }); }
  else if (m.t === 'info') toast(String(m.text).slice(0, 200));
}

function runClientLoop() {
  const id = ++loopId;
  const frame = () => {
    if (id !== loopId || S.role !== 'client') return;
    const key = S.input.hx + ',' + S.input.hy;
    if (key !== S.lastSent) { S.lastSent = key; S.conn.send({ t: 'input', ...S.input }); }
    if (S.view && S.grid) draw(S.view, false);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const iv = setInterval(() => {
    if (id !== loopId || S.role !== 'client') return clearInterval(iv);
    S.conn && S.conn.send({ t: 'input', ...S.input });
  }, 1000);
}

// ---------------------------------------------------------------- Gemeinsam
function leave(reason) {
  loopId++;
  if (S.role === 'host') {
    saveNow();
    for (const c of S.conns.values()) c.close();
    S.hostNet && S.hostNet.close();
  } else if (S.conn) { const c = S.conn; S.conn = null; c.close(); }
  Object.assign(S, { role: null, game: null, hostNet: null, conns: new Map(), conn: null, view: null, grid: null, myId: null, sel: null, seenEv: 0 });
  camInit = false;
  $('screen-start').hidden = false; $('screen-game').hidden = true;
  document.body.classList.remove('ingame');
  renderSaves();
  startMsg(reason || '');
}

function doBuild(k, x, y) {
  if (S.role === 'host') { const err = k === 'X' ? S.game.demolish('host', x, y) : S.game.build('host', k, x, y); if (err) toast(err); }
  else if (S.conn) S.conn.send({ t: 'build', k, x, y });
}

function inviteLink() {
  const p = new URLSearchParams({ dorf: S.room });
  if ($('inv-pw').checked && S.pw) p.set('pw', S.pw);
  return location.origin + location.pathname + (LOCAL ? '?local' : '') + '#' + p.toString();
}

function enterGame() {
  $('screen-start').hidden = true; $('screen-game').hidden = false;
  startMsg('');
  $('invite-panel').hidden = S.role !== 'host' || S.solo;
  if (!$('invite-panel').hidden) $('inv-link').value = inviteLink();
  $('role-note').textContent = S.solo ? 'Allein-Dorf, gespeichert in diesem Browser.'
    : S.role === 'host' ? 'Dorf „' + S.room + '“. Wird alle 15 Sekunden gespeichert.'
      : 'Du bist Gast im Dorf „' + S.room + '“. Eine Kopie wird in deinem Browser gespeichert.';
  renderBuildbar();
  document.body.classList.add('ingame');
  requestAnimationFrame(resizeCanvas);
  $('speed').hidden = S.role !== 'host';
  setSpeed(S.role === 'host' ? (S.game.speed || 1) : 1);
  try { if (navigator.wakeLock && S.role === 'host') navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
  setTimeout(() => el.remove(), 6000);
}

// ---------------------------------------------------------------- Oberfläche
function renderBuildbar() {
  $('buildbar').innerHTML = TOOLS.split('').map((k, i) => {
    const d = BUILD[k] || DEMOLISH;
    return `<button data-k="${k}" title="${esc(d.desc)}"><span class="k">${k === 'X' ? 'X' : i + 1}</span><b>${d.icon} ${esc(d.name)}</b><span class="c">${d.cost ? costText(d.cost) : '½ zurück'}</span></button>`;
  }).join('');
}
function selectBuild(k) {
  S.sel = S.sel === k ? null : k;
  updateHint();
}
function updateHint() {
  const v = S.view;
  for (const b of $('buildbar').children) b.classList.toggle('sel', b.dataset.k === S.sel);
  let text;
  if (!S.sel) text = 'Wähle unten ein Gebäude und tippe auf freie Wiese. Karte ziehen zum Verschieben, zwei Finger oder Mausrad zum Zoomen.';
  else if (S.sel === 'X') text = DEMOLISH.icon + ' ' + DEMOLISH.desc + ' Klicke auf ein Gebäude. Esc bricht ab.';
  else {
    const d = BUILD[S.sel], locked = v && d.level > v.level;
    text = d.icon + ' ' + d.name + ': ' + d.desc + (locked ? ' (Ab Stufe „' + LEVELS[d.level].name + '“.)' : ' Tippe auf freie Wiese. Nochmal auf das Gebäude unten tippen bricht ab.');
  }
  // Infos zum Gebäude unter dem Mauszeiger
  if (v && S.hover && S.grid) {
    const [hx, hy] = S.hover, c = S.grid[hy * W + hx], d = BUILD[c];
    if (d) {
      const b = (v.bl || []).find((q) => q[0] === hx && q[1] === hy);
      let info = d.icon + ' ' + d.name;
      if (d.job && b) info += b[2] ? (d.near ? ' · arbeitet, Umgebung ' + b[3] + ' %' : ' · arbeitet') : ' · kein Arbeiter frei';
      if (d.near && b && b[3] < 50) info += ' (zu wenig ' + { Bb: 'Beerensträucher', T: 'Bäume', R: 'Felsen' }[d.near] + ' in der Nähe)';
      if (d.beds) info += ' · ' + d.beds + ' Betten';
      text = info + '  |  ' + text;
    }
  }
  if ($('build-hint').textContent !== text) $('build-hint').textContent = text;
}

let hudT = 0;
function updateHud(v) {
  const now = performance.now();
  if (now - hudT < 200) return;
  hudT = now;
  const [w, s, f] = v.res;
  $('r-wood').textContent = w; $('r-stone').textContent = s; $('r-food').textContent = f;
  $('r-pop').textContent = v.pop + ' / ' + v.beds + (v.idle ? ' · ' + v.idle + ' ohne Arbeit' : '');
  $('r-food').parentElement.classList.toggle('low', f < v.pop);
  const season = Math.floor((v.day - 1) / DAYS_PER_SEASON) % 4;
  $('r-wood').parentElement.classList.toggle('low', season === 3 && w < Math.ceil(v.pop / 2));
  $('c-day').textContent = 'Tag ' + v.day;
  $('c-season').textContent = ['🌱', '☀️', '🍂', '❄️'][season] + ' ' + SEASONS[season];
  $('c-bar').style.width = (v.time * 100).toFixed(1) + '%';
  $('c-bar').parentElement.classList.toggle('night', v.time >= NIGHT_FROM);
  $('l-name').textContent = '⭐ ' + LEVELS[v.level].name;
  $('l-goal').textContent = 'Ziel: ' + LEVELS[v.level].goal;
  $('level-box').title = 'Ziel: ' + LEVELS[v.level].goal;
  for (const b of $('buildbar').children) {
    const d = BUILD[b.dataset.k];
    if (!d) continue;
    b.classList.toggle('locked', d.level > v.level);
    const c = d.cost;
    b.classList.toggle('poor', (c.wood || 0) > w || (c.stone || 0) > s);
  }
  // Ereignisse als Einblendung
  for (const [id, text] of v.ev || []) if (id > S.seenEv) { S.seenEv = id; toast(text); }
  // Bewohner-Liste
  const online = new Set(v.players.map((p) => p[1]));
  const colorOf = new Map(v.players.map((p) => [p[1], p[2]]));
  const html = (v.stats || []).map(([name, st]) =>
    `<li><span class="dot" style="background:${online.has(name) ? colorOf.get(name) : '#555'}"></span>${esc(name)}${v.players.some((p) => p[0] === S.myId && p[1] === name) ? ' (du)' : ''}<span class="sm">${st.b} gebaut</span></li>`).join('')
    + `<li><span class="dot" style="background:#c9b07a"></span>${v.pop} Siedler<span class="sm">${v.beds} Betten</span></li>`;
  if ($('people').innerHTML !== html) $('people').innerHTML = html;
  updateHint();
}

// ---------------------------------------------------------------- Zeichnen
const cv = $('cv'), ctx = cv.getContext('2d');
// Bildschirmgröße in CSS-Pixeln, Zoom = CSS-Pixel pro Welt-Pixel
let VW = 960, VH = 576, dpr = 1, zoom = 1;
const light = document.createElement('canvas');
const lctx = light.getContext('2d');
function resizeCanvas() {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  VW = r.width; VH = r.height;
  cv.width = light.width = Math.round(VW * dpr);
  cv.height = light.height = Math.round(VH * dpr);
  clampCam();
}
function clampCam() {
  const vw = VW / zoom, vh = VH / zoom;
  cam.x = vw >= W * T ? (W * T - vw) / 2 : clamp(cam.x, 0, W * T - vw);
  cam.y = vh >= H * T ? (H * T - vh) / 2 : clamp(cam.y, 0, H * T - vh);
}
// Zoomen um einen Punkt auf dem Bildschirm (sx, sy in CSS-Pixeln im Spielfeld)
function zoomAt(z, sx, sy) {
  const wx = cam.x + sx / zoom, wy = cam.y + sy / zoom;
  zoom = clamp(z, 0.35, 2.6);
  cam.x = wx - sx / zoom; cam.y = wy - sy / zoom;
  clampCam();
}
if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(cv);
addEventListener('resize', resizeCanvas);
let cam = { x: 0, y: 0 };

function grassColor(season, x, y) {
  const n = ((x * 73856093) ^ (y * 19349663)) & 3;
  if (season === 3) return ['#dfe6e8', '#d8e0e3', '#e6ecee', '#d3dcdf'][n];
  if (season === 2) return ['#7a8f42', '#748a3f', '#80954a', '#6f853c'][n];
  return ['#5c9a45', '#58953f', '#61a04a', '#55913c'][n];
}

function draw(v, isHost) {
  const grid = S.grid; if (!grid) return;
  updateHud(v);
  const season = Math.floor((v.day - 1) / DAYS_PER_SEASON) % 4, winter = season === 3;
  const t = performance.now() / 1000;
  // Kamera: frei verschiebbar, am Anfang auf die Dorfmitte
  const now = performance.now(), fdt = Math.min(0.05, (now - (draw.last || now)) / 1000); draw.last = now;
  if (!camInit) {
    camInit = true; resizeCanvas();
    zoom = VW < 600 ? 1.15 : 1;
    cam.x = W * T / 2 - VW / zoom / 2; cam.y = H * T / 2 - VH / zoom / 2;
  }
  cam.x += panDir[0] * 700 * fdt / zoom; cam.y += panDir[1] * 700 * fdt / zoom;
  clampCam();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1d2a1f'; ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-cam.x, -cam.y);
  const x0 = Math.max(0, Math.floor(cam.x / T)), y0 = Math.max(0, Math.floor(cam.y / T));
  const x1 = Math.min(W - 1, Math.floor((cam.x + VW / zoom) / T)), y1 = Math.min(H - 1, Math.floor((cam.y + VH / zoom) / T));
  const fires = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = grid[y * W + x], px = x * T, py = y * T;
    ctx.fillStyle = c === '~' ? (winter ? '#a9cfe0' : '#3f7fb5') : grassColor(season, x, y);
    ctx.fillRect(px, py, T, T);
    if (c === '~') {
      ctx.strokeStyle = winter ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); const o = Math.sin(t + x * 0.7 + y) * 3; ctx.moveTo(px + 6, py + 14 + o); ctx.lineTo(px + 16, py + 12 + o); ctx.stroke();
    } else drawTile(c, px, py, winter, t, x, y);
    if (c === 'F') fires.push([px + T / 2, py + T / 2]);
    if (BUILD[c] && BUILD[c].icon && c !== 'F' && c !== 'A') { ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(BUILD[c].icon, px + T / 2, py + T - 3); }
  }
  // Gebäude ohne Arbeiter markieren
  for (const [bx, by, worker, eff] of v.bl || []) {
    const d = BUILD[grid[by * W + bx]];
    if (!d || !d.job || bx < x0 - 1 || bx > x1 || by < y0 - 1 || by > y1) continue;
    if (!worker || eff < 50) { ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(!worker ? '💤' : '⚠️', bx * T + T - 6, by * T + 11); }
  }
  // Bau-Vorschau
  if (S.sel && S.hover) {
    const [hx, hy] = S.hover, c = grid[hy * W + hx];
    const ok = S.sel === 'X' ? !!BUILD[c] : c === '.' && BUILD[S.sel].level <= v.level;
    ctx.fillStyle = ok ? 'rgba(120,255,120,.35)' : 'rgba(255,80,60,.35)';
    ctx.fillRect(hx * T, hy * T, T, T);
    ctx.globalAlpha = 0.7; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText((BUILD[S.sel] || DEMOLISH).icon, hx * T + T / 2, hy * T + T / 2 + 6); ctx.globalAlpha = 1;
  } else if (S.hover) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(S.hover[0] * T + 1, S.hover[1] * T + 1, T - 2, T - 2);
  }
  // Siedler
  for (const [x, y, working, sad] of v.vill) {
    const px = x * T, py = y * T + (working ? Math.sin(t * 8 + x) * 1.5 : 0);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(px, py + 7, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9b07a'; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1d6b0'; ctx.beginPath(); ctx.arc(px, py - 7, 4.5, 0, Math.PI * 2); ctx.fill();
    if (sad) { ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(winter ? '🥶' : '😟', px, py - 14); }
  }
  // Zeiger der Mitspieler
  for (const p of v.players) if (p[0] !== S.myId && p[3] >= 0) drawCursor(p);
  ctx.restore();

  // Nacht und Dämmerung mit Lichtkreisen ums Feuer
  const tm = v.time;
  let dark = 0;
  if (tm >= NIGHT_FROM) dark = Math.min(1, (tm - NIGHT_FROM) / 0.05) * 0.62;
  else if (tm < 0.06) dark = (1 - tm / 0.06) * 0.62;
  else if (tm > NIGHT_FROM - 0.06) dark = (tm - (NIGHT_FROM - 0.06)) / 0.06 * 0.2;
  if (dark > 0.01) {
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, VW, VH);
    lctx.fillStyle = `rgba(12,16,48,${dark})`; lctx.fillRect(0, 0, VW, VH);
    lctx.globalCompositeOperation = 'destination-out';
    const lights = fires.map(([x, y]) => [x, y, 150 + Math.sin(t * 7 + x) * 6]);
    for (let [x, y, r] of lights) {
      const sx = (x - cam.x) * zoom, sy = (y - cam.y) * zoom; r *= zoom;
      const g = lctx.createRadialGradient(sx, sy, 10 * zoom, sx, sy, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g; lctx.beginPath(); lctx.arc(sx, sy, r, 0, Math.PI * 2); lctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(light, 0, 0);
  }
}

function drawTile(c, px, py, winter, t, x, y) {
  const cx = px + T / 2, cy = py + T / 2;
  if (c === 'T') {
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(cx, py + T - 4, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(cx - 3, cy + 2, 6, 11);
    ctx.fillStyle = winter ? '#2f5a45' : ((x + y) % 3 ? '#2e6b34' : '#357a3b');
    ctx.beginPath(); ctx.moveTo(cx, py + 1); ctx.lineTo(cx + 13, cy + 7); ctx.lineTo(cx - 13, cy + 7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, py + 7); ctx.lineTo(cx + 11, cy + 3); ctx.lineTo(cx - 11, cy + 3); ctx.closePath(); ctx.fill();
    if (winter) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(cx, py + 1); ctx.lineTo(cx + 5, py + 8); ctx.lineTo(cx - 5, py + 8); ctx.closePath(); ctx.fill(); }
  } else if (c === 't') {
    ctx.fillStyle = '#7a5532'; ctx.beginPath(); ctx.ellipse(cx, cy + 5, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9a06b'; ctx.beginPath(); ctx.ellipse(cx, cy + 3, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  } else if (c === 'R') {
    ctx.fillStyle = '#7d8288'; ctx.beginPath(); ctx.moveTo(px + 4, py + T - 5); ctx.lineTo(px + 7, py + 10); ctx.lineTo(px + 16, py + 5); ctx.lineTo(px + 27, py + 11); ctx.lineTo(px + 29, py + T - 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.moveTo(px + 8, py + 11); ctx.lineTo(px + 16, py + 6); ctx.lineTo(px + 20, py + 14); ctx.lineTo(px + 10, py + 17); ctx.closePath(); ctx.fill();
  } else if (c === 'B' || c === 'b') {
    ctx.fillStyle = winter ? '#5d7a5a' : '#3f8a3a'; ctx.beginPath(); ctx.arc(cx - 5, cy + 3, 8, 0, Math.PI * 2); ctx.arc(cx + 5, cy + 3, 8, 0, Math.PI * 2); ctx.arc(cx, cy - 3, 8, 0, Math.PI * 2); ctx.fill();
    if (c === 'B') { ctx.fillStyle = '#d6304a'; for (const [ox, oy] of [[-6, 2], [4, -4], [6, 5], [-1, 6], [-3, -5]]) { ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 2.3, 0, Math.PI * 2); ctx.fill(); } }
  } else if (c === 'F') {
    ctx.fillStyle = '#6b6b6b'; for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 9, cy + 4 + Math.sin(a) * 5, 3, 0, Math.PI * 2); ctx.fill(); }
    const f = Math.sin(t * 12 + x) * 2;
    ctx.fillStyle = '#f08c2a'; ctx.beginPath(); ctx.moveTo(cx - 6, cy + 5); ctx.quadraticCurveTo(cx, cy - 14 - f, cx + 6, cy + 5); ctx.fill();
    ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.moveTo(cx - 3, cy + 5); ctx.quadraticCurveTo(cx, cy - 6 + f, cx + 3, cy + 5); ctx.fill();
  } else if (c === 'H' || c === 'S' || c === 'L' || c === 'Q') {
    const wall = { H: '#a7784a', S: '#b08d5a', L: '#8d6a43', Q: '#8f8a80' }[c], roof = { H: '#7b4b2a', S: '#9b6b2f', L: '#5f3f22', Q: '#5b5f66' }[c];
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(px + 4, py + T - 6, T - 6, 4);
    ctx.fillStyle = wall; ctx.fillRect(px + 5, py + 13, T - 10, T - 17);
    ctx.fillStyle = winter ? '#eef2f4' : roof; ctx.beginPath(); ctx.moveTo(px + 2, py + 15); ctx.lineTo(cx, py + 2); ctx.lineTo(px + T - 2, py + 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3b2716'; ctx.fillRect(cx - 3, py + T - 11, 6, 7);
  } else if (c === 'M') {
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(px + 3, py + T - 5, T - 4, 4);
    ctx.fillStyle = '#b9b3a7'; ctx.fillRect(px + 3, py + 12, T - 6, T - 15);
    ctx.fillStyle = winter ? '#eef2f4' : '#a5432f'; ctx.beginPath(); ctx.moveTo(px + 1, py + 14); ctx.lineTo(cx, py + 1); ctx.lineTo(px + T - 1, py + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe9a6'; ctx.fillRect(px + 7, py + 17, 5, 5); ctx.fillRect(px + T - 12, py + 17, 5, 5);
  } else if (c === 'A') {
    ctx.fillStyle = winter ? '#cfc6b8' : '#8a6a3e'; ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
    ctx.strokeStyle = winter ? '#b8ae9f' : '#d9c35a'; ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px + 5, py + 6 + k * 7); ctx.lineTo(px + T - 5, py + 6 + k * 7); ctx.stroke(); }
  } else if (c === 'P') {
    ctx.fillStyle = '#8f8a80'; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = winter ? '#cfe6f0' : '#4b93c9'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(cx + Math.sin(t * 2) * 3, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCursor(p) {
  const [, name, color, hx, hy] = p, px = hx * T, py = hy * T;
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
  ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(name, px + 2, py - 4);
  ctx.fillStyle = color; ctx.fillText(name, px + 2, py - 4);
}

// ---------------------------------------------------------------- Eingabe
let camInit = false;
const panDir = [0, 0];
const held = new Set();
const DIRS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
function recomputePan() {
  let dx = 0, dy = 0;
  for (const k of held) if (DIRS[k]) { dx += DIRS[k][0]; dy += DIRS[k][1]; }
  panDir[0] = Math.sign(dx); panDir[1] = Math.sign(dy);
}
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
addEventListener('keydown', (e) => {
  if (!S.role || typing()) return;
  if (DIRS[e.code]) { held.add(e.code); recomputePan(); e.preventDefault(); return; }
  const n = '12345678'.indexOf(e.key);
  if (n >= 0) { selectBuild(BUILD_KEYS[n]); return; }
  if (e.code === 'KeyX' || e.key === '9') { selectBuild('X'); return; }
  if (e.code === 'Escape') { S.sel = null; updateHint(); }
  if (e.key === '+' || e.key === '=') zoomAt(zoom * 1.25, VW / 2, VH / 2);
  if (e.key === '-') zoomAt(zoom / 1.25, VW / 2, VH / 2);
});
addEventListener('keyup', (e) => { held.delete(e.code); recomputePan(); });
addEventListener('blur', () => { held.clear(); recomputePan(); });

function tileAt(e) {
  const r = cv.getBoundingClientRect();
  const x = cam.x + (e.clientX - r.left) / zoom, y = cam.y + (e.clientY - r.top) / zoom;
  return [clamp(Math.floor(x / T), 0, W - 1), clamp(Math.floor(y / T), 0, H - 1)];
}
function setHover(tile) {
  S.hover = tile;
  S.input.hx = tile ? tile[0] : -1; S.input.hy = tile ? tile[1] : -1;
}
// Ziehen verschiebt die Karte, ein kurzer Klick/Tipp baut, zwei Finger zoomen
let drag = null, pinch = null;
const pts = new Map();
const rel = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function startPinch() {
  const [a, b] = [...pts.values()];
  pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: zoom, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
}
cv.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  pts.set(e.pointerId, rel(e));
  cv.setPointerCapture(e.pointerId);
  if (pts.size === 2) { startPinch(); if (drag) drag.moved = true; return; }
  if (pts.size === 1) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
cv.addEventListener('pointermove', (e) => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, rel(e));
  if (pinch && pts.size >= 2) {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    cam.x -= (mx - pinch.mx) / zoom; cam.y -= (my - pinch.my) / zoom;
    pinch.mx = mx; pinch.my = my;
    zoomAt(pinch.z * d / pinch.d, mx, my);
    return;
  }
  if (drag && drag.id === e.pointerId) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > (e.pointerType === 'touch' ? 10 : 6)) drag.moved = true;
    if (drag.moved) { cam.x = drag.cx - dx / zoom; cam.y = drag.cy - dy / zoom; clampCam(); return; }
  }
  if (e.pointerType !== 'touch') setHover(tileAt(e));
});
function endPointer(e, cancel) {
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch = null;
  if (!drag || drag.id !== e.pointerId) { if (pts.size === 0) drag = null; return; }
  const wasDrag = drag.moved; drag = null;
  if (cancel || wasDrag) return;
  const [x, y] = tileAt(e); setHover([x, y]);
  if (S.sel) doBuild(S.sel, x, y);
  updateHint();
}
cv.addEventListener('pointerup', (e) => endPointer(e, false));
cv.addEventListener('pointercancel', (e) => endPointer(e, true));
cv.addEventListener('pointerleave', (e) => { if (!drag && e.pointerType !== 'touch') setHover(null); });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [sx, sy] = rel(e);
  zoomAt(zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), sx, sy);
}, { passive: false });
$('zoom-in').addEventListener('click', () => zoomAt(zoom * 1.25, VW / 2, VH / 2));
$('zoom-out').addEventListener('click', () => zoomAt(zoom / 1.25, VW / 2, VH / 2));
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); S.sel = null; updateHint(); });
$('buildbar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) selectBuild(b.dataset.k); });

// Tempo (nur Gastgeber)
function setSpeed(n) {
  if (S.role === 'host' && S.game) S.game.speed = n;
  for (const b of $('speed').children) b.classList.toggle('sel', +b.dataset.s === n);
}
$('speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); });

// ---------------------------------------------------------------- Start, Knöpfe, Einladung
function renderSaves() {
  const list = listSaves();
  $('saves-panel').hidden = !list.length;
  $('saves').innerHTML = list.map((s) => `<li><span><b>${esc(s.room === 'allein' ? 'Allein-Dorf' : s.room)}</b> · Tag ${s.day} · ${s.pop} Siedler · ${esc(LEVELS[clamp(s.level, 0, 3)].name)}</span><button class="secondary" data-room="${esc(s.room)}">Auswählen</button></li>`).join('');
}
$('saves').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.room === 'allein') { hostRoom(true); return; }
  $('in-room').value = b.dataset.room; $('in-pass').focus();
  startMsg('Passwort eingeben und „Dorf öffnen“ drücken. Mitspieler brauchen dasselbe Passwort.');
});
$('btn-host').addEventListener('click', () => hostRoom(false));
$('btn-join').addEventListener('click', joinRoom);
$('btn-solo').addEventListener('click', () => hostRoom(true));
$('btn-leave').addEventListener('click', () => leave(''));
$('inv-pw').addEventListener('change', () => { $('inv-link').value = inviteLink(); });
$('btn-random').addEventListener('click', () => {
  const a = ['eichen', 'birken', 'tannen', 'moos', 'fuchs', 'bach', 'nebel', 'sonnen'], b = ['hain', 'tal', 'grund', 'feld', 'au', 'wald'];
  $('in-room').value = a[(Math.random() * a.length) | 0] + b[(Math.random() * b.length) | 0] + ((Math.random() * 90 + 10) | 0);
  $('in-pass').value = Math.random().toString(36).slice(2, 8);
  if (!$('in-name').value) $('in-name').value = NAMES[(Math.random() * NAMES.length) | 0];
});
async function copyInvite() {
  const link = inviteLink();
  let ok = false;
  try { await navigator.clipboard.writeText(link); ok = true; } catch (e) {
    const el = $('inv-link'); el.focus(); el.select();
    try { ok = document.execCommand('copy'); } catch (e2) {}
  }
  $('btn-copy').textContent = ok ? 'Kopiert ✓' : 'Markieren & kopieren';
  setTimeout(() => { $('btn-copy').textContent = 'Kopieren'; }, 2000);
}
$('btn-copy').addEventListener('click', copyInvite);
if (navigator.share) {
  $('btn-share').hidden = false;
  $('btn-share').addEventListener('click', () => navigator.share({ title: 'Lichtung', text: 'Bau mit mir am Dorf „' + S.room + '“:', url: inviteLink() }).catch(() => {}));
}
addEventListener('beforeunload', () => { if (S.role === 'host') saveNow(); });

(function init() {
  try { $('in-name').value = localStorage.getItem('lichtung-name') || ''; } catch (e) {}
  renderSaves();
  const h = new URLSearchParams(location.hash.slice(1));
  const room = slug(h.get('dorf') || '');
  if (room) {
    $('in-room').value = room;
    if (h.get('pw')) $('in-pass').value = h.get('pw');
    history.replaceState(null, '', location.pathname + location.search);
    startMsg('Du bist eingeladen! Name eingeben und „Dorf beitreten“ drücken.');
    $('btn-join').classList.remove('secondary'); $('btn-host').classList.add('secondary');
    $('in-name').focus();
  }
})();

// Neue Version auf GitHub Pages erkennen, damit alle dieselbe Version spielen
if (!VERSION.startsWith('__')) {
  setInterval(async () => {
    try {
      const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
      const v = (await r.text()).trim();
      if (v && v !== VERSION) $('update-bar').hidden = false;
    } catch (e) {}
  }, 60000);
  $('btn-reload').addEventListener('click', () => location.reload());
}

// Für Tests
window.__lichtung = { S, Game, BUILD, cleanSave };
