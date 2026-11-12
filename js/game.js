'use strict';
// ============ Lõi mô phỏng: trạng thái, kinh tế, quân đội, giao chiến, công thành, ngoại giao ============
(function () {
  const U = CW.U, T = CW.T;
  const G = CW.G = {};
  const K_DMG = 0.003;           // hệ số thương vong / ngày
  const ENGAGE_R = 1.5;          // khoảng cách giao chiến (ô)
  const SIEGE_R = 1.8;

  // ---------------- Tiện ích truy vấn ----------------
  G.troops = t => (t.inf || 0) + (t.arc || 0) + (t.cav || 0) + (t.sie || 0);
  G.emptyT = () => ({ inf: 0, arc: 0, cav: 0, sie: 0 });
  G.nation = (g, id) => g.nations[id];
  G.nationName = (g, id) => (id < 0 ? 'Thổ hào' : g.nations[id].name);
  G.nationColor = (g, id) => (id < 0 ? CW.NEUTRAL_COLOR : g.nations[id].color);
  G.provName = (g, pid) => (pid >= 0 && g.provs[pid] ? g.provs[pid].name : 'vùng hoang dã');
  G.city = (g, pid) => { const p = g.map.provinces[pid]; return { x: p.cx + 0.5, y: p.cy + 0.5 }; };
  G.provAt = (g, x, y) => {
    const m = g.map; const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= m.W || cy >= m.H) return -1;
    return m.prov[cy * m.W + cx];
  };
  G.provsOf = (g, nid) => { const r = []; g.provs.forEach((p, i) => { if (p.owner === nid) r.push(i); }); return r; };
  G.armiesOf = (g, nid) => g.armies.filter(a => a.nation === nid);
  G.army = (g, id) => g.armies.find(a => a.id === id);
  G.gen = (g, id) => g.generals.find(x => x.id === id);
  G.wallMax = p => 100 + p.bld.wall * 150;
  G.status = (g, a, b) => (a < 0 || b < 0 || a === b ? (a === b ? 'self' : 'neutral') : g.status[a][b]);
  G.atWar = (g, a, b) => a >= 0 && b >= 0 && a !== b && g.status[a][b] === 'war';
  G.hostileProv = (g, nid, owner) => owner !== nid && (owner < 0 || G.atWar(g, nid, owner));
  G.isPlayer = (g, nid) => nid >= 0 && !!g.nations[nid] && !!g.nations[nid].isPlayer;
  G.humans = g => g.nations.filter(n => n.isPlayer).map(n => n.id);
  const HP = (g, ...ids) => ids.some(i => G.isPlayer(g, i));
  G.anyHuman = HP;
  G.terrainAt = (g, x, y) => { const m = g.map; const cx = U.clamp(Math.floor(x), 0, m.W - 1), cy = U.clamp(Math.floor(y), 0, m.H - 1); return m.ter[cy * m.W + cx]; };

  G.dateParts = day => {
    day = Math.floor(day);
    return { y: Math.floor(day / CW.DAYS_PER_YEAR), m: Math.floor((day % CW.DAYS_PER_YEAR) / 30) + 1, d: (day % 30) + 1 };
  };
  G.dateStr = (g, day, short) => {
    const p = G.dateParts(day === undefined ? g.day : day);
    const yr = g.setup.profile.startYear + p.y;
    const yrs = yr < 0 ? `${-yr} TCN` : `${yr}`;
    if (short) return `${p.d}/${p.m}/${yrs}`;
    const season = ['Xuân', 'Xuân', 'Xuân', 'Hạ', 'Hạ', 'Hạ', 'Thu', 'Thu', 'Thu', 'Đông', 'Đông', 'Đông'][p.m - 1];
    return `Năm ${yrs} · Tháng ${p.m} (${season}) · Ngày ${p.d}`;
  };

  // Hàng đợi hiệu ứng âm thanh (UI phát; không lưu vào file)
  // name: tên tiếng, hoặc { nid: tên, '*': tên mặc định } (tiếng tùy theo góc nhìn người chơi); nids: các nước liên quan
  G.sfx = (g, name, nids, major) => {
    if (!name) return;
    const e = { s: name, n: nids || [], major: !!major };
    (g._sfxq || (g._sfxq = [])).push(e);
    if (g._sfxOut) g._sfxOut.push(e);
  };
  G.sfxFor = (e, me) => { if (!e || !(e.major || e.n.includes(me))) return null; return typeof e.s === 'string' ? e.s : (e.s[me] !== undefined ? e.s[me] : e.s['*'] || null); };
  G.log = function (g, type, text, opt) {
    opt = opt || {};
    const ev = { d: Math.floor(g.day), type, text, n: opt.nations || [], x: opt.x, y: opt.y, major: !!opt.major };
    if (opt.rep !== undefined) ev.rep = opt.rep;
    if (opt.sfx) G.sfx(g, opt.sfx, ev.n, ev.major);
    g.events.push(ev);
    if (g._evOut) g._evOut.push(ev);
    if (g.events.length > 2500) g.events.splice(0, g.events.length - 2500);
    (g._fresh || (g._fresh = [])).push(ev);
    return ev;
  };

  // ---------------- Tạo tướng ----------------
  G.randomGeneral = function (g, nid, quality) {
    const q = quality || 1, r = Math.random;
    const stat = (b) => Math.round(U.clamp(b + r() * 40 * q + (r() < 0.12 ? 15 : 0), 20, 99));
    let name, tries = 0;
    do { name = U.pick(r, CW.SURNAMES) + ' ' + U.pick(r, CW.GIVEN); tries++; } while (tries < 20 && g.generals.some(x => x.name === name));
    const gen = { id: g.nextId++, nation: nid, name, war: stat(35), lead: stat(35), int: stat(35), loyalty: 60 + Math.floor(r() * 30), exp: 0, army: null, alive: true, monarch: false, wins: 0 };
    return gen;
  };

  // ---------------- Khởi tạo ván mới ----------------
  G.newGame = function (setup) {
    const N = setup.nationCount;
    const map = CW.generateMap(setup.template, setup.seed, N);
    const r = U.rng(setup.seed ^ 0x5bd1e995);
    const diff = CW.DIFFICULTY[setup.difficulty] || CW.DIFFICULTY.normal;
    const g = { version: 1, setup, day: 0, nextId: 1, nations: [], provs: [], armies: [], generals: [], events: [], proposals: [], status: [], rel: [], truce: [], warStart: [], battles: [], gameOver: null, speed: 1, paused: false };
    Object.defineProperty(g, 'map', { value: map, enumerable: false, writable: true, configurable: true });

    // Quốc gia
    const prof = setup.profile;
    // Người chơi: nước 0 là chủ phòng (hoặc người chơi đơn); setup.humans là các người chơi khác (chế độ nhiều người)
    const profs = [prof].concat((setup.humans || []).map(h => h.profile)).slice(0, N);
    profs.forEach((pf, k) => {
      g.nations.push({ id: k, name: pf.name, char: pf.char, color: pf.color, monarch: pf.monarch, title: pf.title, isPlayer: true, aggr: 0.5, comp: [0.5, 0.25, 0.15, 0.1], prof: k });
      if (pf.player) g.nations[k].player = String(pf.player).slice(0, 24);
    });
    setup.rivals.slice(0, N - profs.length).forEach((rv, k) => {
      const pre = CW.NATION_PRESETS.find(p => p.id === rv.presetId) || CW.NATION_PRESETS[k];
      const id = g.nations.length;
      g.nations.push({ id, name: pre.name, char: pre.char, color: pre.color, monarch: pre.monarch, title: 'Vương', isPlayer: false, aggr: U.clamp(pre.aggr * diff.aggr, 0.1, 1), comp: pre.comp.slice(), presetId: pre.id });
    });
    for (const n of g.nations) {
      Object.assign(n, { alive: true, capital: map.capitals[n.id], res: { food: 2500, gold: 1600, wood: 900, iron: 500, weapons: 900 }, tax: 0.3, autoEcon: false, autoRecruit: false, thinkAt: 3 + n.id * 0.7 });
    }
    // Lãnh địa
    map.provinces.forEach((mp, k) => {
      const owner = map.owners[k];
      const p = { name: mp.name, owner, pop: Math.round(mp.area * 55 * (0.55 + mp.fert) * (0.75 + r() * 0.5)), garrison: G.emptyT(), bld: {}, building: null, queue: [], wallHp: 0, sieged: -99 };
      CW.BUILD_KEYS.forEach(b => (p.bld[b] = 0));
      if (owner >= 0) {
        if (map.capitals[owner] === k) {
          Object.assign(p.bld, { wall: 2, farm: 1, market: 1, smithy: 1, barracks: 1 });
          p.garrison = { inf: 2200, arc: 900, cav: 300, sie: 0 }; p.pop = Math.round(p.pop * 1.4);
          const pf = owner < profs.length ? profs[owner] : null;
          if (pf && pf.capitalName) p.name = pf.capitalName;
        } else {
          p.bld.wall = r() < 0.4 ? 1 : 0; p.bld.farm = r() < 0.5 ? 1 : 0;
          if (mp.hillF > 0.25 && r() < 0.5) p.bld.mine = 1;
          p.garrison = { inf: 500 + Math.round(r() * 400), arc: 200 + Math.round(r() * 200), cav: 0, sie: 0 };
        }
      } else {
        p.bld.wall = r() < 0.5 ? 1 : 0;
        p.garrison = { inf: 400 + Math.round(r() * 700), arc: 150 + Math.round(r() * 300), cav: 0, sie: 0 };
        p.pop = Math.round(p.pop * 0.7);
      }
      p.wallHp = G.wallMax(p);
      g.provs.push(p);
    });
    // Tướng lĩnh + quân đội
    for (const n of g.nations) {
      const mon = G.randomGeneral(g, n.id, 1.1);
      mon.name = n.monarch; mon.monarch = true; mon.loyalty = 100; mon.lead = Math.max(mon.lead, 65);
      const pf = n.isPlayer ? profs[n.prof] : null;
      if (pf && pf.monarchStats) { const ms = pf.monarchStats; mon.war = U.clamp(ms.war | 0, 1, 99); mon.lead = U.clamp(ms.lead | 0, 1, 99); mon.int = U.clamp(ms.int | 0, 1, 99); }
      delete n.prof;
      g.generals.push(mon);
      let made = 0;
      if (pf && Array.isArray(pf.generals)) {
        for (const cg of pf.generals.slice(0, 10)) {
          if (!cg || !cg.name || g.generals.some(x => x.alive && x.name === cg.name)) continue;
          const gen = G.randomGeneral(g, n.id, 1);
          gen.name = cg.name; gen.war = U.clamp(cg.war | 0, 1, 99); gen.lead = U.clamp(cg.lead | 0, 1, 99); gen.int = U.clamp(cg.int | 0, 1, 99);
          gen.loyalty = 90; gen.custom = true;
          g.generals.push(gen); made++;
        }
      }
      for (let i = made; i < 4; i++) g.generals.push(G.randomGeneral(g, n.id, 1));
      const gens = g.generals.filter(x => x.nation === n.id && !x.monarch);
      const cap = n.capital;
      const own = G.provsOf(g, n.id).filter(k => k !== cap);
      G.createArmy(g, n.id, cap, gens[0].id, { inf: 1700, arc: 800, cav: 450, sie: 150 }, 'phuong');
      const second = own.length ? own[Math.floor(r() * own.length)] : cap;
      G.createArmy(g, n.id, second, gens[1].id, { inf: 1200, arc: 500, cav: 250, sie: 50 }, 'hacdy');
    }
    // Ngoại giao
    for (let i = 0; i < N; i++) {
      g.status.push(new Array(N).fill('peace')); g.rel.push(new Array(N).fill(0));
      g.truce.push(new Array(N).fill(0)); g.warStart.push(new Array(N).fill(0));
    }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let rel = Math.round(r() * 40 - 20), st = 'peace';
      const hi = g.nations[i].isPlayer, hj = g.nations[j].isPlayer;
      if (setup.humans && setup.humans.length && (hi || hj)) {
        // Nhiều người chơi: giữa các người chơi theo chế độ (hợp tác = đồng minh), với AI khởi đầu hòa hiếu
        if (hi && hj) { if (setup.mode === 'coop') { st = 'ally'; rel = 80; } else rel = 0; }
      } else if (i === 0) {
        const rv = setup.rivals[j - 1];
        if (rv && rv.rel === 'ally') { st = 'ally'; rel = 70; } else if (rv && rv.rel === 'enemy') { st = 'war'; rel = -60; }
      } else {
        const x = r();
        if (x < 0.12) { st = 'ally'; rel = 60; } else if (x < 0.18) { st = 'war'; rel = -50; }
      }
      g.status[i][j] = g.status[j][i] = st; g.rel[i][j] = g.rel[j][i] = rel;
      g.status[i][i] = 'self';
    }
    g.status[N - 1][N - 1] = 'self';
    for (const n of g.nations) if (n.isPlayer) G.log(g, 'diplo', `${n.title} ${n.monarch} lên ngôi, lập quốc ${n.name}, định đô tại ${g.provs[n.capital].name}.`, { nations: [n.id], major: true, ...G.city(g, n.capital) });
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      if (g.status[i][j] === 'ally') G.log(g, 'diplo', `${g.nations[i].name} và ${g.nations[j].name} kết minh ước.`, { nations: [i, j] });
      if (g.status[i][j] === 'war') { if (g.nations[i].isPlayer) G.camp(g, j, i).wars++; if (g.nations[j].isPlayer) G.camp(g, i, j).wars++; }
      if (g.status[i][j] === 'war') G.log(g, 'war', `${g.nations[i].name} và ${g.nations[j].name} đang giao tranh.`, { nations: [i, j], major: true });
    }
    G.recalcIncome(g);
    return g;
  };

  // ---------------- Tìm đường A* ----------------
  const PF = { size: 0 };
  function nearestLand(map, x, y) {
    const W = map.W, H = map.H;
    for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = ny * W + nx; if (map.mainland[i]) return i;
    }
    return -1;
  }
  G.findPath = function (map, sx, sy, tx, ty) {
    const W = map.W, H = map.H, size = W * H;
    if (PF.size !== size) { PF.size = size; PF.gs = new Float32Array(size); PF.seen = new Int32Array(size); PF.closed = new Int32Array(size); PF.came = new Int32Array(size); PF.stamp = 0; }
    let s = U.clamp(Math.floor(sy), 0, H - 1) * W + U.clamp(Math.floor(sx), 0, W - 1);
    let t = U.clamp(Math.floor(ty), 0, H - 1) * W + U.clamp(Math.floor(tx), 0, W - 1);
    let exactEnd = true;
    if (!map.mainland[s]) { s = nearestLand(map, s % W, (s / W) | 0); }
    if (!map.mainland[t]) { t = nearestLand(map, t % W, (t / W) | 0); exactEnd = false; }
    if (s < 0 || t < 0) return null;
    if (s === t) return [exactEnd ? [tx, ty] : [t % W + 0.5, ((t / W) | 0) + 0.5]];
    const st = ++PF.stamp, gs = PF.gs, seen = PF.seen, closed = PF.closed, came = PF.came;
    const ter = map.ter, river = map.river, land = map.mainland, TER = CW.TERRAIN;
    const cost = i => TER[ter[i]].move + (river[i] ? 1.2 : 0);
    const txc = t % W, tyc = (t / W) | 0;
    const heur = i => { const dx = Math.abs(i % W - txc), dy = Math.abs(((i / W) | 0) - tyc); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); };
    const heap = new U.Heap();
    gs[s] = 0; seen[s] = st; heap.push(s, heur(s));
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    let found = false, expanded = 0;
    while (heap.size) {
      const c = heap.pop();
      if (c === t) { found = true; break; }
      if (closed[c] === st) continue; closed[c] = st;
      if (++expanded > 60000) break;
      const cx = c % W, cy = (c / W) | 0, cc = cost(c);
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!land[n] || closed[n] === st) continue;
        const diag = k >= 4;
        if (diag && (!land[cy * W + nx] || !land[ny * W + cx])) continue;
        const ng = gs[c] + (cc + cost(n)) * 0.5 * (diag ? 1.414 : 1);
        if (seen[n] !== st || ng < gs[n]) { seen[n] = st; gs[n] = ng; came[n] = c; heap.push(n, ng + heur(n)); }
      }
    }
    if (!found) return null;
    const cells = []; let c = t;
    while (c !== s) { cells.push(c); c = came[c]; }
    cells.reverse();
    // Gộp các điểm thẳng hàng
    const pts = [];
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i] % W + 0.5, y = ((cells[i] / W) | 0) + 0.5;
      if (pts.length >= 2 && i < cells.length - 1) {
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        if (Math.abs((b[0] - a[0]) * (y - b[1]) - (b[1] - a[1]) * (x - b[0])) < 1e-6) { pts[pts.length - 1] = [x, y]; continue; }
      }
      pts.push([x, y]);
    }
    if (exactEnd && pts.length) pts[pts.length - 1] = [tx, ty];
    return pts;
  };

  // ---------------- Quân đội ----------------
  G.createArmy = function (g, nid, pid, genId, t, formation) {
    const c = G.city(g, pid);
    const ang = Math.random() * Math.PI * 2;
    const a = {
      id: g.nextId++, nation: nid, gen: genId || null, x: c.x + Math.cos(ang) * 0.9, y: c.y + Math.sin(ang) * 0.9,
      t: { inf: t.inf | 0, arc: t.arc | 0, cav: t.cav | 0, sie: t.sie | 0 }, peak: 0, morale: 80, formation: formation || 'phuong', stance: 'aggr',
      path: null, pi: 0, order: null, state: 'idle', mode: G.isPlayer(g, nid) ? 'manual' : 'auto', mission: G.isPlayer(g, nid) ? null : { type: 'free' },
      merit: 0, facing: 0, cd: {}, still: 0, ambushLeft: 0, foes: [], routDays: 0, siegeProv: -1, thinkAt: g.day + Math.random() * 3, home: pid,
    };
    a.peak = G.troops(a.t);
    if (genId) { const gen = G.gen(g, genId); if (gen) gen.army = a.id; }
    g.armies.push(a);
    return a;
  };
  G.armyName = (g, a) => { const gen = a.gen ? G.gen(g, a.gen) : null; return gen ? gen.name : 'Vô tướng'; };

  G.armySpeed = function (g, a) {
    let s = 9;
    for (const k of CW.UNIT_KEYS) if (a.t[k] > 0) s = Math.min(s, CW.UNITS[k].spd);
    if (s === 9) s = 1;
    // Kỵ binh thuần thì nhanh
    s *= CW.FORMATIONS[a.formation].spd;
    if (a.state === 'rout') s *= 1.3;
    return 1.25 * s;
  };

  G.avgDef = function (t) {
    const n = G.troops(t); if (n <= 0) return 10;
    let d = 0; for (const k of CW.UNIT_KEYS) d += t[k] * CW.UNITS[k].def;
    return d / n;
  };
  // ---- Ảnh hưởng của tướng ----
  // Công: Võ là chính, Thống phụ; danh tướng (Võ hoặc Thống ≥ 85) +10%. Ví dụ 95/90 → ×1.68, 40/40 → ×0.83.
  G.genMult = function (g, a) {
    const gen = a.gen ? G.gen(g, a.gen) : null;
    if (!gen) return 0.75;
    return (1 + (gen.war - 50) / 130 + (gen.lead - 50) / 220) * (gen.war >= 85 || gen.lead >= 85 ? 1.1 : 1);
  };
  // Thủ (giảm thương vong phải nhận): Thống là chính, Trí phụ. Ví dụ Thống 90 Trí 80 → ×1.35, 40/40 → ×0.90.
  G.genDef = function (g, a) {
    const gen = a.gen ? G.gen(g, a.gen) : null;
    if (!gen) return 0.8;
    return 1 + (gen.lead - 50) / 160 + (gen.int - 50) / 300;
  };
  // Mưu lược: chênh lệch Trí giữa hai chủ tướng, tối đa ±12% sức công
  G.wit = function (g, a, foe) {
    if (!foe) return 1;
    const ga = a.gen ? G.gen(g, a.gen) : null, gf = foe.gen ? G.gen(g, foe.gen) : null;
    return 1 + U.clamp(((ga ? ga.int : 30) - (gf ? gf.int : 30)) / 350, -0.12, 0.12);
  };
  G.armyPower = function (g, a, foe) {
    const t = a.t, F = CW.FORMATIONS[a.formation];
    let p = 0;
    for (const k of CW.UNIT_KEYS) p += t[k] * CW.UNITS[k].atk;
    if (a.formation === 'nhanhanh') p += t.arc * CW.UNITS.arc.atk * 0.35;
    if (a.formation === 'phongthi') p += t.cav * CW.UNITS.cav.atk * 0.2;
    p *= F.atk * G.genMult(g, a) * (0.55 + a.morale / 220);
    if (foe && F.beats === foe.formation) p *= 1.15;
    p *= G.wit(g, a, foe);
    if (a.ambushLeft > 0) p *= 1.6;
    return p;
  };
  G.defMult = function (g, a) {
    const F = CW.FORMATIONS[a.formation];
    let m = F.def * (1 + CW.TERRAIN[G.terrainAt(g, a.x, a.y)].def);
    if (a.stance === 'def') m *= 1.1;
    const m2 = g.map; const ci = U.clamp(Math.floor(a.y), 0, m2.H - 1) * m2.W + U.clamp(Math.floor(a.x), 0, m2.W - 1);
    if (m2.river[ci]) m *= 0.9;
    return m;
  };
  // Ước lượng sức mạnh (cho AI)
  G.armyStr = (g, a) => G.armyPower(g, a) * (G.avgDef(a.t) / 10) * G.genDef(g, a) * (a.state === 'rout' ? 0.3 : 1);
  G.garPower = p => { let s = 0; for (const k of CW.UNIT_KEYS) s += p.garrison[k] * CW.UNITS[k].atk; return s * (1 + p.bld.wall * 0.1); };
  G.garStr = p => G.garPower(p) * (1 + (p.wallHp / 100) * 0.12);

  function applyCas(t, cas) {
    const n = G.troops(t); if (n <= 0) return 0;
    cas = Math.min(cas, n);
    let done = 0;
    for (const k of CW.UNIT_KEYS) { const c = Math.min(t[k], cas * t[k] / n); t[k] -= c; done += c; }
    return done;
  }
  G.applyCas = applyCas;

  G.setPath = function (g, a, tx, ty) {
    const p = G.findPath(g.map, a.x, a.y, tx, ty);
    if (!p) return false;
    a.path = p; a.pi = 0; return true;
  };
  G.orderMove = function (g, a, x, y) {
    if (a.state === 'rout') return false;
    a.order = { type: 'move', x, y }; a.siegeProv = -1;
    const ok = G.setPath(g, a, x, y);
    if (a.state !== 'battle') a.state = ok ? 'move' : 'idle';
    return ok;
  };
  G.orderAttack = function (g, a, target) {
    if (a.state === 'rout') return false;
    a.order = { type: 'army', id: target.id }; a.siegeProv = -1;
    const ok = G.setPath(g, a, target.x, target.y);
    if (a.state !== 'battle') a.state = 'move';
    return ok;
  };
  G.orderSiege = function (g, a, pid) {
    if (a.state === 'rout') return false;
    const c = G.city(g, pid);
    a.order = { type: 'siege', prov: pid }; a.siegeProv = -1;
    if (U.dist(a.x, a.y, c.x, c.y) < SIEGE_R * 0.8) { a.path = null; arrive(g, a); return true; }
    const ok = G.setPath(g, a, c.x + 0.6, c.y + 0.6);
    if (a.state !== 'battle') a.state = 'move';
    return ok;
  };
  G.orderStation = function (g, a, pid) {
    const c = G.city(g, pid);
    a.order = { type: 'station', prov: pid }; a.siegeProv = -1;
    const ok = G.setPath(g, a, c.x + 0.7, c.y + 0.8);
    if (a.state !== 'battle' && a.state !== 'rout') a.state = 'move';
    return ok;
  };
  G.orderStop = function (g, a) { if (a.state === 'rout') return; a.path = null; a.order = null; a.siegeProv = -1; if (a.state !== 'battle') a.state = 'idle'; };

  function arrive(g, a) {
    a.path = null;
    if (a.state === 'rout') { a.state = 'idle'; a.order = null; return; }
    const o = a.order;
    if (o && o.type === 'siege') {
      const p = g.provs[o.prov]; const c = G.city(g, o.prov);
      if (U.dist(a.x, a.y, c.x, c.y) < SIEGE_R + 0.3 && G.hostileProv(g, a.nation, p.owner)) {
        a.state = 'siege'; a.siegeProv = o.prov;
        if (HP(g, a.nation, p.owner)) G.log(g, 'siege', `Quân ${G.nationName(g, a.nation)} (${G.armyName(g, a)}) vây thành ${p.name} của ${G.nationName(g, p.owner)}.`, { sfx: 'drum', nations: [a.nation, p.owner], x: c.x, y: c.y });
        return;
      }
    }
    if (o && o.type === 'army') { a.state = 'move'; return; }
    a.state = 'idle'; a.order = null;
  }

  // Chọn thành của mình gần nhất
  G.nearestOwnCity = function (g, nid, x, y) {
    let best = -1, bd = 1e9;
    g.provs.forEach((p, k) => { if (p.owner !== nid) return; const c = G.city(g, k); const d = U.dist(x, y, c.x, c.y); if (d < bd) { bd = d; best = k; } });
    return best;
  };

  G.rout = function (g, a) {
    a.state = 'rout'; a.routDays = 12; a.ambushLeft = 0; a.siegeProv = -1; a.order = null;
    const pid = G.nearestOwnCity(g, a.nation, a.x, a.y);
    if (pid < 0) { G.destroyArmy(g, a, 'tan rã'); return; }
    const c = G.city(g, pid);
    if (!G.setPath(g, a, c.x + 0.7, c.y + 0.8)) a.path = null;
  };

  G.destroyArmy = function (g, a, reason) {
    const i = g.armies.indexOf(a); if (i < 0) return;
    g.armies.splice(i, 1);
    const gen = a.gen ? G.gen(g, a.gen) : null;
    let fate = '';
    if (gen) {
      gen.army = null;
      if (!gen.monarch && Math.random() < 0.35) { gen.alive = false; fate = ` Tướng ${gen.name} tử trận.`; }
      else fate = ` Tướng ${gen.name} thoát về.`;
    }
    if (reason) G.log(g, 'battle', `Đạo quân ${G.nationName(g, a.nation)} (${gen ? gen.name : 'vô tướng'}) bị ${reason} gần ${G.provName(g, G.provAt(g, a.x, a.y))}.${fate}`, { sfx: { [a.nation]: 'defeat' }, nations: [a.nation], x: a.x, y: a.y, major: G.isPlayer(g, a.nation) });
    if (g._onArmyRemoved) g._onArmyRemoved(a);
  };

  // ---------------- Lệnh quản lý quân ----------------
  G.cityNear = (g, a, nid) => { const pid = G.provAt(g, a.x, a.y); if (pid < 0) return -1; const c = G.city(g, pid); return (g.provs[pid].owner === nid && U.dist(a.x, a.y, c.x, c.y) < 2.6) ? pid : -1; };

  G.formArmy = function (g, pid, genId, t, formation) {
    const p = g.provs[pid];
    for (const k of CW.UNIT_KEYS) { t[k] = Math.max(0, Math.min(Math.floor(t[k] || 0), Math.floor(p.garrison[k]))); }
    if (G.troops(t) < 100) return 'Cần ít nhất 100 quân.';
    if (genId) { const gen = G.gen(g, genId); if (!gen || gen.army || !gen.alive || gen.nation !== p.owner) return 'Tướng không khả dụng.'; }
    for (const k of CW.UNIT_KEYS) p.garrison[k] -= t[k];
    const a = G.createArmy(g, p.owner, pid, genId, t, formation);
    if (G.isPlayer(g, p.owner)) G.log(g, 'gen', `Lập đạo quân mới tại ${p.name}: ${U.fmt(G.troops(t))} quân, chủ tướng ${G.armyName(g, a)}.`, { nations: [p.owner], x: a.x, y: a.y });
    return a;
  };
  G.reinforce = function (g, a, keep) {
    const pid = G.cityNear(g, a, a.nation); if (pid < 0) return 'Đạo quân phải ở gần thành của ta.';
    const p = g.provs[pid]; keep = keep === undefined ? 300 : keep;
    const tot = G.troops(p.garrison); const take = Math.max(0, tot - keep);
    if (take <= 0) return 'Trong thành không còn quân dư.';
    for (const k of CW.UNIT_KEYS) { const c = Math.floor(p.garrison[k] * take / tot); p.garrison[k] -= c; a.t[k] += c; }
    a.peak = Math.max(a.peak, G.troops(a.t));
    return `Bổ sung ${U.fmt(take)} quân từ ${p.name}.`;
  };
  G.garrisonDrop = function (g, a, frac) {
    const pid = G.cityNear(g, a, a.nation); if (pid < 0) return 'Đạo quân phải ở gần thành của ta.';
    const p = g.provs[pid];
    for (const k of CW.UNIT_KEYS) { const c = Math.floor(a.t[k] * frac); a.t[k] -= c; p.garrison[k] += c; }
    if (G.troops(a.t) < 50) G.disband(g, a);
    return `Để lại quân trấn thủ ${p.name}.`;
  };
  G.disband = function (g, a) {
    const pid = G.cityNear(g, a, a.nation); if (pid < 0) return 'Đạo quân phải ở gần thành của ta.';
    const p = g.provs[pid];
    for (const k of CW.UNIT_KEYS) p.garrison[k] += Math.floor(a.t[k]);
    const gen = a.gen ? G.gen(g, a.gen) : null; if (gen) gen.army = null;
    g.armies.splice(g.armies.indexOf(a), 1);
    if (g._onArmyRemoved) g._onArmyRemoved(a);
    return `Đạo quân nhập vào thành ${p.name}.`;
  };
  G.split = function (g, a, genId) {
    if (a.state === 'battle' || a.state === 'rout') return 'Không thể tách quân lúc này.';
    if (G.troops(a.t) < 400) return 'Quân quá ít để tách.';
    const t = {}; for (const k of CW.UNIT_KEYS) { t[k] = Math.floor(a.t[k] / 2); a.t[k] -= t[k]; }
    const b = { ...JSON.parse(JSON.stringify(a)), id: g.nextId++, gen: genId || null, t, path: null, order: null, state: 'idle', foes: [], merit: 0, cd: {} };
    b.x += 0.8; b.y += 0.5; b.peak = G.troops(t);
    if (genId) { const gen = G.gen(g, genId); if (gen) gen.army = b.id; }
    g.armies.push(b);
    return b;
  };
  G.merge = function (g, a, b) {
    if (a.nation !== b.nation || a === b) return 'Không thể hợp quân.';
    if (U.dist(a.x, a.y, b.x, b.y) > 3) return 'Hai đạo quân phải ở gần nhau (≤3 ô).';
    for (const k of CW.UNIT_KEYS) a.t[k] += b.t[k];
    a.morale = (a.morale + b.morale) / 2; a.merit += b.merit; a.peak = Math.max(a.peak, G.troops(a.t));
    const gb = b.gen ? G.gen(g, b.gen) : null; if (gb) gb.army = null;
    if (!a.gen && gb) { a.gen = gb.id; gb.army = a.id; }
    g.armies.splice(g.armies.indexOf(b), 1);
    if (g._onArmyRemoved) g._onArmyRemoved(b);
    return 'Hợp quân thành công.';
  };
  G.setGeneral = function (g, a, genId) {
    const old = a.gen ? G.gen(g, a.gen) : null;
    const gen = genId ? G.gen(g, genId) : null;
    if (gen && (gen.army || !gen.alive || gen.nation !== a.nation)) return 'Tướng không khả dụng.';
    if (old) old.army = null;
    a.gen = gen ? gen.id : null; if (gen) gen.army = a.id;
    return 'Đã đổi chủ tướng.';
  };
  G.delegate = function (g, a, mission) {
    a.mode = 'auto'; a.mission = mission; a.thinkAt = g.day; a.task = null;
    const gen = G.armyName(g, a);
    let txt = mission.type === 'defend' ? `trấn giữ ${G.provName(g, mission.prov)}` : mission.type === 'attack' ? `chinh phạt ${G.nationName(g, mission.nation)}` : 'tự do tác chiến';
    if (G.isPlayer(g, a.nation)) G.log(g, 'gen', `Ủy thác cho ${gen}: ${txt}.`, { nations: [a.nation], x: a.x, y: a.y });
  };
  G.undelegate = function (g, a) { a.mode = 'manual'; a.mission = null; a.task = null; };

  G.promote = function (g, a) {
    if (a.merit < 60) return 'Chiến công chưa đủ (cần 60).';
    a.merit -= 60;
    const gen = G.randomGeneral(g, a.nation, 1.15);
    gen.war = Math.min(99, gen.war + 8); gen.loyalty = 85;
    g.generals.push(gen);
    G.log(g, 'gen', `Đề bạt ${gen.name} từ hàng ngũ quân ${G.armyName(g, a)} (Võ ${gen.war} · Thống ${gen.lead} · Trí ${gen.int}).`, { nations: [a.nation] });
    return gen;
  };
  G.hireCost = (g, nid) => 200 + 45 * g.generals.filter(x => x.nation === nid && x.alive).length;
  G.hireCandidates = function (g, nid) { return [0, 1, 2].map(() => G.randomGeneral(g, nid, 1.05)); };
  G.hire = function (g, nid, cand) {
    const n = g.nations[nid]; const cost = G.hireCost(g, nid);
    if (n.res.gold < cost) return 'Ngân khố không đủ.';
    n.res.gold -= cost; cand.id = g.nextId++; cand.nation = nid; g.generals.push(cand);
    G.log(g, 'gen', `${n.name} chiêu mộ hiền tài ${cand.name} (Võ ${cand.war} · Thống ${cand.lead} · Trí ${cand.int}).`, { nations: [nid] });
    return cand;
  };
  // Tự tạo tướng trong game (tốn vàng theo tổng chỉ số)
  G.customGenCost = (war, lead, int) => Math.round(100 + Math.max(0, war + lead + int - 150) * 6);
  G.createCustomGeneral = function (g, nid, name, war, lead, int) {
    name = String(name || '').trim();
    if (!name) return 'Cần nhập tên tướng.';
    if (g.generals.some(x => x.alive && x.name === name)) return 'Tên tướng đã tồn tại.';
    war = U.clamp(war | 0, 1, 99); lead = U.clamp(lead | 0, 1, 99); int = U.clamp(int | 0, 1, 99);
    const n = g.nations[nid]; const cost = G.customGenCost(war, lead, int);
    if (n.res.gold < cost) return `Cần ${cost} vàng.`;
    n.res.gold -= cost;
    const gen = G.randomGeneral(g, nid, 1);
    Object.assign(gen, { name, war, lead, int, loyalty: 90, custom: true });
    g.generals.push(gen);
    G.log(g, 'gen', `${n.name} phong ${name} làm tướng (Võ ${war} · Thống ${lead} · Trí ${int}).`, { nations: [nid] });
    return gen;
  };
  G.renameGeneral = function (g, genId, name) {
    name = String(name || '').trim(); const gen = G.gen(g, genId);
    if (!gen || !name) return 'Tên không hợp lệ.';
    if (g.generals.some(x => x !== gen && x.alive && x.name === name)) return 'Tên đã tồn tại.';
    if (CW.Portraits) CW.Portraits.rename(gen.name, name);
    if (gen.monarch) g.nations[gen.nation].monarch = name;
    gen.name = name; return null;
  };
  G.reward = function (g, genId) {
    const gen = G.gen(g, genId); const n = g.nations[gen.nation];
    if (n.res.gold < 100) return 'Ngân khố không đủ.';
    n.res.gold -= 100; gen.loyalty = Math.min(100, gen.loyalty + 12);
    return `Ban thưởng ${gen.name}, lòng trung thành tăng.`;
  };

  // ---------------- Kế sách ----------------
  G.tacticAvail = function (g, a, key) {
    if ((a.cd[key] || 0) > g.day) return { ok: false, why: `Hồi chiêu ${Math.ceil(a.cd[key] - g.day)} ngày` };
    if (!a.gen) return { ok: false, why: 'Cần chủ tướng' };
    if (key !== 'rally' && !(a.state === 'battle' && a.foes.length)) return { ok: false, why: 'Chỉ dùng khi giao chiến' };
    if (key === 'charge' && a.t.cav < 200) return { ok: false, why: 'Cần ≥200 kỵ binh' };
    return { ok: true };
  };
  G.useTactic = function (g, a, key) {
    const av = G.tacticAvail(g, a, key); if (!av.ok) return av.why;
    const gen = G.gen(g, a.gen); const tac = CW.TACTICS[key];
    a.cd[key] = g.day + tac.cd;
    const foe = a.foes.length ? G.army(g, a.foes[0]) : null;
    let msg = '';
    if (key === 'fire' && foe) {
      const ft = G.terrainAt(g, foe.x, foe.y);
      const chance = 0.35 + gen.int / 140 + (ft === T.FOREST ? 0.15 : 0);
      if (Math.random() < chance) {
        const k = applyCas(foe.t, G.troops(foe.t) * (0.03 + gen.int / 1400) * (ft === T.FOREST ? 1.4 : 1)); G.campCas(g, a.nation, foe.nation, k, a, foe);
        foe.morale -= 10; msg = `${gen.name} dùng Hỏa công! Thiêu chết ${U.fmt(k)} quân địch.`;
      } else { a.morale -= 5; msg = `Hỏa công của ${gen.name} thất bại, gió đổi chiều!`; }
    } else if (key === 'charge' && foe) {
      const k = applyCas(foe.t, a.t.cav * 0.06 * (gen.war / 70)); G.campCas(g, a.nation, foe.nation, k, a, foe);
      foe.morale -= 8; msg = `${gen.name} dẫn thiết kỵ đột kích, hạ ${U.fmt(k)} quân địch!`;
    } else if (key === 'taunt' && foe) {
      const fg = foe.gen ? G.gen(g, foe.gen) : null;
      const d = U.clamp(8 + (gen.int - (fg ? fg.int : 40)) / 5, 3, 22);
      foe.morale -= d; msg = `${gen.name} khích tướng, sĩ khí địch giảm ${Math.round(d)}.`;
    } else if (key === 'rally') {
      const d = 12 + gen.lead / 8; a.morale = Math.min(100, a.morale + d);
      msg = `${gen.name} cổ vũ ba quân, sĩ khí +${Math.round(d)}.`;
    }
    if (HP(g, a.nation, foe ? foe.nation : -1)) G.log(g, 'battle', msg, { sfx: key === 'fire' ? 'fire' : 'shout', nations: [a.nation].concat(foe ? [foe.nation] : []), x: a.x, y: a.y });
    return msg;
  };

  // ---------------- Kinh tế ----------------
  G.buildCost = function (p, key) {
    const b = CW.BUILDINGS[key]; const m = 1 + p.bld[key] * 0.85; const c = {};
    for (const r in b.base) c[r] = Math.round(b.base[r] * m);
    return c;
  };
  G.canAfford = (n, cost) => Object.keys(cost).every(r => (n.res[r] || 0) >= cost[r]);
  G.pay = (n, cost) => { for (const r in cost) n.res[r] -= cost[r]; };
  G.costStr = cost => Object.keys(cost).map(r => `${CW.RES[r] ? CW.RES[r].icon : ''}${cost[r]}`).join(' ');
  G.build = function (g, pid, key) {
    const p = g.provs[pid]; const n = g.nations[p.owner];
    if (!n) return 'Không thể xây.';
    if (p.building) return 'Đang có công trình xây dựng.';
    if (p.bld[key] >= CW.MAX_BLD) return 'Đã đạt cấp tối đa.';
    const cost = G.buildCost(p, key);
    if (!G.canAfford(n, cost)) return 'Không đủ tài nguyên.';
    G.pay(n, cost);
    p.building = { key, left: Math.round(CW.BUILDINGS[key].days * (1 + p.bld[key] * 0.3)), total: 0 };
    p.building.total = p.building.left;
    return null;
  };
  G.recruitCost = function (g, pid, type, n) {
    const p = g.provs[pid]; const u = CW.UNITS[type]; const disc = 1 - 0.08 * p.bld.barracks; const c = {};
    for (const r in u.cost) c[r] = Math.round(u.cost[r] * n / 100 * disc);
    return c;
  };
  G.recruit = function (g, pid, type, n) {
    const p = g.provs[pid]; const nat = g.nations[p.owner];
    if (!nat) return 'Không thể mộ binh.';
    if (p.queue.length >= 6) return 'Hàng chờ huấn luyện đã đầy.';
    if (p.pop < n * 3) return 'Dân số không đủ.';
    if (g.day - p.sieged < 2) return 'Thành đang bị vây.';
    const cost = G.recruitCost(g, pid, type, n);
    if (!G.canAfford(nat, cost)) return 'Không đủ tài nguyên.';
    G.pay(nat, cost); p.pop -= n;
    const days = Math.round(CW.UNITS[type].days / (1 + 0.15 * p.bld.barracks));
    p.queue.push({ type, n, left: days, total: days });
    return null;
  };

  G.provIncome = function (g, pid) {
    const p = g.provs[pid], mp = g.map.provinces[pid]; const n = g.nations[p.owner];
    if (!n) return null;
    const D = CW.diff(g);
    let mult = n.isPlayer ? D.pInc : D.income;
    // Quá tải lãnh thổ: càng nhiều thành, hiệu quả cai trị mỗi thành càng giảm
    const pc = n.provCount || 0; if (pc > 8) mult /= 1 + 0.05 * (pc - 8);
    // Thành mới chiếm: dân chưa phục, thu nhập hồi dần trong 180 ngày
    if (p.conq !== undefined && g.day - p.conq < 180) mult *= 0.35 + 0.65 * (g.day - p.conq) / 180;
    const k = p.pop / 1000;
    const isCap = n.capital === pid;
    const r = {
      food: k * 6 * mp.fert * (1 + 0.3 * p.bld.farm) * mult,
      gold: (k * n.tax * 16 * (1 + 0.3 * p.bld.market) + (isCap ? 30 : 0)) * mult,
      wood: (8 + mp.forestF * 120 + mp.area * 0.03) * (1 + 0.4 * p.bld.lumber) * mult,
      iron: (3 + mp.hillF * 90) * (1 + 0.4 * p.bld.mine) * mult,
      weapons: isCap ? 15 : 0,
    };
    if (g.day - p.sieged < 2) { r.food *= 0.3; r.gold *= 0.3; r.wood *= 0.3; r.iron *= 0.3; }
    return r;
  };
  G.recalcIncome = function (g) {
    for (const n of g.nations) {
      if (!n.alive) continue;
      const inc = { food: 0, gold: 0, wood: 0, iron: 0, weapons: 0 }, up = { food: 0, gold: 0 };
      let smithy = 0, troops = 0;
      g.provs.forEach((p, k) => {
        if (p.owner !== n.id) return;
        const r = G.provIncome(g, k); for (const x in r) inc[x] += r[x];
        smithy += p.bld.smithy;
        for (const u of CW.UNIT_KEYS) { const c = p.garrison[u] / 100 * 0.5; up.food += c * CW.UNITS[u].upkeep.food; up.gold += c * CW.UNITS[u].upkeep.gold; troops += p.garrison[u]; }
      });
      for (const a of g.armies) {
        if (a.nation !== n.id) continue;
        for (const u of CW.UNIT_KEYS) { const c = a.t[u] / 100; up.food += c * CW.UNITS[u].upkeep.food; up.gold += c * CW.UNITS[u].upkeep.gold; troops += a.t[u]; }
      }
      n.inc = inc; n.upkeep = up; n.smithy = smithy; n.troops = troops;
      n.provCount = G.provsOf(g, n.id).length;
    }
  };
  G.power = function (g, nid) {
    const n = g.nations[nid]; if (!n || !n.alive) return 0;
    return (n.troops || 0) + (n.provCount || 0) * 400;
  };

  function dailyEconomy(g) {
    for (const n of g.nations) {
      if (!n.alive || !n.inc) continue;
      const r = n.res, inc = n.inc, up = n.upkeep;
      r.food += (inc.food - up.food) / 30;
      r.gold += (inc.gold - up.gold) / 30;
      r.wood += inc.wood / 30; r.iron += inc.iron / 30; r.weapons += inc.weapons / 30;
      // Xưởng binh khí
      const want = n.smithy * 30 / 30;
      const use = Math.min(want, r.iron, r.wood * 2);
      if (use > 0) { r.iron -= use; r.wood -= use / 2; r.weapons += use * 1.5; }
      n.starving = r.food < 0; n.broke = r.gold < 0;
      if (r.food < 0) r.food = 0;
      if (r.gold < 0) r.gold = 0;
    }
  }

  function dailyProvinces(g) {
    const isMonth = Math.floor(g.day) % 30 === 0;
    g.provs.forEach((p, k) => {
      const n = p.owner >= 0 ? g.nations[p.owner] : null;
      // Công trình
      if (p.building) {
        p.building.left -= 1;
        if (p.building.left <= 0) {
          const key = p.building.key; p.bld[key]++; p.building = null;
          if (key === 'wall') p.wallHp += 150;
          if (G.isPlayer(g, p.owner)) G.log(g, 'econ', `Hoàn thành ${CW.BUILDINGS[key].name} cấp ${p.bld[key]} tại ${p.name}.`, { nations: [p.owner], ...G.city(g, k) });
        }
      }
      // Huấn luyện
      if (p.queue.length && g.day - p.sieged >= 2) {
        const q = p.queue[0]; q.left -= 1;
        if (q.left <= 0) { p.garrison[q.type] += q.n; p.queue.shift(); }
      }
      // Tường thành hồi phục
      const wm = G.wallMax(p);
      if (g.day - p.sieged > 3 && p.wallHp < wm) p.wallHp = Math.min(wm, p.wallHp + wm * 0.015);
      // Thổ hào tự hồi quân
      if (!n && G.troops(p.garrison) < 1300 && g.day - p.sieged > 5) p.garrison.inf += 3;
      // Dân số (hàng tháng)
      if (isMonth && n) {
        const mp = g.map.provinces[k];
        const maxPop = mp.area * 100 * (0.5 + mp.fert) * (1 + 0.1 * p.bld.farm);
        let gr = 0.012 * (1 - n.tax) + 0.003 * p.bld.farm;
        if (n.starving) gr = -0.02;
        p.pop = Math.max(500, Math.min(maxPop, p.pop * (1 + gr)));
      }
    });
  }

  // ---------------- Chiếm thành ----------------
  G.capture = function (g, pid, a) {
    const p = g.provs[pid]; const old = p.owner; const c = G.city(g, pid);
    p.owner = a.nation;
    G.campCity(g, a, old, p.name);
    const tot = G.troops(a.t); const frac = Math.min(0.25, 600 / Math.max(1, tot)) + 0.05;
    p.garrison = G.emptyT();
    for (const k of CW.UNIT_KEYS) { const m = Math.floor(a.t[k] * frac); a.t[k] -= m; p.garrison[k] = m; }
    p.wallHp = G.wallMax(p) * 0.25; p.queue = []; p.building = null; p.pop *= 0.9; p.conq = g.day;
    const bk = CW.BUILD_KEYS.filter(b => p.bld[b] > 0); if (bk.length && Math.random() < 0.6) p.bld[U.pick(Math.random, bk)]--;
    a.state = 'idle'; a.order = null; a.siegeProv = -1; a.merit += 30; a.morale = Math.min(100, a.morale + 10);
    const gen = a.gen ? G.gen(g, a.gen) : null; if (gen) { gen.exp += 30; gen.loyalty = Math.min(100, gen.loyalty + 3); }
    for (const b of g.armies) if (b !== a && b.state === 'siege' && b.siegeProv === pid) { b.state = 'idle'; b.siegeProv = -1; b.order = null; }
    G.log(g, 'siege', `${G.nationName(g, a.nation)} công phá thành ${p.name}${old >= 0 ? ' của ' + G.nationName(g, old) : ''}! (chủ tướng ${G.armyName(g, a)})`, { sfx: { [a.nation]: 'capture', [old]: 'defeat', '*': 'siege' }, nations: [a.nation, old], x: c.x, y: c.y, major: true });
    if (old >= 0) {
      const on = g.nations[old];
      g.rel[old][a.nation] -= 8; g.rel[a.nation][old] -= 8;
      if (G.provsOf(g, old).length === 0) G.eliminate(g, old, a.nation);
      else if (on.capital === pid) {
        const rest = G.provsOf(g, old).sort((x, y) => g.provs[y].pop - g.provs[x].pop);
        on.capital = rest[0];
        G.log(g, 'diplo', `Kinh đô ${p.name} thất thủ! ${on.name} dời đô về ${g.provs[rest[0]].name}.`, { nations: [old], major: true, ...G.city(g, rest[0]) });
        for (const ar of g.armies) if (ar.nation === old) ar.morale = Math.max(10, ar.morale - 15);
      }
    }
    g.dirtyPolitical = true;
    G.recalcIncome(g);
  };

  // ---------------- Chiến dịch của người chơi (thống kê theo từng nước địch, riêng cho mỗi người chơi h) ----------------
  // g.camps = { h: { nid: bản ghi } }. Bản lưu cũ (g.camps = { nid: bản ghi } của nước 0) được chuyển đổi trong G.deserialize.
  G.camps = (g, h) => { const cs = g.camps || (g.camps = {}); return cs[h] || (cs[h] = {}); };
  G.camp = function (g, nid, h) {
    h = h || 0;
    if (!(nid >= 0) || nid === h || !g.nations[nid] || !G.isPlayer(g, h)) return null;
    const cs = G.camps(g, h);
    let c = cs[nid];
    if (!c) {
      const n = g.nations[nid], me = g.nations[h];
      c = cs[nid] = { start: Math.floor(g.day), wars: 0, foeLoss: 0, myLoss: 0, won: 0, lost: 0, taken: [], lostCities: [], gens: {},
        foeProvs: n.provCount || G.provsOf(g, nid).length, foeTroops: Math.round(n.troops || 0), myProvs: me.provCount || 0, myTroops: Math.round(me.troops || 0) };
    }
    return c;
  };
  function campGen(c, gen) {
    if (!gen) return null;
    return c.gens[gen.id] || (c.gens[gen.id] = { name: gen.name, monarch: !!gen.monarch, nation: gen.nation, kills: 0, lost: 0, wins: 0, defeats: 0, cities: 0 });
  }
  // Ghi nhận thương vong: nước `att` (đạo quân attArmy; null = quân thủ thành) gây `n` thương vong cho nước `tgt` (đạo quân tgtArmy)
  G.campCas = function (g, att, tgt, n, attArmy, tgtArmy) {
    if (!(n > 0) || att === tgt || att < 0 && tgt < 0) return;
    if (G.isPlayer(g, att) && tgt >= 0) { const c = G.camp(g, tgt, att); c.foeLoss += n; const r = attArmy && attArmy.gen ? campGen(c, G.gen(g, attArmy.gen)) : null; if (r) r.kills += n; }
    if (G.isPlayer(g, tgt) && att >= 0) { const c = G.camp(g, att, tgt); c.myLoss += n; const r = tgtArmy && tgtArmy.gen ? campGen(c, G.gen(g, tgtArmy.gen)) : null; if (r) r.lost += n; }
  };
  G.campBattle = function (g, vic, los) {
    if (G.isPlayer(g, vic.nation) && los.nation >= 0) { const c = G.camp(g, los.nation, vic.nation); c.won++; const r = vic.gen ? campGen(c, G.gen(g, vic.gen)) : null; if (r) r.wins++; }
    if (G.isPlayer(g, los.nation) && vic.nation >= 0) { const c = G.camp(g, vic.nation, los.nation); c.lost++; const r = los.gen ? campGen(c, G.gen(g, los.gen)) : null; if (r) r.defeats++; }
  };
  G.campCity = function (g, a, old, name) {
    if (G.isPlayer(g, a.nation) && old >= 0) { const c = G.camp(g, old, a.nation); c.taken.push(name); const r = a.gen ? campGen(c, G.gen(g, a.gen)) : null; if (r) r.cities++; }
    if (G.isPlayer(g, old)) G.camp(g, a.nation, old).lostCities.push(name);
  };
  function campReport(g, nid, joined, h) {
    const c = G.camp(g, nid, h), n = g.nations[nid];
    const days = Math.max(1, Math.floor(g.day) - c.start), y = Math.floor(days / 360), m = Math.floor((days % 360) / 30);
    const dur = y || m ? ((y ? y + ' năm' : '') + (y && m ? ' ' : '') + (m ? m + ' tháng' : '')) : days + ' ngày';
    const gens = Object.values(c.gens).map(x => Object.assign({}, x, { score: x.kills / 100 + x.wins * 10 + x.cities * 25 })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    const ratio = c.myLoss > 0 ? (c.foeLoss / c.myLoss).toFixed(1) + ' : 1' : '—';
    const lines = [
      `Thời gian: ${G.dateStr(g, c.start, true)} → ${G.dateStr(g, g.day, true)} (${dur}${c.wars > 1 ? `, ${c.wars} lần khai chiến` : ''}).`,
      `Thế lực ban đầu: ${n.name} có ${c.foeProvs} thành, ~${U.fmt(c.foeTroops)} quân; ta có ${c.myProvs} thành, ~${U.fmt(c.myTroops)} quân.`,
      `Chiến trận: thắng ${c.won} · bại ${c.lost}. Địch tử thương ${U.fmt(c.foeLoss)} · ta tổn thất ${U.fmt(c.myLoss)} (tỉ lệ ${ratio}).`,
      `Thành chiếm được (${c.taken.length}): ${c.taken.join(', ') || '—'}.`,
    ];
    if (c.lostCities.length) lines.push(`Thành bị mất trong chiến dịch (${c.lostCities.length}): ${c.lostCities.join(', ')}.`);
    if (gens.length) {
      lines.push('Danh tướng lập công:');
      gens.forEach((x, i) => lines.push(`  ${i + 1}. ${x.name}${x.monarch ? ' (quân chủ)' : ''} — hạ ${U.fmt(x.kills)} quân, thắng ${x.wins} trận${x.cities ? ', hạ ' + x.cities + ' thành' : ''}${x.lost ? `, hao ${U.fmt(x.lost)} quân` : ''}${x.defeats ? `, bại ${x.defeats} trận` : ''}.`));
    }
    if (joined.length) lines.push(`Hàng tướng về với ta: ${joined.join(', ')}.`);
    const r = { nid, by: h, name: n.name, char: n.char, color: n.color, monarch: n.monarch, day: Math.floor(g.day), title: `Bình định ${n.name}`, lines, stats: c };
    (g.reports || (g.reports = [])).push(r);
    delete G.camps(g, h)[nid];
    return g.reports.length - 1;
  }

  G.eliminate = function (g, nid, by) {
    const n = g.nations[nid]; if (!n.alive) return;
    n.alive = false;
    for (const a of g.armies.slice()) if (a.nation === nid) { const i = g.armies.indexOf(a); g.armies.splice(i, 1); if (g._onArmyRemoved) g._onArmyRemoved(a); }
    const joined = [];
    for (const gen of g.generals) if (gen.nation === nid && gen.alive) {
      gen.army = null;
      if (by >= 0 && !gen.monarch && Math.random() < 0.5) { gen.nation = by; gen.loyalty = 45; joined.push(gen.name); }
      else gen.alive = false;
    }
    for (let j = 0; j < g.nations.length; j++) if (j !== nid) { g.status[nid][j] = g.status[j][nid] = 'peace'; }
    g.proposals = g.proposals.filter(pr => pr.from !== nid && pr.to !== nid);
    G.log(g, 'war', `Nước ${n.name} diệt vong! ${n.monarch} mất nước vào tay ${G.nationName(g, by)}.` + (joined.length ? ` Các tướng ${joined.join(', ')} quy hàng.` : ''), { sfx: 'gong', nations: [nid, by], major: true });
    if (G.isPlayer(g, by)) {
      const ri = campReport(g, nid, joined, by), r = g.reports[ri];
      G.log(g, 'war', `📜 Tổng kết chiến dịch ${r.title}: ${r.lines.slice(0, 3).join(' ')}`, { nations: [by, nid], major: true, rep: ri });
    }
    for (const h in (g.camps || {})) delete g.camps[h][nid];
  };

  // ---------------- Ngoại giao ----------------
  function setRel(g, a, b, v) { v = U.clamp(v, -100, 100); g.rel[a][b] = g.rel[b][a] = v; }
  G.addRel = (g, a, b, d) => setRel(g, a, b, g.rel[a][b] + d);
  G.allies = (g, nid) => g.nations.filter(n => n.alive && n.id !== nid && g.status[nid][n.id] === 'ally').map(n => n.id);
  G.enemies = (g, nid) => g.nations.filter(n => n.alive && n.id !== nid && g.status[nid][n.id] === 'war').map(n => n.id);

  G.declareWar = function (g, a, b, depth) {
    depth = depth || 0;
    if (a === b || !g.nations[a].alive || !g.nations[b].alive || g.status[a][b] === 'war') return;
    const wasAlly = g.status[a][b] === 'ally';
    g.status[a][b] = g.status[b][a] = 'war';
    g.warStart[a][b] = g.warStart[b][a] = g.day;
    if (G.isPlayer(g, a)) G.camp(g, b, a).wars++;
    if (G.isPlayer(g, b)) G.camp(g, a, b).wars++;
    G.addRel(g, a, b, wasAlly ? -70 : -35);
    const A = g.nations[a], B = g.nations[b];
    if (wasAlly) {
      G.log(g, 'diplo', `${A.name} phản bội minh ước, bất ngờ tấn công đồng minh ${B.name}! ${B.name} cắt đứt liên minh và quay giáo phản công.`, { sfx: { [a]: 'drum', [b]: 'drum' }, nations: [a, b], major: true });
      for (const n of g.nations) if (n.alive && n.id !== a && n.id !== b) G.addRel(g, n.id, a, -12);
    } else {
      G.log(g, 'war', `${A.name} tuyên chiến với ${B.name}!`, { sfx: { [a]: 'drum', [b]: 'drum' }, nations: [a, b], major: true });
    }
    g.proposals = g.proposals.filter(p => !((p.from === a && p.to === b) || (p.from === b && p.to === a)));
    if (depth > 0) return;
    // Đồng minh của nạn nhân được kêu gọi
    for (const c of G.allies(g, b)) {
      if (c === a) continue;
      if (G.isPlayer(g, c)) {
        g.proposals.push({ id: g.nextId++, from: b, to: c, type: 'callToArms', target: a, day: g.day, expires: g.day + 60 });
        G.log(g, 'diplo', `Đồng minh ${B.name} bị ${A.name} tấn công, cầu viện ${g.nations[c].name}!`, { nations: [c, b, a], major: true });
        continue;
      }
      if (g.status[c][a] === 'war') continue;
      const p = g.status[c][a] === 'ally' ? 0.85 : 0.7;
      if (Math.random() < p) {
        if (g.status[c][a] === 'ally') {
          g.status[c][a] = g.status[a][c] = 'peace';
          G.log(g, 'diplo', `${g.nations[c].name} hủy minh ước với ${A.name} vì kẻ này tấn công đồng minh ${B.name}.`, { nations: [c, a] });
        }
        G.declareWar(g, c, a, 1);
      }
    }
    // Đồng minh của kẻ tấn công có thể tham chiến nếu ghét nạn nhân
    for (const c of G.allies(g, a)) {
      if (c === b || G.isPlayer(g, c) || g.status[c][b] !== 'peace') continue;
      if (g.rel[c][b] < -10 && Math.random() < 0.5) G.declareWar(g, c, b, 1);
    }
  };
  G.makePeace = function (g, a, b) {
    if (g.status[a][b] !== 'war') return;
    g.status[a][b] = g.status[b][a] = 'peace';
    g.truce[a][b] = g.truce[b][a] = g.day + 360;
    setRel(g, a, b, Math.max(g.rel[a][b], -15));
    for (const ar of g.armies) {
      if ((ar.nation === a || ar.nation === b) && ar.state === 'siege') {
        const p = g.provs[ar.siegeProv]; if (p && (p.owner === a || p.owner === b)) { ar.state = 'idle'; ar.siegeProv = -1; ar.order = null; }
      }
      if ((ar.nation === a || ar.nation === b) && ar.order && ar.order.type === 'army') { const t = G.army(g, ar.order.id); if (t && (t.nation === a || t.nation === b)) G.orderStop(g, ar); }
    }
    G.log(g, 'diplo', `${g.nations[a].name} và ${g.nations[b].name} giảng hòa, đình chiến một năm.`, { nations: [a, b], major: true });
  };
  G.makeAlliance = function (g, a, b) {
    if (g.status[a][b] === 'war') return;
    g.status[a][b] = g.status[b][a] = 'ally';
    setRel(g, a, b, Math.max(g.rel[a][b], 55));
    G.log(g, 'diplo', `${g.nations[a].name} và ${g.nations[b].name} kết đồng minh.`, { nations: [a, b], major: true });
  };
  G.breakAlliance = function (g, a, b) {
    if (g.status[a][b] !== 'ally') return;
    g.status[a][b] = g.status[b][a] = 'peace';
    G.addRel(g, a, b, -25);
    G.log(g, 'diplo', `${g.nations[a].name} hủy bỏ minh ước với ${g.nations[b].name}.`, { nations: [a, b], major: true });
  };
  G.gift = function (g, a, b, amount) {
    const n = g.nations[a]; if (n.res.gold < amount) return 'Ngân khố không đủ.';
    n.res.gold -= amount; g.nations[b].res.gold += amount;
    const d = Math.round(amount / 20);
    G.addRel(g, a, b, d);
    G.log(g, 'diplo', `${n.name} gửi sứ giả dâng ${amount} lượng vàng cho ${g.nations[b].name} (quan hệ +${d}).`, { nations: [a, b] });
    return null;
  };
  G.warAge = (g, a, b) => g.day - (g.warStart[a][b] || 0);
  G.peaceScore = function (g, from, to, tribute) {
    const pf = G.power(g, from), pt = G.power(g, to);
    let s = 0.25 + (pf / Math.max(1, pt) - 1) * 0.5 + (G.enemies(g, to).length - 1) * 0.2 + G.warAge(g, from, to) / 900 + (tribute || 0) / 1500 + g.rel[from][to] / 300;
    return s;
  };
  G.proposePeace = function (g, from, to, tribute) {
    if (g.status[from][to] !== 'war') return { ok: false, msg: 'Hai nước không giao chiến.' };
    tribute = tribute || 0;
    if (tribute && g.nations[from].res.gold < tribute) return { ok: false, msg: 'Ngân khố không đủ để cống nạp.' };
    if (G.isPlayer(g, to)) return humanProposal(g, from, to, 'peace', tribute);
    const s = G.peaceScore(g, from, to, tribute) + Math.random() * 0.2;
    if (s > 0.5) {
      if (tribute) { g.nations[from].res.gold -= tribute; g.nations[to].res.gold += tribute; }
      G.makePeace(g, from, to);
      return { ok: true, msg: `${g.nations[to].name} chấp thuận giảng hòa.` };
    }
    G.addRel(g, from, to, -3);
    return { ok: false, msg: `${g.nations[to].name} khước từ cầu hòa.` };
  };
  G.allianceScore = function (g, from, to) {
    if (g.status[from][to] !== 'peace') return -1;
    let s = g.rel[from][to] / 100;
    const ef = G.enemies(g, from), et = G.enemies(g, to);
    if (ef.some(e => et.includes(e))) s += 0.3;
    if (g.truce[from][to] > g.day) s -= 0.2;
    return s;
  };
  G.proposeAlliance = function (g, from, to) {
    if (g.status[from][to] !== 'peace') return { ok: false, msg: 'Chỉ có thể kết minh khi đang hòa bình.' };
    if (G.isPlayer(g, to)) return humanProposal(g, from, to, 'alliance', 0);
    const s = G.allianceScore(g, from, to) + Math.random() * 0.15;
    if (s > 0.55) { G.makeAlliance(g, from, to); return { ok: true, msg: `${g.nations[to].name} đồng ý kết minh!` }; }
    G.addRel(g, from, to, -2);
    return { ok: false, msg: `${g.nations[to].name} từ chối kết minh (quan hệ chưa đủ thân thiết).` };
  };
  // Quốc thư gửi tới một người chơi khác: chờ họ trả lời
  function humanProposal(g, from, to, type, tribute) {
    if (g.proposals.some(p => p.from === from && p.to === to && p.type === type)) return { ok: false, msg: 'Quốc thư trước vẫn đang chờ hồi âm.' };
    g.proposals.push({ id: g.nextId++, from, to, type, tribute: tribute || 0, day: g.day, expires: g.day + 45 });
    const txt = type === 'peace' ? `${g.nations[from].name} gửi quốc thư cầu hòa với ${g.nations[to].name}${tribute ? ` (kèm cống ${tribute} vàng)` : ''}.` : `${g.nations[from].name} gửi quốc thư đề nghị kết minh với ${g.nations[to].name}.`;
    G.log(g, 'diplo', txt, { nations: [from, to], major: true });
    return { ok: true, msg: `Sứ giả đã lên đường tới ${g.nations[to].name}, chờ hồi âm.` };
  }
  G.answerProposal = function (g, id, accept, by) {
    const i = g.proposals.findIndex(p => p.id === id); if (i < 0) return;
    const pr = g.proposals[i];
    if (by !== undefined && pr.to !== by) return;
    g.proposals.splice(i, 1);
    if (!g.nations[pr.from].alive) return;
    if (pr.type === 'peace') {
      if (accept && pr.tribute) { const f = g.nations[pr.from]; const t = Math.min(pr.tribute, Math.floor(f.res.gold)); f.res.gold -= t; g.nations[pr.to].res.gold += t; }
      if (accept) G.makePeace(g, pr.from, pr.to); else G.addRel(g, pr.from, pr.to, -5);
      if (!accept && G.isPlayer(g, pr.from)) G.log(g, 'diplo', `${g.nations[pr.to].name} khước từ cầu hòa của ${g.nations[pr.from].name}.`, { nations: [pr.from, pr.to] });
    }
    else if (pr.type === 'alliance' && !accept && G.isPlayer(g, pr.from)) { G.addRel(g, pr.from, pr.to, -5); G.log(g, 'diplo', `${g.nations[pr.to].name} từ chối kết minh với ${g.nations[pr.from].name}.`, { nations: [pr.from, pr.to] }); }
    else if (pr.type === 'alliance') { if (accept) G.makeAlliance(g, pr.from, pr.to); else G.addRel(g, pr.from, pr.to, -5); }
    else if (pr.type === 'callToArms') {
      if (accept) { if (g.status[pr.to][pr.target] === 'ally') G.breakAlliance(g, pr.to, pr.target); G.declareWar(g, pr.to, pr.target, 1); G.addRel(g, pr.to, pr.from, 10); }
      else G.addRel(g, pr.to, pr.from, -15);
    }
  };

  // ---------------- Giao chiến hàng ngày ----------------
  function dailyCombat(g) {
    const arr = g.armies;
    for (const a of arr) a.foes = [];
    for (let i = 0; i < arr.length; i++) {
      const A = arr[i]; if (A.routDays > 0 || A.state === 'rout') continue;
      for (let j = i + 1; j < arr.length; j++) {
        const B = arr[j]; if (B.routDays > 0 || B.state === 'rout') continue;
        if (!G.atWar(g, A.nation, B.nation)) continue;
        if (Math.abs(A.x - B.x) > ENGAGE_R || Math.abs(A.y - B.y) > ENGAGE_R) continue;
        if (U.dist(A.x, A.y, B.x, B.y) <= ENGAGE_R) { A.foes.push(B.id); B.foes.push(A.id); }
      }
    }
    const dmg = new Map(), credits = [], ratio = new Map();
    const battles = [];
    for (const a of arr) {
      if (!a.foes.length) continue;
      if (a.state !== 'battle') {
        a.prevState = a.state === 'siege' ? 'idle' : a.state; a.state = 'battle'; a.battleDays = 0; a.battleStart = G.troops(a.t);
        if (G.isPlayer(g, a.nation)) G.sfx(g, 'clash', [a.nation]);
        if (a.stance === 'ambush' && a.still >= 3) { const tt = G.terrainAt(g, a.x, a.y); if (tt === T.FOREST || tt === T.HILL || tt === T.MOUNT) { a.ambushLeft = 3; G.log(g, 'battle', `Quân phục kích của ${G.nationName(g, a.nation)} (${G.armyName(g, a)}) xuất kích!`, { sfx: 'shout', nations: [a.nation], x: a.x, y: a.y }); } }
        a.siegeProv = -1;
      }
      a.battleDays++;
      const foes = a.foes.map(id => G.army(g, id)).filter(Boolean);
      const sum = foes.reduce((s, f) => s + G.troops(f.t), 0) || 1;
      // Uy danh: tướng có Võ vượt trội làm quân địch khiếp sợ khi vừa giáp trận
      if (a.battleDays === 1 && foes[0]) {
        const ga = a.gen ? G.gen(g, a.gen) : null, gf = foes[0].gen ? G.gen(g, foes[0].gen) : null;
        const d = (ga ? ga.war : 30) - (gf ? gf.war : 30);
        if (ga && d > 10) {
          const m = Math.min(15, (d - 10) / 3); for (const f of foes) f.morale -= m;
          if (HP(g, a.nation, foes[0].nation)) G.log(g, 'battle', `Uy danh của ${ga.name} (Võ ${ga.war}) khiến quân ${G.nationName(g, foes[0].nation)} khiếp sợ, sĩ khí giảm ${Math.round(m)}.`, { nations: [a.nation, foes[0].nation], x: a.x, y: a.y, sfx: 'shout' });
        }
      }
      let pow = G.armyPower(g, a, foes[0]);
      if (a.formation === 'hacdy' && G.troops(a.t) > sum * 1.3) pow *= 1.15;
      for (const f of foes) {
        const share = G.troops(f.t) / sum;
        const cas = pow * K_DMG * share / (G.avgDef(f.t) / 10) / G.defMult(g, f) / G.genDef(g, f);
        dmg.set(f.id, (dmg.get(f.id) || 0) + cas);
        if (HP(g, a.nation, f.nation)) credits.push([a, f, cas]);
        if (a.id < f.id) battles.push({ x: (a.x + f.x) / 2, y: (a.y + f.y) / 2, a: a.id, b: f.id });
      }
    }
    for (const a of arr) {
      const cas = dmg.get(a.id); if (!cas) continue;
      const before = G.troops(a.t);
      const done = applyCas(a.t, cas);
      ratio.set(a.id, done / cas);
      const gen = a.gen ? G.gen(g, a.gen) : null;
      const lead = gen ? gen.lead : 40;
      a.morale -= (done / Math.max(1, before)) * 130 * (1 - (lead - 50) / 250);
      a.lastCas = done;
    }
    for (const [a, f, cas] of credits) G.campCas(g, a.nation, f.nation, cas * (ratio.get(f.id) || 0), a, f);
    // Kết quả
    for (const a of arr.slice()) {
      if (a.state !== 'battle') continue;
      if (a.ambushLeft > 0) a.ambushLeft--;
      // AI dùng kế
      if ((a.mode === 'auto') && a.foes.length && Math.random() < 0.25) {
        const opts = Object.keys(CW.TACTICS).filter(k => G.tacticAvail(g, a, k).ok && (k !== 'rally' || a.morale < 60));
        if (opts.length) G.useTactic(g, a, U.pick(Math.random, opts));
      }
      const tot = G.troops(a.t);
      if (tot < 80 || a.morale < 20) {
        const foes = a.foes.map(id => G.army(g, id)).filter(Boolean);
        const where = G.provName(g, G.provAt(g, a.x, a.y));
        for (const f of foes) {
          f.merit += Math.round((a.battleStart || tot) / 120) + 5; f.morale = Math.min(100, f.morale + 8);
          const fg = f.gen ? G.gen(g, f.gen) : null; if (fg) { fg.exp += 25; fg.wins++; fg.loyalty = Math.min(100, fg.loyalty + 2); levelUp(fg); }
        }
        if (foes.length) {
          const vic = foes[0];
          G.campBattle(g, vic, a);
          G.log(g, 'battle', `Trận ${where}: ${G.nationName(g, vic.nation)} (${G.armyName(g, vic)}) đại thắng, quân ${G.nationName(g, a.nation)} (${G.armyName(g, a)}) ${tot < 80 ? 'bị tiêu diệt' : 'tan vỡ tháo chạy'}.`, { sfx: { [vic.nation]: 'victory', [a.nation]: 'defeat' }, nations: [vic.nation, a.nation], x: a.x, y: a.y, major: HP(g, a.nation, vic.nation) });
        }
        if (tot < 80) G.destroyArmy(g, a); else G.rout(g, a);
      }
    }
    for (const a of arr) {
      if (a.state === 'battle' && !a.foes.length) {
        a.state = a.path ? 'move' : 'idle';
        if (a.order && a.order.type === 'siege') { a.state = 'move'; if (!a.path) G.orderSiege(g, a, a.order.prov); }
      }
    }
    g.battles = battles;
  }
  function levelUp(gen) {
    while (gen.exp >= 100) {
      gen.exp -= 100;
      const k = U.pick(Math.random, ['war', 'lead', 'int']);
      gen[k] = Math.min(99, gen[k] + 1 + Math.floor(Math.random() * 2));
    }
  }

  function dailySiege(g) {
    for (const a of g.armies.slice()) {
      if (a.state !== 'siege') continue;
      const pid = a.siegeProv; const p = g.provs[pid];
      if (!p) { a.state = 'idle'; continue; }
      const c = G.city(g, pid);
      if (!G.hostileProv(g, a.nation, p.owner) || U.dist(a.x, a.y, c.x, c.y) > SIEGE_R + 0.5) { a.state = 'idle'; a.siegeProv = -1; a.order = null; continue; }
      p.sieged = g.day;
      const gp = G.garPower(p), ap = G.armyPower(g, a);
      const siegePow = a.t.sie * 0.06 + G.troops(a.t) * 0.0015;
      let toArmy, toGar;
      if (p.wallHp > 0) {
        p.wallHp = Math.max(0, p.wallHp - siegePow);
        toArmy = gp * K_DMG * 0.6; toGar = ap * K_DMG * 0.2;
        if (p.wallHp === 0 && HP(g, a.nation, p.owner)) G.log(g, 'siege', `Tường thành ${p.name} đã bị phá vỡ!`, { sfx: 'siege', nations: [a.nation, p.owner], x: c.x, y: c.y });
      } else { toArmy = gp * K_DMG * 1.1; toGar = ap * K_DMG * 0.9; }
      const before = G.troops(a.t);
      const d1 = applyCas(a.t, toArmy / (G.avgDef(a.t) / 10)); G.campCas(g, p.owner, a.nation, d1, null, a);
      a.morale -= (d1 / Math.max(1, before)) * 60;
      const d2 = applyCas(p.garrison, toGar / (G.avgDef(p.garrison) / 10) / (1 + p.bld.wall * 0.08)); G.campCas(g, a.nation, p.owner, d2, a, null);
      if (G.troops(p.garrison) < 20) G.capture(g, pid, a);
      else if (G.troops(a.t) < 80) G.destroyArmy(g, a, 'đánh tan dưới chân thành ' + p.name);
      else if (a.morale < 20) { G.log(g, 'siege', `Quân ${G.nationName(g, a.nation)} vây ${p.name} thất bại, phải rút lui.`, { nations: [a.nation, p.owner], x: c.x, y: c.y }); G.rout(g, a); }
    }
  }

  function dailyArmies(g) {
    for (const a of g.armies.slice()) {
      if (a.routDays > 0) a.routDays--;
      // Truy kích
      if (a.order && a.order.type === 'army' && a.state !== 'battle' && a.state !== 'rout') {
        const t = G.army(g, a.order.id);
        if (!t || !G.atWar(g, a.nation, t.nation) || t.routDays > 0 || (a.order.auto && U.dist(a.x, a.y, t.x, t.y) > 10)) { G.orderStop(g, a); }
        else {
          const end = a.path && a.path.length ? a.path[a.path.length - 1] : null;
          if (!end || U.dist(end[0], end[1], t.x, t.y) > 1.5) { G.setPath(g, a, t.x, t.y); a.state = 'move'; }
        }
      }
      // Tự giao chiến khi ở thế chủ động
      if (a.stance === 'aggr' && a.state === 'idle' && a.routDays <= 0 && G.troops(a.t) > 300) {
        let best = null, bd = 6;
        for (const b of g.armies) {
          if (b.routDays > 0 || !G.atWar(g, a.nation, b.nation)) continue;
          const d = U.dist(a.x, a.y, b.x, b.y); if (d < bd) { bd = d; best = b; }
        }
        if (best && G.armyStr(g, a) > G.armyStr(g, best) * 0.6) { G.orderAttack(g, a, best); a.order.auto = true; }
      }
      if (a.state === 'idle' || a.state === 'siege') a.still++; else if (a.state === 'move' || a.state === 'rout') a.still = 0;
      // Sĩ khí
      if (a.state !== 'battle' && a.state !== 'siege') {
        const gen = a.gen ? G.gen(g, a.gen) : null;
        const pid = G.provAt(g, a.x, a.y);
        const own = pid >= 0 && g.provs[pid].owner === a.nation;
        a.morale = Math.min(100, a.morale + (own ? 0.6 + (gen ? gen.lead / 150 : 0) : 0.25));
      }
      // Thiếu lương / thiếu tiền
      const n = g.nations[a.nation];
      if (n.starving) { applyCas(a.t, G.troops(a.t) * 0.004); a.morale -= 0.6; }
      if (n.broke) { a.morale -= 0.3; if (n.upkeep && n.upkeep.gold > n.inc.gold) applyCas(a.t, G.troops(a.t) * 0.002); } // hết tiền trả lương: lính đào ngũ dần
      a.morale = U.clamp(a.morale, 0, 100);
      if (G.troops(a.t) < 30 && a.state !== 'battle') G.destroyArmy(g, a, 'tan rã vì đói khát');
    }
  }

  function monthly(g) {
    G.recalcIncome(g);
    // Tướng: lòng trung thành
    for (const gen of g.generals) {
      if (!gen.alive || gen.monarch) continue;
      const n = g.nations[gen.nation]; if (!n || !n.alive) continue;
      if (n.broke) gen.loyalty -= 3; else if (gen.loyalty < 70) gen.loyalty += 0.5;
      if (gen.loyalty < 25 && !gen.army && Math.random() < 0.15) {
        const others = g.nations.filter(x => x.alive && x.id !== gen.nation);
        if (others.length) {
          const to = U.pick(Math.random, others);
          G.log(g, 'gen', `Tướng ${gen.name} bất mãn, bỏ ${n.name} sang đầu quân cho ${to.name}.`, { nations: [n.id, to.id], major: G.isPlayer(g, n.id) });
          gen.nation = to.id; gen.loyalty = 55;
        }
      }
    }
    // Sự kiện ngẫu nhiên
    for (const n of g.nations) {
      if (!n.alive || Math.random() > 0.07) continue;
      const ps = G.provsOf(g, n.id); if (!ps.length) continue;
      const pid = U.pick(Math.random, ps); const p = g.provs[pid]; const c = G.city(g, pid);
      const r = Math.random();
      let txt;
      if (r < 0.25) { const v = Math.round(n.inc.food * 0.6); n.res.food += v; txt = `${p.name} (${n.name}) được mùa bội thu, thu thêm ${v} lương thực.`; }
      else if (r < 0.42) { const v = Math.round(Math.min(n.res.food * 0.15, 400)); n.res.food -= v; txt = `Hạn hán ở ${p.name} (${n.name}), mất ${v} lương thực.`; }
      else if (r < 0.55) { p.pop *= 0.92; txt = `Dịch bệnh hoành hành tại ${p.name} (${n.name}), dân số giảm.`; }
      else if (r < 0.68) { n.res.iron += 200; txt = `Phát hiện mỏ quặng mới ở ${p.name} (${n.name}), +200 sắt.`; }
      else if (r < 0.8) { const v = Math.round(Math.min(n.res.gold * 0.1, 200)); n.res.gold -= v; txt = `Giặc cỏ cướp phá ${p.name} (${n.name}), mất ${v} vàng.`; }
      else if (r < 0.88) { const gen = G.randomGeneral(g, n.id, 1.2); g.generals.push(gen); txt = `Hiền sĩ ${gen.name} tìm đến ${n.name} xin phò tá (Võ ${gen.war} · Thống ${gen.lead} · Trí ${gen.int}).`; }
      else { p.pop *= 1.05; txt = `Lưu dân kéo về ${p.name} (${n.name}), dân số tăng.`; }
      G.log(g, 'misc', txt, { nations: [n.id], x: c.x, y: c.y });
    }
    G.checkOutcome(g);
  }

  // ---------------- Thắng / bại ----------------
  // Chơi đơn: như cũ. Nhiều người: một người chơi thắng khi nắm ≥75% lãnh địa (tính cả đồng minh là người chơi)
  // hoặc mọi nước còn lại đều là người chơi đồng minh; người chơi mất nước thì chỉ còn quan sát.
  G.checkOutcome = function (g) {
    if (g.gameOver) return;
    const hs = g.nations.filter(n => n.isPlayer || n.wasPlayer);
    const multi = hs.length > 1;
    const alive = hs.filter(n => n.alive && n.isPlayer);
    if (!multi) {
      const me = hs[0] || g.nations[0];
      if (!me.alive) { g.gameOver = { win: false, winner: -1, text: `Nước ${me.name} đã diệt vong. Giang sơn về tay kẻ khác...` }; return; }
      const others = g.nations.filter(n => n.alive && n.id !== me.id);
      const mine = G.provsOf(g, me.id).length;
      if (!others.length) g.gameOver = { win: true, winner: me.id, text: `${me.title} ${me.monarch} đã tiêu diệt mọi đối thủ, nhất thống thiên hạ!` };
      else if (mine / g.provs.length >= 0.75) g.gameOver = { win: true, winner: me.id, text: `${me.name} nắm giữ ${mine}/${g.provs.length} lãnh địa — thiên hạ quy về một mối!` };
      return;
    }
    if (!hs.some(n => n.alive)) { g.gameOver = { win: false, winner: -1, text: 'Mọi quân chủ đều đã mất nước. Thiên hạ về tay chư hầu...' }; return; }
    for (const h of alive) {
      const team = g.nations.filter(n => n.alive && (n.id === h.id || (n.isPlayer && g.status[h.id][n.id] === 'ally')));
      const rest = g.nations.filter(n => n.alive && !team.includes(n));
      const held = team.reduce((s, n) => s + G.provsOf(g, n.id).length, 0);
      const names = team.map(n => n.name).join(' – ');
      if (!rest.length) { g.gameOver = { win: true, winner: h.id, text: team.length > 1 ? `Liên minh ${names} đã quét sạch quần hùng, cùng nhau định thiên hạ!` : `${h.title} ${h.monarch} đã tiêu diệt mọi đối thủ, nhất thống thiên hạ!` }; return; }
      if (held / g.provs.length >= 0.75) { g.gameOver = { win: true, winner: h.id, text: `${names} nắm giữ ${held}/${g.provs.length} lãnh địa — thiên hạ quy về một mối!` }; return; }
    }
  };
  // Kết cục theo góc nhìn của người chơi `me` (null nếu chưa có)
  G.outcome = function (g, me) {
    const o = g.gameOver;
    if (o) {
      if (o.winner === undefined || o.winner < 0) return o;
      const win = o.winner === me || (me >= 0 && g.status[me] && g.status[me][o.winner] === 'ally' && g.nations[me].alive && G.isPlayer(g, o.winner));
      return { win, text: o.text, global: true };
    }
    const n = g.nations[me];
    if (n && !n.alive) return { win: false, text: `Nước ${n.name} đã diệt vong. Ngài vẫn có thể ở lại quan sát thiên hạ.` };
    return null;
  };

  // ---------------- Vòng lặp mô phỏng ----------------
  function daily(g) {
    dailyEconomy(g);
    dailyProvinces(g);
    dailyArmies(g);
    dailyCombat(g);
    dailySiege(g);
    // Hết hạn đề nghị
    g.proposals = g.proposals.filter(p => p.expires > g.day);
    if (CW.AI) CW.AI.daily(g);
    if (Math.floor(g.day) % 30 === 0) { monthly(g); if (CW.AI) CW.AI.monthly(g); }
    else if (Math.floor(g.day) % 5 === 0) G.recalcIncome(g);
  }

  function moveArmies(g, dt) {
    const m = g.map;
    for (const a of g.armies) {
      if (a.state === 'battle' || a.state === 'siege' || !a.path) continue;
      if (a.pi >= a.path.length) { arrive(g, a); continue; }
      const ci = U.clamp(Math.floor(a.y), 0, m.H - 1) * m.W + U.clamp(Math.floor(a.x), 0, m.W - 1);
      const tm = (CW.TERRAIN[m.ter[ci]].move || 1) + (m.river[ci] ? 0.6 : 0);
      let rem = G.armySpeed(g, a) * dt / tm;
      while (rem > 0 && a.pi < a.path.length) {
        const p = a.path[a.pi]; const dx = p[0] - a.x, dy = p[1] - a.y; const d = Math.hypot(dx, dy);
        if (d > 1e-4) a.facing = Math.atan2(dy, dx);
        if (d <= rem) { a.x = p[0]; a.y = p[1]; rem -= d; a.pi++; }
        else { a.x += dx / d * rem; a.y += dy / d * rem; rem = 0; }
      }
      if (a.pi >= a.path.length) arrive(g, a);
    }
  }

  G.step = function (g, realDt) {
    if (g.paused || (g.gameOver && !g.gameOver.ack)) return;
    let days = Math.min(realDt, 0.25) * CW.DAYS_PER_SEC * g.speed;
    while (days > 0) {
      const dt = Math.min(days, 0.1);
      const before = Math.floor(g.day);
      g.day += dt; days -= dt;
      moveArmies(g, dt);
      if (Math.floor(g.day) !== before) daily(g);
      if (g.gameOver && !g.gameOver.ack) break;
    }
  };

  // ---------------- Lưu / tải ----------------
  G.serialize = function (g) {
    return JSON.stringify(g, (k, v) => (k.startsWith('_') ? undefined : v));
  };
  G.deserialize = function (str) {
    const g = JSON.parse(str);
    const map = CW.generateMap(g.setup.template, g.setup.seed, g.setup.nationCount);
    Object.defineProperty(g, 'map', { value: map, enumerable: false, writable: true, configurable: true });
    g.dirtyPolitical = true;
    // Chuyển đổi bản lưu cũ: g.camps = { nid: bản ghi } của nước 0 → { 0: { nid: bản ghi } }
    if (g.camps && Object.values(g.camps).some(c => c && c.start !== undefined)) g.camps = { 0: g.camps };
    for (const r of g.reports || []) if (r.by === undefined) r.by = 0;
    if (g.gameOver && g.gameOver.winner === undefined) g.gameOver.winner = g.gameOver.win ? 0 : -1;
    G.recalcIncome(g);
    return g;
  };
  // Một nước người chơi bị giao cho AI (người chơi rời phòng hoặc tải ván nhiều người để chơi đơn)
  G.aiTakeover = function (g, nid, permanent) {
    const n = g.nations[nid]; if (!n || !n.isPlayer) return;
    n.isPlayer = false; if (permanent) delete n.wasPlayer; else n.wasPlayer = true;
    for (const a of g.armies) if (a.nation === nid && a.mode !== 'auto') { a.mode = 'auto'; a.mission = { type: 'free' }; a.thinkAt = g.day; }
    g.proposals = g.proposals.filter(p => p.to !== nid);
  };
  G.humanReturn = function (g, nid) { const n = g.nations[nid]; if (n) { n.isPlayer = true; delete n.wasPlayer; } };
})();
